/**
 * WebSocket Context для получения данных в реальном времени
 * 
 * Управляет WebSocket соединением с сервером и предоставляет:
 * - state: текущее состояние системы (узлы связи, устройства, теги)
 * - tagValues: актуальные значения тегов, обновляемые в реальном времени
 * - isConnected: статус подключения
 * - refreshState: функция для принудительного обновления состояния через REST API
 * 
 * Автоматически переподключается при разрыве соединения.
 */

import React, {createContext, useContext, useEffect, useState, useRef} from 'react'
import axios from 'axios'
import {api, API_BASE, HOST} from "../services/api.js";
import {useNotification} from './NotificationContext.jsx';

const WebSocketContext = createContext(null)

export function WebSocketProvider({children}) {
  // Состояние WebSocket соединения (не используется напрямую, хранится в wsRef)
  const [ws] = useState(null)
  
  // Флаг подключения к WebSocket серверу
  const [isConnected, setIsConnected] = useState(false)
  
  // Текущее состояние системы: { nodes: [...], modbusManagerStatus: {...} }
  const [state, setState] = useState(null)
  
  // Значения тегов: { deviceId: { tagId: { value, timestamp } } }
  const [tagValues, setTagValues] = useState({})
  
  // Ссылка на WebSocket объект для доступа из обработчиков
  const wsRef = useRef(null)
  
  // Таймер для автоматического переподключения
  const reconnectTimeoutRef = useRef(null)
  
  const notification = useNotification()

  // Инициализация WebSocket соединения при монтировании компонента
  useEffect(() => {
    connectWebSocket()
    
    // Очистка при размонтировании
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  /**
   * Подключение к WebSocket серверу
   * 
   * Обрабатывает три типа сообщений от сервера:
   * - 'state': обновление состояния системы (узлы, устройства, теги)
   * - 'tagValues': обновление значений тегов в реальном времени
   * - 'message': уведомления от сервера (ошибки, предупреждения)
   * 
   * Автоматически переподключается через 3 секунды при разрыве соединения.
   */
  const connectWebSocket = () => {
    try {
      // Определяем протокол WebSocket в зависимости от протокола страницы
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${HOST}:3001`
      const websocket = new WebSocket(wsUrl)

      websocket.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        wsRef.current = websocket
        
        // Отменяем запланированное переподключение, если оно было
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      }

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          if (message.type === 'state') {
            // Обновление состояния системы - React автоматически перерисует компоненты
            setState(message.data)
            console.log('State updated from server:', message.data)
          } else if (message.type === 'tagValues') {
            // Обновление значений тегов для конкретного устройства
            setTagValues(prev => {
              const newValues = {...prev}
              if (!newValues[message.deviceId]) {
                newValues[message.deviceId] = {}
              }
              // Объединяем новые значения с существующими
              Object.assign(newValues[message.deviceId], message.data)
              return newValues
            })
          } else if (message.type === 'message') {
            // Показываем уведомление пользователю (success, error, warning, info)
            const {text, messageType} = message.data
            const notificationMethod = notification[messageType] || notification.info
            notificationMethod(text.title, text.description)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error)
        setIsConnected(false)
      }

      websocket.onclose = () => {
        console.log('WebSocket disconnected')
        setIsConnected(false)
        wsRef.current = null

        // Автоматическое переподключение через 3 секунды
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket()
        }, 3000)
      }
    } catch (error) {
      console.error('Error connecting WebSocket:', error)
      setIsConnected(false)
    }
  }

  // Значение контекста, доступное всем дочерним компонентам
  const value = {
    ws, // WebSocket объект (для обратной совместимости, не используется)
    isConnected, // Статус подключения
    state, // Состояние системы
    tagValues, // Значения тегов
    /**
     * Принудительное обновление состояния через REST API
     * Используется при необходимости синхронизации с сервером
     */
    refreshState: async () => {
      try {
        const response = await api.getAllNodes()
        setState({nodes: response.data})
      } catch (error) {
        console.error('Error refreshing state:', error)
      }
    }
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

/**
 * Хук для доступа к WebSocket контексту
 * 
 * @returns {Object} { ws, isConnected, state, tagValues, refreshState }
 * @throws {Error} если используется вне WebSocketProvider
 */
export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider')
  }
  return context
}
