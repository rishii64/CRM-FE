import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, User, Lock, Phone, CheckCircle2, ShieldAlert, Key, Eye, EyeOff } from 'lucide-react';

function Register() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [agentValidation, setAgentValidation] = useState({ checked: false, valid: false, message: '', agentName: '', dept: '' });
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Validate Agent ID live as user types or blurs
  const handleValidateAgent = async (code) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setAgentValidation({ checked: false, valid: false, message: '', agentName: '', dept: '' });
      return;
    }

    setValidating(true);
    try {
      const res = await fetch(`/api/auth/validate-agent/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setAgentValidation({
          checked: true,
          valid: true,
          message: `Validated: ${data.agentName} (${data.departmentName})`,
          agentName: data.agentName,
          dept: data.departmentName,
        });
      } else {
        setAgentValidation({
          checked: true,
          valid: false,
          message: data.message || 'Invalid Agent ID',
          agentName: '',
          dept: '',
        });
      }
    } catch (err) {
      setAgentValidation({ checked: true, valid: false, message: 'Could not validate Agent ID', agentName: '', dept: '' });
    } finally {
      setValidating(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (agentId.trim() && !agentValidation.valid) {
      setError('Please provide a valid Agent ID or clear the field.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name,
        phone,
        password,
        agentId: agentId.trim() || undefined,
      };

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Soft background accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-100/40 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-slate-200 shadow-xl relative z-10 space-y-5">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-3 font-bold">
            <UserPlus size={26} />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Customer Registration
          </h2>
          <p className="text-slate-500 mt-1 text-xs font-medium">Create your account with optional Agent ID mapping</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs font-semibold shadow-xs">
            <ShieldAlert className="shrink-0 mt-0.5 text-red-600" size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800 text-xs font-semibold shadow-xs">
            <CheckCircle2 className="shrink-0 mt-0.5 text-emerald-600" size={18} />
            <span>Registration successful! Redirecting to login...</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <User size={18} />
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Phone Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Phone size={18} />
              </span>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 010-0101"
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs font-medium font-mono"
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

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Agent ID (Optional - e.g. AGT-1001)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                <Key size={18} />
              </span>
              <input
                type="text"
                value={agentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  handleValidateAgent(e.target.value);
                }}
                onBlur={() => handleValidateAgent(agentId)}
                placeholder="AGT-1001"
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-xs font-mono"
              />
            </div>

            {validating && (
              <p className="text-[11px] text-blue-600 font-semibold mt-1">Validating Agent ID...</p>
            )}

            {agentValidation.checked && !validating && (
              <div className={`mt-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                agentValidation.valid ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {agentValidation.valid ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
                <span>{agentValidation.message}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-md shadow-blue-200 active:scale-98 disabled:opacity-50 text-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {loading ? 'Creating Account...' : 'Complete Self-Registration'}
          </button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-slate-500 font-medium">
            Already registered?{' '}
            <Link to="/login" className="text-blue-600 font-bold hover:underline">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
