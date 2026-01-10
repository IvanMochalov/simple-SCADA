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

  return router;
}
