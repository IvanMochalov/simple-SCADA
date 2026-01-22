/**
 * REST API маршруты для управления узлами связи
 * 
 * Узел связи представляет собой физическое соединение через COM порт
 * с настройками последовательного порта (скорость, биты данных, четность и т.д.)
 */

import express from 'express';

export default function connectionRoutes(prisma, modbusManager) {
  const router = express.Router();

  /**
   * GET /api/connections
   * Получить список всех узлов связи с вложенными устройствами и тегами
   */
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
        orderBy: {createdAt: 'desc'}
      });
      res.json(nodes);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * GET /api/connections/:id
   * Получить конкретный узел связи по ID с вложенными устройствами и тегами
   */
  router.get('/:id', async (req, res) => {
    try {
      const node = await prisma.connectionNode.findUnique({
        where: {id: req.params.id},
        include: {
          devices: {
            include: {
              tags: true
            }
          }
        }
      });
      if (!node) {
        return res.status(404).json({error: 'Connection node not found'});
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * POST /api/connections
   * Создать новый узел связи
   * 
   * Параметры:
   * - name: название узла
   * - type: тип соединения (по умолчанию 'COM')
   * - comPort: COM порт (например, 'COM3')
   * - baudRate: скорость передачи (по умолчанию 9600)
   * - dataBits: биты данных (по умолчанию 8)
   * - stopBits: стоп-биты (по умолчанию 1)
   * - parity: четность (по умолчанию 'none')
   * - enabled: включен ли узел в работу (по умолчанию true)
   */
  router.post('/', async (req, res) => {
    try {
      const {name, type, comPort, baudRate, dataBits, stopBits, parity, enabled} = req.body;

      const node = await prisma.connectionNode.create({
        data: {
          name,
          type: type || 'COM',
          comPort,
          baudRate: baudRate || 9600,
          dataBits: dataBits || 8,
          stopBits: stopBits || 1,
          parity: parity || 'none',
          enabled: enabled !== undefined ? enabled : true
        }
      });

      // Если Modbus Manager запущен и узел включен, сразу инициализируем соединение
      if (modbusManager.isRunning && node.enabled) {
        await modbusManager.reloadConnection(node.id);
      }

      res.json(node);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * PUT /api/connections/:id
   * Обновить параметры узла связи
   * 
   * При изменении параметров соединения необходимо перезапустить Modbus соединение
   */
  router.put('/:id', async (req, res) => {
    try {
      const {name, type, comPort, baudRate, dataBits, stopBits, parity, enabled} = req.body;

      const node = await prisma.connectionNode.update({
        where: {id: req.params.id},
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

      // Перезапускаем соединение, если Modbus Manager работает и узел включен
      // Это необходимо, так как параметры COM порта могли измениться
      if (modbusManager.isRunning && node.enabled) {
        await modbusManager.reloadConnection(node.id);
      }

      res.json(node);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * DELETE /api/connections/:id
   * Удалить узел связи
   * 
   * Перед удалением необходимо остановить активное Modbus соединение
   * Все связанные устройства и теги будут удалены каскадно (CASCADE)
   */
  router.delete('/:id', async (req, res) => {
    try {
      // Останавливаем Modbus соединение перед удалением из БД
      await modbusManager.stopConnection(req.params.id);

      await prisma.connectionNode.delete({
        where: {id: req.params.id}
      });

      res.json({success: true});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  return router;
}
