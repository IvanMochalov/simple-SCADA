import React, {createContext, useContext, useEffect, useState, useRef} from 'react'
import axios from 'axios'
import {API_BASE, HOST} from "../services/api.js";

const WebSocketContext = createContext(null)

export function WebSocketProvider({children}) {
  const [ws, setWs] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [state, setState] = useState(null)
  const [tagValues, setTagValues] = useState({}) // { deviceId: { tagId: { value, timestamp } } }
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    connectWebSocket()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${HOST}:3001`
      const websocket = new WebSocket(wsUrl)

      websocket.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        wsRef.current = websocket
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      }

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          if (message.type === 'state') {
            // Обновляем состояние - клиент автоматически перерисует компоненты
            setState(message.data)
            console.log('State updated from server:', message.data)
          } else if (message.type === 'tagValues') {
            setTagValues(prev => {
              const newValues = {...prev}
              if (!newValues[message.deviceId]) {
                newValues[message.deviceId] = {}
              }
              Object.assign(newValues[message.deviceId], message.data)
              return newValues
            })
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

        // Переподключение через 3 секунды
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket()
        }, 3000)
      }
    } catch (error) {
      console.error('Error connecting WebSocket:', error)
      setIsConnected(false)
    }
  }

  const value = {
    ws,
    isConnected,
    state,
    tagValues,
    refreshState: async () => {
      try {
        const response = await axios.get(`${API_BASE}/connections`)
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

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider')
  }
  return context
}
