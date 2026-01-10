import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './Form.css'

export default function ConnectionNodeForm({ nodeId, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'COM_RTU_MASTER',
    comPort: 'COM3',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    enabled: true
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (nodeId) {
      loadNode()
    }
  }, [nodeId])

  const loadNode = async () => {
    try {
      const response = await axios.get(`http://localhost:3001/api/connections/${nodeId}`)
      setFormData(response.data)
    } catch (error) {
      console.error('Error loading node:', error)
      alert('Ошибка при загрузке узла')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (nodeId) {
        await axios.put(`http://localhost:3001/api/connections/${nodeId}`, formData)
      } else {
        await axios.post('http://localhost:3001/api/connections', formData)
      }
      onSave()
    } catch (error) {
      console.error('Error saving node:', error)
      alert('Ошибка при сохранении узла')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{nodeId ? 'Редактировать узел связи' : 'Создать узел связи'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>COM порт</label>
            <input
              type="text"
              value={formData.comPort}
              onChange={(e) => setFormData({ ...formData, comPort: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Скорость (бод)</label>
            <select
              value={formData.baudRate}
              onChange={(e) => setFormData({ ...formData, baudRate: parseInt(e.target.value) })}
            >
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>

          <div className="form-group">
            <label>Биты данных</label>
            <select
              value={formData.dataBits}
              onChange={(e) => setFormData({ ...formData, dataBits: parseInt(e.target.value) })}
            >
              <option value={7}>7</option>
              <option value={8}>8</option>
            </select>
          </div>

          <div className="form-group">
            <label>Стоп-биты</label>
            <select
              value={formData.stopBits}
              onChange={(e) => setFormData({ ...formData, stopBits: parseInt(e.target.value) })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>

          <div className="form-group">
            <label>Четность</label>
            <select
              value={formData.parity}
              onChange={(e) => setFormData({ ...formData, parity: e.target.value })}
            >
              <option value="none">Нет</option>
              <option value="even">Четная</option>
              <option value="odd">Нечетная</option>
            </select>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
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
