/**
 * REST API маршруты для управления устройствами Modbus
 * 
 * Устройство представляет собой Modbus slave с определенным адресом,
 * подключенный к узлу связи (COM порту)
 */

import express from 'express';

export default function deviceRoutes(prisma, modbusManager) {
  const router = express.Router();

  /**
   * GET /api/devices
   * Получить список всех устройств с информацией о узле связи и тегах
   */
  router.get('/', async (req, res) => {
    try {
      const devices = await prisma.device.findMany({
        include: {
          connectionNode: true,
          tags: true
        },
        orderBy: {createdAt: 'desc'}
      });
      res.json(devices);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * GET /api/devices/:id
   * Получить конкретное устройство по ID
   */
  router.get('/:id', async (req, res) => {
    try {
      const device = await prisma.device.findUnique({
        where: {id: req.params.id},
        include: {
          connectionNode: true,
          tags: true
        }
      });
      if (!device) {
        return res.status(404).json({error: 'Device not found'});
      }
      res.json(device);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * POST /api/devices
   * Создать новое устройство
   * 
   * Параметры:
   * - connectionNodeId: ID узла связи, к которому подключено устройство
   * - name: название устройства
   * - address: Modbus адрес устройства (1-247)
   * - responseTimeout: таймаут ответа в мс (по умолчанию 1000)
   * - pollInterval: интервал опроса тегов в мс (по умолчанию 1000)
   * - enabled: включено ли устройство в работу (по умолчанию true)
   */
  router.post('/', async (req, res) => {
    try {
      const {connectionNodeId, name, address, responseTimeout, pollInterval, enabled} = req.body;

      const device = await prisma.device.create({
        data: {
          connectionNodeId,
          name,
          address,
          responseTimeout: responseTimeout || 1000,
          pollInterval: pollInterval || 1000,
          enabled: enabled !== undefined ? enabled : true
        },
        include: {
          connectionNode: true,
          tags: true
        }
      });

      // Перезапускаем соединение узла, чтобы новое устройство начало опрашиваться
      if (modbusManager.isRunning) {
        await modbusManager.reloadConnection(connectionNodeId);
      }

      res.json(device);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * PUT /api/devices/:id
   * Обновить параметры устройства
   * 
   * При изменении параметров опроса необходимо перезапустить соединение узла
   */
  router.put('/:id', async (req, res) => {
    try {
      const {name, address, responseTimeout, pollInterval, enabled} = req.body;

      const device = await prisma.device.findUnique({
        where: {id: req.params.id},
        include: {connectionNode: true}
      });

      if (!device) {
        return res.status(404).json({error: 'Device not found'});
      }

      const updatedDevice = await prisma.device.update({
        where: {id: req.params.id},
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

      // Перезапускаем соединение узла для применения изменений
      if (modbusManager.isRunning) {
        await modbusManager.reloadConnection(device.connectionNodeId);
      }

      res.json(updatedDevice);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * DELETE /api/devices/:id
   * Удалить устройство
   * 
   * Все связанные теги будут удалены каскадно (CASCADE)
   */
  router.delete('/:id', async (req, res) => {
    try {
      const device = await prisma.device.findUnique({
        where: {id: req.params.id},
        include: {connectionNode: true}
      });

      if (!device) {
        return res.status(404).json({error: 'Device not found'});
      }

      const connectionNodeId = device.connectionNodeId;

      await prisma.device.delete({
        where: {id: req.params.id}
      });

      // Перезапускаем соединение узла после удаления устройства
      if (modbusManager.isRunning) {
        await modbusManager.reloadConnection(connectionNodeId);
      }

      res.json({success: true});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * POST /api/devices/:id/reconnect
   * Переподключить устройство
   * 
   * Полезно при сбоях связи - закрывает и заново открывает Modbus соединение
   */
  router.post('/:id/reconnect', async (req, res) => {
    try {
      const result = await modbusManager.reconnectDevice(req.params.id);
      res.json(result);
    } catch (error) {
      console.error('Error reconnecting device:', error);
      res.status(500).json({error: error.message});
    }
  });

  return router;
}
