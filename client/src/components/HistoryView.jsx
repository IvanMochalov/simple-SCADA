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
  Empty,
} from 'antd';
import dayjs from 'dayjs';
import {useNotification} from "../context/NotificationContext.jsx";

const {Title, Text} = Typography;

export default function HistoryView() {
  const notification = useNotification();
  const {state} = useWebSocket()

  const [selectedDevice, setSelectedDevice] = useState("")
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  // Преобразуем историю в табличный формат
  const transformedData = useMemo(() => {
    if (!history || history.length === 0) return {data: []};

    // Собираем уникальные временные метки
    const timestamps = [...new Set(history.map(item => item.timestamp))].sort();

    // Собираем уникальные теги
    const uniqueTags = {};
    history.forEach(item => {
      if (item.tag && item.tag.id) {
        uniqueTags[item.tag.id] = {
          id: item.tag.id,
          name: item.tag.name,
          deviceName: item.device?.name || 'Неизвестно'
        };
      }
    });

    const tags = Object.values(uniqueTags);

    // Создаем строки для таблицы
    const tableData = timestamps.map(timestamp => {
      const row = {id: timestamp, timestamp};

      // Находим все записи для этого времени
      const recordsAtTime = history.filter(item => item.timestamp === timestamp);

      // Заполняем значения тегов
      tags.forEach(tag => {
        const record = recordsAtTime.find(item => item.tag.id === tag.id);
        row[`tag_${tag.id}`] = record ? record.value : null;
        row[`tag_${tag.id}_name`] = tag.name; // Для удобства
      });

      return row;
    });

    return {
      data: tableData,
      tags: tags
    };
  }, [history]);
  
  const allDevices = useMemo(() => {
    const devices = [];

    if (state?.nodes) {
      state.nodes.forEach(node => {
        if (node.devices && node.devices.length > 0) {
          node.devices.forEach(device => {
            devices.push({
              ...device,
              nodeName: node.name,
              nodeId: node.id
            });
          });
        }
      });
    }

    return devices;
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

  // Состояния для DatePicker и TimePicker
  const [startDate, setStartDate] = useState(() => {
    return dayjs().subtract(1, 'hour');
  });

  const [endDate, setEndDate] = useState(() => {
    return dayjs();
  });

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
      setHistory(response.data.reverse()) // Показываем от старых к новым
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

  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: 'Время',
        dataIndex: 'timestamp',
        key: 'timestamp',
        fixed: 'left',
        width: 150,
        render: (timestamp) => {
          const date = new Date(timestamp);
          return date.toLocaleString('ru-RU');
        },
        sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
        defaultSortOrder: 'ascend',
      },
    ];

    // Добавляем колонки для каждого тега
    if (transformedData.tags && transformedData.tags.length > 0) {
      transformedData.tags.forEach(tag => {
        baseColumns.push({
          title: `Значение ${tag.name}`,
          dataIndex: `tag_${tag.id}`,
          key: `tag_${tag.id}`,
          width: 120,
          render: (value) => (
            <span className="value-cell" style={{
              color: value !== null && value !== undefined ? '#1890ff' : '#999',
              fontWeight: value !== null && value !== undefined ? '600' : 'normal'
            }}>
              {value !== null && value !== undefined ? value : '-'}
            </span>
          ),
          sorter: (a, b) => {
            const valA = a[`tag_${tag.id}`] || 0;
            const valB = b[`tag_${tag.id}`] || 0;
            return valA - valB;
          },
        });
      });
    }

    return baseColumns;
  }, [transformedData.tags]);

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
          <Col xs={24} lg={8}>
            <div className="filter-group">
              <Text strong style={{display: 'block', marginBottom: 8}}>
                Устройство
              </Text>
              <Select
                value={selectedDevice}
                onChange={(value) => {
                  setSelectedDevice(value)
                  setHistory([])
                }}
                options={selectDeviceOptions}
                placeholder="Выберите устройство"
                style={{width: '100%'}}
              />
            </div>
          </Col>

          <Col xs={24} lg={8}>
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

          <Col xs={24} lg={8}>
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
              onClick={loadDeviceHistory}
              disabled={!selectedDevice || loading}
              loading={loading}
            >
              Загрузить историю
            </Button>
          </Col>
        </Row>
      </Card>

      {selectedDevice && (
        <Card title="Исторические данные">
          {transformedData?.data?.length === 0 ? (
            <Empty
              description={loading ? "Загрузка данных..." : "Нет данных за выбранный период"}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <div style={{overflowX: 'auto'}}>
              <Table
                loading={loading}
                dataSource={transformedData.data}
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
            </div>
          )}
        </Card>
      )}
    </div>
  )
}