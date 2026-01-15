# Система диспетчерского управления и сбора данных для технологических объектов управления

Система для работы с Modbus RTU устройствами через COM порты. Аналог ПО MasterOPC Universal Modbus Server.

## Технологии

- **Сервер**: Node.js, Express, WebSocket, modbus-serial, Prisma ORM, SQLite
- **Клиент**: React, Vite, WebSocket, Ant Design

## Структура проекта

```
simple-SCADA/
├── server/                       # Node.js сервер
│   ├── src/
│   │   ├── index.js              # Точка входа сервера
│   │   ├── modbus/
│   │   │   └── ModbusManager.js  # Менеджер Modbus соединений
│   │   └── routes/               # REST API маршруты
│   └── prisma/
│       └── schema.prisma         # Схема базы данных
└── client/                       # React клиент
    ├── src/
    │   ├── components/           # React компоненты
    │   ├── context/              # React контексты
    │   ├── services/             # React компоненты
    │   │   └── api.js            # HTTP клиент для взаимодействия с сервером (REST API)
    │   ├── index.css             # Базовые стили для страницы
    │   └── main.jsx              # Точка входа компонентов
    └── index.html                # Точка входа клиента
```

## Установка

### 1. Установка зависимостей

```bash
# В корневой директории
npm install

# Или установить отдельно для сервера и клиента
cd server && npm install
cd ../client && npm install
```

### 2. Настройка базы данных

```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
```

### 3. Запуск

#### Вариант 1: Запуск сервера и клиента отдельно

```bash
# Терминал 1 - Сервер
cd server
npm run dev

# Терминал 2 - Клиент
cd client
npm run dev
```

#### Вариант 2: Запуск через корневой package.json (если установлен concurrently)

```bash
npm run dev
```

Сервер будет доступен на `http://localhost:3001`
Клиент будет доступен на `http://localhost:5173`

## Использование

### Создание конфигурации

1. **Создать узел связи (COM порт)**
    - Название: например, "RS-485"
    - Тип: например, "COM"
    - Указать включен ли в работу
    - COM порт: например, "COM3"
    - Скорость: 9600 бод
    - Биты данных: 8
    - Стоп-биты: 1
    - Четность: Нет

2. **Добавить устройство**
    - Название: например, "TRM 1"
    - Адрес Modbus: 17
    - Время ответа: 1000 мс
    - Период опроса: 1000 мс

3. **Добавить тег**
    - Название: например, "температура датчика"
    - Адрес регистра: 1
    - Тип регистра: HOLDING_REGISTER
    - Тип данных в устройстве: int16
    - Тип данных в сервере: int32
    - Тип доступа: ReadOnly

### Просмотр данных

- **Конфигурация**: Управление узлами связи, устройствами и тегами
- **Реальное время**: Отображение текущих значений тегов с обновлением через WebSocket
- **История**: Просмотр исторических данных (собираются каждую минуту)

## Особенности

- Реальное время обновление значений тегов через WebSocket
- Автоматический сбор исторических данных каждую минуту
- Отображение статуса системы в целом (подключено/отключено)
- Отображение статуса работы Modbus Manager (запущен/остановлен)
- Сервер оповещает клиента о различных ошибках в процессе выполнения команд Modbus Manager
- Древовидная структура: Узлы связи → Устройства → Теги
- Поддержка различных типов регистров Modbus (Holding, Input, Coil, Discrete Input)

## API

### REST API

- `GET /api/modbus/status` - Получить статус Modbus Manager
- `POST /api/modbus/start` - Запустить Modbus Manager
- `POST /api/modbus/stop` - Остановить Modbus Manager

- `GET /api/connections` - Получить все узлы связи
- `GET /api/connections/:id` - Получить узел связи
- `POST /api/connections` - Создать узел связи
- `PUT /api/connections/:id` - Обновить узел связи
- `DELETE /api/connections/:id` - Удалить узел связи

- `GET /api/devices` - Получить все устройства
- `POST /api/devices` - Создать устройство
- `GET /api/devices/:id` - Получить устройство
- `PUT /api/devices/:id` - Обновить устройство
- `DELETE /api/devices/:id` - Удалить устройство
- `POST /api/devices/:id/reconnect` - Переподключить устройство

- `GET /api/tags` - Получить все теги
- `POST /api/tags` - Создать тег
- `GET /api/tags/:id` - Получить тег
- `PUT /api/tags/:id` - Обновить тег
- `DELETE /api/tags/:id` - Удалить тег

- `GET /api/history/system` — история всей системы
- `GET /api/history/node/:nodeId` — история узла связи
- `GET /api/history/device/:deviceId` — история устройства
- `GET /api/history/tag/:tagId` — история тега

### WebSocket

Подключение: `ws://localhost:3001`

Сообщения от сервера:

- `{ type: 'state', data: { nodes: [...] } }` - Текущее состояние системы
- `{ type: 'tagValues', deviceId: '...', data: { tagId: { value, timestamp } } }` - Обновление значений тегов
- `{ type: 'message', data: { text: {...}, messageType, } }` - Оповещение клиента сервером

## Примечания

- Убедитесь, что COM порт не используется другими приложениями
- На Windows может потребоваться запуск с правами администратора для доступа к COM портам
- Исторические данные собираются каждую минуту для всех активных тегов подключенных устройств
