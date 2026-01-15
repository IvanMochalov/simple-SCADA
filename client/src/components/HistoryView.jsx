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
  Form, Alert,
} from 'antd';
import dayjs from 'dayjs';
import {useNotification} from "../context/NotificationContext.jsx";

const {Title, Text} = Typography;

export default function HistoryView() {
  const notification = useNotification();
  const {state, isConnected} = useWebSocket()
  const [form] = Form.useForm()

  const [selectedDevice, setSelectedDevice] = useState("")
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  // Преобразуем историю в табличный формат (данные уже сгруппированы на сервере)
  const transformedData = useMemo(() => {
    if (!history || !history.data || history.data.length === 0) {
      return {data: [], tags: history?.tags || []};
    }

    // Данные уже сгруппированы на сервере, просто преобразуем в формат для таблицы
    const tags = history.tags || [];
    const tableData = history.data.map((row, index) => {
      const tableRow = {
        id: row.timestamp,
        timestamp: row.timestamp,
        key: `row-${index}`
      };

      // Заполняем значения тегов
      tags.forEach(tag => {
        if (row.tags && row.tags[tag.id]) {
          tableRow[`tag_${tag.id}`] = row.tags[tag.id].value;
          tableRow[`tag_${tag.id}_name`] = tag.name;
        } else {
          tableRow[`tag_${tag.id}`] = null;
          tableRow[`tag_${tag.id}_name`] = tag.name;
        }
      });

      return tableRow;
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
          startTime: startDate.format('YYYY-MM-DDTHH:mm:ss'),
          endTime: endDate.format('YYYY-MM-DDTHH:mm:ss'),
          limit: 10000
        }
      })
      notification.success(`История устройства ${currentDeviceName} успешно загружена`)
      // Сервер возвращает уже сгруппированные данные в формате {data: [], tags: []}
      setHistory(response.data)
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
  const handleStartDateTimeChange = (date) => {
    if (date) {
      setStartDate(date);
      // Если конечная дата меньше новой начальной, обновляем конечную дату
      if (endDate.isBefore(date)) {
        setEndDate(date);
      }
    }
  }

  // Обработчик изменения конечной даты
  const handleEndDateTimeChange = (date) => {
    if (date) {
      setEndDate(date);
    }
  }

  // Обработчик изменения времени для начальной даты
  const handleStartTimeChange = (time) => {
    if (time) {
      const newDate = startDate.hour(time.hour()).minute(time.minute());
      setStartDate(newDate);
      // Если конечная дата меньше новой начальной, обновляем конечную дату
      if (endDate.isBefore(newDate)) {
        setEndDate(newDate);
      }
    }
  }

  // Обработчик изменения времени для конечной даты
  const handleEndTimeChange = (time) => {
    if (time) {
      const newDate = endDate.hour(time.hour()).minute(time.minute());
      setEndDate(newDate);
    }
  }

  if (!isConnected) {
    return (
      <div className="realtime-view">
        <Alert
          title="Нет подключения к серверу"
          description="Проверьте соединение с сервером."
          type="warning"
          showIcon
        />
      </div>
    )
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
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            device: selectedDevice,
          }}
          onValuesChange={(changedValues) => {
            if (changedValues.device !== undefined) {
              setSelectedDevice(changedValues.device)
              setHistory([])
            }
          }}
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} lg={8}>
              <Form.Item
                label="Устройство"
                name="device"
                rules={[{required: true, message: 'Выберите устройство'}]}
              >
                <Select
                  options={selectDeviceOptions}
                  placeholder="Выберите устройство"
                  style={{width: '100%'}}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item
                label="Начало"
              >
                <Space style={{width: '100%'}}>
                  <DatePicker
                    value={startDate}
                    onChange={handleStartDateTimeChange}
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
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item
                label="Конец"
              >
                <Space style={{width: '100%'}}>
                  <DatePicker
                    value={endDate}
                    onChange={handleEndDateTimeChange}
                    format="DD.MM.YYYY"
                    placeholder="Дата"
                    disabledDate={(current) => {
                      if (!current || !startDate) return false
                      return current.isBefore(startDate, 'day')
                    }}
                  />
                  <TimePicker
                    value={endDate}
                    onChange={handleEndTimeChange}
                    format="HH:mm"
                    placeholder="Время"
                    disabledTime={() => {
                      if (!endDate || !startDate) return {}

                      // Если даты одинаковые, ограничиваем время
                      if (endDate.isSame(startDate, 'day')) {
                        const startHour = startDate.hour()
                        const startMinute = startDate.minute()

                        return {
                          disabledHours: () => {
                            // Отключаем все часы до часа начала
                            return Array.from({length: startHour}, (_, i) => i)
                          },
                          disabledMinutes: (selectedHour) => {
                            // Если выбран час начала, отключаем минуты до минуты начала
                            if (selectedHour === startHour) {
                              return Array.from({length: startMinute}, (_, i) => i)
                            }
                            return []
                          }
                        }
                      }

                      return {}
                    }}
                  />
                </Space>
              </Form.Item>
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
        </Form>
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
                scroll={{x: 'max-content', y: undefined}}
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