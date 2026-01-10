import express from 'express';

export default function connectionRoutes(prisma, modbusManager) {
  const router = express.Router();

  // Получить все узлы связи
  router.get('/', async (req, res) => {
    try {
      const nodes = await prisma.connectionNode.findMany({
        include: {
          devices: {
            include: {
              tags: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Получить узел связи по ID
  router.get('/:id', async (req, res) => {
    try {
      const node = await prisma.connectionNode.findUnique({
        where: { id: req.params.id },
        include: {
          devices: {
            include: {
              tags: true
            }
          }
        }
      });
      if (!node) {
        return res.status(404).json({ error: 'Connection node not found' });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Создать узел связи
  router.post('/', async (req, res) => {
    try {
      const { name, type, comPort, baudRate, dataBits, stopBits, parity, enabled } = req.body;
      
      const node = await prisma.connectionNode.create({
        data: {
          name,
          type: type || 'COM_RTU_MASTER',
          comPort,
          baudRate: baudRate || 9600,
          dataBits: dataBits || 8,
          stopBits: stopBits || 1,
          parity: parity || 'none',
          enabled: enabled !== undefined ? enabled : true
        }
      });

      // Если узел включен, запускаем соединение
      if (node.enabled) {
        await modbusManager.reloadConnection(node.id);
      }

      res.json(node);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Обновить узел связи
  router.put('/:id', async (req, res) => {
    try {
      const { name, type, comPort, baudRate, dataBits, stopBits, parity, enabled } = req.body;
      
      const node = await prisma.connectionNode.update({
        where: { id: req.params.id },
        data: {
          name,
          type,
          comPort,
          baudRate,
          dataBits,
          stopBits,
          parity,
          enabled
        }
      });

      // Перезапускаем соединение
      await modbusManager.reloadConnection(node.id);

      res.json(node);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Удалить узел связи
  router.delete('/:id', async (req, res) => {
    try {
      // Останавливаем соединение перед удалением
      await modbusManager.stopConnection(req.params.id);

      await prisma.connectionNode.delete({
        where: { id: req.params.id }
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
