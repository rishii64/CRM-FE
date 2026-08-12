import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { setUser, logoutUser, selectUser, selectAuthLoading } from './store/slices/authSlice';
import Login from './pages/Login';
import Register from './pages/Register';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AgentDashboard from './pages/AgentDashboard';
import CustomerDashboard from './pages/CustomerDashboard';
import { useSocket } from './context/SocketContext';

// Helper component for private routing based on authentication
const ProtectedRoute = ({ user, loading, children }) => {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0f19]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};


function App() {
  const dispatch = useDispatch();
  const reduxUser = useSelector(selectUser);
  const reduxLoading = useSelector(selectAuthLoading);

  const [user, setLocalUser] = useState(null);
  const [loading, setLocalLoading] = useState(true);
  const { registerUser, isConnected } = useSocket();

  // Helper to sync both local and Redux auth state
  const updateAuthUser = (userData) => {
    setLocalUser(userData);
    dispatch(setUser(userData));
  };

  // Check auth state on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          updateAuthUser(data.user);
          // Register the user on the socket server
          registerUser(data.user.id, data.user.role);
        } else {
          updateAuthUser(null);
        }
      } catch (err) {
        console.error('Auth verification error:', err);
        updateAuthUser(null);
      } finally {
        setLocalLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Sync user with socket when user changes or socket is connected
  useEffect(() => {
    if (user && isConnected) {
      registerUser(user.id, user.role);
    }
  }, [user, isConnected]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setLocalUser(null);
      dispatch(logoutUser());
    } catch (err) {
      console.error('Logout error:', err);
    }
  };


  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLoginSuccess={(userData) => updateAuthUser(userData)} />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />

        {/* Main Dashboard Route Auto-Dispatched by User Role */}
        <Route path="/" element={
          <ProtectedRoute user={user} loading={loading}>
            {user?.role === 'Super Admin' && <SuperAdminDashboard user={user} onLogout={handleLogout} />}
            {user?.role === 'Admin' && <AdminDashboard user={user} onLogout={handleLogout} />}
            {user?.role === 'Agent' && <AgentDashboard user={user} onLogout={handleLogout} />}
            {user?.role === 'Customer' && <CustomerDashboard user={user} onLogout={handleLogout} />}
          </ProtectedRoute>
        }
        />

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
