/**
 * ModbusManager - основной класс для управления Modbus RTU соединениями
 *
 * Отвечает за:
 * - Управление соединениями с COM портами (узлы связи)
 * - Опрос Modbus устройств по расписанию
 * - Кэширование значений тегов
 * - Сбор исторических данных
 * - Запись значений в теги
 * - Отправку обновлений через WebSocket
 *
 * Использует библиотеку modbus-serial для работы с Modbus RTU протоколом.
 */

import ModbusRTU from 'modbus-serial';
import {isIterable} from "../utils/index.js";

export class ModbusManager {
  constructor(prisma, wss) {
    this.prisma = prisma; // Prisma клиент для работы с БД
    this.wss = wss; // WebSocket сервер для отправки обновлений клиентам

    // Хранилище активных Modbus соединений: connectionNodeId -> { client, devices }
    this.archiveInterval = 60000; // Интервал архивации по умолчанию (60 секунд)
    this.connections = new Map();

    // Интервалы опроса устройств: deviceId -> interval ID
    this.pollingIntervals = new Map();

    // Интервал сбора исторических данных (каждую минуту)
    this.historyInterval = null;

    // Флаг работы Modbus Manager
    this.isRunning = false;

    // Кэш значений тегов: deviceId -> { tagId -> { value, timestamp } }
    this.tagValuesCache = new Map();

    // Блокировки для предотвращения параллельного опроса одного устройства
    // deviceId -> Promise (текущий опрос)
    this.devicePollingLocks = new Map();

    // Блокировки для предотвращения параллельной записи в одно устройство
    // deviceId -> Promise (текущая запись)
    this.deviceWriteLocks = new Map();
  }

  /**
   * Запуск Modbus Manager
   *
   * Выполняет:
   * 1. Загрузку всех активных узлов связи с устройствами и тегами из БД
   * 2. Инициализацию Modbus соединений для каждого узла
   * 3. Запуск периодического опроса устройств
   * 4. Запуск сбора исторических данных (каждую минуту)
   *
   * Если какой-то узел не удалось запустить, работа продолжается с остальными.
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('Starting Modbus Manager...');

    // Загружаем все активные узлы связи с включенными устройствами и тегами
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

    // Запускаем Modbus соединения для каждого узла связи
    // Если один узел не запустился (например, COM порт занят), продолжаем с остальными
    for (const node of nodes) {
      try {
        await this.startConnection(node);
      } catch (error) {
        console.error(`Failed to start connection for node ${node.name}:`, error);
        // Продолжаем работу с другими узлами
      }
    }

    // Загружаем интервал архивации из настроек
    await this.loadArchiveInterval();

    // Запускаем периодический сбор исторических данных
    // Проверяем, есть ли хотя бы один активный тег в системе
    this.startHistoryCollection();

    console.log('Modbus Manager started');
  }

  /**
   * Остановка Modbus Manager
   *
   * Выполняет:
   * 1. Остановку всех интервалов опроса устройств
   * 2. Закрытие всех Modbus соединений
   * 3. Обновление статусов узлов связи в БД
   * 4. Остановку сбора исторических данных
   */
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    console.log('Stopping Modbus Manager...');

    // Останавливаем все интервалы периодического опроса устройств
    for (const interval of this.pollingIntervals.values()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();

    // Закрываем все Modbus соединения и обновляем статусы в БД
    const nodeIds = Array.from(this.connections.keys());
    for (const nodeId of nodeIds) {
      const conn = this.connections.get(nodeId);
      try {
        if (conn && conn.client && conn.client.isOpen) {
          await conn.client.close();
        }
        // Обновляем статус узла связи на 'disconnected' в БД
        await this.updateNodeConnectionStatus(nodeId, 'disconnected', null);
      } catch (error) {
        console.error(`Error closing connection ${nodeId}:`, error);
      }
    }
    this.connections.clear();

    // Останавливаем интервал сбора исторических данных
    this.stopHistoryCollection();
  }

