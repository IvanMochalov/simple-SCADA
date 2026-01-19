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
  Tooltip,
  Modal,
  InputNumber,
  Form
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined
} from '@ant-design/icons';
import {isNumeric} from "../utils/index.js";

const {Title, Text} = Typography;

export default function RealTimeView() {
  const notification = useNotification();
  const {state, tagValues, isConnected} = useWebSocket()
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [expandedDevices, setExpandedDevices] = useState(new Set())
  const [isModbusRunning, setIsModbusRunning] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [writeModalVisible, setWriteModalVisible] = useState(false)
  const [selectedTagForWrite, setSelectedTagForWrite] = useState(null)
  const [writeForm] = Form.useForm()
  const [isWriting, setIsWriting] = useState(false)

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
        notification.warning('Modbus Manager остановлен');
      } else {
        const {data} = await api.startModbus()
        if (data.success) {
          notification.success('Modbus Manager запущен');
        } else {
          notification.error(data.data.title, data.data.description)
        }
      }
    } catch (error) {
      console.error('Error toggling Modbus Manager:', error)
      console.log("error: -->", error);
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

  const handleWriteTag = (device, tag, node) => {
    const tagValue = getTagValue(device.id, tag.id)
    setSelectedTagForWrite({device, tag, node, currentValue: tagValue?.value})
    writeForm.setFieldsValue({value: tagValue?.value || 0})
    setWriteModalVisible(true)
  }

  const handleWriteSubmit = async () => {
    if (!selectedTagForWrite) return

    try {
      const values = await writeForm.validateFields()
      setIsWriting(true)

      await api.writeTagValue(selectedTagForWrite.tag.id, values.value)
      notification.success(`Значение тега "${selectedTagForWrite.tag.name}" успешно записано`)
      setWriteModalVisible(false)
      setSelectedTagForWrite(null)
      writeForm.resetFields()
    } catch (error) {
      console.error('Error writing tag value:', error)

      // Формируем детальное сообщение об ошибке
      const errorData = error.response?.data || {}
      let errorMessage = errorData.error || error.message || "Неизвестная ошибка"

      // Логируем полную информацию об ошибке для отладки
      if (errorData.modbusCode) {
        console.log('Modbus error code:', errorData.modbusCode)
      }

      // Сообщение уже содержит детальную информацию с сервера,
      // но можно добавить дополнительную информацию о modbusCode в консоль
      notification.error('Ошибка при записи значения', errorMessage)
    } finally {
      setIsWriting(false)
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
            title="Нет включенных узлов связи"
            description="Для работы Modbus Server необходимо включить в работу хотя бы один узел связи в разделе 'Конфигурация'."
            type="warning"
            showIcon
          />
        </Space>
      </div>
    )
  }

  const renderTagValue = (device, tag, node) => {
    if (!isModbusRunning) {
      return (
        <Text type="secondary">Запустите Modbus Server</Text>
      )
    }

    // Проверяем статус подключения узла
    if (node.connectionStatus === 'error') {
      return (
        <Text type="danger">
          Узел не подключен
          {node.lastError && (
            <div style={{fontSize: '10px', marginTop: '4px'}}>
              {node.lastError}
            </div>
          )}
        </Text>
      )
    }

    if (node.connectionStatus === 'disconnected') {
      return (
        <Text type="secondary">Узел отключен</Text>
      )
    }

    if (!device.enabled) {
      return (
        <Text type="secondary">Устройство не включено в работу</Text>
      )
    }

    if (!tag.enabled) {
      return (
        <Text type="secondary">Тег не включен в работу</Text>
      )
    }

    // Для узлов с ошибкой не показываем устаревшие данные
    if (node.connectionStatus !== 'connected') {
      return (
        <Text type="secondary">Нет данных</Text>
      )
    }

    const tagValue = getTagValue(device.id, tag.id)

    return tagValue ? (
      <>
        <div className="tag-value">
          {formatTagValue(tagValue.value)}
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
    )
  }

  const renderTagContent = (device, tag, node) => {
    const tagValue = getTagValue(device.id, tag.id)
    const canWrite = tag.accessType === 'ReadWrite' &&
      isModbusRunning &&
      node.connectionStatus === 'connected' &&
      device.enabled &&
      tag.enabled &&
      tagValue &&
      !tagValue.error

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
            <div style={{textAlign: "start"}}>
              <Space align={"start"} style={{justifyContent: "space-between", width: "100%"}}>
                <Text strong>{tag.name}</Text>
                <Space size="small">
                  <Tag
                    color={tag.enabled ? 'success' : 'default'}
                    icon={tag.enabled ? <CheckCircleOutlined/> : <CloseCircleOutlined/>}
                    style={{fontSize: '10px'}}
                  >
                    {tag.enabled ? 'Вкл' : 'Выкл'}
                  </Tag>
                  {canWrite && (
                    <Tooltip title="Изменить значение">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined/>}
                        onClick={() => handleWriteTag(device, tag, node)}
                      />
                    </Tooltip>
                  )}
                </Space>
              </Space>
              <br/>
              <Text type="secondary" style={{fontSize: '12px'}}>
                Адрес: {tag.address}
              </Text>
            </div>
            {renderTagValue(device, tag, node)}
          </Space>
        </Card>
      </Col>
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
                        {node.enabled ? 'Включен в работу' : 'Не включен в работу'}
                      </Tag>
                      {isModbusRunning && node.connectionStatus && (
                        <Tag
                          color={node.connectionStatus === 'connected' ? 'success' : 'error'}
                        >
                          {node.connectionStatus === 'connected' ? 'Соединение установлено' : 'Ошибка соединения'}
                        </Tag>
                      )}
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
                                      {device.enabled ? 'Включен в работу' : 'Не включен'}
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
                                  {device.tags.map(tag => renderTagContent(device, tag, node))}
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

      {/* Модальное окно для записи значения */}
      <Modal
        title={`Изменить значение тега "${selectedTagForWrite?.tag?.name || ''}"`}
        open={writeModalVisible}
        onOk={handleWriteSubmit}
        onCancel={() => {
          setWriteModalVisible(false)
          setSelectedTagForWrite(null)
          writeForm.resetFields()
        }}
        confirmLoading={isWriting}
        okText="Записать"
        cancelText="Отмена"
      >
        <Form
          form={writeForm}
          layout="vertical"
          initialValues={{
            value: selectedTagForWrite?.currentValue || 0
          }}
        >
          <Form.Item
            label="Новое значение"
            name="value"
            rules={[
              {required: true, message: 'Введите значение'},
              {type: 'number', message: 'Значение должно быть числом'}
            ]}
          >
            <InputNumber
              style={{width: '100%'}}
              placeholder="Введите значение"
              step={selectedTagForWrite?.tag?.serverDataType === 'float' ? 0.01 : 1}
              precision={selectedTagForWrite?.tag?.serverDataType === 'float' ? 2 : 0}
            />
          </Form.Item>
          {selectedTagForWrite?.currentValue !== undefined && (
            <Text type="secondary" style={{fontSize: '12px'}}>
              Текущее значение: {formatTagValue(selectedTagForWrite.currentValue)}
            </Text>
          )}
        </Form>
      </Modal>
    </div>
  )
}
