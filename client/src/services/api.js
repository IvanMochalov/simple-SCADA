/**
 * HTTP клиент для взаимодействия с REST API сервера
 * 
 * Предоставляет методы для работы с:
 * - Узлами связи (Connection Nodes)
 * - Устройствами Modbus (Devices)
 * - Тегами (Tags)
 * - Историческими данными (History)
 * - Modbus Manager
 */

import axios from "axios";

// Настройки подключения к серверу
// В продакшене используйте переменные окружения или относительные пути
export const HOST = '192.168.3.25';
// export const HOST = 'localhost';
export const BASE = `http://${HOST}:3001`;
export const API_BASE = `${BASE}/api`;
export const WS_BASE = `ws://${HOST}:3001`;

export const api = {
  // ========== API УЗЛОВ СВЯЗИ (Connection Nodes) ==========
  
  /**
   * GET /api/connections
   * Получить список всех узлов связи с устройствами и тегами
   */
  getAllNodes: async () => await axios.get(`${API_BASE}/connections`),

  /**
   * GET /api/connections/:id
   * Получить узел связи по ID
   */
  getNodeById: async (id) => await axios.get(`${API_BASE}/connections/${id}`),

  /**
   * POST /api/connections
   * Создать новый узел связи
   * @param {Object} requestData - данные узла связи (name, comPort, baudRate и т.д.)
   */
  createNode: async (requestData) => await axios.post(`${API_BASE}/connections`, requestData),

  /**
   * PUT /api/connections/:id
   * Обновить узел связи
   * @param {string} id - ID узла связи
   * @param {Object} requestData - обновленные данные
   */
  updateNodeById: async (id, requestData) => await axios.put(`${API_BASE}/connections/${id}`, requestData),

  /**
   * DELETE /api/connections/:id
   * Удалить узел связи
   * @param {string} id - ID узла связи
   */
  removeNodeById: async (id) => await axios.delete(`${API_BASE}/connections/${id}`),

  // ========== API УСТРОЙСТВ (Devices) ==========
  
  /**
   * GET /api/devices/:id
   * Получить устройство по ID
   */
  getDeviceById: async (id) => await axios.get(`${API_BASE}/devices/${id}`),

  /**
   * POST /api/devices
   * Создать новое устройство
   * @param {Object} requestData - данные устройства (name, address, connectionNodeId и т.д.)
   */
  createDevice: async (requestData) => await axios.post(`${API_BASE}/devices`, requestData),

  /**
   * PUT /api/devices/:id
   * Обновить устройство
   * @param {string} id - ID устройства
   * @param {Object} requestData - обновленные данные
   */
  updateDeviceById: async (id, requestData) => await axios.put(`${API_BASE}/devices/${id}`, requestData),

  /**
   * DELETE /api/devices/:id
   * Удалить устройство
   * @param {string} id - ID устройства
   */
  removeDeviceById: async (id) => await axios.delete(`${API_BASE}/devices/${id}`),

  /**
   * POST /api/devices/:id/reconnect
   * Переподключить устройство (закрыть и заново открыть Modbus соединение)
   * @param {string} id - ID устройства
   */
  reconnectDeviceById: async (id) => await axios.post(`${API_BASE}/devices/${id}/reconnect`),

  // ========== API ИСТОРИЧЕСКИХ ДАННЫХ (History) ==========
  
  /**
   * GET /api/history/system
   * Получить исторические данные для всей системы
   * @param {Object} requestData - параметры запроса (params: {startTime, endTime, limit})
   */
  getHistorySystem: async (requestData) => await axios.get(`${API_BASE}/history/system`, requestData),

  /**
   * GET /api/history/node/:nodeId
   * Получить исторические данные для узла связи
   * @param {string} id - ID узла связи
   * @param {Object} requestData - параметры запроса (params: {startTime, endTime, limit})
   */
  getHistoryNodeById: async (id, requestData) => await axios.get(`${API_BASE}/history/node/${id}`, requestData),

  /**
   * GET /api/history/device/:deviceId
   * Получить исторические данные для устройства
   * @param {string} id - ID устройства
   * @param {Object} requestData - параметры запроса (params: {startTime, endTime, limit})
   */
  getHistoryDeviceById: async (id, requestData) => await axios.get(`${API_BASE}/history/device/${id}`, requestData),

  // ========== API ТЕГОВ (Tags) ==========
  
  /**
   * GET /api/tags/:id
   * Получить тег по ID
   */
  getTagById: async (id) => await axios.get(`${API_BASE}/tags/${id}`),

  /**
   * DELETE /api/tags/:id
   * Удалить тег
   * @param {string} id - ID тега
   */
  removeTagById: async (id) => await axios.delete(`${API_BASE}/tags/${id}`),

  /**
   * POST /api/tags
   * Создать новый тег
   * @param {Object} requestData - данные тега (name, address, registerType и т.д.)
   */
  createTag: async (requestData) => await axios.post(`${API_BASE}/tags`, requestData),

  /**
   * PUT /api/tags/:id
   * Обновить тег
   * @param {string} id - ID тега
   * @param {Object} requestData - обновленные данные
   */
  updateTagById: async (id, requestData) => await axios.put(`${API_BASE}/tags/${id}`, requestData),

  /**
   * POST /api/tags/:id/write
   * Записать значение в тег Modbus устройства
   * Работает только для тегов с типом доступа 'ReadWrite'
   * @param {string} id - ID тега
   * @param {number} value - значение для записи
   */
  writeTagValue: async (id, value) => await axios.post(`${API_BASE}/tags/${id}/write`, {value}),

  // ========== API MODBUS MANAGER ==========
  
  /**
   * POST /api/modbus/start
   * Запустить Modbus Manager (начать опрос устройств и сбор данных)
   */
  startModbus: async () => await axios.post(`${API_BASE}/modbus/start`),

  /**
   * POST /api/modbus/stop
   * Остановить Modbus Manager (остановить опрос и закрыть соединения)
   */
  stopModbus: async () => await axios.post(`${API_BASE}/modbus/stop`),

  // ========== API НАСТРОЕК СИСТЕМЫ (Settings) ==========
  
  /**
   * GET /api/settings/archive-interval
   * Получить текущий интервал архивации данных
   */
  getArchiveInterval: async () => await axios.get(`${API_BASE}/settings/archive-interval`),

  /**
   * PUT /api/settings/archive-interval
   * Установить интервал архивации данных
   * @param {number} interval - интервал в миллисекундах
   */
  setArchiveInterval: async (interval) => await axios.put(`${API_BASE}/settings/archive-interval`, { interval }),
};