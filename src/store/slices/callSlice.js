import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  activeCall: null,
  connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected'
  isScreenSharing: false,
  isAudioMuted: false,
  isVideoMuted: false,
};

export const callSlice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    setActiveCallState: (state, action) => {
      state.activeCall = action.payload;
    },
    setCallConnectionStatus: (state, action) => {
      state.connectionStatus = action.payload;
    },
    setScreenSharingState: (state, action) => {
      state.isScreenSharing = action.payload;
    },
    setAudioMuted: (state, action) => {
      state.isAudioMuted = action.payload;
    },
    setVideoMuted: (state, action) => {
      state.isVideoMuted = action.payload;
    },
    resetCallState: (state) => {
      state.activeCall = null;
      state.connectionStatus = 'disconnected';
      state.isScreenSharing = false;
      state.isAudioMuted = false;
      state.isVideoMuted = false;
    },
  },
});

export const {
  setActiveCallState,
  setCallConnectionStatus,
  setScreenSharingState,
  setAudioMuted,
  setVideoMuted,
  resetCallState,
} = callSlice.actions;

export const selectActiveCall = (state) => state.call.activeCall;
export const selectCallConnectionStatus = (state) => state.call.connectionStatus;
export const selectIsScreenSharing = (state) => state.call.isScreenSharing;

export default callSlice.reducer;
