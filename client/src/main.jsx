/**
 * Точка входа клиентского приложения
 * 
 * Инициализирует React приложение и монтирует его в DOM элемент #root
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './components/App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App/>
  // </React.StrictMode>,
)
