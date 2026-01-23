/**
 * Компонент отображения данных в реальном времени
 * 
 * Функциональность:
 * - Отображает текущие значения всех тегов с обновлением через WebSocket
 * - Позволяет запускать/останавливать Modbus Manager
 * - Позволяет редактировать значения тегов с типом доступа 'ReadWrite'
 * - Показывает статусы подключения узлов связи и устройств
 * - Позволяет переподключать устройства при сбоях
 * 
 * Структура отображения:
 * - Узлы связи → Устройства → Теги (в виде карточек)
 * - Значения тегов обновляются автоматически при получении данных через WebSocket
 * 
 * Все узлы и устройства развернуты по умолчанию.
 */

import React, {useState, useMemo, useEffect} from 'react'
import {useWebSocket} from '../context/WebSocketContext'
import './RealTimeView.css'
import {api} from "../services/api.js";
import {useNotification} from "../context/NotificationContext";
import {
  Flex,
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
import {isNumeric} from "../utils/index.js";

const {Title, Text, Paragraph} = Typography;

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

  // Автоматически открываем все узлы и устройства по умолчанию
  useEffect(() => {
    if (enabledNodes.length > 0) {
      const allNodeIds = new Set(enabledNodes.map(node => node.id))
      const allDeviceIds = new Set()
      
      enabledNodes.forEach(node => {
        if (node.devices) {
          node.devices.forEach(device => {
            allDeviceIds.add(device.id)
          })
        }
      })
      
      setExpandedNodes(allNodeIds)
      setExpandedDevices(allDeviceIds)
    }
  }, [enabledNodes])

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

  const handleTagValueChange = async (tag, tagValue, str) => {
    const originalValue = formatTagValue(tagValue.value);

    // Валидация: проверяем, что введено число
    const trimmedStr = str.trim();
    if (!trimmedStr) {
      notification.error('Ошибка', 'Введите число');
      return originalValue;
    }

    // Определяем, разрешены ли дробные числа
    // Разрешаем дробные числа если:
    // 1. serverDataType === 'float'
    // 2. scaleFactor существует и не равен 1.0 (потому что после обратного масштабирования может получиться дробное)
    // Обрабатываем scaleFactor как число (может быть строкой из БД)
    let scaleFactor = 1.0;
    if (tag.scaleFactor !== undefined && tag.scaleFactor !== null) {
      scaleFactor = typeof tag.scaleFactor === 'string' ? parseFloat(tag.scaleFactor) : Number(tag.scaleFactor);
      if (isNaN(scaleFactor)) scaleFactor = 1.0;
    }
    
    const allowFloat = tag.serverDataType === 'float' || scaleFactor !== 1.0;
    
    // Заменяем запятую на точку для правильного парсинга
    const normalizedStr = trimmedStr.replace(',', '.');
    
    // Сначала проверяем формат строки, потом парсим
    // Для целых чисел проверяем, что строка содержит только цифры (и минус в начале)
    // Для дробных чисел проверяем, что это валидное число с точкой/запятой
    if (!allowFloat) {
      if (!/^-?\d+$/.test(trimmedStr)) {
        notification.error('Ошибка', 'Введите только целое число');
        return originalValue;
      }
    } else {
      // Для дробных чисел проверяем валидный формат числа (точка или запятая)
      // Разрешаем: "25.60", "25,60", "25", "-25.5", ".5", "0.5", "-.5"
      // Регулярное выражение: необязательный минус, затем цифры, затем точка/запятая и цифры, или просто цифры
      if (!/^-?(\d+([.,]\d+)?|([.,]\d+))$/.test(trimmedStr)) {
        notification.error('Ошибка', 'Введите корректное число');
        return originalValue;
      }
    }

    const numValue = allowFloat ? parseFloat(normalizedStr) : parseInt(normalizedStr, 10);

    // Проверка на валидное число
    if (isNaN(numValue)) {
      notification.error('Ошибка', allowFloat ? 'Введите число' : 'Введите только целое число');
      return originalValue;
    }

    // Проверяем, изменилось ли значение
    if (numValue === tagValue.value) {
      return originalValue;
    }

    // Сохраняем значение
    try {
      await api.writeTagValue(tag.id, numValue);
      notification.success(`Значение тега "${tag.name}" успешно записано`);
      return formatTagValue(numValue);
    } catch (error) {
      console.error('Error writing tag value:', error);
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error || error.message || "Неизвестная ошибка";
      notification.error('Ошибка при записи значения', errorMessage);
      return originalValue;
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

    // Определяем, можно ли записывать значение в тег
    const canWrite = tag.accessType === 'ReadWrite' &&
      isModbusRunning &&
      node.connectionStatus === 'connected' &&
      device.enabled &&
      tag.enabled &&
      tagValue &&
      !tagValue.error

    return tagValue ? (
      <React.Fragment>
        {canWrite ? (
          <Flex justify={"center"}>
            <Text
              type='success'
              editable={{
                onChange: (str) => handleTagValueChange(tag, tagValue, str),
                tooltip: 'Нажмите для редактирования'
              }}
              className={"tag-value"}
            >
              {formatTagValue(tagValue.value)}
            </Text>
          </Flex>
        ) : (
          <Text type="success" style={{fontSize: '2rem'}}>
            {formatTagValue(tagValue.value)}
          </Text>
        )}
        {tagValue.error && (
          <Text type="danger" style={{fontSize: '12px'}}>
            {tagValue.error}
          </Text>
        )}
        <Text type="secondary" style={{fontSize: '11px'}}>
          {new Date(tagValue.timestamp).toLocaleTimeString('ru-RU')}
        </Text>
      </React.Fragment>
    ) : (
      <Text type="secondary">Нет данных</Text>
    )
  }

  const renderTagContent = (device, tag, node) => {
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
              <Flex justify="space-between" align="center" gap="small" style={{width: '100%'}}>
                <Tooltip title={tag.name}>
                  <Paragraph
                    strong
                    ellipsis={true}
                    style={{
                      margin: 0,
                    }}
                  >
                    {tag.name}
                  </Paragraph>
                </Tooltip>
                <Space size="small" style={{flexShrink: 0}}>
                  <Tag
                    color={tag.enabled ? 'success' : 'default'}
                    icon={tag.enabled ? <CheckCircleOutlined/> : <CloseCircleOutlined/>}
                    style={{fontSize: '10px'}}
                  >
                    {tag.enabled ? 'Вкл' : 'Выкл'}
                  </Tag>
                </Space>
              </Flex>
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
                styles={{header: {alignItems: "center"}}}
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

    </div>
  )
}
