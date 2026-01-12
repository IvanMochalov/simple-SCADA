import React, {useState} from 'react'
import {useWebSocket} from '../context/WebSocketContext'
import './RealTimeView.css'
import {api} from "../services/api.js";

export default function RealTimeView() {
  const {state, tagValues, isConnected} = useWebSocket()
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [expandedDevices, setExpandedDevices] = useState(new Set())
  const [isModbusRunning, setIsModbusRunning] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  const toggleNode = (nodeId) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const toggleDevice = (deviceId) => {
    const newExpanded = new Set(expandedDevices)
    if (newExpanded.has(deviceId)) {
      newExpanded.delete(deviceId)
    } else {
      newExpanded.add(deviceId)
    }
    setExpandedDevices(newExpanded)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return '#27ae60'
      case 'disconnected':
        return '#e74c3c'
      case 'error':
        return '#f39c12'
      default:
        return '#95a5a6'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'connected':
        return 'Подключено'
      case 'disconnected':
        return 'Отключено'
      case 'error':
        return 'Ошибка'
      default:
        return 'Неизвестно'
    }
  }

  const getTagValue = (deviceId, tagId) => {
    if (!tagValues[deviceId] || !tagValues[deviceId][tagId]) {
      return null
    }
    return tagValues[deviceId][tagId]
  }

  // Обновляем статус modbusManager при изменении state
  React.useEffect(() => {
    if (state && state.modbusManagerStatus) {
      setIsModbusRunning(state.modbusManagerStatus.isRunning || false)
    }
  }, [state])

  const handleToggleModbus = async () => {
    if (isToggling) return
    
    setIsToggling(true)
    try {
      if (isModbusRunning) {
        await api.stopModbus()
      } else {
        await api.startModbus()
      }
      // Состояние обновится автоматически через WebSocket
    } catch (error) {
      console.error('Error toggling Modbus Manager:', error)
      alert(error.response?.data?.error || 'Ошибка при управлении Modbus Manager')
    } finally {
      setIsToggling(false)
    }
  }

  const handleReconnectDevice = async (deviceId) => {
    try {
      await api.reconnectDeviceById(deviceId)
      // Состояние обновится автоматически через WebSocket
    } catch (error) {
      console.error('Error reconnecting device:', error)
      alert(error.response?.data?.error || 'Ошибка при переподключении устройства')
    }
  }

  if (!isConnected) {
    return (
      <div className="realtime-view">
        <div className="connection-warning">
          <p>Нет подключения к серверу. Проверьте соединение.</p>
        </div>
      </div>
    )
  }

  if (!state || !state.nodes || state.nodes.length === 0) {
    return (
      <div className="realtime-view">
        <div className="empty-state">
          <p>Нет узлов связи. Создайте узел связи в разделе "Конфигурация".</p>
        </div>
      </div>
    )
  }

  return (
    <div className="realtime-view">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
        <h2>Значения тегов в реальном времени</h2>
        <button
          onClick={handleToggleModbus}
          disabled={isToggling || !isConnected}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: isModbusRunning ? '#e74c3c' : '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isToggling || !isConnected ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            opacity: isToggling || !isConnected ? 0.6 : 1
          }}
        >
          {isToggling ? '...' : (isModbusRunning ? '⏹ Остановить Modbus Server' : '▶ Запустить Modbus Server')}
        </button>
      </div>

      <div className="realtime-container">
        {state.nodes.map(node => (
          <div key={node.id} className="realtime-node">
            <div className="node-header" onClick={() => toggleNode(node.id)}>
              <span className="expand-icon">
                {expandedNodes.has(node.id) ? '▼' : '▶'}
              </span>
              <span className="node-name">{node.name}</span>
              <span className="node-info">{node.comPort}</span>
            </div>

            {expandedNodes.has(node.id) && (
              <div className="node-content">
                {node.devices.length === 0 ? (
                  <div className="empty-devices">
                    <p>Нет устройств</p>
                  </div>
                ) : (
                  node.devices.map(device => (
                    <div key={device.id} className="realtime-device">
                      <div className="device-header">
                        <div onClick={() => toggleDevice(device.id)}
                             style={{display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, cursor: 'pointer'}}>
                          <span className="expand-icon">
                            {expandedDevices.has(device.id) ? '▼' : '▶'}
                          </span>
                          <span className="device-name">{device.name}</span>
                          <span
                            className="device-status"
                            style={{color: getStatusColor(device.status)}}
                          >
                            {getStatusText(device.status)}
                          </span>
                        </div>
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReconnectDevice(device.id)
                          }}
                          title="Переподключить"
                        >
                          🔄
                        </button>
                      </div>

                      {expandedDevices.has(device.id) && (
                        <div className="device-content">
                          {device.tags.length === 0 ? (
                            <div className="empty-tags">
                              <p>Нет тегов</p>
                            </div>
                          ) : (
                            <div className="tags-grid">
                              {device.tags.map(tag => {
                                const tagValue = getTagValue(device.id, tag.id)
                                return (
                                  <div key={tag.id} className="tag-card">
                                    <div className="tag-header">
                                      <span className="tag-name">{tag.name}</span>
                                      <span className="tag-address">Адрес: {tag.address}</span>
                                    </div>
                                    <div className="tag-value-container">
                                      {tagValue ? (
                                        <>
                                          <div className="tag-value">
                                            {tagValue.value !== null ? tagValue.value : '—'}
                                          </div>
                                          {tagValue.error && (
                                            <div className="tag-error">{tagValue.error}</div>
                                          )}
                                          <div className="tag-timestamp">
                                            {new Date(tagValue.timestamp).toLocaleTimeString('ru-RU')}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="tag-value no-data">
                                          Нет данных
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
