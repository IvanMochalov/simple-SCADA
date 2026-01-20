import React from 'react'
import {useNavigate, useLocation, Outlet} from 'react-router-dom'
import {Layout as AntLayout, Menu, Typography, Badge, Space} from 'antd'
import {useWebSocket} from '../context/WebSocketContext'

const {Header, Content} = AntLayout
const {Title} = Typography

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const {isConnected, state} = useWebSocket()

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

  return (
    <AntLayout className="layout" style={{minHeight: '100vh'}}>
      <Header style={{
        background: '#001529',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Title level={3} style={{color: '#fff', margin: 0, fontSize: '20px'}}>
          Система диспетчерского управления
        </Title>
        <Space>
          <Badge status={isConnected ? 'success' : 'error'} text={isConnected ? 'Подключено' : 'Отключено'}
                 style={{color: '#fff'}}/>
        </Space>
      </Header>
      <Menu
        theme="dark"
        mode="horizontal"
        selectedKeys={getSelectedKey()}
        items={menuItems}
        onClick={handleMenuClick}
        style={{lineHeight: '64px'}}
      />
      <Content style={{padding: '24px', background: '#f0f2f5', flex: 1}}>
        <Outlet/>
      </Content>
    </AntLayout>
  )
}
