/**
 * Точка входа сервера SCADA системы
 * 
 * Сервер предоставляет:
 * - REST API для управления конфигурацией (узлы связи, устройства, теги)
 * - WebSocket для передачи данных в реальном времени
 * - Modbus Manager для работы с Modbus RTU устройствами через COM порты
 */

import express from 'express';
import cors from 'cors';
import {createServer} from 'http';
import {PrismaClient} from '@prisma/client';
import {WebSocketServer} from 'ws';
import {ModbusManager} from './modbus/ModbusManager.js';
import connectionRoutes from './routes/connections.js';
import deviceRoutes from './routes/devices.js';
import tagRoutes from './routes/tags.js';
import historyRoutes from './routes/history.js';
import modbusRoutes from './routes/modbus.js';
import settingsRoutes from './routes/settings.js';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {existsSync} from 'fs';

// Получаем путь к директории текущего модуля (для ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Определяем путь к собранному клиенту
const clientDistPath = join(__dirname, '../../client/dist');

// Проверяем, нужно ли отдавать статические файлы (только в production режиме)
const isProduction = process.env.NODE_ENV === 'production';
const shouldServeStatic = isProduction && existsSync(clientDistPath);

// Инициализация базы данных Prisma
const prisma = new PrismaClient();

// Создание Express приложения и HTTP сервера
const app = express();
const server = createServer(app);

// Инициализация WebSocket сервера для передачи данных в реальном времени
const wss = new WebSocketServer({server});

// Настройка middleware
app.use(cors()); // Разрешаем CORS для всех запросов
app.use(express.json()); // Парсинг JSON в теле запросов

// Инициализация Modbus Manager - управляет всеми Modbus соединениями
const modbusManager = new ModbusManager(prisma, wss);

// Регистрация REST API маршрутов
app.use('/api/connections', connectionRoutes(prisma, modbusManager)); // Управление узлами связи
app.use('/api/devices', deviceRoutes(prisma, modbusManager)); // Управление устройствами
app.use('/api/tags', tagRoutes(prisma, modbusManager)); // Управление тегами
app.use('/api/history', historyRoutes(prisma)); // Получение исторических данных
app.use('/api/modbus', modbusRoutes(modbusManager)); // Управление Modbus Manager
app.use('/api/settings', settingsRoutes(prisma, modbusManager)); // Управление настройками системы

// Отдача статических файлов клиента (только в production режиме)
if (shouldServeStatic) {
  // Отдаем статические файлы из папки dist
  app.use(express.static(clientDistPath));
  
  // Обработка SPA роутинга: все запросы, которые не начинаются с /api или /ws,
  // должны возвращать index.html для поддержки клиентского роутинга
  app.get('*', (req, res) => {
    // Пропускаем API и WebSocket запросы
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return res.status(404).json({error: 'Not found'});
    }
    // Для всех остальных запросов отдаем index.html
    res.sendFile(join(clientDistPath, 'index.html'));
  });
  
  console.log('✅ Serving static files from:', clientDistPath);
} else {
  // В dev режиме не отдаем статические файлы (клиент работает через Vite dev server)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      return res.status(404).json({
        error: 'Not found',
        message: 'В режиме разработки клиент должен работать через Vite dev server (порт 5173)'
      });
    }
    res.status(404).json({error: 'Not found'});
  });
  
  if (isProduction) {
    console.log('⚠️  Production mode, but client/dist not found. Run "npm run build" first.');
  } else {
    console.log('🔧 Development mode: static files served by Vite dev server');
  }
}

// Обработка WebSocket подключений
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  // При подключении нового клиента отправляем текущее состояние системы
  // (список узлов связи, устройств, тегов и их текущие значения)
  modbusManager.sendCurrentState(ws);
});

// Запуск HTTP сервера
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});

// Корректное завершение работы при получении сигналов остановки
// Останавливаем Modbus Manager и закрываем соединения с базой данных
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await modbusManager.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await modbusManager.stop();
  await prisma.$disconnect();
  process.exit(0);
});
