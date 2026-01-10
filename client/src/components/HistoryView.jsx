import React, {useState, useEffect} from 'react'
import {useWebSocket} from '../context/WebSocketContext'
import './HistoryView.css'
import {api} from "../services/api.js";

export default function HistoryView() {
  const {state} = useWebSocket()
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [selectedTag, setSelectedTag] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [startTime, setStartTime] = useState(() => {
    const date = new Date()
    date.setHours(date.getHours() - 1)
    return date.toISOString().slice(0, 16)
  })
  const [endTime, setEndTime] = useState(() => {
    return new Date().toISOString().slice(0, 16)
  })

  useEffect(() => {
    if (selectedTag) {
      loadHistory()
    }
  }, [selectedTag, startTime, endTime])

  const loadHistory = async () => {
    if (!selectedTag) return

    setLoading(true)
    try {
      const response = await api.getHistoryTagById(selectedTag, {
        params: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          limit: 10000
        }
      })
      setHistory(response.data.reverse()) // Показываем от старых к новым
    } catch (error) {
      console.error('Error loading history:', error)
      alert('Ошибка при загрузке истории')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU')
  }

  if (!state || !state.nodes || state.nodes.length === 0) {
    return (
      <div className="history-view">
        <div className="empty-state">
          <p>Нет узлов связи. Создайте узел связи в разделе "Конфигурация".</p>
        </div>
      </div>
    )
  }

  // Получаем все устройства и теги для выбора
  const allDevices = []
  const allTags = []

  state.nodes.forEach(node => {
    node.devices.forEach(device => {
      allDevices.push({...device, nodeName: node.name})
      device.tags.forEach(tag => {
        allTags.push({...tag, deviceName: device.name, deviceId: device.id})
      })
    })
  })

  const selectedTagInfo = allTags.find(t => t.id === selectedTag)

  return (
    <div className="history-view">
      <h2>Исторические данные</h2>

      <div className="history-filters">
        <div className="filter-group">
          <label>Устройство</label>
          <select
            value={selectedDevice || ''}
            onChange={(e) => {
              setSelectedDevice(e.target.value)
              setSelectedTag(null)
            }}
          >
            <option value="">Выберите устройство</option>
            {allDevices.map(device => (
              <option key={device.id} value={device.id}>
                {device.nodeName} → {device.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Тег</label>
          <select
            value={selectedTag || ''}
            onChange={(e) => setSelectedTag(e.target.value)}
            disabled={!selectedDevice}
          >
            <option value="">Выберите тег</option>
            {allTags
              .filter(tag => !selectedDevice || tag.deviceId === selectedDevice)
              .map(tag => (
                <option key={tag.id} value={tag.id}>
                  {tag.name} (Адрес: {tag.address})
                </option>
              ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Начало</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Конец</label>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <button className="btn btn-primary" onClick={loadHistory} disabled={!selectedTag || loading}>
            {loading ? 'Загрузка...' : 'Загрузить'}
          </button>
        </div>
      </div>

      {selectedTagInfo && (
        <div className="history-info">
          <h3>
            {selectedTagInfo.deviceName} → {selectedTagInfo.name}
          </h3>
          <p>Адрес: {selectedTagInfo.address} | Тип: {selectedTagInfo.registerType}</p>
        </div>
      )}

      {loading ? (
        <div className="loading">Загрузка данных...</div>
      ) : history.length === 0 && selectedTag ? (
        <div className="empty-state">
          <p>Нет данных за выбранный период</p>
        </div>
      ) : (
        <div className="history-table-container">
          <table className="history-table">
            <thead>
            <tr>
              <th>Время</th>
              <th>Значение</th>
            </tr>
            </thead>
            <tbody>
            {history.map(record => (
              <tr key={record.id}>
                <td>{formatDate(record.timestamp)}</td>
                <td className="value-cell">{record.value}</td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