  /**
   * Загружает интервал архивации из настроек БД
   */
  async loadArchiveInterval() {
    try {
      const setting = await this.prisma.systemSettings.findUnique({
        where: {key: 'archiveInterval'}
      });

      if (setting) {
        this.archiveInterval = parseInt(setting.value) || 60000;
      } else {
        // Если настройка не найдена, создаем с дефолтным значением
        await this.prisma.systemSettings.create({
          data: {
            key: 'archiveInterval',
            value: '60000'
          }
        });
        this.archiveInterval = 60000;
      }
    } catch (error) {
      console.error('Error loading archive interval:', error);
      this.archiveInterval = 60000; // Используем значение по умолчанию при ошибке
    }
  }

  /**
   * Запускает сбор исторических данных с текущим интервалом
   */
  startHistoryCollection() {
    // Останавливаем предыдущий интервал, если он существует
    this.stopHistoryCollection();

    // Запускаем новый интервал с текущим значением archiveInterval
    this.historyInterval = setInterval(() => {
      // Проверяем, есть ли хотя бы один активный тег в системе
      const nodes = Array.from(this.connections.values());
      const isSomeNodeHasDeviceWithTagEnabled = nodes.some(conn => {
        const devices = Array.from(conn.devices.values());
        return devices.some(device =>
          device.enabled &&
          device.tags &&
          device.tags.length > 0 &&
          device.tags.some(tag => tag.enabled)
        );
      });

      if (isSomeNodeHasDeviceWithTagEnabled) {
        this.collectHistoryData();
      }
    }, this.archiveInterval);
  }

  /**
   * Останавливает сбор исторических данных
   */
  stopHistoryCollection() {
    if (this.historyInterval) {
      clearInterval(this.historyInterval);
      this.historyInterval = null;
    }
  }

  /**
   * Обновляет интервал архивации и перезапускает сбор данных
   * @param {number} interval - Новый интервал в миллисекундах
   */
  async updateArchiveInterval(interval) {
    this.archiveInterval = interval;
    this.startHistoryCollection();
    console.log(`Archive interval updated to ${interval} ms`);
  }

