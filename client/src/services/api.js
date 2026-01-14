import axios from "axios";

export const HOST = '192.168.3.25';
// export const HOST = 'localhost';
export const BASE = `http://${HOST}:3001`;
export const API_BASE = `${BASE}/api`;
export const WS_BASE = `ws://${HOST}:3001`;

export const api = {
  // API NODES - Узлы связи
  // GET /api/connections - Получить все узлы связи
  getAllNodes: async () => await axios.get(`${API_BASE}/connections`),

  // GET /api/connections - Получить все узлы связи
  getNodeById: async (id) => await axios.get(`${API_BASE}/connections/${id}`),

  // POST /api/connections - Создать узел связи
  createNode: async (requestData) => await axios.post(`${API_BASE}/connections`, requestData),

  // PUT /api/connections/:id - Обновить узел связи
  updateNodeById: async (id, requestData) => await axios.put(`${API_BASE}/connections/${id}`, requestData),

  // DELETE /api/connections/:id - Удалить узел связи
  removeNodeById: async (id) => await axios.delete(`${API_BASE}/connections/${id}`),

  // API DEVICES - Устройства
  // GET /api/devices/:id - Получить устройство
  getDeviceById: async (id) => await axios.get(`${API_BASE}/devices/${id}`),

  // POST /api/devices - Создать узел связи
  createDevice: async (requestData) => await axios.post(`${API_BASE}/devices`, requestData),

  // PUT /api/devices/:id - Обновить узел связи
  updateDeviceById: async (id, requestData) => await axios.put(`${API_BASE}/devices/${id}`, requestData),

  // DELETE /api/devices/:id - Удалить устройство
  removeDeviceById: async (id) => await axios.delete(`${API_BASE}/devices/${id}`),

  // POST /api/devices/:id/reconnect - Переподключить устройство
  reconnectDeviceById: async (id) => await axios.post(`${API_BASE}/devices/${id}/reconnect`),

  // GET /api/history/device/:deviceId - Получить историю для устройства
  getHistoryDeviceById: async (id, requestData) => await axios.get(`${API_BASE}/history/device/${id}`, requestData),

  // API TAGS - Теги
  // GET /api/tags/:id - Получить тег по ID
  getTagById: async (id) => await axios.get(`${API_BASE}/tags/${id}`),

  // DELETE /api/tags/:id - Удалить тег
  removeTagById: async (id) => await axios.delete(`${API_BASE}/tags/${id}`),

  // GET /api/history/tag/:tagId - Получить историю для тега
  getHistoryTagById: async (id, requestData) => await axios.get(`${API_BASE}/history/tag/${id}`, requestData),

  // POST /api/tags - Создать тег
  createTag: async (requestData) => await axios.post(`${API_BASE}/tags`, requestData),

  // PUT /api/tags/:id - Обновить тег
  updateTagById: async (id, requestData) => await axios.put(`${API_BASE}/tags/${id}`, requestData),

  // API MODBUS - Управление Modbus Manager
  // GET /api/modbus/status - Получить статус Modbus Manager
  getModbusStatus: async () => await axios.get(`${API_BASE}/modbus/status`),

  // POST /api/modbus/start - Запустить Modbus Manager
  startModbus: async () => await axios.post(`${API_BASE}/modbus/start`),

  // POST /api/modbus/stop - Остановить Modbus Manager
  stopModbus: async () => await axios.post(`${API_BASE}/modbus/stop`),
};