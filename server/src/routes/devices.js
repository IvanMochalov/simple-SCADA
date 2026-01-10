import express from 'express';

export default function deviceRoutes(prisma, modbusManager) {
  const router = express.Router();

  // Получить все устройства
  router.get('/', async (req, res) => {
    try {
      const devices = await prisma.device.findMany({
        include: {
          connectionNode: true,
          tags: true
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(devices);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Получить устройство по ID
  router.get('/:id', async (req, res) => {
    try {
      const device = await prisma.device.findUnique({
        where: { id: req.params.id },
        include: {
          connectionNode: true,
          tags: true
        }
      });
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      res.json(device);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Создать устройство
  router.post('/', async (req, res) => {
    try {
      const { connectionNodeId, name, address, responseTimeout, pollInterval, enabled } = req.body;
      
      const device = await prisma.device.create({
        data: {
          connectionNodeId,
          name,
          address,
          responseTimeout: responseTimeout || 1000,
          pollInterval: pollInterval || 1000,
          enabled: enabled !== undefined ? enabled : true,
          status: 'unknown'
        },
        include: {
          connectionNode: true,
          tags: true
        }
      });

      // Перезапускаем соединение узла
      await modbusManager.reloadConnection(connectionNodeId);

      res.json(device);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Обновить устройство
  router.put('/:id', async (req, res) => {
    try {
      const { name, address, responseTimeout, pollInterval, enabled } = req.body;
      
      const device = await prisma.device.findUnique({
        where: { id: req.params.id },
        include: { connectionNode: true }
      });

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      const updatedDevice = await prisma.device.update({
        where: { id: req.params.id },
        data: {
          name,
          address,
          responseTimeout,
          pollInterval,
          enabled
        },
        include: {
          connectionNode: true,
          tags: true
        }
      });

      // Перезапускаем соединение узла
      await modbusManager.reloadConnection(device.connectionNodeId);

      res.json(updatedDevice);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Удалить устройство
  router.delete('/:id', async (req, res) => {
    try {
      const device = await prisma.device.findUnique({
        where: { id: req.params.id },
        include: { connectionNode: true }
      });

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      const connectionNodeId = device.connectionNodeId;

      await prisma.device.delete({
        where: { id: req.params.id }
      });

      // Перезапускаем соединение узла
      await modbusManager.reloadConnection(connectionNodeId);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Переподключить устройство
  router.post('/:id/reconnect', async (req, res) => {
    try {
      const result = await modbusManager.reconnectDevice(req.params.id);
      res.json(result);
    } catch (error) {
      console.error('Error reconnecting device:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
