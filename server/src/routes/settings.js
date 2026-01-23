/**
 * API маршруты для управления настройками системы
 */

import express from 'express';

const router = express.Router();

/**
 * Инициализация маршрутов настроек
 * @param {PrismaClient} prisma - Prisma клиент для работы с БД
 * @returns {Router} Express router
 */
export default function settingsRoutes(prisma, modbusManager) {
  // Получение интервала архивации
  router.get('/archive-interval', async (req, res) => {
    try {
      const setting = await prisma.systemSettings.findUnique({
        where: { key: 'archiveInterval' }
      });

      // Если настройка не найдена, возвращаем значение по умолчанию
      const interval = setting ? parseInt(setting.value) : 60000;
      res.json({ interval });
    } catch (error) {
      console.error('Error getting archive interval:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Установка интервала архивации
  router.put('/archive-interval', async (req, res) => {
    try {
      const { interval } = req.body;

      if (!interval || typeof interval !== 'number' || interval < 1000) {
        return res.status(400).json({ error: 'Интервал должен быть числом не менее 1000 мс' });
      }

      // Создаем или обновляем настройку
      const setting = await prisma.systemSettings.upsert({
        where: { key: 'archiveInterval' },
        update: { value: interval.toString() },
        create: {
          key: 'archiveInterval',
          value: interval.toString()
        }
      });

      // Обновляем интервал в ModbusManager
      if (modbusManager) {
        await modbusManager.updateArchiveInterval(interval);
      }

      res.json({ 
        success: true, 
        interval: parseInt(setting.value) 
      });
    } catch (error) {
      console.error('Error setting archive interval:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
