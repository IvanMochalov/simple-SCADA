/**
 * REST API маршруты для получения исторических данных
 * 
 * Исторические данные собираются автоматически каждую минуту
 * для всех активных тегов подключенных устройств.
 */

import express from 'express';

export default function historyRoutes(prisma) {
  const router = express.Router();

  /**
   * GET /api/history/tag/:tagId
   * Получить исторические данные для конкретного тега
   * 
   * Query параметры:
   * - startTime: начальное время (ISO строка)
   * - endTime: конечное время (ISO строка)
   * - limit: максимальное количество записей (по умолчанию 1000)
   */
  router.get('/tag/:tagId', async (req, res) => {
    try {
      const { tagId } = req.params;
      const { startTime, endTime, limit = 1000 } = req.query;

      const where = { tagId };
      if (startTime || endTime) {
        where.timestamp = {};
        if (startTime) where.timestamp.gte = new Date(startTime);
        if (endTime) where.timestamp.lte = new Date(endTime);
      }

      const history = await prisma.historyData.findMany({
        where,
        include: {
          device: {
            select: {
              id: true,
              name: true
            }
          },
          tag: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit)
      });

      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/history/node/:nodeId
   * Получить исторические данные для всех устройств узла связи
   * 
   * Данные группируются по времени и возвращаются в табличном формате
   * для удобного отображения в таблице и графиках.
   * 
   * Query параметры:
   * - startTime: начальное время (ISO строка)
   * - endTime: конечное время (ISO строка)
   * - limit: максимальное количество записей (по умолчанию 10000)
   */
  router.get('/node/:nodeId', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const { startTime, endTime, limit = 10000 } = req.query;

      // Получаем все устройства узла
      const devices = await prisma.device.findMany({
        where: { connectionNodeId: nodeId },
        include: {
          connectionNode: {
            select: {
              id: true,
              name: true
            }
          },
          tags: {
            where: { enabled: true },
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      const deviceIds = devices.map(d => d.id);

      if (deviceIds.length === 0) {
        return res.json({
          data: [],
          tags: []
        });
      }

      const where = { deviceId: { in: deviceIds } };
      if (startTime || endTime) {
        where.timestamp = {};
        if (startTime) where.timestamp.gte = new Date(startTime);
        if (endTime) where.timestamp.lte = new Date(endTime);
      }

      const history = await prisma.historyData.findMany({
        where,
        include: {
          device: {
            include: {
              connectionNode: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          tag: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { timestamp: 'asc' },
        take: parseInt(limit)
      });

      // Группируем данные по времени и формируем структуру для таблицы
      const groupedByTime = {};
      const uniqueTags = {};

      history.forEach(item => {
        if (!item.tag || !item.device) return;

        const timestamp = new Date(item.timestamp);
        const normalizedTime = new Date(
          timestamp.getFullYear(),
          timestamp.getMonth(),
          timestamp.getDate(),
          timestamp.getHours(),
          timestamp.getMinutes(),
          timestamp.getSeconds()
        ).toISOString();

        if (!groupedByTime[normalizedTime]) {
          groupedByTime[normalizedTime] = {
            timestamp: normalizedTime,
            tags: {}
          };
        }

        const tagKey = `${item.device.connectionNode.name}_${item.device.name}_${item.tag.name}`;
        const tagId = `${item.device.id}_${item.tag.id}`;

        groupedByTime[normalizedTime].tags[tagId] = {
          value: item.value,
          tag: item.tag,
          device: item.device,
          node: item.device.connectionNode
        };

        if (!uniqueTags[tagId]) {
          uniqueTags[tagId] = {
            id: tagId,
            tagId: item.tag.id,
            tagName: item.tag.name,
            deviceId: item.device.id,
            deviceName: item.device.name,
            nodeId: item.device.connectionNode.id,
            nodeName: item.device.connectionNode.name,
            displayName: `${item.device.connectionNode.name} → ${item.device.name} → ${item.tag.name}`
          };
        }
      });

      const tableData = Object.keys(groupedByTime)
        .sort()
        .map(normalizedTime => {
          const timeGroup = groupedByTime[normalizedTime];
          const row = {
            timestamp: normalizedTime,
            tags: {}
          };

          Object.keys(uniqueTags).forEach(tagId => {
            if (timeGroup.tags[tagId]) {
              row.tags[tagId] = {
                value: timeGroup.tags[tagId].value,
                tag: timeGroup.tags[tagId].tag,
                device: timeGroup.tags[tagId].device,
                node: timeGroup.tags[tagId].node
              };
            } else {
              row.tags[tagId] = null;
            }
          });

          return row;
        });

      res.json({
        data: tableData,
        tags: Object.values(uniqueTags)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/history/system
   * Получить исторические данные для всей системы (всех узлов связи)
   * 
   * Данные группируются по времени и возвращаются в табличном формате.
   * 
   * Query параметры:
   * - startTime: начальное время (ISO строка)
   * - endTime: конечное время (ISO строка)
   * - limit: максимальное количество записей (по умолчанию 10000)
   */
  router.get('/system', async (req, res) => {
    try {
      const { startTime, endTime, limit = 10000 } = req.query;

      const where = {};
      if (startTime || endTime) {
        where.timestamp = {};
        if (startTime) where.timestamp.gte = new Date(startTime);
        if (endTime) where.timestamp.lte = new Date(endTime);
      }

      const history = await prisma.historyData.findMany({
        where,
        include: {
          device: {
            include: {
              connectionNode: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          tag: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { timestamp: 'asc' },
        take: parseInt(limit)
      });

      // Группируем данные по времени
      const groupedByTime = {};
      const uniqueTags = {};

      history.forEach(item => {
        if (!item.tag || !item.device) return;

        const timestamp = new Date(item.timestamp);
        const normalizedTime = new Date(
          timestamp.getFullYear(),
          timestamp.getMonth(),
          timestamp.getDate(),
          timestamp.getHours(),
          timestamp.getMinutes(),
          timestamp.getSeconds()
        ).toISOString();

        if (!groupedByTime[normalizedTime]) {
          groupedByTime[normalizedTime] = {
            timestamp: normalizedTime,
            tags: {}
          };
        }

        const tagId = `${item.device.id}_${item.tag.id}`;

        groupedByTime[normalizedTime].tags[tagId] = {
          value: item.value,
          tag: item.tag,
          device: item.device,
          node: item.device.connectionNode
        };

        if (!uniqueTags[tagId]) {
          uniqueTags[tagId] = {
            id: tagId,
            tagId: item.tag.id,
            tagName: item.tag.name,
            deviceId: item.device.id,
            deviceName: item.device.name,
            nodeId: item.device.connectionNode.id,
            nodeName: item.device.connectionNode.name,
            displayName: `${item.device.connectionNode.name} → ${item.device.name} → ${item.tag.name}`
          };
        }
      });

      const tableData = Object.keys(groupedByTime)
        .sort()
        .map(normalizedTime => {
          const timeGroup = groupedByTime[normalizedTime];
          const row = {
            timestamp: normalizedTime,
            tags: {}
          };

          Object.keys(uniqueTags).forEach(tagId => {
            if (timeGroup.tags[tagId]) {
              row.tags[tagId] = {
                value: timeGroup.tags[tagId].value,
                tag: timeGroup.tags[tagId].tag,
                device: timeGroup.tags[tagId].device,
                node: timeGroup.tags[tagId].node
              };
            } else {
              row.tags[tagId] = null;
            }
          });

          return row;
        });

      res.json({
        data: tableData,
        tags: Object.values(uniqueTags)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/history/device/:deviceId
   * Получить исторические данные для конкретного устройства
   * 
   * Данные группируются по времени и возвращаются в табличном формате.
   * 
   * Query параметры:
   * - startTime: начальное время (ISO строка)
   * - endTime: конечное время (ISO строка)
   * - limit: максимальное количество записей (по умолчанию 1000)
   */
  router.get('/device/:deviceId', async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { startTime, endTime, limit = 1000 } = req.query;

      const where = { deviceId };
      if (startTime || endTime) {
        where.timestamp = {};
        if (startTime) where.timestamp.gte = new Date(startTime);
        if (endTime) where.timestamp.lte = new Date(endTime);
      }

      // Получаем все записи истории
      const history = await prisma.historyData.findMany({
        where,
        include: {
          device: {
            select: {
              id: true,
              name: true
            }
          },
          tag: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { timestamp: 'asc' },
        take: parseInt(limit)
      });

      // Группируем данные по нормализованным временным меткам (до секунды)
      const groupedByTime = {};
      const uniqueTags = {};

      history.forEach(item => {
        if (!item.tag || !item.tag.id) return;

        // Нормализуем временную метку до секунды для группировки
        const timestamp = new Date(item.timestamp);
        const normalizedTime = new Date(
          timestamp.getFullYear(),
          timestamp.getMonth(),
          timestamp.getDate(),
          timestamp.getHours(),
          timestamp.getMinutes(),
          timestamp.getSeconds()
        ).toISOString();

        // Группируем по времени
        if (!groupedByTime[normalizedTime]) {
          groupedByTime[normalizedTime] = {
            timestamp: normalizedTime,
            tags: {}
          };
        }

        // Сохраняем значение тега для этого времени
        groupedByTime[normalizedTime].tags[item.tag.id] = {
          value: item.value,
          tag: item.tag,
          device: item.device
        };

        // Собираем уникальные теги
        if (!uniqueTags[item.tag.id]) {
          uniqueTags[item.tag.id] = {
            id: item.tag.id,
            name: item.tag.name,
            deviceName: item.device?.name || 'Неизвестно'
          };
        }
      });

      // Преобразуем сгруппированные данные в массив строк для таблицы
      const tableData = Object.keys(groupedByTime)
        .sort()
        .map(normalizedTime => {
          const timeGroup = groupedByTime[normalizedTime];
          const row = {
            timestamp: normalizedTime,
            tags: {}
          };

          // Заполняем значения тегов
          Object.keys(uniqueTags).forEach(tagId => {
            if (timeGroup.tags[tagId]) {
              row.tags[tagId] = {
                value: timeGroup.tags[tagId].value,
                tag: timeGroup.tags[tagId].tag
              };
            } else {
              row.tags[tagId] = null;
            }
          });

          return row;
        });

      // Возвращаем сгруппированные данные и список тегов
      res.json({
        data: tableData,
        tags: Object.values(uniqueTags)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
