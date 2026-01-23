/**
 * REST API маршруты для управления тегами Modbus
 * 
 * Тег представляет собой регистр Modbus устройства, который опрашивается
 * для чтения/записи значений. Каждый тег привязан к устройству.
 */

import express from 'express';

export default function tagRoutes(prisma, modbusManager) {
  const router = express.Router();

  /**
   * GET /api/tags
   * Получить список всех тегов с информацией об устройстве и узле связи
   */
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

  /**
   * GET /api/tags/:id
   * Получить конкретный тег по ID
   */
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

  /**
   * POST /api/tags
   * Создать новый тег
   * 
   * Параметры:
   * - deviceId: ID устройства, к которому привязан тег
   * - name: название тега
   * - address: адрес Modbus регистра
   * - registerType: тип регистра ('HOLDING_REGISTER', 'INPUT_REGISTER', 'COIL', 'DISCRETE_INPUT')
   * - deviceDataType: тип данных в устройстве ('int16', 'int32', 'float' и т.д.)
   * - serverDataType: тип данных на сервере ('int32', 'float' и т.д.)
   * - accessType: тип доступа ('ReadOnly' или 'ReadWrite')
   * - scaleFactor: коэффициент масштабирования (по умолчанию 1.0, например 0.1 для деления на 10)
   * - enabled: включен ли тег в опрос (по умолчанию true)
   */
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
        scaleFactor,
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
          scaleFactor: scaleFactor !== undefined ? scaleFactor : 1.0,
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

      // Перезапускаем соединение узла, чтобы новый тег начал опрашиваться
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

  /**
   * PUT /api/tags/:id
   * Обновить параметры тега
   * 
   * При изменении параметров тега необходимо перезапустить соединение узла
   */
  router.put('/:id', async (req, res) => {
    try {
      const {
        name,
        address,
        registerType,
        deviceDataType,
        serverDataType,
        accessType,
        scaleFactor,
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

      const updateData = {
        name,
        address,
        registerType,
        deviceDataType,
        serverDataType,
        accessType,
        enabled
      };

      // Добавляем scaleFactor только если он передан
      if (scaleFactor !== undefined) {
        updateData.scaleFactor = scaleFactor;
      }

      const updatedTag = await prisma.tag.update({
        where: {id: req.params.id},
        data: updateData,
        include: {
          device: {
            include: {
              connectionNode: true
            }
          }
        }
      });

      // Перезапускаем соединение узла для применения изменений
      if (modbusManager.isRunning) {
        await modbusManager.reloadConnection(tag.device.connectionNodeId);
      }

      res.json(updatedTag);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * DELETE /api/tags/:id
   * Удалить тег
   */
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

      // Перезапускаем соединение узла после удаления тега
      if (modbusManager.isRunning) {
        await modbusManager.reloadConnection(connectionNodeId);
      }

      res.json({success: true});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * POST /api/tags/:id/write
   * Записать значение в тег Modbus устройства
   * 
   * Работает только для тегов с типом доступа 'ReadWrite'.
   * Значение преобразуется согласно типу данных тега.
   * 
   * Параметры:
   * - value: значение для записи (число)
   */
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
      
      // Передаем детальную информацию об ошибке, включая Modbus код ошибки
      const errorResponse = {
        error: error.message,
        modbusCode: error.modbusCode, // Код ошибки Modbus (если есть)
        originalError: error.originalError ? {
          message: error.originalError.message,
          name: error.originalError.name
        } : undefined
      };
      
      res.status(500).json(errorResponse);
    }
  });

  return router;
}
