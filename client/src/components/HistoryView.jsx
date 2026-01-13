import React, {useState, useEffect, useMemo} from 'react'
import {useWebSocket} from '../context/WebSocketContext'
import './HistoryView.css'
import {api} from "../services/api.js";
import {
  Button,
  Select,
  DatePicker,
  TimePicker,
  Space,
  Table,
  Card,
  Row,
  Col,
  Typography,
  Divider,
  Empty,
} from 'antd';
import dayjs from 'dayjs';
import {useNotification} from "../context/NotificationContext.jsx";

const {Title, Text} = Typography;

export default function HistoryView() {
  const notification = useNotification();
  const {state} = useWebSocket()

  const [selectedDevice, setSelectedDevice] = useState("")
  const [selectedTag, setSelectedTag] = useState("")
  const [history, setHistory] = useState([])
  const [deviceHistory, setDeviceHistory] = useState([])
  const [loading, setLoading] = useState(false)

  // Получаем все устройства и теги для выбора с помощью useMemo
  const {allDevices, allTags} = useMemo(() => {
    const devices = [];
    const tags = [];

    if (state?.nodes) {
      state.nodes.forEach(node => {
        if (node.devices && node.devices.length > 0) {
          node.devices.forEach(device => {
            devices.push({
              ...device,
              nodeName: node.name,
              nodeId: node.id
            });

            if (device.tags && device.tags.length > 0) {
              device.tags.forEach(tag => {
                tags.push({
                  ...tag,
                  deviceName: device.name,
                  deviceId: device.id,
                  nodeName: node.name
                });
              });
            }
          });
        }
      });
    }

    return {allDevices: devices, allTags: tags};
  }, [state]);

  const selectDeviceOptions = [
    {
      value: "",
      label: "Выберите устройство"
    },
    ...allDevices.map(device => ({
      value: device.id,
      label: `${device.nodeName} → ${device.name}`
    }))
  ];

  const selectTagOptions = [
    {
      value: "",
      label: "Выберите тег"
    },
    ...allTags
      .filter(tag => tag.deviceId === selectedDevice)
      .map(tag => ({
        value: tag.id,
        label: `${tag.name} (Адрес: ${tag.address})`
      }))
  ];

  // Состояния для DatePicker и TimePicker
  const [startDate, setStartDate] = useState(() => {
    return dayjs().subtract(1, 'hour');
  });

  const [endDate, setEndDate] = useState(() => {
    return dayjs();
  });

  useEffect(() => {
    if (selectedTag) {
      loadTagHistory()
    }
  }, [selectedTag, startDate, endDate])

  const loadTagHistory = async () => {
    if (!selectedTag) return
    const currentTag = allTags.find(tag => tag.id === selectedTag)
    const currentTagName = `${currentTag.name} (Адрес: ${currentTag.address})`

    setLoading(true)
    try {
      const response = await api.getHistoryTagById(selectedTag, {
        params: {
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          limit: 10000
        }
      })
      notification.success(`История тега '${currentTagName}' успешно загружена`)
      setHistory(response.data.reverse()) // Показываем от старых к новым
    } catch (error) {
      console.error('Error loading history:', error)
      notification.error('Ошибка загрузки истории тега', error.message || "")
    } finally {
      setLoading(false)
    }
  }

  const loadDeviceHistory = async () => {
    if (!selectedDevice) return

    const currentDevice = allDevices.find(device => device.id === selectedDevice)
    const currentDeviceName = `${currentDevice.nodeName} → ${currentDevice.name}`

    setLoading(true)
    try {
      const response = await api.getHistoryDeviceById(selectedDevice, {
        params: {
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          limit: 10000
        }
      })
      notification.success(`История устройства ${currentDeviceName} успешно загружена`)
      setDeviceHistory(response.data.reverse()) // Показываем от старых к новым
    } catch (error) {
      console.error('Error loading history:', error)
      notification.error('Ошибка загрузки истории устройства', error.message || "")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedDevice) {
      loadDeviceHistory()
    }
  }, [selectedDevice, startDate, endDate])

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

  const selectedTagInfo = allTags.find(t => t.id === selectedTag)

  if (!state || !state?.nodes || state?.nodes?.length === 0) {
    return (
      <Card className="history-view">
        <Empty
          description={
            <Text type="secondary">
              Нет узлов связи. Создайте узел связи в разделе "Конфигурация".
            </Text>
          }
        />
      </Card>
    )
  }

  return (
    <div className="history-view">
      <Title level={2}>Исторические данные</Title>

      <Card
        title="Фильтры"
        styles={{
          root: {marginBottom: 24},
          body: {
            padding: '24px'
          }
        }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <div className="filter-group">
              <Text strong style={{display: 'block', marginBottom: 8}}>
                Устройство
              </Text>
              <Select
                value={selectedDevice}
                onChange={(value) => {
                  setSelectedDevice(value)
                  setSelectedTag("")
                }}
                options={selectDeviceOptions}
                placeholder="Выберите устройство"
              />
            </div>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <div className="filter-group">
              <Text strong style={{display: 'block', marginBottom: 8}}>
                Тег
              </Text>
              <Select
                value={selectedTag}
                onChange={(value) => setSelectedTag(value)}
                disabled={!selectedDevice}
                options={selectTagOptions}
                placeholder="Выберите тег"
              />
            </div>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <div className="filter-group">
              <Text strong style={{display: 'block', marginBottom: 8}}>
                Начало
              </Text>
              <Space>
                <DatePicker
                  value={startDate}
                  onChange={(date, dateString) => handleStartDateTimeChange(date, dateString)}
                  format="DD.MM.YYYY"
                  placeholder="Дата"
                />
                <TimePicker
                  value={startDate}
                  onChange={handleStartTimeChange}
                  format="HH:mm"
                  placeholder="Время"
                />
              </Space>
            </div>
          </Col>

          <Col xs={24} sm={12} md={6}>
            <div className="filter-group">
              <Text strong style={{display: 'block', marginBottom: 8}}>
                Конец
              </Text>
              <Space>
                <DatePicker
                  value={endDate}
                  onChange={(date, dateString) => handleEndDateTimeChange(date, dateString)}
                  format="DD.MM.YYYY"
                  placeholder="Дата"
                />
                <TimePicker
                  value={endDate}
                  onChange={handleEndTimeChange}
                  format="HH:mm"
                  placeholder="Время"
                />
              </Space>
            </div>
          </Col>

          <Col xs={24}>
            <Button
              type="primary"
              onClick={loadTagHistory}
              disabled={!selectedTag || loading}
              loading={loading}
            >
              Загрузить историю
            </Button>
          </Col>
        </Row>
      </Card>

      {selectedTagInfo && (
        <Card
          title="Информация о теге"
          styles={{root: {marginBottom: 24}}}
        >
          <Row gutter={[16, 8]}>
            <Col span={24}>
              <Title level={4} style={{margin: 0}}>
                {selectedTagInfo.deviceName} → {selectedTagInfo.name}
              </Title>
            </Col>
            <Col span={24}>
              <Space separator={<Divider orientation="vertical"/>}>
                <Text>Адрес: {selectedTagInfo.address}</Text>
                <Text>Тип: {selectedTagInfo.registerType}</Text>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {selectedTag && (
        <Card title="Исторические данные">
          {history.length === 0 ? (
            <Empty
              description="Нет данных за выбранный период"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
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
            />
          )}
        </Card>
      )}
    </div>
  )
}