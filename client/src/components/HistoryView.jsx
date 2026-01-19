import React, {useState, useEffect, useMemo, useCallback} from 'react'
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
  Checkbox,
  Drawer,
} from 'antd';
import {FilterOutlined} from '@ant-design/icons';
import dayjs from 'dayjs';
import {useNotification} from "../context/NotificationContext.jsx";
import {isNumeric} from "../utils/index.js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

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
  const [selectedTagsForChart, setSelectedTagsForChart] = useState([]) // Массив tagId для отображения на графике
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false) // Состояние боковой панели фильтров

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

  // Преобразуем данные для графика
  const chartData = useMemo(() => {
    if (!history || !history.data || history.data.length === 0) {
      return [];
    }

    const tags = history.tags || [];
    const selectedTags = selectedTagsForChart.length > 0
      ? tags.filter(tag => selectedTagsForChart.includes(tag.id))
      : tags; // Если ничего не выбрано, показываем все теги

    if (selectedTags.length === 0) {
      return [];
    }

    return history.data.map(row => {
      const chartPoint = {
        time: new Date(row.timestamp).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        timestamp: row.timestamp
      };

      // Добавляем значения выбранных тегов
      selectedTags.forEach(tag => {
        const tagKey = tag.id || `${tag.deviceId}_${tag.tagId}`;
        const displayName = tag.displayName || `${tag.nodeName || ''} → ${tag.deviceName || ''} → ${tag.tagName || tag.name || ''}`;

        if (row.tags && row.tags[tagKey] && row.tags[tagKey].value !== null && row.tags[tagKey].value !== undefined) {
          const value = row.tags[tagKey].value;
          chartPoint[displayName] = isNumeric(value) ? Number(value) : value;
        } else {
          chartPoint[displayName] = null;
        }
      });

      return chartPoint;
    });
  }, [history, selectedTagsForChart]);

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

  const [hasInitialLoad, setHasInitialLoad] = useState(false); // Флаг для отслеживания начальной загрузки

  const loadHistory = async (silent = false) => {
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
        if (!silent) {
          notification.success('История всей системы успешно загружена');
        }
      } else if (filterLevel === 'node' && selectedNodeId) {
        response = await api.getHistoryNodeById(selectedNodeId, params);
        const node = allNodes.find(n => n.id === selectedNodeId);
        if (!silent) {
          notification.success(`История узла ${node?.name || selectedNodeId} успешно загружена`);
        }
      } else if (filterLevel === 'device' && selectedDeviceId) {
        response = await api.getHistoryDeviceById(selectedDeviceId, params);
        const device = devicesForNode.find(d => d.id === selectedDeviceId);
        if (!silent) {
          notification.success(`История устройства ${device?.name || selectedDeviceId} успешно загружена`);
        }
      } else {
        notification.error('Выберите необходимые фильтры');
        setLoading(false);
        return;
      }

      setHistory(response.data)
      // Автоматически выбираем все теги для графика при загрузке
      if (response.data && response.data.tags && response.data.tags.length > 0) {
        setSelectedTagsForChart(response.data.tags.map(tag => tag.id))
      } else {
        setSelectedTagsForChart([])
      }
    } catch (error) {
      console.error('Error loading history:', error)
      notification.error('Ошибка загрузки истории', error.response?.data?.error || error.message || "")
    } finally {
      setLoading(false)
    }
  }

  // Автоматическая загрузка данных при открытии страницы
  useEffect(() => {
    // Загружаем данные только если:
    // 1. Есть подключение к WebSocket
    // 2. Есть узлы связи
    // 3. Еще не выполнялась начальная загрузка
    // 4. Не идет загрузка
    if (isConnected && state?.nodes && state.nodes.length > 0 && !hasInitialLoad && !loading) {
      setHasInitialLoad(true);
      loadHistory(true); // Автоматическая загрузка без уведомлений
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, state?.nodes]);

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

  // Форматирует значение тега для отображения
  const formatTagValue = (value) => {
    if (value === null || value === undefined) {
      return '—'
    }
    // Если значение - число, форматируем его
    if (isNumeric(value)) {
      // Если число целое - показываем без десятичной части
      // Если дробное - ограничиваем до 2 знаков после запятой
      return value % 1 === 0 ? value.toString() : Number(value).toFixed(2)
    }

    // Для нечисловых значений возвращаем как есть
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
            const formattedValue = formatTagValue(value);

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
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
        <Title level={2} style={{margin: 0}}>Исторические данные</Title>
        <Button
          type="primary"
          icon={<FilterOutlined/>}
          onClick={() => setFilterDrawerOpen(true)}
        >
          Фильтры
        </Button>
      </div>

      <Drawer
        title="Фильтры"
        placement="right"
        onClose={() => setFilterDrawerOpen(false)}
        open={filterDrawerOpen}
        size={"default"}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Row gutter={[16, 16]}>
            <Col xs={24}>
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
              <Col xs={24}>
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
                <Col xs={24}>
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
                <Col xs={24}>
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

            <Col xs={24}>
              <Form.Item
                label="Начало"
              >
                <Space style={{width: '100%'}} orientation="vertical" size="small">
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

            <Col xs={24}>
              <Form.Item
                label="Конец"
              >
                <Space style={{width: '100%'}} orientation="vertical" size="small">
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

            <Col xs={24}>
              <Form.Item>
                <Button
                  type="primary"
                  onClick={() => {
                    loadHistory();
                    setFilterDrawerOpen(false);
                  }}
                  disabled={!canLoad() || loading}
                  loading={loading}
                  style={{width: '100%'}}
                  block
                >
                  Загрузить историю
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* Начальное состояние - когда данные еще не загружены */}
      {(!history || (history.data && history.data.length === 0 && !loading)) && (
        <Card
          title="Исторические данные"
          styles={{
            root: {marginBottom: 24},
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{textAlign: 'center'}}>
                <Text type="secondary" style={{fontSize: 16, display: 'block', marginBottom: 16}}>
                  {!history
                    ? "Выберите период и нажмите 'Загрузить историю' для отображения данных"
                    : "Нет данных за выбранный период. Попробуйте выбрать другой период."}
                </Text>
                <Button
                  type="primary"
                  icon={<FilterOutlined/>}
                  onClick={() => setFilterDrawerOpen(true)}
                  size="large"
                >
                  Открыть фильтры
                </Button>
              </div>
            }
          />
        </Card>
      )}

      {history && history.data && history.data.length > 0 && (
        <Card title="Таблица исторических данные">
          <div style={{overflowX: 'auto'}}>
            <Table
              loading={loading}
              dataSource={transformedData.data}
              columns={columns}
              rowKey="id"
              size="small"
              scroll={{x: 'max-content', y: 600}}
              pagination={{
                defaultPageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100', '200'],
                showTotal: (total, range) =>
                  `${range[0]}-${range[1]} из ${total} записей`,
              }}
            />
          </div>
        </Card>
      )}


      {history && history.data && history.data.length > 0 && transformedData.tags && transformedData.tags.length > 0 && (
        <Card
          title="График исторических данных"
          styles={{
            root: {marginTop: 24},
          }}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Form.Item label="Выберите теги для отображения на графике">
                <Checkbox.Group
                  value={selectedTagsForChart}
                  onChange={(checkedValues) => setSelectedTagsForChart(checkedValues)}
                  style={{width: '100%'}}
                >
                  <Row gutter={[8, 8]}>
                    {transformedData.tags.map(tag => {
                      const displayName = tag.displayName || `${tag.nodeName || ''} → ${tag.deviceName || ''} → ${tag.tagName || tag.name || ''}`;
                      return (
                        <Col key={tag.id} span={8}>
                          <Checkbox value={tag.id}>{displayName}</Checkbox>
                        </Col>
                      );
                    })}
                  </Row>
                </Checkbox.Group>
              </Form.Item>
            </Col>
            <Col span={24}>
              {chartData.length > 0 && selectedTagsForChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart
                    data={chartData}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis
                      dataKey="time"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval="preserveStartEnd"
                    />
                    <YAxis/>
                    <Tooltip
                      formatter={(value, name) => {
                        if (value === null || value === undefined) return '—';
                        return isNumeric(value)
                          ? (value % 1 === 0 ? value.toString() : Number(value).toFixed(2))
                          : value;
                      }}
                      labelFormatter={(label) => `Время: ${label}`}
                    />
                    <Legend/>
                    {transformedData.tags
                      .filter(tag => selectedTagsForChart.includes(tag.id))
                      .map((tag, index) => {
                        const displayName = tag.displayName || `${tag.nodeName || ''} → ${tag.deviceName || ''} → ${tag.tagName || tag.name || ''}`;
                        // Генерируем разные цвета для линий
                        const colors = [
                          '#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
                          '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911'
                        ];
                        const color = colors[index % colors.length];
                        return (
                          <Line
                            key={tag.id}
                            type="monotone"
                            dataKey={displayName}
                            stroke={color}
                            strokeWidth={2}
                            dot={{r: 3}}
                            connectNulls={false}
                            name={displayName}
                          />
                        );
                      })}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty
                  description="Выберите теги для отображения на графике"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}
            </Col>
          </Row>
        </Card>
      )}
    </div>
  )
}
