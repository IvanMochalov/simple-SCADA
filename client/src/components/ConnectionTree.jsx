import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useWebSocket } from '../context/WebSocketContext'
import ConnectionNodeForm from './ConnectionNodeForm'
import DeviceForm from './DeviceForm'
import TagForm from './TagForm'
import './ConnectionTree.css'

export default function ConnectionTree() {
  const { state, refreshState } = useWebSocket()
  const [nodes, setNodes] = useState([])
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [expandedDevices, setExpandedDevices] = useState(new Set())
  const [showNodeForm, setShowNodeForm] = useState(false)
  const [showDeviceForm, setShowDeviceForm] = useState(false)
  const [showTagForm, setShowTagForm] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)

  useEffect(() => {
    loadNodes()
  }, [])

  useEffect(() => {
    if (state && state.nodes) {
      setNodes(state.nodes)
    }
  }, [state])

  const loadNodes = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/connections')
      setNodes(response.data)
    } catch (error) {
      console.error('Error loading nodes:', error)
    }
  }

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

  const handleDeleteNode = async (nodeId) => {
    if (!confirm('Удалить узел связи?')) return
    try {
      await axios.delete(`http://localhost:3001/api/connections/${nodeId}`)
      await loadNodes()
      refreshState()
    } catch (error) {
      console.error('Error deleting node:', error)
      alert('Ошибка при удалении узла')
    }
  }

  const handleDeleteDevice = async (deviceId, nodeId) => {
    if (!confirm('Удалить устройство?')) return
    try {
      await axios.delete(`http://localhost:3001/api/devices/${deviceId}`)
      await loadNodes()
      refreshState()
    } catch (error) {
      console.error('Error deleting device:', error)
      alert('Ошибка при удалении устройства')
    }
  }

  const handleDeleteTag = async (tagId, deviceId) => {
    if (!confirm('Удалить тег?')) return
    try {
      await axios.delete(`http://localhost:3001/api/tags/${tagId}`)
      await loadNodes()
      refreshState()
    } catch (error) {
      console.error('Error deleting tag:', error)
      alert('Ошибка при удалении тега')
    }
  }

  const handleReconnectDevice = async (deviceId) => {
    try {
      await axios.post(`http://localhost:3001/api/devices/${deviceId}/reconnect`)
      await loadNodes()
      refreshState()
    } catch (error) {
      console.error('Error reconnecting device:', error)
      alert(error.response?.data?.error || 'Ошибка при переподключении устройства')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected': return '#27ae60'
      case 'disconnected': return '#e74c3c'
      case 'error': return '#f39c12'
      default: return '#95a5a6'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'connected': return 'Подключено'
      case 'disconnected': return 'Отключено'
      case 'error': return 'Ошибка'
      default: return 'Неизвестно'
    }
  }

  return (
    <div className="connection-tree">
      <div className="tree-header">
        <h2>Конфигурация узлов связи</h2>
        <button 
          className="btn btn-primary"
          onClick={() => {
            setSelectedNodeId(null)
            setShowNodeForm(true)
          }}
        >
          + Добавить узел связи
        </button>
      </div>

      <div className="tree-container">
        {nodes.length === 0 ? (
          <div className="empty-state">
            <p>Нет узлов связи. Создайте первый узел связи.</p>
          </div>
        ) : (
          nodes.map(node => (
            <div key={node.id} className="tree-node">
              <div className="node-header" onClick={() => toggleNode(node.id)}>
                <span className="expand-icon">
                  {expandedNodes.has(node.id) ? '▼' : '▶'}
                </span>
                <span className="node-name">{node.name}</span>
                <span className="node-info">
                  {node.comPort} | {node.baudRate} бод
                </span>
                <div className="node-actions">
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      setShowNodeForm(true)
                    }}
                    title="Редактировать"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      setShowDeviceForm(true)
                    }}
                    title="Добавить устройство"
                  >
                    ➕
                  </button>
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteNode(node.id)
                    }}
                    title="Удалить"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {expandedNodes.has(node.id) && (
                <div className="node-content">
                  {node.devices.length === 0 ? (
                    <div className="empty-devices">
                      <p>Нет устройств. Добавьте устройство.</p>
                    </div>
                  ) : (
                    node.devices.map(device => (
                      <div key={device.id} className="tree-device">
                        <div className="device-header" onClick={() => toggleDevice(device.id)}>
                          <span className="expand-icon">
                            {expandedDevices.has(device.id) ? '▼' : '▶'}
                          </span>
                          <span className="device-name">{device.name}</span>
                          <span 
                            className="device-status"
                            style={{ color: getStatusColor(device.status) }}
                          >
                            {getStatusText(device.status)}
                          </span>
                          <div className="device-actions">
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
                            <button
                              className="btn-icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedDeviceId(device.id)
                                setShowDeviceForm(true)
                              }}
                              title="Редактировать"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn-icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedDeviceId(device.id)
                                setSelectedNodeId(node.id)
                                setShowTagForm(true)
                              }}
                              title="Добавить тег"
                            >
                              ➕
                            </button>
                            <button
                              className="btn-icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteDevice(device.id, node.id)
                              }}
                              title="Удалить"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {expandedDevices.has(device.id) && (
                          <div className="device-content">
                            {device.tags.length === 0 ? (
                              <div className="empty-tags">
                                <p>Нет тегов. Добавьте тег.</p>
                              </div>
                            ) : (
                              device.tags.map(tag => (
                                <div key={tag.id} className="tree-tag">
                                  <span className="tag-name">{tag.name}</span>
                                  <span className="tag-info">
                                    Адрес: {tag.address} | {tag.registerType} | {tag.accessType}
                                  </span>
                                  <button
                                    className="btn-icon"
                                    onClick={() => handleDeleteTag(tag.id, device.id)}
                                    title="Удалить"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showNodeForm && (
        <ConnectionNodeForm
          nodeId={selectedNodeId}
          onClose={() => {
            setShowNodeForm(false)
            setSelectedNodeId(null)
          }}
          onSave={async () => {
            await loadNodes()
            refreshState()
            setShowNodeForm(false)
            setSelectedNodeId(null)
          }}
        />
      )}

      {showDeviceForm && (
        <DeviceForm
          deviceId={selectedDeviceId}
          nodeId={selectedNodeId}
          onClose={() => {
            setShowDeviceForm(false)
            setSelectedDeviceId(null)
            setSelectedNodeId(null)
          }}
          onSave={async () => {
            await loadNodes()
            refreshState()
            setShowDeviceForm(false)
            setSelectedDeviceId(null)
            setSelectedNodeId(null)
          }}
        />
      )}

      {showTagForm && (
        <TagForm
          deviceId={selectedDeviceId}
          onClose={() => {
            setShowTagForm(false)
            setSelectedDeviceId(null)
          }}
          onSave={async () => {
            await loadNodes()
            refreshState()
            setShowTagForm(false)
            setSelectedDeviceId(null)
          }}
        />
      )}
    </div>
  )
}
