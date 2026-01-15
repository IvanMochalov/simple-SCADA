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
    this.devicePollingLocks = new Map(); // deviceId -> Promise (текущий опрос)
    this.deviceWriteLocks = new Map(); // deviceId -> Promise (текущая запись)
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

    // Закрываем все соединения и обновляем статусы
    const nodeIds = Array.from(this.connections.keys());
    for (const nodeId of nodeIds) {
      const conn = this.connections.get(nodeId);
      try {
        if (conn && conn.client && conn.client.isOpen) {
          await conn.client.close();
        }
        // Обновляем статус узла на disconnected
        await this.updateNodeConnectionStatus(nodeId, 'disconnected', null);
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

      // Даем время на инициализацию COM порта и очистку буфера
      // Это критично для стабильной работы RS-485
      await new Promise(resolve => setTimeout(resolve, 500));

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
      // На RS-485 шине устройства должны опрашиваться последовательно
      // Добавляем задержку между запусками опроса устройств для избежания конфликтов
      for (let i = 0; i < enabledDevices.length; i++) {
        const device = enabledDevices[i];
        // Задержка перед запуском опроса каждого устройства
        // Первое устройство тоже получает задержку для стабилизации порта
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          // Дополнительная задержка для первого устройства после открытия порта
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        this.startDevicePolling(device, client);
      }

      this.connections.set(node.id, connection);

      // Обновляем статус подключения узла
      await this.updateNodeConnectionStatus(node.id, 'connected', null);

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

      // Обновляем статус подключения узла с ошибкой
      await this.updateNodeConnectionStatus(node.id, 'error', errorMessage);

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

      // Обновляем статус подключения узла
      await this.updateNodeConnectionStatus(nodeId, 'disconnected', null);

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

    // Делаем первый опрос с задержкой для стабильности
    // Увеличена задержка для избежания таймаутов и CRC ошибок при первом подключении
    // Это дает время на инициализацию устройства и очистку буфера
    setTimeout(async () => {
      await this.pollDevice(device, client);
    }, 500);
  }

  stopDevicePolling(deviceId) {
    const interval = this.pollingIntervals.get(deviceId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(deviceId);
    }
  }

  async pollDevice(device, client) {
    // Проверяем, не идет ли запись в это устройство
    const writeLock = this.deviceWriteLocks.get(device.id);
    if (writeLock) {
      // Ждем завершения записи
      try {
        await writeLock;
      } catch (error) {
        // Игнорируем ошибки записи
      }
      // Если после ожидания все еще идет запись, пропускаем этот цикл опроса
      if (this.deviceWriteLocks.has(device.id)) {
        return;
      }
    }

    // Сохраняем Promise текущего опроса для синхронизации
    const pollingPromise = this._doPollDevice(device, client);
    this.devicePollingLocks.set(device.id, pollingPromise);
    
    try {
      await pollingPromise;
    } finally {
      // Удаляем блокировку после завершения опроса
      if (this.devicePollingLocks.get(device.id) === pollingPromise) {
        this.devicePollingLocks.delete(device.id);
      }
    }
  }

  async _doPollDevice(device, client) {
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

      // Опрашиваем теги последовательно с задержкой
      // На RS-485 важно давать время между запросами
      for (const tag of deviceWithTags.tags) {
        try {
          let value = null;

          // Задержка между чтениями регистров для стабильности RS-485
          // Увеличена задержка для избежания CRC ошибок
          if (deviceWithTags.tags.indexOf(tag) > 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          switch (tag.registerType) {
            case 'HOLDING_REGISTER':
              // Для float нужно читать 2 регистра (32 бита)
              const holdingRegistersToRead = (tag.deviceDataType === 'float' || tag.serverDataType === 'float') ? 2 : 1;
              const holdingResult = await client.readHoldingRegisters(
                tag.address,
                holdingRegistersToRead
              );
              
              if (holdingRegistersToRead === 2) {
                // Конвертируем два регистра в float
                value = this.convertRegistersToFloat(holdingResult.data[0], holdingResult.data[1]);
              } else {
                value = this.convertValue(holdingResult.data[0], tag.deviceDataType, tag.serverDataType);
              }
              break;

            case 'INPUT_REGISTER':
              // Для float нужно читать 2 регистра (32 бита)
              const inputRegistersToRead = (tag.deviceDataType === 'float' || tag.serverDataType === 'float') ? 2 : 1;
              const inputResult = await client.readInputRegisters(
                tag.address,
                inputRegistersToRead
              );
              
              if (inputRegistersToRead === 2) {
                // Конвертируем два регистра в float
                value = this.convertRegistersToFloat(inputResult.data[0], inputResult.data[1]);
              } else {
                value = this.convertValue(inputResult.data[0], tag.deviceDataType, tag.serverDataType);
              }
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

  async updateNodeConnectionStatus(nodeId, status, errorMessage) {
    try {
      await this.prisma.connectionNode.update({
        where: {id: nodeId},
        data: {
          connectionStatus: status,
          lastError: errorMessage
        }
      });
    } catch (error) {
      console.error(`Error updating node connection status ${nodeId}:`, error);
    }
  }

  /**
   * Конвертирует два Modbus регистра (16 бит каждый) в IEEE 754 float (32 бита)
   * Используется порядок байтов: старший регистр (high word) -> младший регистр (low word)
   * Это стандартный порядок для большинства Modbus устройств (big-endian)
   * 
   * @param {number} highWord - Старший регистр (первые 16 бит)
   * @param {number} lowWord - Младший регистр (последние 16 бит)
   * @returns {number} Float значение
   */
  convertRegistersToFloat(highWord, lowWord) {
    // Преобразуем два 16-битных регистра в 32-битное целое число
    // highWord содержит старшие 16 бит, lowWord - младшие 16 бит
    // Порядок байтов: Big-endian (ABCD)
    // A = старший байт highWord, B = младший байт highWord
    // C = старший байт lowWord, D = младший байт lowWord
    
    // Создаем буфер для 32-битного float
    const buffer = Buffer.allocUnsafe(4);
    
    // Записываем байты в правильном порядке (big-endian)
    // Старший байт highWord -> buffer[0]
    // Младший байт highWord -> buffer[1]
    // Старший байт lowWord -> buffer[2]
    // Младший байт lowWord -> buffer[3]
    buffer.writeUInt16BE(highWord, 0);
    buffer.writeUInt16BE(lowWord, 2);
    
    // Читаем как IEEE 754 float (big-endian)
    return buffer.readFloatBE(0);
  }

  /**
   * Конвертирует IEEE 754 float (32 бита) в два Modbus регистра (16 бит каждый)
   * Обратная операция для convertRegistersToFloat
   * 
   * @param {number} floatValue - Float значение
   * @returns {Array<number>} [highWord, lowWord] - два 16-битных регистра
   */
  convertFloatToRegisters(floatValue) {
    // Создаем буфер для 32-битного float
    const buffer = Buffer.allocUnsafe(4);
    
    // Записываем float как IEEE 754 (big-endian)
    buffer.writeFloatBE(floatValue, 0);
    
    // Читаем два 16-битных регистра
    const highWord = buffer.readUInt16BE(0);
    const lowWord = buffer.readUInt16BE(2);
    
    return [highWord, lowWord];
  }

  /**
   * Записывает значение в тег устройства
   * 
   * @param {string} tagId - ID тега
   * @param {number|string} value - Значение для записи
   * @returns {Promise<{success: boolean, value: any}>}
   */
  async writeTagValue(tagId, value) {
    let tag = null;
    try {
      // Загружаем тег с информацией об устройстве и узле связи
      tag = await this.prisma.tag.findUnique({
        where: {id: tagId},
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        }
      });

      if (!tag) {
        throw new Error('Тег не найден');
      }

      if (tag.accessType !== 'ReadWrite') {
        throw new Error('Тег доступен только для чтения');
      }

      if (!tag.enabled) {
        throw new Error('Тег не включен в работу');
      }

      // Проверяем, что устройство включено
      if (!tag.device.enabled) {
        throw new Error('Устройство не включено в работу');
      }

      // Находим соединение узла связи
      const connection = this.connections.get(tag.device.connectionNodeId);
      if (!connection || !connection.client) {
        throw new Error('Узел связи не подключен');
      }

      const client = connection.client;
      const device = tag.device;

      // Создаем Promise для блокировки записи
      const writePromise = this._doWriteTagValue(tag, device, client, value);
      this.deviceWriteLocks.set(device.id, writePromise);

      try {
        // Ждем завершения текущего опроса, если он идет
        const pollingLock = this.devicePollingLocks.get(device.id);
        if (pollingLock) {
          try {
            await pollingLock;
          } catch (error) {
            // Игнорируем ошибки опроса
          }
          // Небольшая задержка после завершения опроса
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Приостанавливаем опрос устройства на время записи
        this.stopDevicePolling(device.id);

        // Выполняем запись
        const result = await writePromise;
        
        return result;
      } finally {
        // Удаляем блокировку записи
        if (this.deviceWriteLocks.get(device.id) === writePromise) {
          this.deviceWriteLocks.delete(device.id);
        }
        
        // Возобновляем опрос устройства после записи
        // Небольшая задержка перед возобновлением опроса
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Проверяем, что устройство все еще включено и соединение активно
        const updatedDevice = await this.prisma.device.findUnique({
          where: {id: device.id},
          include: {
            connectionNode: true
          }
        });
        
        if (updatedDevice && updatedDevice.enabled && connection.client) {
          this.startDevicePolling(updatedDevice, connection.client);
        }
      }
    } catch (error) {
      console.error(`Error writing tag value ${tagId}:`, error);
      
      // Формируем более информативное сообщение об ошибке
      let errorMessage = error.message;
      
      if (error.modbusCode === 1) {
        errorMessage = `Устройство не поддерживает запись в адрес ${tag?.address || 'неизвестен'}. Проверьте, что адрес регистра правильный и устройство поддерживает запись в этот адрес.`;
      } else if (error.modbusCode === 2) {
        errorMessage = `Недопустимый адрес регистра ${tag?.address || 'неизвестен'}. Проверьте адрес регистра в настройках тега.`;
      } else if (error.modbusCode === 3) {
        errorMessage = `Недопустимое значение для записи. Проверьте диапазон допустимых значений для этого регистра.`;
      } else if (error.name === 'TransactionTimedOutError') {
        errorMessage = `Таймаут при записи значения. Устройство не ответило в течение установленного времени. Попробуйте переподключить устройство.`;
      }
      
      // Создаем новую ошибку с более информативным сообщением
      const enhancedError = new Error(errorMessage);
      enhancedError.originalError = error;
      enhancedError.modbusCode = error.modbusCode;
      throw enhancedError;
    }
  }

  async _doWriteTagValue(tag, device, client, value) {
    // Сохраняем текущий таймаут и увеличиваем его для записи
    // Запись может занимать больше времени, чем чтение
    const originalTimeout = client.getTimeout ? client.getTimeout() : (device.responseTimeout || 1000);
    const writeTimeout = Math.max(originalTimeout * 2, 3000); // Увеличиваем в 2 раза, минимум 3 секунды
    
    try {
      // Устанавливаем unit ID для устройства
      client.setID(device.address);
      
      // Устанавливаем увеличенный таймаут для записи
      client.setTimeout(writeTimeout);

      // Конвертируем значение в нужный формат
      let writeValue = value;
      if (typeof value === 'string') {
        writeValue = parseFloat(value);
        if (isNaN(writeValue)) {
          throw new Error('Некорректное значение');
        }
      }

      // Записываем значение в зависимости от типа регистра
      switch (tag.registerType) {
        case 'HOLDING_REGISTER':
          // Для float нужно записать 2 регистра
          if (tag.deviceDataType === 'float' || tag.serverDataType === 'float') {
            const [highWord, lowWord] = this.convertFloatToRegisters(writeValue);
            // Некоторые устройства не поддерживают функцию 16 (Write Multiple Registers)
            // Поэтому записываем два регистра по отдельности
            console.log(`Writing float to tag ${tag.name} (${tag.id}): address=${tag.address}, value=${writeValue}, highWord=${highWord}, lowWord=${lowWord}`);
            await client.writeRegister(tag.address, highWord);
            // Небольшая задержка между записями для стабильности RS-485
            await new Promise(resolve => setTimeout(resolve, 50));
            await client.writeRegister(tag.address + 1, lowWord);
          } else {
            // Для целых чисел записываем одно значение
            // Преобразуем int32 в int16 если нужно
            let registerValue = writeValue;
            if (tag.deviceDataType === 'int16' && tag.serverDataType === 'int32') {
              // Ограничиваем до диапазона int16
              if (registerValue > 32767) registerValue = 32767;
              if (registerValue < -32768) registerValue = -32768;
              
              // Преобразуем отрицательные числа в формат uint16 для Modbus
              // Modbus регистры хранят значения как uint16 (0-65535)
              // Отрицательные int16 значения представлены как 32768-65535
              if (registerValue < 0) {
                registerValue = registerValue + 65536;
              }
            }
            
            // Убеждаемся, что значение в диапазоне uint16
            registerValue = Math.round(registerValue);
            if (registerValue < 0) registerValue = 0;
            if (registerValue > 65535) registerValue = 65535;
            
            console.log(`Writing value to tag ${tag.name} (${tag.id}): address=${tag.address}, originalValue=${writeValue}, registerValue=${registerValue} (uint16), deviceDataType=${tag.deviceDataType}, serverDataType=${tag.serverDataType}, device=${device.name} (address ${device.address})`);
            
            // Некоторые устройства не поддерживают функцию 6 (Write Single Register)
            // и требуют функцию 16 (Write Multiple Registers) даже для одного регистра
            // Пробуем сначала функцию 16
            try {
              await client.writeRegisters(tag.address, [registerValue]);
            } catch (error) {
              // Если функция 16 не поддерживается, пробуем функцию 6
              if (error.modbusCode === 1) {
                console.log(`Function 16 not supported, trying function 6 for tag ${tag.name}`);
                await client.writeRegister(tag.address, registerValue);
              } else {
                throw error;
              }
            }
          }
          break;

        case 'COIL':
          // Для COIL записываем boolean значение
          await client.writeCoil(tag.address, writeValue !== 0 && writeValue !== false);
          break;

        case 'INPUT_REGISTER':
          throw new Error('INPUT_REGISTER доступен только для чтения');

        case 'DISCRETE_INPUT':
          throw new Error('DISCRETE_INPUT доступен только для чтения');

        default:
          throw new Error(`Неподдерживаемый тип регистра: ${tag.registerType}`);
      }

      // Небольшая задержка после записи для стабильности
      await new Promise(resolve => setTimeout(resolve, 100));

      // Читаем значение обратно для подтверждения
      let readValue = null;
      if (tag.registerType === 'HOLDING_REGISTER') {
        const isFloat = tag.deviceDataType === 'float' || tag.serverDataType === 'float';
        if (isFloat) {
          const readResult = await client.readHoldingRegisters(tag.address, 2);
          readValue = this.convertRegistersToFloat(readResult.data[0], readResult.data[1]);
        } else {
          const readResult = await client.readHoldingRegisters(tag.address, 1);
          readValue = this.convertValue(readResult.data[0], tag.deviceDataType, tag.serverDataType);
        }
      } else if (tag.registerType === 'COIL') {
        const readResult = await client.readCoils(tag.address, 1);
        readValue = readResult.data[0] ? 1 : 0;
      }

      // Обновляем кэш значений
      if (!this.tagValuesCache.has(device.id)) {
        this.tagValuesCache.set(device.id, new Map());
      }
      const deviceCache = this.tagValuesCache.get(device.id);
      deviceCache.set(tag.id, {
        tagId: tag.id,
        tagName: tag.name,
        value: readValue,
        timestamp: new Date().toISOString()
      });

      // Отправляем обновленное значение через WebSocket
      this.broadcastTagValues(device.id, {
        [tag.id]: {
          tagId: tag.id,
          tagName: tag.name,
          value: readValue,
          timestamp: new Date().toISOString()
        }
      });

      // Восстанавливаем оригинальный таймаут
      client.setTimeout(originalTimeout);

      return {
        success: true,
        value: readValue
      };
    } catch (error) {
      // Восстанавливаем оригинальный таймаут даже при ошибке
      try {
        client.setTimeout(originalTimeout);
      } catch (e) {
        // Игнорируем ошибки при восстановлении таймаута
      }
      console.error(`Error in _doWriteTagValue for tag ${tag.id}:`, error);
      throw error;
    }
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
            connectionStatus: node.connectionStatus || 'disconnected',
            lastError: node.lastError,
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
                enabled: tag.enabled,
                deviceDataType: tag.deviceDataType,
                serverDataType: tag.serverDataType
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
        
        // Задержка перед запуском опроса для стабильности RS-485
        // Даем время на очистку буфера и инициализацию устройства
        await new Promise(resolve => setTimeout(resolve, 300));
        
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
