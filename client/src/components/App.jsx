import React from 'react'
import {Navigate, createBrowserRouter, RouterProvider} from 'react-router-dom'
import Layout from './Layout.jsx'
import ConnectionTree from './ConnectionTree.jsx'
import RealTimeView from './RealTimeView.jsx'
import HistoryView from './HistoryView.jsx'
import {WebSocketProvider} from '../context/WebSocketContext.jsx'
import {NotificationProvider} from '../context/NotificationContext.jsx'

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