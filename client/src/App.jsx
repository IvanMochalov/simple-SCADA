import React from 'react'
import {BrowserRouter as Router, Routes, Route, Navigate} from 'react-router-dom'
import Layout from './components/Layout'
import ConnectionTree from './components/ConnectionTree'
import RealTimeView from './components/RealTimeView'
import HistoryView from './components/HistoryView'
import {WebSocketProvider} from './context/WebSocketContext'
import './App.css'
import {ToastContainer} from 'react-toastify';

function App() {
  return (
    <WebSocketProvider>
      <ToastContainer/>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<ConnectionTree/>}/>
            <Route path="/realtime" element={<RealTimeView/>}/>
            <Route path="/history" element={<HistoryView/>}/>
            <Route path="*" element={<Navigate to="/" replace/>}/>
          </Routes>
        </Layout>
      </Router>
    </WebSocketProvider>
  )
}

export default App
