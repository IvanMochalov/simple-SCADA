import express from 'express';

export default function modbusRoutes(modbusManager) {
  const router = express.Router();

  // Получить статус Modbus Manager
  router.get('/status', (req, res) => {
    try {
      const status = modbusManager.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  // Запустить Modbus Manager
  router.post('/start', async (req, res) => {
    try {
      await modbusManager.start();
      modbusManager.broadcastStateUpdate();
      res.json({success: true, status: modbusManager.getStatus()});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });

  // Остановить Modbus Manager
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
