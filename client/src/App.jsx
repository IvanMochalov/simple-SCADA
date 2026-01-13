import React from 'react'
import {Navigate, createBrowserRouter, RouterProvider} from 'react-router-dom'
import Layout from './components/Layout'
import ConnectionTree from './components/ConnectionTree'
import RealTimeView from './components/RealTimeView'
import HistoryView from './components/HistoryView'
import {WebSocketProvider} from './context/WebSocketContext'
import {NotificationProvider} from './context/NotificationContext'
import './App.css'

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <WebSocketProvider>
        <NotificationProvider>
          <Layout/>
        </NotificationProvider>
      </WebSocketProvider>
    ),
    children: [
      {
        index: true,
        element: <ConnectionTree/>,
      },
      {
        path: 'realtime',
        element: <RealTimeView/>,
      },
      {
        path: 'history',
        element: <HistoryView/>,
      },
      {
        path: '*',
        element: <Navigate to="/" replace/>,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router}/>
}

export default App