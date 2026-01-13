import React, {useState, useEffect} from 'react'
import './Form.css'
import {api} from "../services/api.js";
import {useNotification} from "../context/NotificationContext.jsx";

export default function DeviceForm({deviceId, nodeId, onClose, onSave}) {
  const notification = useNotification();
  const [nodes, setNodes] = useState([])
  const [formData, setFormData] = useState({
    connectionNodeId: nodeId || '',
    name: '',
    address: 17,
    responseTimeout: 1000,
    pollInterval: 1000,
    enabled: true
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadNodes()
    if (deviceId) {
      loadDevice()
    }
  }, [deviceId])

  const loadNodes = async () => {
    try {
      const response = await api.getAllNodes()
      setNodes(response.data)
      if (!nodeId && response.data.length > 0) {
        setFormData(prev => ({...prev, connectionNodeId: response.data[0].id}))
      }
    } catch (error) {
      console.error('Error loading nodes:', error)
      notification.error('Ошибка загрузки узлов', error.message || "")
    }
  }

  const loadDevice = async () => {
    try {
      const response = await api.getDeviceById(deviceId)
      setFormData(response.data)
    } catch (error) {
      console.error('Error loading device:', error)
      notification.error('Ошибка загрузки устройства', error.message || "")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (deviceId) {
        await api.updateDeviceById(deviceId, formData)
      } else {
        await api.createDevice(formData)
      }
      onSave()
    } catch (error) {
      console.error('Error saving device:', error)
      alert('Ошибка при сохранении устройства')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{deviceId ? 'Редактировать устройство' : 'Создать устройство'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label>Узел связи</label>
            <select
              value={formData.connectionNodeId}
              onChange={(e) => setFormData({...formData, connectionNodeId: e.target.value})}
              required
              disabled={!!nodeId}
            >
              <option value="">Выберите узел связи</option>
              {nodes.map(node => (
                <option key={node.id} value={node.id}>
                  {node.name} ({node.comPort})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>Адрес Modbus (0-255)</label>
            <input
              type="number"
              min="0"
              max="255"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: parseInt(e.target.value)})}
              required
            />
          </div>

          <div className="form-group">
            <label>Время ответа (мс)</label>
            <input
              type="number"
              min="100"
              step="100"
              value={formData.responseTimeout}
              onChange={(e) => setFormData({...formData, responseTimeout: parseInt(e.target.value)})}
              required
            />
          </div>

          <div className="form-group">
            <label>Период опроса (мс)</label>
            <input
              type="number"
              min="100"
              step="100"
              value={formData.pollInterval}
              onChange={(e) => setFormData({...formData, pollInterval: parseInt(e.target.value)})}
              required
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
              />
              Включено
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
