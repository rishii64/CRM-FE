import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App.jsx';
import './index.css';
import { store } from './store';
import { SocketProvider } from './context/SocketContext.jsx';
import { WebRtcProvider } from './context/WebRtcContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <SocketProvider>
          <WebRtcProvider>
            <App />
          </WebRtcProvider>
        </SocketProvider>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);

