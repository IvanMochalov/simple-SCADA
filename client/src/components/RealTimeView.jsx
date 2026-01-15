import React, {useState, useMemo} from 'react'
import {useWebSocket} from '../context/WebSocketContext'
import './RealTimeView.css'
import {api} from "../services/api.js";
import {useNotification} from "../context/NotificationContext";
import {
  Card,
  Button,
  Typography,
  Collapse,
  Tag,
  Alert,
  Empty,
  Space,
  Row,
  Col,
  Tooltip
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';

const {Title, Text} = Typography;

export default function RealTimeView() {
  const notification = useNotification();
  const {state, tagValues, isConnected} = useWebSocket()
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [expandedDevices, setExpandedDevices] = useState(new Set())
  const [isModbusRunning, setIsModbusRunning] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  // Фильтруем только включенные узлы связи
  const enabledNodes = useMemo(() => {
    if (!state || !state.nodes) return []
    return state.nodes.filter(node => node.enabled)
  }, [state])

  const toggleNode = (nodeId) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const toggleDevice = (deviceId) => {
    const newExpanded = new Set(expandedDevices)
    if (newExpanded.has(deviceId)) {
      newExpanded.delete(deviceId)
    } else {
      newExpanded.add(deviceId)
    }
    setExpandedDevices(newExpanded)
  }

  const getTagValue = (deviceId, tagId) => {
    if (!tagValues[deviceId] || !tagValues[deviceId][tagId]) {
      return null
    }
    return tagValues[deviceId][tagId]
  }

  // Обновляем статус modbusManager при изменении state
  React.useEffect(() => {
    if (state && state.modbusManagerStatus) {
      setIsModbusRunning(state.modbusManagerStatus.isRunning || false)
    }
  }, [state])

  const handleToggleModbus = async () => {
    if (isToggling) return

    setIsToggling(true)
    try {
      if (isModbusRunning) {
        await api.stopModbus()
      } else {
        await api.startModbus()
      }
    } catch (error) {
      console.error('Error toggling Modbus Manager:', error)
      notification.error('Ошибка при управлении Modbus Manager', error.response?.data?.error || "")
    } finally {
      setIsToggling(false)
    }
  }

  const handleReconnectDevice = async (deviceId) => {
    try {
      await api.reconnectDeviceById(deviceId)
      notification.success('Устройство переподключено');
    } catch (error) {
      console.error('Error reconnecting device:', error)
      notification.error('Ошибка при переподключении устройства', error.response?.data?.error || "")
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

  if (!state || !state.nodes || state.nodes.length === 0) {
    return (
      <div className="realtime-view">
        <Empty
          description="Нет узлов связи. Создайте узел связи в разделе 'Конфигурация'."
        />
      </div>
    )
  }

  // Если нет включенных узлов, показываем предупреждение
  if (enabledNodes.length === 0) {
    return (
      <div className="realtime-view">
        <Space orientation="vertical" style={{width: '100%'}} size="large">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <Title level={2}>Значения тегов в реальном времени</Title>
          </div>
          <Alert
            message="Нет включенных узлов связи"
            description="Для работы Modbus Server необходимо включить в работу хотя бы один узел связи в разделе 'Конфигурация'."
            type="warning"
            showIcon
          />
        </Space>
      </div>
    )
  }

  return (
    <div className="realtime-view">
      <Space orientation="vertical" style={{width: '100%'}} size="large">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <Title level={2}>Значения тегов в реальном времени</Title>
          <Button
            type={isModbusRunning ? 'danger' : 'primary'}
            icon={isModbusRunning ? <StopOutlined/> : <PlayCircleOutlined/>}
            onClick={handleToggleModbus}
            loading={isToggling}
            disabled={!isConnected}
            size="large"
          >
            {isModbusRunning ? 'Остановить Modbus Server' : 'Запустить Modbus Server'}
          </Button>
        </div>

        <Space orientation="vertical" style={{width: '100%'}} size="middle">
          {enabledNodes.map(node => (
            <Card key={node.id} size="small" styles={{body: {padding: "0"}}}>
              <Collapse
                activeKey={expandedNodes.has(node.id) ? [node.id] : []}
                onChange={() => toggleNode(node.id)}
                ghost
                items={[{
                  key: node.id,
                  label: (
                    <Space>
                      <Text strong>{node.name}</Text>
                      <Tag color="blue">{node.comPort}</Tag>
                      <Tag
                        color={node.enabled ? 'success' : 'default'}
                        icon={node.enabled ? <CheckCircleOutlined/> : <CloseCircleOutlined/>}
                      >
                        {node.enabled ? 'Включен' : 'Не включен'}
                      </Tag>
                    </Space>
                  ),
                  children: node.devices.length === 0 ? (
                    <Empty description="Нет устройств" image={Empty.PRESENTED_IMAGE_SIMPLE}/>
                  ) : (
                    <Space orientation="vertical" style={{width: '100%'}} size="small">
                      {node.devices.map(device => (
                        <Card key={device.id} size="small" style={{marginTop: 8}} className="device-card"
                              styles={{body: {padding: "0"}}}>
                          <Collapse
                            styles={{header: {alignItems: "center"}}}
                            activeKey={expandedDevices.has(device.id) ? [device.id] : []}
                            onChange={() => toggleDevice(device.id)}
                            items={[{
                              key: device.id,
                              label: (
                                <Space style={{width: '100%', justifyContent: 'space-between'}}>
                                  <Space>
                                    <Text strong>{device.name}</Text>
                                    <Tag
                                      color={device.enabled ? 'success' : 'default'}
                                      icon={device.enabled ? <CheckCircleOutlined/> : <CloseCircleOutlined/>}
                                    >
                                      {device.enabled ? 'Включен' : 'Не включен'}
                                    </Tag>
                                  </Space>
                                  {device.enabled && (
                                    <Tooltip title="Переподключить устройство">
                                      <Button
                                        type="text"
                                        icon={<ReloadOutlined/>}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleReconnectDevice(device.id)
                                        }}
                                      />
                                    </Tooltip>
                                  )}
                                </Space>
                              ),
                              children: device.tags.length === 0 ? (
                                <Empty description="Нет тегов" image={Empty.PRESENTED_IMAGE_SIMPLE}/>
                              ) : (
                                <Row gutter={[16, 16]}>
                                  {device.tags.map(tag => {
                                    const tagValue = getTagValue(device.id, tag.id)
                                    return (
                                      <Col key={tag.id} xs={24} sm={12} md={8} lg={6}>
                                        <Card size="small" className="tag-card"
                                              styles={{body: {height: "100%"}, root: {height: "100%"}}}>
                                          <Space orientation="vertical" style={{
                                            width: '100%',
                                            height: '100%',
                                            textAlign: 'center',
                                            justifyContent: "space-between"
                                          }}>
                                            <div>
                                              <Space>
                                                <Text strong>{tag.name}</Text>
                                                <Tag
                                                  color={tag.enabled ? 'success' : 'default'}
                                                  icon={tag.enabled ? <CheckCircleOutlined/> : <CloseCircleOutlined/>}
                                                  style={{fontSize: '10px'}}
                                                >
                                                  {tag.enabled ? 'Вкл' : 'Выкл'}
                                                </Tag>
                                              </Space>
                                              <br/>
                                              <Text type="secondary" style={{fontSize: '12px'}}>
                                                Адрес: {tag.address}
                                              </Text>
                                            </div>
                                            {!isModbusRunning ? (
                                              <Text type="secondary">Запустите Modbus Server</Text>
                                            ) : tagValue ? (
                                              <>
                                                <div className="tag-value">
                                                  {tagValue.value !== null ? tagValue.value : '—'}
                                                </div>
                                                {tagValue.error && (
                                                  <Text type="danger" style={{fontSize: '12px'}}>
                                                    {tagValue.error}
                                                  </Text>
                                                )}
                                                <Text type="secondary" style={{fontSize: '11px'}}>
                                                  {new Date(tagValue.timestamp).toLocaleTimeString('ru-RU')}
                                                </Text>
                                              </>
                                            ) : (
                                              <Text type="secondary">Нет данных</Text>
                                            )}
                                          </Space>
                                        </Card>
                                      </Col>
                                    )
                                  })}
                                </Row>
                              )
                            }]}
                          />
                        </Card>
                      ))}
                    </Space>
                  )
                }]}
              />
            </Card>
          ))}
        </Space>
      </Space>
    </div>
  )
}
