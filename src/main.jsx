import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { SocketProvider } from './context/SocketContext.jsx';
import { WebRtcProvider } from './context/WebRtcContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <SocketProvider>
        <WebRtcProvider>
          <App />
        </WebRtcProvider>
      </SocketProvider>
    </ThemeProvider>
  </React.StrictMode>
);
