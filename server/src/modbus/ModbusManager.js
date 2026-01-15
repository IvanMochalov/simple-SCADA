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

    // Загружаем все активные узлы связи с устройствами и тегами
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

    // Запускаем соединения для каждого узла
    // Если один узел не запустился, продолжаем работу с остальными
    for (const node of nodes) {
      try {
        await this.startConnection(node);
      } catch (error) {
        console.error(`Failed to start connection for node ${node.name}:`, error);
        // Продолжаем работу с другими узлами
      }
    }

    // Запускаем сбор исторических данных каждую минуту
    this.historyInterval = setInterval(() => {
      const isSomeNodeHasDeviceWithTagEnabled = nodes.some(node => 
        node.enabled && 
        node.devices && 
        node.devices.some(device => 
          device.enabled && 
          device.tags && 
          device.tags.some(tag => tag.enabled)
        )
      );

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
  }

  async startConnection(node) {
    try {
      console.log(`Starting connection for node ${node.name} (${node.comPort})`);

      // Если устройства не загружены, загружаем их
      if (!node.devices || node.devices.length === 0) {
        const nodeWithDevices = await this.prisma.connectionNode.findUnique({
          where: {id: node.id},
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
        if (nodeWithDevices) {
          node.devices = nodeWithDevices.devices || [];
        } else {
          node.devices = [];
        }
      }

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
      // Если устройств нет, используем дефолтный таймаут
      const timeouts = node.devices.map(d => d.responseTimeout || 1000);
      const minTimeout = timeouts.length > 0 ? Math.min(...timeouts) : 1000;
      client.setTimeout(minTimeout);

      const connection = {
        client,
        devices: new Map()
      };

      // Запускаем опрос только для включенных устройств с тегами
      const enabledDevices = node.devices.filter(device => 
        device.enabled && 
        device.tags && 
        device.tags.length > 0
      );

      // Сохраняем все устройства в connection
      for (const device of node.devices) {
        connection.devices.set(device.id, device);
      }

      // Опрашиваем только включенные устройства с тегами
      // Добавляем небольшую задержку между запусками опроса устройств для стабильности
      for (let i = 0; i < enabledDevices.length; i++) {
        const device = enabledDevices[i];
        // Задержка перед запуском опроса каждого устройства (кроме первого)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.startDevicePolling(device, client);
      }

      this.connections.set(node.id, connection);

      console.log(`Connection started for node ${node.name} with ${enabledDevices.length} enabled devices`);
    } catch (error) {
      console.error(`Error starting connection for node ${node.name}:`, error);
      let errorMessage = "";
      if (error.message && error.message.includes('Access denied')) {
        errorMessage = `Доступ к COM порту ${node.name}: ${node.comPort} запрещен. Убедитесь, что порт не занят другим приложением.`;
      } else if (error.message && error.message.includes('cannot open')) {
        errorMessage = `Не удалось открыть COM порт ${node.name}: ${node.comPort}. Проверьте, что порт существует и доступен.`;
      } else {
        errorMessage = `Проверьте подключение ${node.name}: ${node.comPort}.`;
      }

      // Не останавливаем весь Modbus Manager при ошибке одного узла
      // Просто пропускаем этот узел и продолжаем работу
      this.broadcastMessage({
        title: `Ошибка подключения к узлу ${node.name}: ${node.comPort}.`,
        description: errorMessage
      }, "error");
    } finally {
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

      console.log(`Connection stopped for node ${nodeId}`);
    } catch (error) {
      console.error(`Error stopping connection ${nodeId}:`, error);
    } finally {
      this.broadcastStateUpdate();
    }
  }

  startDevicePolling(device, client) {
    // Останавливаем предыдущий интервал, если есть
    this.stopDevicePolling(device.id);

    const interval = setInterval(async () => {
      await this.pollDevice(device, client);
    }, device.pollInterval);

    this.pollingIntervals.set(device.id, interval);

    // Делаем первый опрос с небольшой задержкой для стабильности
    // Это помогает избежать таймаутов при первом подключении
    setTimeout(async () => {
      await this.pollDevice(device, client);
    }, 200);
  }

  stopDevicePolling(deviceId) {
    const interval = this.pollingIntervals.get(deviceId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(deviceId);
    }
  }

  async pollDevice(device, client) {
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

      if (!deviceWithTags || !deviceWithTags.enabled || deviceWithTags.tags.length === 0) {
        this.stopDevicePolling(device.id);
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

      // Обновляем время последнего опроса
      try {
        await this.prisma.device.update({
          where: {id: device.id},
          data: {
            lastPollTime: new Date()
          }
        });
      } catch (error) {
        console.error(`Error updating device lastPollTime ${device.id}:`, error);
      }

      // Если все теги не отвечают, останавливаем опрос устройства
      if (allTagsTimeout && !hasSuccessfulReads) {
        // Останавливаем опрос устройства, так как оно не отвечает
        this.stopDevicePolling(device.id);
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
      // Останавливаем опрос при ошибке
      this.stopDevicePolling(device.id);
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


  async collectHistoryData() {
    try {
      console.log('Collecting history data...');

      // Получаем все активные устройства с тегами
      const devices = await this.prisma.device.findMany({
        where: {enabled: true},
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
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  broadcastMessage(messageData, messageType = 'info') {
    // Поддерживаем как строку, так и объект с title и description
    const text = typeof messageData === 'string' 
      ? { title: messageData, description: '' }
      : messageData;

    const message = JSON.stringify({
      type: 'message',
      data: {
        text: text,
        messageType: messageType
      },
      timestamp: new Date().toISOString()
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
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
              enabled: device.enabled,
              lastPollTime: device.lastPollTime,
              tags: device.tags.map(tag => ({
                id: tag.id,
                name: tag.name,
                address: tag.address,
                registerType: tag.registerType,
                accessType: tag.accessType,
                enabled: tag.enabled
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

    if (node && node.enabled && this.isRunning) {
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
        throw new Error(`Устройство не найдено`);
      }

      const displayDeviceName = `${device.connectionNode.name} → ${device.name}`;

      // Находим соединение узла связи
      const connection = this.connections.get(device.connectionNodeId);
      if (!connection || !connection.client) {
        throw new Error(`Устройство ${displayDeviceName} отключено. Проверьте питание.`);
      }

      console.log(`Reconnecting device ${displayDeviceName}...`);

      // Останавливаем текущий опрос, если он запущен
      this.stopDevicePolling(deviceId);

      // Загружаем актуальные данные устройства
      const updatedDevice = await this.prisma.device.findUnique({
        where: {id: deviceId},
        include: {
          tags: {
            where: {enabled: true}
          }
        }
      });

      if (!updatedDevice) {
        throw new Error(`Устройство ${displayDeviceName} не найдено после обновления`);
      }

      if (updatedDevice.enabled && updatedDevice.tags.length > 0) {
        // Обновляем устройство в connection.devices
        connection.devices.set(deviceId, updatedDevice);
        
        // Небольшая задержка перед запуском опроса для стабильности
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Запускаем опрос устройства
        this.startDevicePolling(updatedDevice, connection.client);
      } else {
        console.log(`Device ${displayDeviceName} is disabled or has no enabled tags`);
      }

      return {success: true, enabled: updatedDevice.enabled};
    } catch (error) {
      console.error(`Error reconnecting device:`, error);
      throw error;
    }
  }
}
