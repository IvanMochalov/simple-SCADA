import React, {useState, useEffect} from 'react'
import {useWebSocket} from '../context/WebSocketContext'
import './HistoryView.css'
import {api} from "../services/api.js";
import {Button, Select, DatePicker, TimePicker, Space, Table} from 'antd';
import dayjs from 'dayjs';
import {useNotification} from "../context/NotificationContext.jsx";

export default function HistoryView() {
  const notification = useNotification();
  const {state} = useWebSocket()
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [selectedTag, setSelectedTag] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  // Состояния для DatePicker и TimePicker
  const [startDate, setStartDate] = useState(() => {
    return dayjs().subtract(1, 'hour');
  });

  const [endDate, setEndDate] = useState(() => {
    return dayjs();
  });

  useEffect(() => {
    if (selectedTag) {
      loadHistory()
    }
  }, [selectedTag, startDate, endDate])

  const loadHistory = async () => {
    if (!selectedTag) return

    setLoading(true)
    try {
      const response = await api.getHistoryTagById(selectedTag, {
        params: {
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          limit: 10000
        }
      })
      notification.success('История загружена')
      setHistory(response.data.reverse()) // Показываем от старых к новым
    } catch (error) {
      console.error('Error loading history:', error)
      notification.error('Ошибка загрузки истории', error.message || "")
    } finally {
      setLoading(false)
    }
  }

  // Колонки для таблицы Ant Design
  const columns = [
    {
      title: 'Время',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('ru-RU');
      },
      width: 150,
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Значение',
      width: 150,
      dataIndex: 'value',
      key: 'value',
      render: (value) => <span className="value-cell">{value}</span>,
      sorter: (a, b) => a.value - b.value,
    },
  ];

  // Обработчик изменения начальной даты
  const handleStartDateTimeChange = (date, dateString) => {
    if (date) {
      setStartDate(date);
    }
  }

  // Обработчик изменения конечной даты
  const handleEndDateTimeChange = (date, dateString) => {
    if (date) {
      setEndDate(date);
    }
  }

  // Обработчик изменения времени для начальной даты
  const handleStartTimeChange = (time, timeString) => {
    if (time) {
      const newDate = startDate.hour(time.hour()).minute(time.minute());
      setStartDate(newDate);
    }
  }

  // Обработчик изменения времени для конечной даты
  const handleEndTimeChange = (time, timeString) => {
    if (time) {
      const newDate = endDate.hour(time.hour()).minute(time.minute());
      setEndDate(newDate);
    }
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
          <Select
            value={selectedDevice || null}
            onChange={(value) => {
              setSelectedDevice(value)
              setSelectedTag(null)
            }}
            options={[{
              value: null,
              label: "Выберите устройство"
            }, ...allDevices.map(device => ({
              value: device.id,
              label: `${device.nodeName} → ${device.name}`
            }))]}
            style={{width: '100%'}}
          />
        </div>

        <div className="filter-group">
          <label>Тег</label>
          <Select
            value={selectedTag || null}
            onChange={(value) => setSelectedTag(value)}
            disabled={!selectedDevice}
            options={[{
              value: null,
              label: "Выберите тег"
            }, ...allTags.filter(tag => !selectedDevice || tag.deviceId === selectedDevice).map(tag => ({
              value: tag.id,
              label: `${tag.name} (Адрес: ${tag.address})`
            }))]}
            style={{width: '100%'}}
          />
        </div>

        <div className="filter-group">
          <label>Начало</label>
          <Space>
            <DatePicker
              value={startDate}
              onChange={(date, dateString) => handleStartDateTimeChange(date, dateString)}
              format="DD.MM.YYYY"
              placeholder="Выберите дату"
            />
            <TimePicker
              value={startDate}
              onChange={handleStartTimeChange}
              format="HH:mm"
              placeholder="Выберите время"
            />
          </Space>
        </div>

        <div className="filter-group">
          <label>Конец</label>
          <Space>
            <DatePicker
              value={endDate}
              onChange={(date, dateString) => handleEndDateTimeChange(date, dateString)}
              format="DD.MM.YYYY"
              placeholder="Выберите дату"
            />
            <TimePicker
              value={endDate}
              onChange={handleEndTimeChange}
              format="HH:mm"
              placeholder="Выберите время"
            />
          </Space>
        </div>

        <div className="filter-group">
          <Button
            type="primary"
            onClick={loadHistory}
            disabled={!selectedTag || loading}
            loading={loading}
          >
            Загрузить
          </Button>
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
      <Table
        loading={loading}
        dataSource={history}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} из ${total} записей`,
        }}
        locale={{
          emptyText: 'Нет данных для отображения'
        }}
      />
    </div>
  )
}