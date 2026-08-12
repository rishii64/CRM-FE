import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { setSocketConnected, setRegisteredSocketUser } from '../store/slices/socketSlice';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const dispatch = useDispatch();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to backend server
    const serverUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_CLIENT_URL || window.location.origin;

    console.log('Connecting to socket server at:', serverUrl);

    const socketInstance = io(serverUrl, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'], // Add polling as fallback
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket.IO connected:', socketInstance.id);
      setIsConnected(true);
      dispatch(setSocketConnected(true));
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      setIsConnected(false);
      dispatch(setSocketConnected(false));
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [dispatch]);

  // Helper to register authenticated user on socket connection
  const registerUser = (userId, role) => {
    if (socket && isConnected) {
      socket.emit('register-user', { userId, role });
      dispatch(setRegisteredSocketUser({ userId, role }));
    }
  };


  return (
    <SocketContext.Provider value={{ socket, isConnected, registerUser }}>
      {children}
    </SocketContext.Provider>
  );
};