  /**
   * Инициализация Modbus соединения для узла связи
   *
   * @param {Object} node - узел связи с настройками COM порта
   *
   * Выполняет:
   * 1. Загрузку устройств и тегов узла (если не загружены)
   * 2. Создание Modbus RTU клиента
   * 3. Подключение к COM порту с указанными параметрами
   * 4. Настройку таймаута
   * 5. Запуск периодического опроса устройств
   */
  async startConnection(node) {
    try {
      console.log(`Starting connection for node ${node.name} (${node.comPort})`);

      // Если устройства не были загружены вместе с узлом, загружаем их отдельно
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

      // Создаем Modbus RTU клиент
      const client = new ModbusRTU();

      // Подключаемся к COM порту с буферизацией
      // modbus-serial автоматически создаст и откроет SerialPort
      await client.connectRTUBuffered(node.comPort, {
        baudRate: node.baudRate,
        dataBits: node.dataBits,
        stopBits: node.stopBits,
        parity: node.parity || 'none',
      });

      // Даем время на инициализацию COM порта и очистку буфера
      // Это критично для стабильной работы RS-485, особенно при переключении направления
      await new Promise(resolve => setTimeout(resolve, 500));

      // Устанавливаем таймаут для Modbus операций
      // Используем минимальный таймаут среди всех устройств узла
      // Если устройств нет, используем дефолтный таймаут 1000 мс
      const timeouts = node.devices.map(d => d.responseTimeout || 1000);
      const minTimeout = timeouts.length > 0 ? Math.min(...timeouts) : 1000;
      client.setTimeout(minTimeout);

      const connection = {
        client,
        devices: new Map(),
        pollingQueue: [], // Очередь устройств для опроса
        isPolling: false // Флаг, что идет опрос
      };

      // КРИТИЧНО: Добавляем соединение в Map СРАЗУ после создания
      // Это предотвращает race condition, когда запись происходит до завершения инициализации
      this.connections.set(node.id, connection);

      // Запускаем опрос только для включенных устройств с тегами
      const enabledDevices = node.devices.filter(device =>
        device.enabled &&
        device.tags &&
        device.tags.length > 0 &&
        device.tags.some(tag => tag.enabled)
      );

      // Сохраняем все устройства в connection
      for (const device of enabledDevices) {
        connection.devices.set(device.id, device);
      }

      // Запускаем единый интервал опроса для всех устройств узла
      // Это гарантирует последовательный опрос устройств на RS-485 шине
      if (enabledDevices.length > 0) {
        // Используем минимальный интервал опроса среди всех устройств
        const minPollInterval = Math.min(...enabledDevices.map(d => d.pollInterval || 1000));

        // Запускаем единый интервал для последовательного опроса всех устройств
        const nodePollingInterval = setInterval(async () => {
          await this.pollNodeDevices(node.id, connection);
        }, minPollInterval);

        // Сохраняем интервал для узла
        this.pollingIntervals.set(node.id, nodePollingInterval);

        // Делаем первый опрос с задержкой для стабилизации
        setTimeout(async () => {
          await this.pollNodeDevices(node.id, connection);
        }, 200);
      }

      // Обновляем статус подключения узла
      await this.updateNodeConnectionStatus(node.id, 'connected', null);

      console.log(`Connection started for node ${node.name} with ${enabledDevices.length} enabled devices`);
    } catch (error) {
      console.error(`Error starting connection for node ${node.name}:`, error);

      // Удаляем соединение из Map, если оно было добавлено, но инициализация не завершилась
      if (this.connections.has(node.id)) {
        const failedConnection = this.connections.get(node.id);
        // Закрываем клиент, если он был создан
        if (failedConnection && failedConnection.client) {
          try {
            if (failedConnection.client.isOpen) {
              await failedConnection.client.close();
            }
          } catch (closeError) {
            // Игнорируем ошибки при закрытии
          }
        }
        this.connections.delete(node.id);
      }

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
      // Останавливаем опрос узла (единый интервал для всех устройств)
      this.stopNodePolling(nodeId);

      // Также останавливаем опрос отдельных устройств (для обратной совместимости)
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

  // Последовательный опрос всех устройств узла
  async pollNodeDevices(nodeId, connection) {
    // Если уже идет опрос, пропускаем этот цикл
    if (connection.isPolling) {
      return;
    }

    // Проверяем, не идет ли запись в какое-либо устройство узла
    // Если идет запись, пропускаем этот цикл опроса для предотвращения конфликтов на RS-485
    const hasActiveWrite = Array.from(connection.devices.keys()).some(deviceId =>
      this.deviceWriteLocks.has(deviceId)
    );
    if (hasActiveWrite) {
      return;
    }

    connection.isPolling = true;

    try {
      // Получаем все включенные устройства узла
      const devices = Array.from(connection.devices.values()).filter(device =>
        device.enabled &&
        device.tags &&
        device.tags.length > 0 &&
        device.tags.some(tag => tag.enabled)
      );

      // Опрашиваем устройства последовательно
      for (let i = 0; i < devices.length; i++) {
        const device = devices[i];

        // Задержка между опросами устройств для стабильности RS-485
        // Небольшая задержка нужна для очистки буфера и предотвращения конфликтов
        // При интервале 500 мс это критично для стабильности
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 50)); // Оптимизировано: 100 -> 50 мс
        }

        // Дополнительная проверка на запись (на случай, если запись началась во время опроса)
        const writeLock = this.deviceWriteLocks.get(device.id);
        if (writeLock) {
          // Пропускаем устройство, если идет запись
          continue;
        }

        // Опрашиваем устройство
        await this.pollDevice(device, connection.client);
      }
    } catch (error) {
      console.error(`Error polling node devices ${nodeId}:`, error);
    } finally {
      connection.isPolling = false;
    }
  }

  stopDevicePolling(deviceId) {
    // Останавливаем интервал для устройства (если используется старый подход)
    const interval = this.pollingIntervals.get(deviceId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(deviceId);
    }
  }

  stopNodePolling(nodeId) {
    // Останавливаем интервал опроса для узла
    const interval = this.pollingIntervals.get(nodeId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(nodeId);
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
      // Проверяем, что устройство существует, включено и имеет итерируемые теги
      if (!device || !device.enabled || !device.tags || !isIterable(device.tags)) {
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
      for (const tag of device.tags) {
        try {
          let value = null;

          // Задержка между чтениями регистров для стабильности RS-485
          // Небольшая задержка нужна для очистки буфера между запросами
          // Это предотвращает CRC ошибки и таймауты
          if (device.tags.indexOf(tag) > 0) {
            await new Promise(resolve => setTimeout(resolve, 30)); // Уменьшено с 50 до 30 мс
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
                // Применяем масштабирование для float, если указано
                if (tag.scaleFactor && tag.scaleFactor !== 1.0) {
                  value = value * tag.scaleFactor;
                }
              } else {
                value = this.convertValue(holdingResult.data[0], tag.deviceDataType, tag.serverDataType, tag.scaleFactor || 1.0);
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
                // Применяем масштабирование для float, если указано
                if (tag.scaleFactor && tag.scaleFactor !== 1.0) {
                  value = value * tag.scaleFactor;
                }
              } else {
                value = this.convertValue(inputResult.data[0], tag.deviceDataType, tag.serverDataType, tag.scaleFactor || 1.0);
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

  convertValue(rawValue, deviceDataType, serverDataType, scaleFactor = 1.0) {
    let value = rawValue;

    // Простая конвертация для int16 -> int32
    if (deviceDataType === 'int16' && serverDataType === 'int32') {
      // Преобразуем int16 в int32 (знак сохраняется)
      if (rawValue >= 32768) {
        value = rawValue - 65536; // Отрицательное число
      } else {
        value = rawValue;
      }
    }

    // Применяем масштабирование
    if (scaleFactor !== 1.0) {
      value = value * scaleFactor;
    }

    return value;
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
      // Если соединение не найдено сразу, делаем небольшую задержку и повторную попытку
      // Это решает проблему race condition при быстром запуске записи после старта Modbus Manager
      let connection = this.connections.get(tag.device.connectionNodeId);

      if (!connection) {
        // Небольшая задержка для случая, когда соединение еще инициализируется
        await new Promise(resolve => setTimeout(resolve, 100));
        connection = this.connections.get(tag.device.connectionNodeId);
      }

      if (!connection) {
        // Проверяем, запущен ли Modbus Manager
        if (!this.isRunning) {
          throw new Error('Modbus Manager не запущен. Запустите Modbus Manager перед записью значений.');
        }
        throw new Error(`Узел связи не найден. Убедитесь, что узел "${tag.device.connectionNode?.name || tag.device.connectionNodeId}" подключен и Modbus Manager запущен.`);
      }

      if (!connection.client) {
        throw new Error('Modbus клиент не инициализирован для узла связи');
      }

      // Проверяем, что клиент действительно открыт и готов к работе
      if (!connection.client.isOpen) {
        throw new Error('COM порт узла связи не открыт. Попробуйте переподключить узел.');
      }

      const client = connection.client;
      const device = tag.device;

      // КРИТИЧНО: Проверяем, не идет ли уже запись в это устройство
      // Предотвращаем одновременные записи в одно устройство
      if (this.deviceWriteLocks.has(device.id)) {
        throw new Error('Запись в устройство уже выполняется. Дождитесь завершения предыдущей операции.');
      }

      // Устанавливаем временную блокировку СРАЗУ после проверки
      // Это предотвращает race condition, когда две записи проходят проверку одновременно
      const tempLockPromise = Promise.resolve(); // Временный Promise для блокировки
      this.deviceWriteLocks.set(device.id, tempLockPromise);

      let writePromise = null; // Объявляем вне try для доступа в catch/finally

      try {
        // Ждем завершения текущего опроса устройства, если он идет
        const pollingLock = this.devicePollingLocks.get(device.id);
        if (pollingLock) {
          try {
            await pollingLock;
          } catch (error) {
            // Игнорируем ошибки опроса
          }
        }

        // КРИТИЧНО: Ждем завершения опроса узла, если он идет
        // На RS-485 нельзя писать во время опроса других устройств на той же шине
        // Это предотвращает конфликты и таймауты
        let waitCount = 0;
        const maxWait = 20; // Максимум 20 попыток (1 секунда при интервале 50 мс)
        while (connection.isPolling && waitCount < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 50));
          waitCount++;
        }

        // Дополнительная задержка для очистки буфера RS-485 после опроса
        // Это критично для стабильности при быстрых интервалах (500 мс и выше)
        await new Promise(resolve => setTimeout(resolve, 100));

        // ТЕПЕРЬ создаем Promise для реальной записи и заменяем временную блокировку
        // Это гарантирует, что опрос узла не начнется во время записи
        writePromise = this._doWriteTagValue(tag, device, client, value);
        this.deviceWriteLocks.set(device.id, writePromise);

        // Выполняем запись
        return await writePromise;
      } catch (error) {
        // Если произошла ошибка до начала записи, удаляем временную блокировку
        const currentLock = this.deviceWriteLocks.get(device.id);
        if (currentLock === tempLockPromise || currentLock === writePromise) {
          this.deviceWriteLocks.delete(device.id);
        }
        throw error;
      } finally {
        // Удаляем блокировку записи (временную или реальную)
        const currentLock = this.deviceWriteLocks.get(device.id);
        if (currentLock === tempLockPromise || (writePromise && currentLock === writePromise)) {
          this.deviceWriteLocks.delete(device.id);
        }

        // Задержка после записи для стабильности RS-485
        // Даем время на обработку ответа устройства и очистку буфера
        // Это важно для предотвращения конфликтов при следующем цикле опроса
        await new Promise(resolve => setTimeout(resolve, 150)); // Оптимизировано: 200 -> 150 мс

        // Проверяем, что устройство все еще включено и соединение активно
        const updatedDevice = await this.prisma.device.findUnique({
          where: {id: device.id},
          include: {
            connectionNode: true,
            tags: {
              where: {enabled: true}
            }
          }
        });

        if (updatedDevice && updatedDevice.enabled && connection.client &&
          updatedDevice.tags && Array.isArray(updatedDevice.tags) && updatedDevice.tags.length > 0) {
          // Обновляем устройство в connection.devices
          // Опрос будет выполняться через pollNodeDevices автоматически
          connection.devices.set(device.id, updatedDevice);
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

      // Применяем обратное масштабирование перед записью
      // Если scaleFactor = 0.1 (значит при чтении делим на 10), то при записи умножаем на 10
      if (tag.scaleFactor && tag.scaleFactor !== 1.0) {
        writeValue = writeValue / tag.scaleFactor;
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

            // Некоторые устройства не поддерживают функцию 6 (Write Single Register)
            // и требуют функцию 16 (Write Multiple Registers) даже для одного регистра
            // Пробуем сначала функцию 16
            try {
              console.log(`Writing value to tag ${tag.name} (${tag.id}): address=${tag.address}, originalValue=${writeValue}, registerValue=${registerValue} (uint16), deviceDataType=${tag.deviceDataType}, serverDataType=${tag.serverDataType}, device=${device.name} (address ${device.address}) width 16 function`);
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
          // Применяем масштабирование для float, если указано
          if (tag.scaleFactor && tag.scaleFactor !== 1.0) {
            readValue = readValue * tag.scaleFactor;
          }
        } else {
          const readResult = await client.readHoldingRegisters(tag.address, 1);
          readValue = this.convertValue(readResult.data[0], tag.deviceDataType, tag.serverDataType, tag.scaleFactor || 1.0);
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

        // Пропускаем устройства без тегов или с неитерируемыми тегами
        if (!device.tags || !isIterable(device.tags)) continue;

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
      ? {title: messageData, description: ''}
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
                serverDataType: tag.serverDataType,
                scaleFactor: tag.scaleFactor !== undefined && tag.scaleFactor !== null ? tag.scaleFactor : 1.0
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

      if (updatedDevice.enabled && Array.isArray(updatedDevice.tags) && updatedDevice.tags.length > 0) {
        // Обновляем устройство в connection.devices
        // Опрос будет выполняться через pollNodeDevices автоматически
        connection.devices.set(deviceId, updatedDevice);
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
