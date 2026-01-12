import ModbusRTU from 'modbus-serial';

export class ModbusManager {
  constructor(prisma, wss) {
    this.prisma = prisma;
    this.wss = wss;
    this.connections = new Map(); // connectionNodeId -> { client, devices }
    this.pollingIntervals = new Map(); // deviceId -> interval
    this.historyInterval = null;
    this.isRunning = false;
    this.tagValuesCache = new Map(); // deviceId -> { tagId -> { value, timestamp } }
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('Starting Modbus Manager...');

    // Загружаем все активные узлы связи
    const nodes = await this.prisma.connectionNode.findMany({
      where: {enabled: true},
      include: {
        devices: {
          where: {enabled: true},
          include: {
            tags: {
              where: {enabled: true}
            }
          }
        }
      }
    });

    for (const node of nodes) {
      await this.startConnection(node);
    }

    // Запускаем сбор исторических данных каждую минуту
    this.historyInterval = setInterval(() => {
      const isSomeNodeHasDeviceWithTagEnabled = nodes.some(node => node.enabled && node.devices.some(device => device.enabled && device.tags.some(tag => tag.enabled)));

      if (isSomeNodeHasDeviceWithTagEnabled) {
        this.collectHistoryData();
      }
    }, 60000); // 60 секунд

    console.log('Modbus Manager started');
  }

  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    console.log('Stopping Modbus Manager...');

    // Останавливаем все интервалы опроса
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    // Закрываем все соединения
    for (const [nodeId, conn] of this.connections.entries()) {
      try {
        if (conn.client && conn.client.isOpen) {
          await conn.client.close();
        }
      } catch (error) {
        console.error(`Error closing connection ${nodeId}:`, error);
      }
    }
    this.connections.clear();

    // Останавливаем сбор истории
    if (this.historyInterval) {
      clearInterval(this.historyInterval);
      this.historyInterval = null;
    }

