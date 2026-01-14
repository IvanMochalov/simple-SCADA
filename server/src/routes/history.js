import express from 'express';

export default function historyRoutes(prisma) {
  const router = express.Router();

  // Получить исторические данные
  router.get('/', async (req, res) => {
    try {
      const { deviceId, tagId, startTime, endTime, limit = 1000 } = req.query;

      const where = {};
      if (deviceId) where.deviceId = deviceId;
      if (tagId) where.tagId = tagId;
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

  // Получить исторические данные для конкретного тега
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

  // Получить исторические данные для устройства
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
