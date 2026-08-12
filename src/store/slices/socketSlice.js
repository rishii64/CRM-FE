import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isConnected: false,
  registeredUserId: null,
  userRole: null,
};

export const socketSlice = createSlice({
  name: 'socket',
  initialState,
  reducers: {
    setSocketConnected: (state, action) => {
      state.isConnected = action.payload;
    },
    setRegisteredSocketUser: (state, action) => {
      state.registeredUserId = action.payload.userId;
      state.userRole = action.payload.role;
    },
    resetSocketState: (state) => {
      state.isConnected = false;
      state.registeredUserId = null;
      state.userRole = null;
    },
  },
});

export const { setSocketConnected, setRegisteredSocketUser, resetSocketState } = socketSlice.actions;

export const selectIsSocketConnected = (state) => state.socket.isConnected;
export const selectRegisteredUserId = (state) => state.socket.registeredUserId;

export default socketSlice.reducer;
