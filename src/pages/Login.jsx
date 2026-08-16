import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, User, Lock, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { getApiUrl, authFetch } from '../config/api';

function Login({ onLoginSuccess }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e, customIdentifier = null, customPass = null) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    const loginId = customIdentifier || identifier;
    const loginPass = customPass || password;

    try {
      const res = await authFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginId, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      onLoginSuccess(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillAndLogin = (e, idVal, passVal) => {
    setIdentifier(idVal);
    setPassword(passVal);
    handleLogin(e, idVal, passVal);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Soft background accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-100/40 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-white p-5 sm:p-8 rounded-3xl border border-slate-200 shadow-xl relative z-10 space-y-5 sm:space-y-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-3 font-bold">
            <LogIn size={26} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome Back
          </h2>
          <p className="text-xs text-slate-500 mt-1">Sign in with your User ID or Phone Number</p>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-medium flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              User ID or Phone Number
            </label>
            <div className="relative">
              <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                required 
                value={identifier} 
                onChange={(e) => setIdentifier(e.target.value)} 
                placeholder="e.g. AGT-1001 or +1234567890"
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Enter password"
                className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-xs sm:text-sm transition cursor-pointer shadow-md shadow-blue-200 disabled:opacity-50 active:scale-98"
          >
            {loading ? 'Signing in...' : 'Sign In to Account'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500">
          Customer without an account?{' '}
          <Link to="/register" className="font-bold text-blue-600 hover:underline">
            Register here
          </Link>
        </div>

        {/* Demo Quick Logins */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2.5">
            Quick Testing Demo Accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={(e) => fillAndLogin(e, 'SUPERADMIN_01', 'admin123')}
              className="p-2.5 sm:p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-xs text-purple-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs min-w-0"
            >
              <span className="font-bold truncate">Super Admin</span>
              <span className="text-[10px] text-purple-600 font-mono truncate">SUPERADMIN_01</span>
            </button>
            <button 
              onClick={(e) => fillAndLogin(e, 'ADMIN_01', 'admin123')}
              className="p-2.5 sm:p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs text-blue-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs min-w-0"
            >
              <span className="font-bold truncate">Admin</span>
              <span className="text-[10px] text-blue-600 font-mono truncate">ADMIN_01</span>
            </button>
            <button 
              onClick={(e) => fillAndLogin(e, 'AGT-1001', 'agent1')}
              className="p-2.5 sm:p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs text-emerald-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs min-w-0"
            >
              <span className="font-bold truncate">Agent (Tech)</span>
              <span className="text-[10px] text-emerald-600 font-mono truncate">AGT-1001</span>
            </button>
            <button 
              onClick={(e) => fillAndLogin(e, '+1234567890', 'customer1')}
              className="p-2.5 sm:p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs text-amber-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs min-w-0"
            >
              <span className="font-bold truncate">Customer 1</span>
              <span className="text-[10px] text-amber-600 font-mono truncate">+1234567890</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
