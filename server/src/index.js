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

const prisma = new PrismaClient();
const app = express();
const server = createServer(app);

// WebSocket сервер
const wss = new WebSocketServer({server});

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация Modbus Manager
const modbusManager = new ModbusManager(prisma, wss);

// REST API routes
app.use('/api/connections', connectionRoutes(prisma, modbusManager));
app.use('/api/devices', deviceRoutes(prisma, modbusManager));
app.use('/api/tags', tagRoutes(prisma, modbusManager));
app.use('/api/history', historyRoutes(prisma));
app.use('/api/modbus', modbusRoutes(modbusManager));

// WebSocket подключения
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  // Отправляем текущее состояние при подключении
  modbusManager.sendCurrentState(ws);
});

// Запуск сервера
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});

// Graceful shutdown
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
