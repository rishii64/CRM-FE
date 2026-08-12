import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { 
  Users, Shield, UserPlus, Power, Folder, Download, Activity, Check, X, ShieldAlert
} from 'lucide-react';

function SuperAdminDashboard({ user, onLogout }) {
  const { socket, isConnected } = useSocket();

  const [admins, setAdmins] = useState([]);
  const [agents, setAgents] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);
  const [adminForm, setAdminForm] = useState({ userId: '', name: '', password: '', phone: '', email: '' });
  const [message, setMessage] = useState('');

  // Target Device Data Repository Modal state
  const [adminDeviceDataModalOpen, setAdminDeviceDataModalOpen] = useState(false);
  const [adminSelectedCall, setAdminSelectedCall] = useState(null);
  const [adminDeviceData, setAdminDeviceData] = useState(null);
  const [adminLoadingDeviceData, setAdminLoadingDeviceData] = useState(false);

  const fetchData = async () => {
    try {
      const [admRes, agRes, callRes, logRes] = await Promise.all([
        fetch('/api/super-admin/admins'),
        fetch('/api/admin/agents'),
        fetch('/api/calls/active'),
        fetch('/api/calls/logs'),
      ]);

      if (admRes.ok) setAdmins(await admRes.json());
      if (agRes.ok) setAgents(await agRes.json());
      if (callRes.ok) setActiveCalls(await callRes.json());
      if (logRes.ok) setCallLogs(await logRes.json());
    } catch (err) {
      console.error('Error fetching Super Admin data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.on('call-initiated', () => fetchData());
    socket.on('call-started', () => fetchData());
    socket.on('call-ended', (data) => {
      if (data && (data.callId || data.roomId)) {
        setActiveCalls((prev) => prev.filter((c) => c.id !== data.callId && c.roomId !== data.roomId && c.id !== Number(data.callId)));
      }
      fetchData();
    });

    return () => {
      socket.off('call-initiated');
      socket.off('call-started');
      socket.off('call-ended');
    };
  }, [socket, isConnected]);

  // Handle Create Admin
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/super-admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminForm),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`Admin '${data.admin.userId}' created successfully.`);
        setShowCreateAdminModal(false);
        setAdminForm({ userId: '', name: '', password: '', phone: '', email: '' });
        fetchData();
      } else {
        alert(data.message || 'Error creating admin');
      }
    } catch (err) {
      console.error('Create admin error:', err);
    }
  };

  // Toggle Admin Status
  const handleToggleAdminStatus = async (adminId) => {
    try {
      const res = await fetch(`/api/super-admin/admins/${adminId}/toggle-status`, { method: 'PUT' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error toggling admin status:', err);
    }
  };

  // Open Target Device Data Modal
  const handleOpenAdminDeviceData = async (call) => {
    try {
      const res = await fetch(`/api/calls/${call.id}/device-data`);
      const data = await res.json();

      if (!res.ok || !data.permissions?.granted || !data.deviceData) {
        alert('Access Denied: Customer has not granted target device permissions.');
        return;
      }

      setAdminSelectedCall(call);
      setAdminDeviceData(data.deviceData);
      setAdminDeviceDataModalOpen(true);
    } catch (err) {
      console.error('Error fetching admin device data:', err);
      alert('Access Denied: Customer has not granted target device permissions.');
    }
  };

  const handleDownloadAsset = (url, title) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = title || 'Customer_Asset';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`Downloading customer asset: ${title}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 text-purple-700 font-extrabold rounded-xl flex items-center justify-center text-lg">
            SA
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              ZenSupportX <span className="text-purple-700 text-xs py-0.5 px-2 bg-purple-50 rounded-full font-bold border border-purple-200">Root Super Admin</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Root User: {user.name} ({user.userId})</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onLogout}
            className="p-2.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl text-slate-600 hover:text-red-700 transition cursor-pointer"
            title="Log Out"
          >
            <Power size={18} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {message && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex justify-between items-center shadow-xs">
            <span>{message}</span>
            <button onClick={() => setMessage('')} className="text-emerald-700 font-bold hover:underline">Dismiss</button>
          </div>
        )}

        {/* System Overview Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl font-bold">
              <Shield size={24} />
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">System Admins</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-0.5">{admins.length}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl font-bold">
              <Users size={24} />
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Active Agents</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-0.5">{agents.length}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl font-bold">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Live Active Calls</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-0.5">{activeCalls.length}</p>
            </div>
          </div>
        </div>

        {/* Section 1: Admin Management */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Shield className="text-purple-600" size={20} />
                Admin Account Management
              </h2>
              <p className="text-xs text-slate-500">Root Super Admin exclusive control for creating and managing Admin credentials</p>
            </div>
            <button
              onClick={() => setShowCreateAdminModal(true)}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <UserPlus size={16} />
              <span>Create New Admin</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-4">Admin User ID</th>
                  <th className="p-4">Name</th>
                  <th className="p-4">Phone Number</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((adm) => (
                  <tr key={adm.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 font-mono font-bold text-purple-700">{adm.user_id}</td>
                    <td className="p-4 font-semibold text-slate-900">{adm.name}</td>
                    <td className="p-4 text-slate-600 font-mono">{adm.phone || 'N/A'}</td>
                    <td className="p-4 text-slate-600">{adm.email || 'N/A'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                        adm.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {adm.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleToggleAdminStatus(adm.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          adm.status === 'Active'
                            ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {adm.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Target Device Repository Inspection */}
        {activeCalls.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Folder className="text-blue-600" size={20} />
              Target Device Data Repository (Full Access & Download)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeCalls.map((call) => (
                <div key={call.id} className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Call: {call.department}</h4>
                      <p className="text-xs text-slate-500">Customer: <span className="text-blue-600 font-bold">{call.customer?.name}</span></p>
                    </div>
                    <button
                      onClick={() => handleOpenAdminDeviceData(call)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Folder size={14} />
                      <span>Inspect & Download</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modal: Create Admin */}
      {showCreateAdminModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create New Admin Account</h3>
              <button onClick={() => setShowCreateAdminModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Admin User ID (e.g. ADMIN_02)</label>
                <input
                  type="text"
                  required
                  value={adminForm.userId}
                  onChange={(e) => setAdminForm({ ...adminForm, userId: e.target.value })}
                  placeholder="ADMIN_02"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Admin Name</label>
                <input
                  type="text"
                  required
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  placeholder="Operations Admin"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                  placeholder="+15550000"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition mt-2 cursor-pointer shadow-sm"
              >
                Create Admin Account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Target Device Data Repository Modal */}
      {adminDeviceDataModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl p-6 border border-slate-200 shadow-2xl relative space-y-4 text-slate-900">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2 text-slate-900">
                  <Folder size={20} className="text-blue-600" />
                  Target Device Data Repository Access
                </h3>
                <p className="text-xs text-slate-500">
                  Inspecting granted assets for client <span className="text-blue-600 font-bold">{adminSelectedCall?.customer?.name}</span>
                </p>
              </div>
              <button onClick={() => setAdminDeviceDataModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-[350px] overflow-y-auto">
              {adminDeviceData?.gallery?.map((item) => (
                <div key={item.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2">
                  <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                    <img src={item.url} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                  <button
                    onClick={() => handleDownloadAsset(item.url, item.title)}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Download File</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SuperAdminDashboard;
