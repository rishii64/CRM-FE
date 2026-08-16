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

      <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-slate-200 shadow-xl relative z-10 space-y-6">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-3 font-bold">
            <LogIn size={26} />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome Back
          </h2>
          <p className="text-slate-500 mt-1.5 text-xs font-medium">Sign in with your User ID or Phone Number</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs font-semibold shadow-xs">
            <ShieldAlert className="shrink-0 mt-0.5 text-red-600" size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              User ID or Phone Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <User size={18} />
              </span>
              <input 
                type="text" 
                required 
                value={identifier} 
                onChange={(e) => setIdentifier(e.target.value)} 
                placeholder="SUPERADMIN_01 / AGT-1001 / Phone"
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Lock size={18} />
              </span>
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 rounded-xl glass-input text-xs font-medium"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition cursor-pointer"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-blue-200 active:scale-98 disabled:opacity-50 text-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {loading ? 'Signing in...' : 'Sign In to Account'}
          </button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-slate-500 font-medium">
            Customer without an account?{' '}
            <Link to="/register" className="text-blue-600 font-bold hover:underline">
              Register here
            </Link>
          </p>
        </div>

        {/* Quick Testing Roles Grid */}
        <div className="pt-5 border-t border-slate-100">
          <p className="text-[11px] text-center font-bold text-slate-400 uppercase tracking-wider mb-3">
            Quick Testing Demo Accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={(e) => fillAndLogin(e, 'SUPERADMIN_01', 'admin123')}
              className="p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-xs text-purple-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs"
            >
              <span className="font-bold">Super Admin</span>
              <span className="text-[10px] text-purple-600 font-mono">SUPERADMIN_01</span>
            </button>
            <button 
              onClick={(e) => fillAndLogin(e, 'ADMIN_01', 'admin123')}
              className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs text-blue-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs"
            >
              <span className="font-bold">Admin</span>
              <span className="text-[10px] text-blue-600 font-mono">ADMIN_01</span>
            </button>
            <button 
              onClick={(e) => fillAndLogin(e, 'AGT-1001', 'agent1')}
              className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs text-emerald-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs"
            >
              <span className="font-bold">Agent (Tech)</span>
              <span className="text-[10px] text-emerald-600 font-mono">AGT-1001</span>
            </button>
            <button 
              onClick={(e) => fillAndLogin(e, '+1234567890', 'customer1')}
              className="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs text-amber-900 transition text-left flex flex-col justify-between cursor-pointer shadow-xs"
            >
              <span className="font-bold">Customer 1</span>
              <span className="text-[10px] text-amber-600 font-mono">+1234567890</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
