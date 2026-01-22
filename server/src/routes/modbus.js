/**
 * REST API маршруты для управления Modbus Manager
 * 
 * Modbus Manager - основной компонент, управляющий всеми Modbus соединениями,
 * опросом устройств и сбором исторических данных.
 */

import express from 'express';

export default function modbusRoutes(modbusManager) {
  const router = express.Router();

  /**
   * GET /api/modbus/status
   * Получить текущий статус Modbus Manager
   * 
   * Возвращает информацию о том, запущен ли Modbus Manager,
   * количество активных соединений и устройств.
   */
  router.get('/status', (req, res) => {
    try {
      const status = modbusManager.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * POST /api/modbus/start
   * Запустить Modbus Manager
   * 
   * Инициализирует все активные соединения с узлами связи,
   * начинает опрос устройств и сбор исторических данных.
   * После запуска отправляет обновление состояния всем WebSocket клиентам.
   */
  router.post('/start', async (req, res) => {
    try {
      await modbusManager.start();
      modbusManager.broadcastStateUpdate();
      res.json({success: true, status: modbusManager.getStatus()});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  /**
   * POST /api/modbus/stop
   * Остановить Modbus Manager
   * 
   * Останавливает все Modbus соединения, опрос устройств
   * и сбор исторических данных. После остановки отправляет
   * обновление состояния всем WebSocket клиентам.
   */
  router.post('/stop', async (req, res) => {
    try {
      await modbusManager.stop();
      modbusManager.broadcastStateUpdate();
      res.json({success: true, status: modbusManager.getStatus()});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  return router;
}
