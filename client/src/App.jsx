import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ConnectionTree from './components/ConnectionTree'
import RealTimeView from './components/RealTimeView'
import HistoryView from './components/HistoryView'
import { WebSocketProvider } from './context/WebSocketContext'
import './App.css'

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<ConnectionTree />} />
            <Route path="/realtime" element={<RealTimeView />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </WebSocketProvider>
  )
}

export default App
