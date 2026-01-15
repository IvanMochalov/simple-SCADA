import React, {useState, useEffect} from 'react'
import {useWebSocket} from '../context/WebSocketContext'
import ConnectionNodeForm from './ConnectionNodeForm'
import DeviceForm from './DeviceForm'
import TagForm from './TagForm'
import {api} from "../services/api.js";
import {
  Card,
  Button,
  Typography,
  Collapse,
  Tag,
  Empty,
  Space,
  Modal,
  Tooltip, Alert
} from 'antd';
import {
  AppstoreAddOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import {useNotification} from "../context/NotificationContext.jsx";

const {Title, Text} = Typography;
const {confirm} = Modal;


export default function ConnectionTree() {
  const notification = useNotification();
  const {state, refreshState, isConnected} = useWebSocket()
  const [nodes, setNodes] = useState([])
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [expandedDevices, setExpandedDevices] = useState(new Set())
  const [showNodeForm, setShowNodeForm] = useState(false)
  const [showDeviceForm, setShowDeviceForm] = useState(false)
  const [showTagForm, setShowTagForm] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [selectedTagId, setSelectedTagId] = useState(null)

  useEffect(() => {
    loadNodes()
  }, [])

  useEffect(() => {
    if (state && state.nodes) {
      setNodes(state.nodes)
    }
  }, [state])

  const loadNodes = async () => {
    try {
      const response = await api.getAllNodes()
      setNodes(response.data)
    } catch (error) {
      console.error('Error loading nodes:', error)
    }
  }

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

  const handleDeleteNode = async (nodeId) => {
    confirm({
      title: 'Удалить узел связи?',
      content: 'Это действие нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await api.removeNodeById(nodeId)
          await loadNodes()
          refreshState()
          notification.success('Узел связи удален')
        } catch (error) {
          console.error('Error deleting node:', error)
          notification.error('Ошибка при удалении узла', error.message || "")
        }
      }
    })
  }

  const handleDeleteDevice = async (deviceId, nodeId) => {
    confirm({
      title: 'Удалить устройство?',
      content: 'Это действие нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await api.removeDeviceById(deviceId)
          await loadNodes()
          refreshState()
          notification.success('Устройство удалено')
        } catch (error) {
          console.error('Error deleting device:', error)
          notification.error('Ошибка при удалении устройства', error.message || "")
        }
      }
    })
  }

  const handleDeleteTag = async (tagId, deviceId) => {
    confirm({
      title: 'Удалить тег?',
      content: 'Это действие нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await api.removeTagById(tagId)
          await loadNodes()
          refreshState()
          notification.success('Тег удален')
        } catch (error) {
          console.error('Error deleting tag:', error)
          notification.error('Ошибка при удалении тега', error.message || "")
        }
      }
    })
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
    <div style={{maxWidth: "1200px", margin: "0 auto", padding: "16px"}}>
      <Space orientation="vertical" style={{width: '100%'}} size="large">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <Title level={2}>Конфигурация узлов связи</Title>
          <Button
            type="primary"
            onClick={() => {
              setSelectedNodeId(null)
              setShowNodeForm(true)
            }}
            icon={<AppstoreAddOutlined/>}
          >
            Добавить узел связи
          </Button>
        </div>

        {nodes.length === 0 ? (
          <Empty description="Нет узлов связи. Создайте первый узел связи."/>
        ) : (
          <Space orientation="vertical" style={{width: '100%'}} size="middle">
            {nodes.map(node => (
              <Card key={node.id} size="small" styles={{body: {padding: "0"}}}>
                <Collapse
                  styles={{header: {alignItems: "center"}}}
                  activeKey={expandedNodes.has(node.id) ? [node.id] : []}
                  onChange={() => toggleNode(node.id)}
                  ghost
                  items={[{
                    key: node.id,
                    label: (
                      <Space style={{width: '100%', justifyContent: 'space-between'}}>
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
                        <Space onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Редактировать узел связи">
                            <Button
                              type="text"
                              icon={<EditOutlined/>}
                              onClick={() => {
                                setSelectedNodeId(node.id)
                                setShowNodeForm(true)
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="Добавить устройство">
                            <Button
                              type="text"
                              icon={<PlusOutlined/>}
                              onClick={() => {
                                setSelectedNodeId(node.id)
                                setShowDeviceForm(true)
                              }}
                            />
                          </Tooltip>
                          <Tooltip title="Удалить узел связи">
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined/>}
                              onClick={() => handleDeleteNode(node.id)}
                            />
                          </Tooltip>
                        </Space>
                      </Space>
                    ),
                    children: node.devices.length === 0 ? (
                      <Empty description="Нет устройств. Добавьте устройство." image={Empty.PRESENTED_IMAGE_SIMPLE}/>
                    ) : (
                      <Space orientation="vertical" style={{width: '100%'}} size="small">
                        {node.devices.map(device => (
                          <Card key={device.id} size="small" style={{marginTop: 8}} styles={{body: {padding: "0"}}}>
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
                                    <Space onClick={(e) => e.stopPropagation()}>
                                      <Tooltip title="Редактировать устройство">
                                        <Button
                                          type="text"
                                          icon={<EditOutlined/>}
                                          onClick={() => {
                                            setSelectedDeviceId(device.id)
                                            setSelectedNodeId(node.id)
                                            setShowDeviceForm(true)
                                          }}
                                        />
                                      </Tooltip>
                                      <Tooltip title="Добавить тег">
                                        <Button
                                          type="text"
                                          icon={<PlusOutlined/>}
                                          onClick={() => {
                                            setSelectedDeviceId(device.id)
                                            setSelectedNodeId(node.id)
                                            setShowTagForm(true)
                                          }}
                                        />
                                      </Tooltip>
                                      <Tooltip title="Удалить устройство">
                                        <Button
                                          type="text"
                                          danger
                                          icon={<DeleteOutlined/>}
                                          onClick={() => handleDeleteDevice(device.id, node.id)}
                                        />
                                      </Tooltip>
                                    </Space>
                                  </Space>
                                ),
                                children: device.tags.length === 0 ? (
                                  <Empty description="Нет тегов. Добавьте тег." image={Empty.PRESENTED_IMAGE_SIMPLE}/>
                                ) : (
                                  <Space orientation="vertical" style={{width: '100%'}} size="small">
                                    {device.tags.map(tag => (
                                      <Card key={tag.id} size="small" style={{background: '#fafafa'}}>
                                        <Space style={{width: '100%', justifyContent: 'space-between'}}>
                                          <Space orientation="vertical" size={0}>
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
                                            <Text type="secondary" style={{fontSize: '12px'}}>
                                              Адрес: {tag.address} | {tag.registerType} | {tag.accessType}
                                            </Text>
                                          </Space>
                                          <Space onClick={(e) => e.stopPropagation()}>
                                            <Tooltip title="Редактировать тег">
                                              <Button
                                                type="text"
                                                icon={<EditOutlined/>}
                                                onClick={() => {
                                                  setSelectedTagId(tag.id)
                                                  setSelectedDeviceId(device.id)
                                                  setSelectedNodeId(node.id)
                                                  setShowTagForm(true)
                                                }}
                                              />
                                            </Tooltip>
                                            <Tooltip title="Удалить тег">
                                              <Button
                                                type="text"
                                                danger
                                                icon={<DeleteOutlined/>}
                                                onClick={() => handleDeleteTag(tag.id, device.id)}
                                              />
                                            </Tooltip>
                                          </Space>
                                        </Space>
                                      </Card>
                                    ))}
                                  </Space>
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
        )}
      </Space>

      {showNodeForm && (
        <ConnectionNodeForm
          nodeId={selectedNodeId}
          onClose={() => {
            setShowNodeForm(false)
            setSelectedNodeId(null)
          }}
          onSave={async () => {
            await loadNodes()
            refreshState()
            setShowNodeForm(false)
            setSelectedNodeId(null)
          }}
        />
      )}

      {showDeviceForm && (
        <DeviceForm
          deviceId={selectedDeviceId}
          nodeId={selectedNodeId}
          onClose={() => {
            setShowDeviceForm(false)
            setSelectedDeviceId(null)
            setSelectedNodeId(null)
          }}
          onSave={async () => {
            await loadNodes()
            refreshState()
            setShowDeviceForm(false)
            setSelectedDeviceId(null)
            setSelectedNodeId(null)
          }}
        />
      )}

      {showTagForm && (
        <TagForm
          tagId={selectedTagId}
          deviceId={selectedDeviceId}
          onClose={() => {
            setShowTagForm(false)
            setSelectedTagId(null)
            setSelectedDeviceId(null)
          }}
          onSave={async () => {
            await loadNodes()
            refreshState()
            setShowTagForm(false)
            setSelectedTagId(null)
            setSelectedDeviceId(null)
          }}
        />
      )}
    </div>
  )
}
