import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  theme: 'light',
  activeTab: 'overview',
  notifications: [],
  activeModal: null,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action) => {
      state.theme = action.payload;
    },
    setActiveTab: (state, action) => {
      state.activeTab = action.payload;
    },
    addNotification: (state, action) => {
      state.notifications.push({
        id: Date.now(),
        ...action.payload,
      });
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter((n) => n.id !== action.payload);
    },
    openModal: (state, action) => {
      state.activeModal = action.payload;
    },
    closeModal: (state) => {
      state.activeModal = null;
    },
  },
});

export const {
  setTheme,
  setActiveTab,
  addNotification,
  removeNotification,
  openModal,
  closeModal,
} = uiSlice.actions;

export const selectTheme = (state) => state.ui.theme;
export const selectActiveTab = (state) => state.ui.activeTab;
export const selectNotifications = (state) => state.ui.notifications;

export default uiSlice.reducer;