    console.log('Modbus Manager stopped');
  }

  async startConnection(node) {
    try {
      console.log(`Starting connection for node ${node.name} (${node.comPort})`);

      const client = new ModbusRTU();

      // Используем connectRTUBuffered для подключения к COM порту
      // modbus-serial сам создаст и откроет SerialPort
      await client.connectRTUBuffered(node.comPort, {
        baudRate: node.baudRate,
        dataBits: node.dataBits,
        stopBits: node.stopBits,
        parity: node.parity || 'none',
      });

      // Устанавливаем таймаут для всех устройств (берем минимальный)
      const minTimeout = Math.min(...node.devices.map(d => d.responseTimeout || 1000));
      client.setTimeout(minTimeout);

      const connection = {
        client,
        devices: new Map()
      };

      // Запускаем опрос только для устройств со статусом connected
      const connectedDevices = node.devices.filter(device => device.status === 'connected');

      for (const device of node.devices) {
        connection.devices.set(device.id, device);
      }

      // Опрашиваем только устройства со статусом connected
      for (const device of connectedDevices) {
        // Используем setTimeout для задержки между запусками опроса устройств
        this.startDevicePolling(device, client);
      }

      this.connections.set(node.id, connection);
      this.broadcastStateUpdate();

      console.log(`Connection started for node ${node.name}`);
    } catch (error) {
      console.error(`Error starting connection for node ${node.name}:`, error);

      // Обрабатываем специфичные ошибки
      let errorMessage = error.message;
      if (error.message && error.message.includes('Access denied')) {
        errorMessage = 'Доступ к COM порту запрещен. Убедитесь, что порт не занят другим приложением и запустите с правами администратора.';
      } else if (error.message && error.message.includes('cannot open')) {
        errorMessage = 'Не удалось открыть COM порт. Проверьте, что порт существует и доступен.';
      }

      // Обновляем статус всех устройств этого узла
      for (const device of node.devices) {
        await this.updateDeviceStatus(device.id, 'error', errorMessage);
      }
      this.broadcastStateUpdate();
    }
  }

  async stopConnection(nodeId) {
    const connection = this.connections.get(nodeId);
    if (!connection) return;

    try {
      // Останавливаем опрос всех устройств
      const deviceIds = Array.from(connection.devices.keys());
      for (const deviceId of deviceIds) {
        this.stopDevicePolling(deviceId);
      }

      // Закрываем соединение
      if (connection.client) {
        try {
          // В modbus-serial проверяем, открыт ли клиент
          if (connection.client.isOpen) {
            await connection.client.close();
          }
        } catch (error) {
          // Игнорируем ошибки при закрытии
          console.error(`Error closing modbus client:`, error);
        }
      }

      this.connections.delete(nodeId);
      this.broadcastStateUpdate();

      console.log(`Connection stopped for node ${nodeId}`);
    } catch (error) {
      console.error(`Error stopping connection ${nodeId}:`, error);
    }
  }

  startDevicePolling(device, client) {
    // Останавливаем предыдущий интервал, если есть
    this.stopDevicePolling(device.id);

    const interval = setInterval(async () => {
      await this.pollDevice(device, client);
    }, device.pollInterval);

    this.pollingIntervals.set(device.id, interval);

    // Сразу делаем первый опрос
    this.pollDevice(device, client);
  }

  stopDevicePolling(deviceId) {
    const interval = this.pollingIntervals.get(deviceId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(deviceId);
    }
  }

  async pollDevice(device, client, skipStatusCheck = false) {
    try {
      // Загружаем актуальные теги устройства
      const deviceWithTags = await this.prisma.device.findUnique({
        where: {id: device.id},
        include: {
          tags: {
            where: {enabled: true}
          }
        }
      });

      if (!deviceWithTags) {
        return;
      }

      // Проверяем статус устройства - если статус изменился, останавливаем опрос
      // При переподключении (skipStatusCheck = true) пропускаем эту проверку
      if (!skipStatusCheck) {
        if (deviceWithTags.status !== 'connected') {
          this.stopDevicePolling(device.id);
          return;
        }
      }

      if (deviceWithTags.tags.length === 0) {
        return;
      }

      const tagValues = {};
      let hasSuccessfulReads = false;
      let allTagsTimeout = true;

      // Устанавливаем unit ID для устройства перед чтением
      client.setID(device.address);

      // Опрашиваем теги последовательно с небольшой задержкой
      for (const tag of deviceWithTags.tags) {
        try {
          let value = null;

          // Небольшая задержка между чтениями регистров
          if (deviceWithTags.tags.indexOf(tag) > 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          switch (tag.registerType) {
            case 'HOLDING_REGISTER':
              const holdingResult = await client.readHoldingRegisters(
                tag.address,
                1
              );
              value = this.convertValue(holdingResult.data[0], tag.deviceDataType, tag.serverDataType);
              break;

            case 'INPUT_REGISTER':
              const inputResult = await client.readInputRegisters(
                tag.address,
                1
              );
              value = this.convertValue(inputResult.data[0], tag.deviceDataType, tag.serverDataType);
              break;

            case 'COIL':
              const coilResult = await client.readCoils(
                tag.address,
                1
              );
              value = coilResult.data[0] ? 1 : 0;
              break;

            case 'DISCRETE_INPUT':
              const discreteResult = await client.readDiscreteInputs(
                tag.address,
                1
              );
              value = discreteResult.data[0] ? 1 : 0;
              break;
          }

          tagValues[tag.id] = {
            tagId: tag.id,
            tagName: tag.name,
            value: value,
            timestamp: new Date().toISOString()
          };

          hasSuccessfulReads = true;
          allTagsTimeout = false;

        } catch (tagError) {
          console.error(`Error reading tag ${tag.name} from device ${device.name}:`, tagError);

          // Проверяем, является ли ошибка TransactionTimedOutError
          if (tagError.name !== 'TransactionTimedOutError') {
            allTagsTimeout = false;
          }

          tagValues[tag.id] = {
            tagId: tag.id,
            tagName: tag.name,
            value: null,
            error: tagError.message,
            timestamp: new Date().toISOString()
          };
        }
      }

      // Проверяем текущий статус устройства перед обновлением
      const currentDevice = await this.prisma.device.findUnique({
        where: {id: device.id},
        select: {status: true}
      });

      const oldStatus = currentDevice?.status || 'unknown';
      let newStatus;

      // Обновляем статус устройства
      if (allTagsTimeout && !hasSuccessfulReads) {
        newStatus = 'disconnected';
        await this.updateDeviceStatus(device.id, newStatus, 'TransactionTimedOutError');
        // Останавливаем опрос устройства, так как оно отключено
        this.stopDevicePolling(device.id);
      } else {
        newStatus = 'connected';
        await this.updateDeviceStatus(device.id, newStatus, null);
      }

      // Уведомляем клиентов об изменении статуса устройства
      if (oldStatus !== newStatus) {
        this.broadcastStateUpdate();
      }

      // Сохраняем значения в кэш
      if (!this.tagValuesCache.has(device.id)) {
        this.tagValuesCache.set(device.id, new Map());
      }
      const deviceCache = this.tagValuesCache.get(device.id);
      for (const [tagId, tagData] of Object.entries(tagValues)) {
        deviceCache.set(tagId, tagData);
      }

      // Отправляем данные через WebSocket
      this.broadcastTagValues(device.id, tagValues);

    } catch (error) {
      console.error(`Error polling device ${device.name}:`, error);
      await this.updateDeviceStatus(device.id, 'disconnected', error.message);
      this.broadcastStateUpdate();
    }
  }

  convertValue(rawValue, deviceDataType, serverDataType) {
    // Простая конвертация для int16 -> int32
    if (deviceDataType === 'int16' && serverDataType === 'int32') {
      // Преобразуем int16 в int32 (знак сохраняется)
      if (rawValue >= 32768) {
        return rawValue - 65536; // Отрицательное число
      }
      return rawValue;
    }

    // Для других типов пока возвращаем как есть
    return rawValue;
  }

  async updateDeviceStatus(deviceId, status, errorMessage) {
    try {
      await this.prisma.device.update({
        where: {id: deviceId},
        data: {
          status,
          lastPollTime: new Date()
        }
      });
    } catch (error) {
      console.error(`Error updating device status ${deviceId}:`, error);
    }
  }

  async collectHistoryData() {
    try {
      console.log('Collecting history data...');

      // Получаем все активные устройства с тегами
      const devices = await this.prisma.device.findMany({
        where: {enabled: true, status: 'connected'},
        include: {
          tags: {
            where: {enabled: true}
          }
        }
      });

      let savedCount = 0;

      for (const device of devices) {
        const deviceCache = this.tagValuesCache.get(device.id);
        if (!deviceCache) continue;

        // Сохраняем последние значения всех тегов устройства
        for (const tag of device.tags) {
          const tagData = deviceCache.get(tag.id);
          if (tagData && tagData.value !== null && !tagData.error) {
            try {
              await this.saveHistoryData(device.id, tag.id, tagData.value);
              savedCount++;
            } catch (error) {
              console.error(`Error saving history for tag ${tag.name}:`, error);
            }
          }
        }
      }

      console.log(`History data collection completed. Saved ${savedCount} records.`);
    } catch (error) {
      console.error('Error collecting history data:', error);
    }
  }

  async saveHistoryData(deviceId, tagId, value) {
    try {
      await this.prisma.historyData.create({
        data: {
          deviceId,
          tagId,
          value: String(value)
        }
      });
    } catch (error) {
      console.error(`Error saving history data:`, error);
    }
  }

  broadcastTagValues(deviceId, tagValues) {
    const message = JSON.stringify({
      type: 'tagValues',
      deviceId,
      data: tagValues,
      timestamp: new Date().toISOString()
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });

    // История сохраняется каждую минуту через collectHistoryData
  }

  broadcastStateUpdate() {
    this.sendCurrentState();
  }

  getStatus() {
    return {
      isRunning: this.isRunning
    };
  }

  sendCurrentState(ws = null) {
    const clients = ws ? [ws] : Array.from(this.wss.clients).filter(c => c.readyState === 1);

    Promise.all([
      this.prisma.connectionNode.findMany({
        include: {
          devices: {
            include: {
              tags: true
            }
          }
        }
      })
    ]).then(([nodes]) => {
      const message = JSON.stringify({
        type: 'state',
        data: {
          modbusManagerStatus: this.getStatus(),
          nodes: nodes.map(node => ({
            id: node.id,
            name: node.name,
            type: node.type,
            comPort: node.comPort,
            enabled: node.enabled,
            devices: node.devices.map(device => ({
              id: device.id,
              name: device.name,
              address: device.address,
              status: device.status,
              lastPollTime: device.lastPollTime,
              tags: device.tags.map(tag => ({
                id: tag.id,
                name: tag.name,
                address: tag.address,
                registerType: tag.registerType,
                accessType: tag.accessType
              }))
            }))
          }))
        }
      });

      clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(message);
        }
      });
    }).catch(error => {
      console.error('Error sending current state:', error);
    });
  }

  async reloadConnection(nodeId) {
    await this.stopConnection(nodeId);

    const node = await this.prisma.connectionNode.findUnique({
      where: {id: nodeId},
      include: {
        devices: {
          where: {enabled: true},
          include: {
            tags: {
              where: {enabled: true}
            }
          }
        }
      }
    });

    if (node && node.enabled) {
      await this.startConnection(node);
    }
  }

  async reconnectDevice(deviceId) {
    try {
      // Находим устройство с узлом связи
      const device = await this.prisma.device.findUnique({
        where: {id: deviceId},
        include: {
          connectionNode: true,
          tags: {
            where: {enabled: true}
          }
        }
      });

      if (!device) {
        throw new Error('Device not found');
      }

      // Находим соединение узла связи
      const connection = this.connections.get(device.connectionNodeId);
      if (!connection || !connection.client) {
        throw new Error('Connection node is not active');
      }

      console.log(`Reconnecting device ${device.name}...`);

      // Выполняем одноразовый опрос устройства с пропуском проверки статуса
      // Метод pollDevice сам обновит статус на основе результатов опроса
      await this.pollDevice(device, connection.client, true);

      // Если после опроса устройство стало connected, запускаем постоянный опрос
      const updatedDevice = await this.prisma.device.findUnique({
        where: {id: deviceId},
        include: {
          tags: {
            where: {enabled: true}
          }
        }
      });

      if (updatedDevice && updatedDevice.status === 'connected') {
        // Проверяем, не запущен ли уже опрос
        if (!this.pollingIntervals.has(deviceId)) {
          // Обновляем устройство в connection.devices
          connection.devices.set(deviceId, updatedDevice);
          this.startDevicePolling(updatedDevice, connection.client);
        }
      }

      return {success: true, status: updatedDevice?.status};
    } catch (error) {
      console.error(`Error reconnecting device ${deviceId}:`, error);
      throw error;
    }
  }
}
