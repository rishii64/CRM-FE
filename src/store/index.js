import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import socketReducer from './slices/socketSlice';
import callReducer from './slices/callSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    socket: socketReducer,
    call: callReducer,
    ui: uiReducer,
  },
  devTools: process.env.NODE_ENV !== 'production',
});
