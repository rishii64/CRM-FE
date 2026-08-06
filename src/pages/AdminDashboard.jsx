import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Video, AlertTriangle, FileText, Activity, Power, ArrowRightLeft, CheckCircle, PhoneCall
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('agents');
  const { socket, isConnected } = useSocket();

  // State collections
  const [agents, setAgents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [waitingQueue, setWaitingQueue] = useState([]);
  const [departments, setDepartments] = useState([]);

  // Modals & form state
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [agentForm, setAgentForm] = useState({ userId: '', name: '', password: '', phone: '', departmentId: '' });

  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [targetAgentId, setTargetAgentId] = useState('');

  const [showAssignQueueModal, setShowAssignQueueModal] = useState(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState(null);

  // Barge-In Call State
  const [bargeInCall, setBargeInCall] = useState(null);
  const [bargeInMicMuted, setBargeInMicMuted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Total Live Activity Counter
  const totalLiveActivityCount = activeCalls.length + waitingQueue.length;

  // Fetch initial datasets
  const fetchData = async () => {
    setLoading(true);
    try {
      const [agRes, custRes, callRes, escRes, logRes, deptRes, callLogRes, queueRes] = await Promise.all([
        fetch('/api/admin/agents'),
        fetch('/api/admin/customers'),
        fetch('/api/calls/active'),
        fetch('/api/admin/escalations'),
        fetch('/api/admin/audit-logs'),
        fetch('/api/departments'),
        fetch('/api/admin/call-logs'),
        fetch('/api/queue/active'),
      ]);

      if (agRes.ok) setAgents(await agRes.json());
      if (custRes.ok) setCustomers(await custRes.json());
      if (callRes.ok) setActiveCalls(await callRes.json());
      if (escRes.ok) setEscalations(await escRes.json());
      if (logRes.ok) setAuditLogs(await logRes.json());
      if (callLogRes.ok) setCallLogs(await callLogRes.json());
      if (queueRes.ok) setWaitingQueue(await queueRes.json());
      if (deptRes.ok) {
        const depts = await deptRes.json();
        setDepartments(depts);
        if (depts.length > 0 && !agentForm.departmentId) {
          setAgentForm((prev) => ({ ...prev, departmentId: depts[0].id }));
        }
      }
    } catch (err) {
      console.error('Error loading Admin dashboard datasets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen to Socket.IO events for real-time queue & call updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.on('queue-updated', () => {
      fetchData();
    });

    socket.on('call-initiated', () => fetchData());
    socket.on('call-started', () => fetchData());
    socket.on('call-ended', () => fetchData());

    return () => {
      socket.off('queue-updated');
      socket.off('call-initiated');
      socket.off('call-started');
      socket.off('call-ended');
    };
  }, [socket, isConnected]);

  // Handle Create Agent
  const handleCreateAgent = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentForm),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`Agent '${data.agent.agentCode}' created successfully.`);
        setShowCreateAgentModal(false);
        setAgentForm({ userId: '', name: '', password: '', phone: '', departmentId: departments[0]?.id || '' });
        fetchData();
      } else {
        alert(data.message || 'Error creating agent');
      }
    } catch (err) {
      console.error('Create agent error:', err);
    }
  };

  // Toggle Agent Active / Inactive
  const handleToggleAgent = async (agentId) => {
    try {
      const res = await fetch(`/api/admin/agents/${agentId}/toggle-status`, { method: 'PUT' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error toggling agent status:', err);
    }
  };

  // Reassign Customer to Agent
  const handleReassignCustomer = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !targetAgentId) return;

    try {
      const res = await fetch(`/api/admin/customers/${selectedCustomer.id}/reassign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newAgentId: targetAgentId }),
      });

      if (res.ok) {
        setMessage(`Customer '${selectedCustomer.name}' reassigned successfully.`);
        setShowReassignModal(false);
        setSelectedCustomer(null);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to reassign customer');
      }
    } catch (err) {
      console.error('Reassign error:', err);
    }
  };

  // Handle Assign & Connect Call from Waiting Queue
  const handleAssignQueueCall = async (e) => {
    e.preventDefault();
    if (!selectedQueueItem || !targetAgentId) return;

    try {
      const res = await fetch('/api/queue/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId: selectedQueueItem.id, agentId: targetAgentId }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`Call assigned & connected! Customer '${selectedQueueItem.customerName}' has been dispatched.`);
        setShowAssignQueueModal(false);
        setSelectedQueueItem(null);
        fetchData();
      } else {
        alert(data.message || 'Failed to assign and connect call');
      }
    } catch (err) {
      console.error('Error assigning queue call:', err);
    }
  };

  // Handle Call Barge-In by Admin
  const handleBargeInCall = (call) => {
    if (!call || !socket) return;
    setBargeInCall(call);
    socket.emit('join-room', { roomId: call.roomId });
    socket.emit('admin-join-observe', { roomId: call.roomId });
    setMessage(`Barged into live call session room '${call.roomId}' as Admin.`);
  };

  const handleExitBargeIn = () => {
    if (bargeInCall && socket) {
      socket.emit('leave-room', { roomId: bargeInCall.roomId });
    }
    setBargeInCall(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-700 font-extrabold rounded-xl flex items-center justify-center text-lg">
            AD
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Zentelex <span className="text-blue-700 text-xs py-0.5 px-2 bg-blue-50 rounded-full font-bold border border-blue-200">Operations Admin</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Admin: {user.name} ({user.userId})</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Calls & Queue Notification Counter Badge */}
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold text-red-700 shadow-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${totalLiveActivityCount > 0 ? 'bg-red-400' : 'bg-slate-300'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${totalLiveActivityCount > 0 ? 'bg-red-600' : 'bg-slate-400'}`}></span>
            </span>
            <span>Live Calls: <span className="font-extrabold text-red-800 font-mono">{activeCalls.length}</span> | Queue: <span className="font-extrabold text-amber-800 font-mono">{waitingQueue.length}</span></span>
          </div>

          <button
            onClick={onLogout}
            className="p-2.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl text-slate-600 hover:text-red-700 transition cursor-pointer"
            title="Log Out"
          >
            <Power size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {message && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex justify-between items-center shadow-xs">
            <span>{message}</span>
            <button onClick={() => setMessage('')} className="text-emerald-700 font-bold hover:underline">Dismiss</button>
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl font-bold">
              <Users size={22} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Managed Agents</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-0.5">{agents.length}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl font-bold">
              <UserPlus size={22} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Registered Customers</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-0.5">{customers.length}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3.5 bg-red-50 text-red-600 rounded-xl font-bold">
              <Video size={22} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Live Calls</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-3xl font-extrabold text-slate-900">{activeCalls.length}</p>
                {waitingQueue.length > 0 && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    +{waitingQueue.length} Waiting
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl font-bold">
              <AlertTriangle size={22} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Escalation Reports</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-0.5">{escalations.filter(e => e.status === 'Open').length} Open</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 space-x-6">
          <button
            onClick={() => setActiveTab('agents')}
            className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'agents' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users size={16} />
            <span>Manage Agents ({agents.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'customers' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <UserPlus size={16} />
            <span>Manage Customers & Reassignment ({customers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('monitoring')}
            className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer relative ${
              activeTab === 'monitoring' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Activity size={16} />
            <span>Live Calls ({activeCalls.length})</span>
            {totalLiveActivityCount > 0 && (
              <span className="px-2 py-0.5 bg-red-600 text-white rounded-full text-[10px] font-extrabold animate-pulse shadow-xs ml-1">
                {totalLiveActivityCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('escalations')}
            className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'escalations' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <AlertTriangle size={16} />
            <span>Escalations ({escalations.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'audit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText size={16} />
            <span>Audit Logs ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('callLogs')}
            className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
              activeTab === 'callLogs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <PhoneCall size={16} />
            <span>Call History ({callLogs.length})</span>
          </button>
        </div>

        {/* Tab 1: Manage Agents */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900">Agent Directory & Management</h2>
                <p className="text-xs text-slate-500">Create new agents and manage activation status</p>
              </div>
              <button
                onClick={() => setShowCreateAgentModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <UserPlus size={16} />
                <span>Create New Agent</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Agent Code</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Department</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Availability</th>
                    <th className="p-4">Account Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 font-mono font-bold text-blue-700">{agent.agentCode}</td>
                      <td className="p-4 font-semibold text-slate-900">{agent.name}</td>
                      <td className="p-4 text-slate-600 font-medium">{agent.department}</td>
                      <td className="p-4 text-slate-600 font-mono">{agent.phone || 'N/A'}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                          agent.availabilityStatus === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          agent.availabilityStatus === 'Busy' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {agent.availabilityStatus}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                          agent.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleToggleAgent(agent.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            agent.status === 'Active'
                              ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {agent.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Manage Customers & Reassignment */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Customer Directory & Reassignment</h2>
              <p className="text-xs text-slate-500">View permanent Customer-Agent mappings and reassign agents</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Customer User ID</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Phone Number</th>
                    <th className="p-4">Assigned Agent Code</th>
                    <th className="p-4">Assigned Agent Name</th>
                    <th className="p-4 text-right">Reassign Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 font-mono font-bold text-amber-700">{cust.userId}</td>
                      <td className="p-4 font-semibold text-slate-900">{cust.name}</td>
                      <td className="p-4 text-slate-600 font-mono">{cust.phone || 'N/A'}</td>
                      <td className="p-4 font-mono font-bold text-blue-700">{cust.assignedAgentCode || 'Unassigned'}</td>
                      <td className="p-4 font-medium text-slate-900">{cust.assignedAgentName}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedCustomer(cust);
                            setTargetAgentId(cust.assignedAgentId || (agents[0] ? agents[0].id : ''));
                            setShowReassignModal(true);
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 ml-auto cursor-pointer shadow-xs"
                        >
                          <ArrowRightLeft size={13} />
                          <span>Reassign Agent</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Live Calls & Waiting Queue Monitoring */}
        {activeTab === 'monitoring' && (
          <div className="space-y-6">
            {/* Waiting Queue Dispatch Panel */}
            <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center font-bold">
                    <Activity size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Live Waiting Call Queue ({waitingQueue.length})
                    </h3>
                    <p className="text-xs text-slate-500">Customers waiting for support call dispatch & agent connection</p>
                  </div>
                </div>
                {waitingQueue.length > 0 && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-xs font-extrabold animate-pulse">
                    {waitingQueue.length} Customer(s) Waiting
                  </span>
                )}
              </div>

              {waitingQueue.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  No customers currently waiting in the call queue.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {waitingQueue.map((item) => (
                    <div key={item.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 shadow-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-mono text-amber-700 font-bold uppercase">Customer Code: {item.customerCode}</span>
                          <h4 className="text-sm font-extrabold text-slate-900">{item.customerName}</h4>
                          <p className="text-xs text-slate-500 font-mono">Phone: {item.phone || 'N/A'} • {item.departmentName}</p>
                        </div>
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-extrabold uppercase">
                          Waiting
                        </span>
                      </div>

                      {item.notes && (
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs text-slate-700">
                          <span className="font-bold text-slate-800 block">Wait Request Note:</span>
                          "{item.notes}"
                        </div>
                      )}

                      {/* Primary Assigned Agent Status */}
                      <div className="flex justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Assigned Agent</span>
                          <span className="font-bold text-slate-900">
                            {item.assignedAgent ? `${item.assignedAgent.name} (${item.assignedAgent.agentCode})` : 'Unassigned'}
                          </span>
                        </div>
                        {item.assignedAgent && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            item.assignedAgent.availabilityStatus === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            item.assignedAgent.availabilityStatus === 'Busy' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {item.assignedAgent.availabilityStatus}
                          </span>
                        )}
                      </div>

                      {/* Assign & Connect Button */}
                      <button
                        onClick={() => {
                          setSelectedQueueItem(item);
                          const defaultAgent = (item.assignedAgent && item.assignedAgent.availabilityStatus === 'Available')
                            ? item.assignedAgent.id
                            : (agents.find(a => a.availabilityStatus === 'Available')?.id || (agents[0] ? agents[0].id : ''));
                          setTargetAgentId(defaultAgent);
                          setShowAssignQueueModal(true);
                        }}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs active:scale-98"
                      >
                        <ArrowRightLeft size={14} />
                        <span>Assign Agent & Connect Call</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Live Video Sessions */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Active Live Video Sessions</h3>
                <p className="text-xs text-slate-500">Video support calls currently in progress</p>
              </div>

              {activeCalls.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeCalls.map((call) => (
                    <div key={call.id} className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs space-y-3">
                      <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                        <div>
                          <span className="text-[10px] font-mono text-blue-700 uppercase font-bold">Room: {call.roomId}</span>
                          <h4 className="text-sm font-bold text-slate-900 mt-0.5">{call.department} Call Session</h4>
                        </div>
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold uppercase animate-pulse">
                          Live Active
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium uppercase block">Agent</span>
                          <span className="font-bold text-emerald-700">{call.agent ? call.agent.name : 'Unknown Agent'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium uppercase block">Customer</span>
                          <span className="font-bold text-blue-700">{call.customer ? call.customer.name : 'Unknown Customer'}</span>
                        </div>
                      </div>

                      {/* Call Barge-In Button */}
                      <button
                        onClick={() => handleBargeInCall(call)}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-red-200 active:scale-98"
                      >
                        <Video size={14} />
                        <span>Barge-In Live Call</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <Video size={40} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-slate-800 text-sm">No Live Calls Active</p>
                  <p className="text-xs text-slate-500 mt-0.5">Active video sessions will display here in real time.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Escalation Reports */}
        {activeTab === 'escalations' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Agent Escalation Reports</h2>
              <p className="text-xs text-slate-500">Inconveniences and serving issues reported by agents</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-4">Agent</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Issue Type</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Update Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {escalations.map((esc) => (
                    <tr key={esc.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 font-bold text-emerald-700">{esc.agentName} ({esc.agentCode})</td>
                      <td className="p-4 font-bold text-amber-700">{esc.customerName}</td>
                      <td className="p-4 font-bold text-slate-900">{esc.issueType}</td>
                      <td className="p-4 text-slate-600 max-w-xs truncate" title={esc.description}>{esc.description}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          esc.status === 'Open' ? 'bg-red-50 text-red-700 border-red-200' :
                          esc.status === 'In Progress' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {esc.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <select
                          value={esc.status}
                          onChange={(e) => handleUpdateEscalation(esc.id, e.target.value)}
                          className="bg-white text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 font-medium"
                        >
                          <option value="Open">Open</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: Audit Logs */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">System Audit Logs</h2>
              <p className="text-xs text-slate-500">Enterprise security and action audit record</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden max-h-[450px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-4">Timestamp</th>
                    <th className="p-4">User</th>
                    <th className="p-4">Action Description</th>
                    <th className="p-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 text-slate-500 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="p-4 font-bold text-blue-700">{log.performedBy}</td>
                      <td className="p-4 text-slate-800">{log.action}</td>
                      <td className="p-4 text-slate-500 font-mono">{log.ipAddress || '::1'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 6: Call History with Date & Time */}
        {activeTab === 'callLogs' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Call Log History</h2>
              <p className="text-xs text-slate-500">Historical call session records with exact Date & Time</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-4">Date & Time</th>
                    <th className="p-4">Room ID</th>
                    <th className="p-4">Agent</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Department</th>
                    <th className="p-4">Duration</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Disconnect Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {callLogs.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400 font-medium">No historical call records found.</td>
                    </tr>
                  ) : (
                    callLogs.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition">
                        <td className="p-4 font-mono font-semibold text-slate-900 text-xs">
                          <div>{c.date}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{c.time}</div>
                        </td>
                        <td className="p-4 font-mono font-bold text-blue-700">{c.roomId}</td>
                        <td className="p-4 font-bold text-emerald-700">{c.agentName}</td>
                        <td className="p-4 font-bold text-amber-700">{c.customerName}</td>
                        <td className="p-4 font-medium text-slate-600">{c.department}</td>
                        <td className="p-4 font-mono font-bold text-slate-800">{c.duration}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                            c.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            c.status === 'Connected' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            c.status === 'Initiated' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 text-xs font-medium">{c.disconnectReason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Create Agent */}
      {showCreateAgentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold">Create New Agent Account</h3>
              <button onClick={() => setShowCreateAgentModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Agent User ID / Code (e.g. AGT-1003)</label>
                <input
                  type="text"
                  required
                  value={agentForm.userId}
                  onChange={(e) => setAgentForm({ ...agentForm, userId: e.target.value })}
                  placeholder="AGT-1003"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Agent Full Name</label>
                <input
                  type="text"
                  required
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  placeholder="Sarah Agent"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <select
                  value={agentForm.departmentId}
                  onChange={(e) => setAgentForm({ ...agentForm, departmentId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-medium"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={agentForm.password}
                  onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  value={agentForm.phone}
                  onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
                  placeholder="+15550000"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition mt-2 cursor-pointer shadow-xs"
              >
                Create Agent Account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reassign Customer */}
      {showReassignModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4 text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold">Reassign Customer Agent</h3>
              <button onClick={() => setShowReassignModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-600">
              Reassign customer <span className="text-amber-700 font-bold">{selectedCustomer.name}</span> ({selectedCustomer.userId}) to a new primary support Agent.
            </p>

            <form onSubmit={handleReassignCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Target Agent</label>
                <select
                  value={targetAgentId}
                  onChange={(e) => setTargetAgentId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-medium"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.agentCode}) - {a.department} [{a.availabilityStatus}]
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs"
              >
                Confirm Reassignment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign Agent & Connect Call from Waiting Queue */}
      {showAssignQueueModal && selectedQueueItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white p-6 rounded-3xl border border-emerald-200 shadow-2xl space-y-4 text-slate-900 animate-scale">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
                  <ArrowRightLeft size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Assign Agent & Connect Call
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Bridge call for waiting customer</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAssignQueueModal(false)} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1">
              <p className="text-slate-900 font-extrabold text-sm">{selectedQueueItem.customerName}</p>
              <p className="text-slate-600 font-mono">User ID: <span className="font-bold text-amber-700">{selectedQueueItem.customerCode}</span> • {selectedQueueItem.departmentName}</p>
              <p className="text-slate-600 font-mono">Phone: {selectedQueueItem.phone || 'N/A'}</p>
              {selectedQueueItem.assignedAgent && (
                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Assigned Agent:</span>
                  <span className="font-bold text-slate-800">
                    {selectedQueueItem.assignedAgent.name} ({selectedQueueItem.assignedAgent.agentCode})
                  </span>
                </div>
              )}
            </div>

            <form onSubmit={handleAssignQueueCall} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Select Agent to Connect</label>
                <select
                  value={targetAgentId}
                  onChange={(e) => setTargetAgentId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.agentCode}) - {a.department} [{a.availabilityStatus}]
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-200 active:scale-98"
              >
                <Video size={16} />
                <span>Connect & Dispatch Call Now</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Admin Live Call Barge-In Workspace */}
      {bargeInCall && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white p-6 rounded-3xl border-2 border-red-400 shadow-2xl space-y-4 text-slate-900 animate-scale">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center font-bold animate-pulse">
                  <Video size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-slate-900">Admin Call Barge-In Workspace</h3>
                    <span className="px-2.5 py-0.5 bg-red-100 text-red-800 border border-red-300 rounded-full text-[10px] font-extrabold uppercase animate-pulse">
                      LIVE BARGE-IN ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono font-semibold mt-0.5">
                    Room ID: <span className="text-blue-700">{bargeInCall.roomId}</span> • {bargeInCall.department}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleExitBargeIn} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Call Participants Context */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Active Agent</span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  {bargeInCall.agent ? bargeInCall.agent.name : 'Support Agent'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Active Customer</span>
                <span className="font-extrabold text-blue-700 text-sm">
                  {bargeInCall.customer ? bargeInCall.customer.name : 'Customer'}
                </span>
              </div>
            </div>

            {/* Live Stream Viewfinder / Video Canvas placeholder */}
            <div className="relative bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden h-64 flex items-center justify-center shadow-inner">
              <div className="text-center space-y-2 p-6">
                <Video size={48} className="mx-auto text-red-500 animate-pulse" />
                <p className="text-sm font-extrabold text-white">Admin Barged into Live Session</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  You are observing and participating in this support session live in real time without prior notice.
                </p>
              </div>
              <span className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                ● BARGE-IN MONITORING
              </span>
            </div>

            {/* Action Controls */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setBargeInMicMuted(!bargeInMicMuted)}
                className={`flex-1 py-3 border rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  bargeInMicMuted 
                    ? 'bg-amber-50 border-amber-200 text-amber-800' 
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{bargeInMicMuted ? 'Unmute Admin Mic' : 'Mute Admin Mic'}</span>
              </button>

              <button
                onClick={async () => {
                  if (window.confirm('Are you sure you want to forcefully disconnect this live call?')) {
                    await fetch(`/api/calls/${bargeInCall.id}/end`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ disconnectReason: 'Admin terminated call during barge-in' }),
                    });
                    handleExitBargeIn();
                    fetchData();
                  }
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm active:scale-98"
              >
                Force Disconnect Call
              </button>

              <button
                onClick={handleExitBargeIn}
                className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm"
              >
                Exit Barge-In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
