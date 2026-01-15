import express from 'express';

export default function tagRoutes(prisma, modbusManager) {
  const router = express.Router();

  // Получить все теги
  router.get('/', async (req, res) => {
    try {
      const tags = await prisma.tag.findMany({
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        },
        orderBy: {createdAt: 'desc'}
      });
      res.json(tags);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  // Получить тег по ID
  router.get('/:id', async (req, res) => {
    try {
      const tag = await prisma.tag.findUnique({
        where: {id: req.params.id},
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        }
      });
      if (!tag) {
        return res.status(404).json({error: 'Tag not found'});
      }
      res.json(tag);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  // Создать тег
  router.post('/', async (req, res) => {
    try {
      const {
        deviceId,
        name,
        address,
        registerType,
        deviceDataType,
        serverDataType,
        accessType,
        enabled
      } = req.body;

      const tag = await prisma.tag.create({
        data: {
          deviceId,
          name,
          address,
          registerType: registerType || 'HOLDING_REGISTER',
          deviceDataType: deviceDataType || 'int16',
          serverDataType: serverDataType || 'int32',
          accessType: accessType || 'ReadOnly',
          enabled: enabled !== undefined ? enabled : true
        },
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        }
      });

      // Перезапускаем соединение узла
      const device = await prisma.device.findUnique({
        where: {id: deviceId},
        include: {connectionNode: true}
      });

      if (modbusManager.isRunning && device) {
        await modbusManager.reloadConnection(device.connectionNodeId);
      }

      res.json(tag);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  // Обновить тег
  router.put('/:id', async (req, res) => {
    try {
      const {
        name,
        address,
        registerType,
        deviceDataType,
        serverDataType,
        accessType,
        enabled
      } = req.body;

      const tag = await prisma.tag.findUnique({
        where: {id: req.params.id},
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        }
      });

      if (!tag) {
        return res.status(404).json({error: 'Tag not found'});
      }

      const updatedTag = await prisma.tag.update({
        where: {id: req.params.id},
        data: {
          name,
          address,
          registerType,
          deviceDataType,
          serverDataType,
          accessType,
          enabled
        },
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        }
      });

      if (modbusManager.isRunning) {
        // Перезапускаем соединение узла
        await modbusManager.reloadConnection(tag.device.connectionNodeId);
      }

      res.json(updatedTag);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  // Удалить тег
  router.delete('/:id', async (req, res) => {
    try {
      const tag = await prisma.tag.findUnique({
        where: {id: req.params.id},
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        }
      });

      if (!tag) {
        return res.status(404).json({error: 'Tag not found'});
      }

      const connectionNodeId = tag.device.connectionNodeId;

      await prisma.tag.delete({
        where: {id: req.params.id}
      });

      if (modbusManager.isRunning) {
        // Перезапускаем соединение узла
        await modbusManager.reloadConnection(connectionNodeId);
      }

      res.json({success: true});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  // Записать значение в тег
  router.post('/:id/write', async (req, res) => {
    try {
      const {id} = req.params;
      const {value} = req.body;

      if (value === undefined || value === null) {
        return res.status(400).json({error: 'Значение не указано'});
      }

      const result = await modbusManager.writeTagValue(id, value);
      res.json(result);
    } catch (error) {
      console.error('Error writing tag value:', error);
      res.status(500).json({error: error.message});
    }
  });

  return router;
}
