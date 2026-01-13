import React from 'react'
import {Link, Outlet, useLocation} from 'react-router-dom'
import {useWebSocket} from '../context/WebSocketContext'
import './Layout.css'

export default function Layout() {
  const location = useLocation()
  const {isConnected, state} = useWebSocket()
  console.log("state: -->", state);

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <h1>Система диспетчерского управления Modbus</h1>
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{isConnected ? 'Подключено' : 'Отключено'}</span>
          </div>
        </div>
      </header>

      <nav className="nav">
        <Link
          to="/"
          className={location.pathname === '/' ? 'active' : ''}
        >
          Конфигурация
        </Link>
        <Link
          to="/realtime"
          className={location.pathname === '/realtime' ? 'active' : ''}
        >
          Реальное время
        </Link>
        <Link
          to="/history"
          className={location.pathname === '/history' ? 'active' : ''}
        >
          История
        </Link>
      </nav>

      <main className="main-content">
        <Outlet/>
      </main>
    </div>
  )
}
