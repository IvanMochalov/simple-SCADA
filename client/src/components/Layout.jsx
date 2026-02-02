/**
 * Основной layout приложения
 *
 * Содержит:
 * - Заголовок с названием системы
 * - Индикатор статуса подключения к серверу
 * - Навигационное меню для переключения между разделами
 * - Область контента для отображения дочерних компонентов
 */

import React, {useState, useEffect} from 'react'
import {useNavigate, useLocation, Outlet} from 'react-router-dom'
import {Layout as AntLayout, Menu, Typography, Badge, Space, Button, Modal, Form, Select} from 'antd'
import {SettingOutlined} from '@ant-design/icons'
import {useWebSocket} from '../context/WebSocketContext'
import {api} from '../services/api'
import {useNotification} from '../context/NotificationContext'
import {useWindowBreakpoints} from '../hooks/useWindowBreakpoints'

const {Header, Content} = AntLayout
const {Title} = Typography

export default function Layout() {
  const location = useLocation()
  const screens = useWindowBreakpoints()
  const isMobile = !screens.sm
  const navigate = useNavigate()
  const {isConnected, state} = useWebSocket()
  const notification = useNotification()
  const [settingsModalVisible, setSettingsModalVisible] = useState(false)
  const [archiveInterval, setArchiveInterval] = useState(60000)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  // Загружаем текущий интервал архивации при открытии модального окна
  useEffect(() => {
    if (settingsModalVisible) {
      loadArchiveInterval()
    }
  }, [settingsModalVisible])

  const loadArchiveInterval = async () => {
    try {
      const {data} = await api.getArchiveInterval()
      setArchiveInterval(data.interval)
      form.setFieldsValue({interval: data.interval})
    } catch (error) {
      console.error('Error loading archive interval:', error)
      notification.error('Ошибка загрузки настроек', error.message || '')
    }
  }

  const handleSettingsOk = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      await api.setArchiveInterval(values.interval)
      setArchiveInterval(values.interval)
      notification.success('Интервал архивации успешно обновлен')
      setSettingsModalVisible(false)
    } catch (error) {
      console.error('Error saving archive interval:', error)
      if (error.errorFields) {
        // Ошибка валидации формы
        return
      }
      notification.error('Ошибка сохранения настроек', error.response?.data?.error || error.message || '')
    } finally {
      setLoading(false)
    }
  }

  const handleSettingsCancel = () => {
    setSettingsModalVisible(false)
    form.resetFields()
  }

  // Варианты интервала архивации
  const archiveIntervalOptions = [
    {value: 5000, label: '5 секунд'},
    {value: 10000, label: '10 секунд'},
    {value: 30000, label: '30 секунд'},
    {value: 60000, label: 'Минута'},
    {value: 300000, label: '5 минут'},
  ]

  const getSelectedKey = () => {
    if (location.pathname === '/') return ['config']
    if (location.pathname === '/realtime') return ['realtime']
    if (location.pathname === '/history') return ['history']
    return []
  }

  const menuItems = [
    {
      key: 'config',
      label: 'Конфигурация',
    },
    {
      key: 'realtime',
      label: 'Реальное время',
    },
    {
      key: 'history',
      label: 'История',
    },
  ]

  const handleMenuClick = ({key}) => {
    if (key === 'config') {
      navigate('/')
    } else if (key === 'realtime') {
      navigate('/realtime')
    } else if (key === 'history') {
      navigate('/history')
    }
  }

  const getConnectStatusText = () => {
    if (isMobile) return null;
    return isConnected ? 'Подключено' : 'Отключено'
  }

  return (
    <AntLayout className="layout" style={{minHeight: '100vh'}}>
      <Header style={{
        background: '#001529',
        padding: isMobile ? "0 10px" : '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Title level={3} style={{color: '#fff', margin: 0, fontSize: isMobile ? "14px" : '20px'}}>
          Система диспетчерского управления
        </Title>
        <Space>
          <Badge status={isConnected ? 'success' : 'error'} text={getConnectStatusText()}
                 style={{color: '#fff'}}/>
          <Button
            type="text"
            icon={<SettingOutlined/>}
            onClick={() => setSettingsModalVisible(true)}
            style={{color: '#fff'}}
            title="Настройки системы"
          />
        </Space>
      </Header>
      <Menu
        theme="dark"
        mode="horizontal"
        selectedKeys={getSelectedKey()}
        items={menuItems}
        onClick={handleMenuClick}
        style={{lineHeight: isMobile ? "48px" : '64px'}}
      />
      <Content style={{
        background: '#f0f2f5',
        display: 'flex',
        alignItems: 'start',
        justifyContent: 'center'
      }}>
        <div style={{
          padding: isMobile ? "10px" : '24px',
          width: '100%',
          maxWidth: "1600px",
          minWidth: "336px"
        }}>
          <Outlet/>
        </div>
      </Content>

      <Modal
        title="Настройки системы"
        open={settingsModalVisible}
        onOk={handleSettingsOk}
        onCancel={handleSettingsCancel}
        confirmLoading={loading}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{interval: archiveInterval}}
        >
          <Form.Item
            name="interval"
            label="Интервал архивации данных"
            rules={[{required: true, message: 'Выберите интервал архивации'}]}
          >
            <Select
              placeholder="Выберите интервал архивации"
              options={archiveIntervalOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </AntLayout>
  )
}
