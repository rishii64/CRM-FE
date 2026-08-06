import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to backend server
    const serverUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_CLIENT_URL || window.location.origin;
    const socketInstance = io(serverUrl, {
      withCredentials: true,
      autoConnect: true,
    });

    socketInstance.on('connect', () => {
      console.log('Socket.IO connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Helper to register authenticated user on socket connection
  const registerUser = (userId, role) => {
    if (socket && isConnected) {
      socket.emit('register-user', { userId, role });
    }
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, registerUser }}>
      {children}
    </SocketContext.Provider>
  );
};
