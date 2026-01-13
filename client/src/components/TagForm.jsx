import React, {useState, useEffect} from 'react'
import './Form.css'
import {api} from "../services/api.js";
import {toast} from "react-toastify"

export default function TagForm({deviceId, onClose, onSave}) {
  const [formData, setFormData] = useState({
    deviceId: deviceId || '',
    name: '',
    address: 1,
    registerType: 'HOLDING_REGISTER',
    deviceDataType: 'int16',
    serverDataType: 'int32',
    accessType: 'ReadOnly',
    enabled: true
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (deviceId) {
      setFormData(prev => ({...prev, deviceId}))
    }
  }, [deviceId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (formData.id) {
        await api.updateTagById(formData.id, formData)
      } else {
        await api.createTag(formData)
      }
      onSave()
    } catch (error) {
      console.error('Error saving tag:', error)
      toast.error('Ошибка при сохранении тега')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Создать тег</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="form">
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
            <label>Адрес регистра (0-65535)</label>
            <input
              type="number"
              min="0"
              max="65535"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: parseInt(e.target.value)})}
              required
            />
          </div>

          <div className="form-group">
            <label>Тип регистра</label>
            <select
              value={formData.registerType}
              onChange={(e) => setFormData({...formData, registerType: e.target.value})}
            >
              <option value="HOLDING_REGISTER">Holding Register</option>
              <option value="INPUT_REGISTER">Input Register</option>
              <option value="COIL">Coil</option>
              <option value="DISCRETE_INPUT">Discrete Input</option>
            </select>
          </div>

          <div className="form-group">
            <label>Тип данных в устройстве</label>
            <select
              value={formData.deviceDataType}
              onChange={(e) => setFormData({...formData, deviceDataType: e.target.value})}
            >
              <option value="int16">int16</option>
              <option value="int32">int32</option>
              <option value="uint16">uint16</option>
              <option value="uint32">uint32</option>
              <option value="float">float</option>
            </select>
          </div>

          <div className="form-group">
            <label>Тип данных в сервере</label>
            <select
              value={formData.serverDataType}
              onChange={(e) => setFormData({...formData, serverDataType: e.target.value})}
            >
              <option value="int32">int32</option>
              <option value="int16">int16</option>
              <option value="uint32">uint32</option>
              <option value="uint16">uint16</option>
              <option value="float">float</option>
            </select>
          </div>

          <div className="form-group">
            <label>Тип доступа</label>
            <select
              value={formData.accessType}
              onChange={(e) => setFormData({...formData, accessType: e.target.value})}
            >
              <option value="ReadOnly">Только чтение</option>
              <option value="ReadWrite">Чтение и запись</option>
            </select>
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
