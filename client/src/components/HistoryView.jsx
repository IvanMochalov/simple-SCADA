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

  // Фильтры: уровень -> узел -> устройство
  const [filterLevel, setFilterLevel] = useState('system') // 'system', 'node', 'device'
  const [selectedNodeId, setSelectedNodeId] = useState("")
  const [selectedDeviceId, setSelectedDeviceId] = useState("")
  
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  // Преобразуем историю в табличный формат
  const transformedData = useMemo(() => {
    if (!history || !history.data || history.data.length === 0) {
      return {data: [], tags: history?.tags || []};
    }

    const tags = history.tags || [];
    const tableData = history.data.map((row, index) => {
      const tableRow = {
        id: row.timestamp,
        timestamp: row.timestamp,
        key: `row-${index}`
      };

      // Заполняем значения тегов
      tags.forEach(tag => {
        const tagKey = tag.id || `${tag.deviceId}_${tag.tagId}`;
        if (row.tags && row.tags[tagKey]) {
          tableRow[`tag_${tagKey}`] = row.tags[tagKey].value;
        } else {
          tableRow[`tag_${tagKey}`] = null;
        }
      });

      return tableRow;
    });

    return {
      data: tableData,
      tags: tags
    };
  }, [history]);

  // Получаем список узлов
  const allNodes = useMemo(() => {
    return state?.nodes || [];
  }, [state]);

  // Получаем список устройств для выбранного узла
  const devicesForNode = useMemo(() => {
    if (!selectedNodeId || !state?.nodes) return [];
    const node = state.nodes.find(n => n.id === selectedNodeId);
    return node?.devices || [];
  }, [selectedNodeId, state]);

  // Состояния для DatePicker и TimePicker
  const [startDate, setStartDate] = useState(() => {
    return dayjs().subtract(1, 'hour');
  });

  const [endDate, setEndDate] = useState(() => {
    return dayjs();
  });

  const loadHistory = async () => {
    setLoading(true)
    try {
      let response;
      const params = {
        params: {
          startTime: startDate.format('YYYY-MM-DDTHH:mm:ss'),
          endTime: endDate.format('YYYY-MM-DDTHH:mm:ss'),
          limit: 10000
        }
      };

      if (filterLevel === 'system') {
        response = await api.getHistorySystem(params);
        notification.success('История всей системы успешно загружена');
      } else if (filterLevel === 'node' && selectedNodeId) {
        response = await api.getHistoryNodeById(selectedNodeId, params);
        const node = allNodes.find(n => n.id === selectedNodeId);
        notification.success(`История узла ${node?.name || selectedNodeId} успешно загружена`);
      } else if (filterLevel === 'device' && selectedDeviceId) {
        response = await api.getHistoryDeviceById(selectedDeviceId, params);
        const device = devicesForNode.find(d => d.id === selectedDeviceId);
        notification.success(`История устройства ${device?.name || selectedDeviceId} успешно загружена`);
      } else {
        notification.error('Выберите необходимые фильтры');
        setLoading(false);
        return;
      }

      setHistory(response.data)
    } catch (error) {
      console.error('Error loading history:', error)
      notification.error('Ошибка загрузки истории', error.response?.data?.error || error.message || "")
    } finally {
      setLoading(false)
    }
  }

  // Обработчики изменения фильтров
  const handleLevelChange = (level) => {
    setFilterLevel(level);
    setSelectedNodeId("");
    setSelectedDeviceId("");
    setHistory([]);
  };

  const handleNodeChange = (nodeId) => {
    setSelectedNodeId(nodeId);
    setSelectedDeviceId("");
    setHistory([]);
  };

  const handleDeviceChange = (deviceId) => {
    setSelectedDeviceId(deviceId);
    setHistory([]);
  };

  // Форматирует значение тега для отображения (та же логика, что и в RealTimeView)
  const formatTagValue = (value, tag) => {
    if (value === null || value === undefined) {
      return '—'
    }

    // Проверяем, является ли значение float (число с десятичной частью)
    // или тип данных тега указывает на float
    const isFloat = tag?.serverDataType === 'float' ||
      tag?.deviceDataType === 'float' ||
      (typeof value === 'number' && value % 1 !== 0)

    if (isFloat) {
      // Ограничиваем до 3 знаков после запятой для float
      return Number(value).toFixed(3)
    }

    // Для целых чисел возвращаем как есть
    return value
  }

  const columns = useMemo(() => {
    const baseColumns = [
      {
        title: 'Время',
        dataIndex: 'timestamp',
        key: 'timestamp',
        fixed: 'left',
        width: 180,
        render: (timestamp) => {
          const date = new Date(timestamp);
          return date.toLocaleString('ru-RU');
        },
        sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
        defaultSortOrder: 'descend',
      },
    ];

    // Добавляем колонки для каждого тега
    if (transformedData.tags && transformedData.tags.length > 0) {
      transformedData.tags.forEach(tag => {
        const tagKey = tag.id || `${tag.deviceId}_${tag.tagId}`;
        const displayName = tag.displayName || `${tag.nodeName || ''} → ${tag.deviceName || ''} → ${tag.tagName || tag.name || ''}`;
        
        baseColumns.push({
          title: displayName,
          dataIndex: `tag_${tagKey}`,
          key: `tag_${tagKey}`,
          width: 150,
          render: (value) => {
            const formattedValue = formatTagValue(value, tag);
            
            return (
              <span className="value-cell" style={{
                color: value !== null && value !== undefined ? '#1890ff' : '#999',
                fontWeight: value !== null && value !== undefined ? '600' : 'normal'
              }}>
                {formattedValue}
              </span>
            );
          },
          sorter: (a, b) => {
            const valA = a[`tag_${tagKey}`] || 0;
            const valB = b[`tag_${tagKey}`] || 0;
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

  // Проверка возможности загрузки
  const canLoad = () => {
    if (filterLevel === 'system') return true;
    if (filterLevel === 'node') return selectedNodeId !== "";
    if (filterLevel === 'device') return selectedDeviceId !== "";
    return false;
  };

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
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <Form.Item
                label="Уровень"
              >
                <Select
                  value={filterLevel}
                  onChange={handleLevelChange}
                  style={{width: '100%'}}
                  options={[
                    {value: 'system', label: 'Вся система'},
                    {value: 'node', label: 'Узел связи'},
                    {value: 'device', label: 'Устройство'}
                  ]}
                />
              </Form.Item>
            </Col>

            {filterLevel === 'node' && (
              <Col xs={24} lg={8}>
                <Form.Item
                  label="Узел связи"
                  rules={[{required: true, message: 'Выберите узел связи'}]}
                >
                  <Select
                    value={selectedNodeId}
                    onChange={handleNodeChange}
                    placeholder="Выберите узел связи"
                    style={{width: '100%'}}
                    options={[
                      {value: "", label: "Выберите узел связи"},
                      ...allNodes.map(node => ({
                        value: node.id,
                        label: `${node.name} (${node.comPort})`
                      }))
                    ]}
                  />
                </Form.Item>
              </Col>
            )}

            {filterLevel === 'device' && (
              <>
                <Col xs={24} lg={8}>
                  <Form.Item
                    label="Узел связи"
                    rules={[{required: true, message: 'Выберите узел связи'}]}
                  >
                    <Select
                      value={selectedNodeId}
                      onChange={handleNodeChange}
                      placeholder="Выберите узел связи"
                      style={{width: '100%'}}
                      options={[
                        {value: "", label: "Выберите узел связи"},
                        ...allNodes.map(node => ({
                          value: node.id,
                          label: `${node.name} (${node.comPort})`
                        }))
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} lg={8}>
                  <Form.Item
                    label="Устройство"
                    rules={[{required: true, message: 'Выберите устройство'}]}
                  >
                    <Select
                      value={selectedDeviceId}
                      onChange={handleDeviceChange}
                      placeholder="Выберите устройство"
                      style={{width: '100%'}}
                      disabled={!selectedNodeId}
                      options={[
                        {value: "", label: "Выберите устройство"},
                        ...devicesForNode.map(device => ({
                          value: device.id,
                          label: device.name
                        }))
                      ]}
                    />
                  </Form.Item>
                </Col>
              </>
            )}

            <Col xs={24} lg={filterLevel === 'system' ? 8 : filterLevel === 'node' ? 8 : 4}>
              <Form.Item
                label="Начало"
              >
                <Space style={{width: '100%'}} direction="vertical" size="small">
                  <DatePicker
                    value={startDate}
                    onChange={handleStartDateTimeChange}
                    format="DD.MM.YYYY"
                    placeholder="Дата"
                    style={{width: '100%'}}
                  />
                  <TimePicker
                    value={startDate}
                    onChange={handleStartTimeChange}
                    format="HH:mm"
                    placeholder="Время"
                    style={{width: '100%'}}
                  />
                </Space>
              </Form.Item>
            </Col>

            <Col xs={24} lg={filterLevel === 'system' ? 8 : filterLevel === 'node' ? 8 : 4}>
              <Form.Item
                label="Конец"
              >
                <Space style={{width: '100%'}} direction="vertical" size="small">
                  <DatePicker
                    value={endDate}
                    onChange={handleEndDateTimeChange}
                    format="DD.MM.YYYY"
                    placeholder="Дата"
                    style={{width: '100%'}}
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
                    style={{width: '100%'}}
                    disabledTime={() => {
                      if (!endDate || !startDate) return {}

                      if (endDate.isSame(startDate, 'day')) {
                        const startHour = startDate.hour()
                        const startMinute = startDate.minute()

                        return {
                          disabledHours: () => {
                            return Array.from({length: startHour}, (_, i) => i)
                          },
                          disabledMinutes: (selectedHour) => {
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

            <Col xs={24} lg={filterLevel === 'system' ? 8 : filterLevel === 'node' ? 8 : 4}>
              <Form.Item label=" ">
                <Button
                  type="primary"
                  onClick={loadHistory}
                  disabled={!canLoad() || loading}
                  loading={loading}
                  style={{width: '100%', marginTop: '30px'}}
                >
                  Загрузить историю
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {history && history.data && history.data.length > 0 && (
        <Card title="Исторические данные">
          <div style={{overflowX: 'auto'}}>
            <Table
              loading={loading}
              dataSource={transformedData.data}
              columns={columns}
              rowKey="id"
              size="small"
              scroll={{x: 'max-content', y: 600}}
              pagination={{
                defaultPageSize: 50,
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100', '200'],
                showTotal: (total, range) =>
                  `${range[0]}-${range[1]} из ${total} записей`,
              }}
            />
          </div>
        </Card>
      )}

      {history && history.data && history.data.length === 0 && !loading && (
        <Card title="Исторические данные">
          <Empty
            description="Нет данных за выбранный период"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}
    </div>
  )
}
