import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useWebRtc } from '../context/WebRtcContext';
import {
  Video, VideoOff, Mic, MicOff, Monitor, MonitorOff, Phone, PhoneOff, Send, Paperclip,
  ArrowRightLeft, FileText, CheckCircle, ShieldAlert, Star, Power, User, Sun, Moon,
  Folder, Camera, Users, Lock, Eye, X, AlertCircle
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getApiUrl, authFetch } from '../config/api';

function AgentDashboard({ user, onLogout }) {
  const { theme, toggleTheme } = useTheme();
  const { socket, isConnected } = useSocket();
  const {
    localStream,
    remoteStream,
    activeCall,
    connectionStatus,
    setActiveCall,
    startPeerCall,
    leaveCall,
    localVideoCallbackRef,
    remoteVideoCallbackRef,
  } = useWebRtc();

  // Agent specific states
  const [availability, setAvailability] = useState(user.availabilityStatus || 'Offline');
  const [chatMessages, setChatMessages] = useState([]);
  const [typedMessage, setTypedMessage] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [availableAgentsForTransfer, setAvailableAgentsForTransfer] = useState([]);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTransferPending, setIsTransferPending] = useState(false);
  const [transferStatusMsg, setTransferStatusMsg] = useState('');
  const [incomingTransferRequest, setIncomingTransferRequest] = useState(null);

  // Target Device Access permission states
  const [devicePermissions, setDevicePermissions] = useState({
    gallery: false,
    contacts: false,
    granted: false,
  });
  const [isDeviceDataModalOpen, setIsDeviceDataModalOpen] = useState(false);
  const [deviceData, setDeviceData] = useState(null);
  const [loadingDeviceData, setLoadingDeviceData] = useState(false);
  const [activeDeviceTab, setActiveDeviceTab] = useState('gallery');
  const [agentPreviewFile, setAgentPreviewFile] = useState(null);

  // UI state for devices
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  // Hidden file upload ref
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Sync initial availability status
  useEffect(() => {
    if (user.availabilityStatus) {
      setAvailability(user.availabilityStatus);
    }
  }, [user]);

  // Handle Availability Toggle
  const handleToggleAvailability = async (newStatus) => {
    try {
      const res = await authFetch('/api/agents/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setAvailability(newStatus);
        if (newStatus === 'Offline' && activeCall) {
          leaveCall();
          alert('You have switched to Offline. The active call with the customer has been disconnected.');
        }
      }
    } catch (err) {
      console.error('Error toggling availability:', err);
    }
  };

  // Socket routing for call bridging, chat, and transfers
  useEffect(() => {
    if (!socket || !isConnected) return;

    // 1. Listen for call assignment by Super Admin
    socket.on('call-assigned', async (callData) => {
      console.log('Call assigned to agent:', callData);
      setCallNotes('');
      setChatMessages([]);
      setDevicePermissions({ gallery: false, contacts: false, granted: false });

      // Join the signaling room
      socket.emit('join-room', { roomId: callData.roomId });

      // Start the WebRTC flow
      await startPeerCall({
        callId: callData.callId,
        roomId: callData.roomId,
        partnerName: callData.partnerName,
        partnerUserId: callData.customerUserId,
        role: 'Agent',
        customerNotes: callData.customerNotes,
        customerPhone: callData.customerPhone,
      });

      // Load previous chat history (if any)
      try {
        const chatRes = await authFetch(`/api/chat/${callData.callId}`);
        if (chatRes.ok) {
          setChatMessages(await chatRes.json());
        }
      } catch (err) {
        console.error('Error loading history:', err);
      }
    });

    // 2. Listen for Chat Messages in real-time
    socket.on('receive-message', (message) => {
      setChatMessages((prev) => [...prev, message]);
    });

    // 3. Listen for Device Permissions Updated
    socket.on('device-permissions-updated', (data) => {
      console.log('Agent received device-permissions-updated:', data);
      if (data.permissions) {
        setDevicePermissions(data.permissions);
      }
    });

    // 4. Listen for Partner Disconnecting (Call End)
    socket.on('call-ended', () => {
      console.log('Call ended by client/server');
      leaveCall();
      alert('The call was ended.');
    });

    // 5. Listen for Call Transfer Requests (when target accepts/rejects)
    socket.on('transfer-rejected', ({ agentName }) => {
      setIsTransferPending(false);
      setTransferStatusMsg(`${agentName} rejected the transfer request.`);
      setTimeout(() => setTransferStatusMsg(''), 5000);
    });

    socket.on('transfer-completed', () => {
      setIsTransferPending(false);
      setIsTransferModalOpen(false);
      setTransferStatusMsg('');
      setAvailability('Available');
      leaveCall();
      // alert('Call successfully transferred. You are now available.');
    });

    // 6. Listen for incoming Transfer request invitation
    socket.on('transfer-requested', (transferData) => {
      console.log('Incoming transfer request:', transferData);
      setIncomingTransferRequest(transferData);
    });

    // 7. Listen for Force Logout (e.g. account deactivated or deleted)
    socket.on('force-logout', (data) => {
      console.log('Agent received force-logout:', data);
      alert(data?.reason || 'Your agent account was deactivated or removed by an administrator.');
      if (onLogout) onLogout();
    });

    return () => {
      socket.off('call-assigned');
      socket.off('receive-message');
      socket.off('device-permissions-updated');
      socket.off('call-ended');
      socket.off('transfer-rejected');
      socket.off('transfer-completed');
      socket.off('transfer-requested');
      socket.off('force-logout');
    };
  }, [socket, isConnected, startPeerCall, leaveCall, onLogout]);

  // Handle incoming transfer accept / reject
  const handleAcceptTransfer = async () => {
    if (!incomingTransferRequest) return;
    const { transferId, roomId } = incomingTransferRequest;
    socket.emit('join-room', { roomId });
    try {
      await authFetch(`/api/calls/transfer/${transferId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'Accepted' }),
      });
    } catch (err) {
      console.error('Error responding to transfer request:', err);
    } finally {
      setIncomingTransferRequest(null);
    }
  };

  const handleRejectTransfer = async () => {
    if (!incomingTransferRequest) return;
    const { transferId } = incomingTransferRequest;
    try {
      await authFetch(`/api/calls/transfer/${transferId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'Rejected' }),
      });
    } catch (err) {
      console.error('Error rejecting transfer request:', err);
    } finally {
      setIncomingTransferRequest(null);
    }
  };

  // Toggle Mute Audio
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Video Camera
  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOff(!videoTrack.enabled);
      }
    }
  };

  // Send Text Message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!typedMessage.trim() || !activeCall) return;

    try {
      const res = await authFetch(`/api/chat/${activeCall.callId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageType: 'Text', content: typedMessage }),
      });

      if (res.ok) {
        const msg = await res.json();
        // Append locally
        setChatMessages((prev) => [...prev, msg]);
        // Emit to socket room
        socket.emit('send-message', { roomId: activeCall.roomId, message: msg });
        setTypedMessage('');
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Open Target Device Data Modal (Read-Only for Agent)
  const handleOpenDeviceData = async () => {
    if (!activeCall) return;
    setIsDeviceDataModalOpen(true);
    setLoadingDeviceData(true);

    try {
      const res = await authFetch(`/api/calls/${activeCall.callId}/device-data`);
      if (res.ok) {
        const data = await res.json();
        setDeviceData(data.deviceData);
      }
    } catch (err) {
      console.error('Error fetching device data:', err);
    } finally {
      setLoadingDeviceData(false);
    }
  };

  // Attach & Upload file
  const handleFileUpload = async (e) => {
    if (!devicePermissions.granted) {
      alert('File sharing is locked until customer grants device access permissions.');
      return;
    }

    const file = e.target.files[0];
    if (!file || !activeCall) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Upload to storage
      const uploadRes = await authFetch(`/api/chat/${activeCall.callId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('File upload failed');
      const uploadData = await uploadRes.json();

      // 2. Save Chat Message in DB
      const saveRes = await authFetch(`/api/chat/${activeCall.callId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'File',
          content: uploadData.fileName,
          fileUrl: uploadData.fileUrl,
        }),
      });

      if (saveRes.ok) {
        const msg = await saveRes.json();
        setChatMessages((prev) => [...prev, msg]);
        socket.emit('send-message', { roomId: activeCall.roomId, message: msg });
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('File upload failed.');
    }
  };

  // Fetch online available agents for live call transfer
  const openTransferModal = async () => {
    try {
      const res = await authFetch('/api/agents/list');
      if (res.ok) {
        const list = await res.json();
        // Exclude self and list only 'Available' status agents
        const filtered = list.filter(a => a.userId !== user.id && a.availabilityStatus === 'Available');
        setAvailableAgentsForTransfer(filtered);
        setIsTransferModalOpen(true);
      }
    } catch (err) {
      console.error('Error listing transfer agents:', err);
    }
  };

  // Initiate call transfer
  const handleInitiateTransfer = async (agentId) => {
    setIsTransferPending(true);
    setTransferStatusMsg('Waiting for target agent to accept...');

    try {
      const res = await authFetch('/api/calls/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: activeCall.callId,
          targetAgentId: agentId,
        }),
      });

      if (!res.ok) throw new Error('Transfer request failed');
    } catch (err) {
      setIsTransferPending(false);
      setTransferStatusMsg(`Error: ${err.message}`);
    }
  };

  // End Call & Submit Notes
  const handleEndCall = async () => {
    if (!activeCall) return;

    try {
      const res = await authFetch(`/api/calls/${activeCall.callId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnectReason: callNotes || 'Agent completed call' }),
      });

      if (res.ok) {
        leaveCall();
        setCallNotes('');
        // alert('Call ended successfully.');
      }
    } catch (err) {
      console.error('Error ending call:', err);
    }
  };

  // Registered Customers & Outbound Call states
  const [registeredCustomers, setRegisteredCustomers] = useState([]);
  const [showCustomersModal, setShowCustomersModal] = useState(false);
  const [showOutboundCallModal, setShowOutboundCallModal] = useState(false);
  const [targetCallPhone, setTargetCallPhone] = useState('');
  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [escalationForm, setEscalationForm] = useState({ issueType: 'Customer Issue', description: '' });

  // Fetch registered customers list
  const fetchRegisteredCustomers = async () => {
    try {
      const res = await authFetch('/api/agents/customers');
      if (res.ok) setRegisteredCustomers(await res.json());
    } catch (err) {
      console.error('Error fetching registered customers:', err);
    }
  };

  // Initiate call by phone
  const handleInitiateOutboundCall = async (phoneToCall) => {
    const targetPhone = phoneToCall || targetCallPhone;
    if (!targetPhone.trim()) return;

    try {
      const res = await authFetch('/api/agents/call-by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowOutboundCallModal(false);
        setShowCustomersModal(false);

        // Join the room first
        socket.emit('join-room', { roomId: data.roomId });

        // Then start the WebRTC call - this will create and send the offer
        await startPeerCall({
          callId: data.callId,
          roomId: data.roomId,
          partnerName: data.customerName,
          partnerUserId: data.customerUserId,
          role: 'Agent',
          customerPhone: data.customerPhone,
        });
      } else {
        alert(data.message || 'Failed to initiate outbound call');
      }
    } catch (err) {
      console.error('Outbound call error:', err);
    }
  };

  // Submit Escalation Report
  const handleCreateEscalation = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/agents/escalations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: activeCall ? activeCall.partnerUserId : null,
          callId: activeCall ? activeCall.callId : null,
          issueType: escalationForm.issueType,
          description: escalationForm.description,
        }),
      });

      if (res.ok) {
        alert('Escalation report submitted to Admin successfully.');
        setShowEscalationModal(false);
        setEscalationForm({ issueType: 'Customer Issue', description: '' });
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to submit escalation');
      }
    } catch (err) {
      console.error('Escalation error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4 shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-700 font-extrabold rounded-xl flex items-center justify-center text-lg shrink-0">
            ZT
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              ZenSupportX <span className="text-emerald-700 font-bold text-xs py-0.5 px-2 bg-emerald-50 rounded-full border border-emerald-200">Agent Workspace</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Agent: {user.name} ({user.agentCode || user.userId}) • {user.department?.name || 'Technical Support'}</p>
          </div>
        </div>

        {/* Action Buttons & Status Toggles */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 w-full md:w-auto">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                fetchRegisteredCustomers();
                setShowCustomersModal(true);
              }}
              className="px-2.5 sm:px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Users size={14} className="shrink-0" />
              <span className="truncate">Customers</span>
            </button>

            <button
              onClick={() => setShowOutboundCallModal(true)}
              className="px-2.5 sm:px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Phone size={14} className="shrink-0" />
              <span className="truncate">Call Customer</span>
            </button>

            <button onClick={() => setShowEscalationModal(true)}
              className="col-span-2 sm:col-span-1 px-2.5 sm:px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <ShieldAlert size={14} className="text-amber-600 shrink-0" />
              <span className="truncate">Escalation Form</span>
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:flex-initial flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1 gap-1">
              <button onClick={() => handleToggleAvailability('Available')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${availability === 'Available'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-emerald-700'
                  }`}
              >
                <Power size={12} />
                Available
              </button>
              <button onClick={() => handleToggleAvailability('Offline')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${availability === 'Offline'
                  ? 'bg-red-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-red-700'
                  }`}
              >
                <Power size={12} />
                Offline
              </button>
            </div>

            <button onClick={onLogout} className="p-2.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl text-slate-600 hover:text-red-700 transition cursor-pointer shrink-0" title="Log Out" >
              <Power size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid split */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left Side Call/Streaming panel */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          {!activeCall ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <Video className="text-slate-300 mb-3 animate-pulse" size={60} />
              <h3 className="text-xl font-bold text-slate-900 mb-1">Awaiting Support Calls</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Set your status to <span className="text-emerald-600 font-bold">Available</span> above.
                Calls from assigned customers or manual bridges will connect here.
              </p>

              {availability === 'Offline' && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert size={16} className="text-red-600" />
                  <span>You are currently OFFLINE and cannot receive matched calls.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4">

              {/* WebRTC Call Viewport */}
              {(() => {
                const hasLiveRemoteVideo = remoteStream && remoteStream.getVideoTracks().some(t => t.readyState === 'live' && !t.muted);
                return (
                  <div className="relative flex-1 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[340px] flex items-center justify-center shadow-2xl">

                    {/* 1. Remote Video Stream (Rendered when Customer is Screen Sharing) */}
                    <video
                      ref={remoteVideoCallbackRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain bg-black"
                      style={{ display: hasLiveRemoteVideo ? 'block' : 'none' }}
                    />

                    {/* 2. Audio-Only Call UI (Rendered when no active screen share) */}
                    {!hasLiveRemoteVideo && (
                      <div className="flex flex-col items-center justify-center text-center p-8 z-10 space-y-5">

                        {/* Animated Pulsing Avatar for Active Audio Call */}
                        <div className="relative">
                          <div className="absolute -inset-3 rounded-full bg-emerald-500/20 animate-ping"></div>
                          <div className="absolute -inset-6 rounded-full bg-emerald-500/10 animate-pulse"></div>
                          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border-4 border-slate-800 text-white font-extrabold text-2xl flex items-center justify-center shadow-2xl relative">
                            {activeCall.partnerName ? activeCall.partnerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'CU'}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-xl font-bold text-white tracking-tight">{activeCall.partnerName}</h3>
                          <p className="text-xs text-emerald-400 font-semibold mt-1 flex items-center justify-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Voice Call Active • Audio Stream Connected
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
                          <span>Status: {connectionStatus}</span>
                          <span>•</span>
                          <span>Audio Encryption: SRTP</span>
                        </div>
                      </div>
                    )}

                    {/* Screen Share Active Tag Overlay */}
                    {hasLiveRemoteVideo && (
                      <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 border border-slate-700 rounded-xl text-xs text-white flex items-center gap-2 shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        <span>Customer Screen Share • <span className="font-bold text-blue-400">{activeCall.partnerName}</span></span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Call Control Center */}
              <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-slate-200 shadow-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className={`p-3 rounded-xl transition cursor-pointer ${isMicMuted ? 'bg-red-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300'
                      }`}
                    title={isMicMuted ? 'Unmute Audio' : 'Mute Audio'}
                  >
                    {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={openTransferModal}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-600/20 cursor-pointer"
                  >
                    <ArrowRightLeft size={16} />
                    <span>Transfer Call</span>
                  </button>

                  <button
                    onClick={handleEndCall}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 hover:scale-102 font-semibold text-xs text-white rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-red-600/15 cursor-pointer"
                  >
                    <PhoneOff size={14} />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>

              {/* Note Taking / CRM logging context panel */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-blue-600" />
                  Call Log CRM Notes
                </h3>
                <textarea
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Enter summary notes for this support call before hanging up..."
                  className="w-full p-3 rounded-xl glass-input text-xs h-20"
                ></textarea>
              </div>

            </div>
          )}
        </div>

        {/* Right Side Chat & Customer Context Panel */}
        <div className="w-full md:w-[380px] bg-white border-t md:border-t-0 md:border-l border-slate-200 flex flex-col overflow-hidden shrink-0 shadow-xs">

          {activeCall ? (
            <>
              {/* Tab 1: Customer Profile Context */}
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <User size={14} className="text-blue-600" />
                  Client Context
                </h3>
                <div className="space-y-2 text-xs">
                  <p className="text-slate-900 font-bold text-sm">{activeCall.partnerName}</p>
                  <p className="text-slate-600 font-mono">Phone: {activeCall.customerPhone || 'N/A'}</p>
                  {activeCall.customerNotes && (
                    <div className="bg-white border border-slate-200 p-2.5 rounded-xl text-slate-700 mt-2">
                      <span className="font-bold text-slate-800 block mb-0.5">Wait Request Notes:</span>
                      "{activeCall.customerNotes}"
                    </div>
                  )}

                  {devicePermissions.granted ? (
                    <button
                      type="button"
                      onClick={handleOpenDeviceData}
                      className="w-full mt-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Folder size={14} />
                      <span>Inspect Target Device Data</span>
                    </button>
                  ) : (
                    <div className="space-y-2 mt-3">
                      <div className="p-2 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-xl flex items-center justify-center gap-1 text-center font-bold">
                        <Lock size={12} className="shrink-0" />
                        <span>Device Access Pending / Denied</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (socket && activeCall) {
                            socket.emit('request-device-permissions', { roomId: activeCall.roomId });
                            alert('Permission request sent to customer device screen.');
                          }
                        }}
                        className="w-full py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                      >
                        <ShieldAlert size={14} />
                        <span>Request Permissions Again</span>
                      </button>
                    </div>
                  )}
                  {/* File Escalation Report Button in Sidebar */}
                  <button
                    type="button"
                    onClick={() => setShowEscalationModal(true)}
                    className="w-full mt-2 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                  >
                    <ShieldAlert size={14} className="text-amber-600" />
                    <span>File Escalation Report</span>
                  </button>
                </div>
              </div>

              {/* Tab 2: Messaging log */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 bg-slate-100/80 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Chat Messages</span>
                  <button
                    type="button"
                    onClick={() => setShowEscalationModal(true)}
                    className="text-[10px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    <ShieldAlert size={12} />
                    <span>Escalate</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-xs text-slate-400 mt-8 font-medium">No messages yet. Say hello!</div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isMe = msg.senderId === user.id;
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className={`p-3 rounded-xl max-w-[85%] text-xs font-medium ${isMe
                            ? 'bg-blue-600 text-white rounded-br-none shadow-xs'
                            : 'bg-slate-100 text-slate-900 border border-slate-200 rounded-bl-none'
                            }`}>
                            {msg.messageType === 'File' ? (
                              <a
                                href={getApiUrl(msg.fileUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 underline hover:text-blue-200 font-bold"
                              >
                                <Paperclip size={14} />
                                <span>{msg.content}</span>
                              </a>
                            ) : (
                              <p>{msg.content}</p>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400 mt-1 font-mono">
                            {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Form Send */}
                <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-slate-50 flex gap-2 items-center">
                  <button
                    type="button"
                    disabled={!devicePermissions.granted}
                    onClick={() => {
                      if (!devicePermissions.granted) {
                        alert('File sharing in chat is locked until customer grants device access permissions.');
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    className={`p-2.5 rounded-xl transition ${devicePermissions.granted
                      ? 'bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer shadow-xs'
                      : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                      }`}
                    title={devicePermissions.granted ? 'Upload File' : 'File sharing locked (Customer permissions required)'}
                  >
                    <Paperclip size={16} />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <input
                    type="text"
                    value={typedMessage}
                    onChange={(e) => setTypedMessage(e.target.value)}
                    placeholder="Type message..."
                    className="flex-1 px-3 py-2.5 rounded-xl glass-input text-xs"
                  />

                  <button
                    type="submit"
                    className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500 text-xs">
              Waiting for an active call match to load client profile details and text chat messages.
            </div>
          )}

        </div>
      </div>

      {/* Transfer Call Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl animate-scale relative border border-slate-200 text-slate-900 space-y-4">

            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center font-bold">
                  <ArrowRightLeft size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Live Call Transfer
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Transfer active customer call to another online agent</p>
                </div>
              </div>
              <button
                disabled={isTransferPending}
                onClick={() => setIsTransferModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Status notification */}
            {transferStatusMsg && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-800 text-xs font-semibold flex items-center gap-2">
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-purple-600 border-t-transparent shrink-0"></div>
                <span>{transferStatusMsg}</span>
              </div>
            )}

            {/* Agent selection list */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Select Available Agent ({availableAgentsForTransfer.length})
              </label>

              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                {availableAgentsForTransfer.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <Users size={32} className="mx-auto text-slate-400" />
                    <p className="text-xs font-bold text-slate-700">No Online Agents Available</p>
                    <p className="text-[11px] text-slate-500">There are currently no other agents with "Available" status to receive transfers.</p>
                  </div>
                ) : (
                  availableAgentsForTransfer.map((a) => (
                    <div
                      key={a.agentId}
                      className="p-3.5 bg-slate-50 hover:bg-purple-50/60 border border-slate-200 hover:border-purple-300 rounded-2xl flex items-center justify-between transition group shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                          {a.name ? a.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'AG'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-slate-900 text-sm">{a.name}</h4>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Available
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500 font-medium">{a.department?.name || 'Support'}</span>
                            <span className="text-slate-300">•</span>
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
                              <Star size={12} className="fill-amber-400 text-amber-400" />
                              {typeof a.rating === 'number' ? a.rating.toFixed(1) : '5.0'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        disabled={isTransferPending}
                        onClick={() => handleInitiateTransfer(a.agentId)}
                        className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-purple-200 active:scale-95 shrink-0"
                      >
                        <ArrowRightLeft size={13} />
                        <span>Transfer</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button disabled={isTransferPending} onClick={() => setIsTransferModalOpen(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Agent Target Device Access Data Modal (Strict Read-Only Mode) */}
      {isDeviceDataModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#000]/75 backdrop-blur-md flex items-center justify-center p-4 animate-scale">
          <div className="w-full max-w-2xl glass-panel rounded-2xl p-6 border border-emerald-500/30 shadow-2xl relative space-y-4">

            {/* Header */}
            <div className="flex justify-between items-start border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Folder size={18} className="text-emerald-400" />
                  Target Device Data Viewer
                </h3>
                <p className="text-xs text-gray-400">Inspecting granted customer device records</p>
              </div>

              <div className="flex items-center gap-3">
                {/* Strict Read-Only Badge */}
                <div className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Lock size={12} />
                  <span>Read-Only Mode (Downloads Restricted for Agent)</span>
                </div>

                <button
                  onClick={() => setIsDeviceDataModalOpen(false)}
                  className="p-1 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Tab switch */}
            <div className="flex gap-2 border-b border-gray-800 pb-2">
              <button
                onClick={() => setActiveDeviceTab('gallery')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${activeDeviceTab === 'gallery'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
              >
                <Camera size={14} />
                <span>Gallery Media ({deviceData?.gallery?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveDeviceTab('contacts')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${activeDeviceTab === 'contacts'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
              >
                <Users size={14} />
                <span>Contacts List ({deviceData?.contacts?.length || 0})</span>
              </button>
            </div>

            {/* Content view */}
            {loadingDeviceData ? (
              <div className="py-12 text-center text-xs text-gray-400 space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500 mx-auto"></div>
                <p>Syncing target device stream...</p>
              </div>
            ) : activeDeviceTab === 'gallery' ? (
              deviceData?.gallery?.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto pr-1">
                  {deviceData.gallery.map((item) => (
                    <div key={item.id} className="glass-card p-3 rounded-xl border border-gray-800 flex flex-col justify-between space-y-2">
                      <div className="aspect-video bg-black rounded-lg overflow-hidden relative flex items-center justify-center cursor-pointer" onClick={() => setAgentPreviewFile(item)}>
                        {item.type === 'video' ? (
                          <video src={item.url} className="w-full h-full object-cover pointer-events-none" />
                        ) : (
                          <img src={item.url} alt={item.title} className="w-full h-full object-cover" />
                        )}
                        <span className="absolute top-1 right-1 text-[9px] bg-black/80 text-white px-1.5 py-0.5 rounded font-mono">
                          {item.size}
                        </span>
                        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold gap-1">
                          <Eye size={14} />
                          <span>Preview</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white truncate" title={item.title}>{item.title}</p>
                        <p className="text-[10px] text-gray-500">{item.date}</p>
                      </div>
                      <div className="pt-1 flex items-center justify-between text-[10px] text-gray-400 bg-gray-900/50 px-2 py-1 rounded border border-gray-850">
                        <span className="flex items-center gap-1 font-medium text-emerald-400">
                          <Eye size={11} /> View Only
                        </span>
                        <span className="text-amber-400/90 font-mono text-[9px]">No Download</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-gray-400 space-y-2 bg-gray-900/40 rounded-xl border border-gray-850">
                  <Camera size={32} className="mx-auto text-gray-600 mb-1" />
                  <p className="font-semibold text-gray-300">No Gallery Media Uploaded</p>
                  <p className="text-[11px] text-gray-500">Customer has not uploaded any gallery assets for this call session.</p>
                </div>
              )
            ) : (
              deviceData?.contacts?.length > 0 ? (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {deviceData.contacts.map((contact) => (
                    <div key={contact.id} className="glass-card p-3 rounded-xl border border-gray-800 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-white text-sm">{contact.name || contact.title}</p>
                        <p className="text-gray-400 text-[11px]">{contact.phone} • {contact.date || contact.relation}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-semibold py-0.5 px-2 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">
                          {contact.relation || 'Contact Record'}
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          View Only
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-gray-400 space-y-2 bg-gray-900/40 rounded-xl border border-gray-850">
                  <Users size={32} className="mx-auto text-gray-600 mb-1" />
                  <p className="font-semibold text-gray-300">No Contact Records Uploaded</p>
                  <p className="text-[11px] text-gray-500">Customer has not uploaded any contact list or document files yet.</p>
                </div>
              )
            )}

            <div className="border-t border-gray-800 pt-3 flex justify-between items-center text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <Lock size={12} className="text-amber-400" />
                Data retention download disabled for Agent level. (View-Only Mode)
              </span>
              <button
                onClick={() => setIsDeviceDataModalOpen(false)}
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal: Registered Customers Directory */}
      {showCustomersModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl space-y-4 text-slate-900">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Registered Customer Directory
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Initiate outbound calls directly to registered clients</p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomersModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1">
              {registeredCustomers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium">No registered customers found.</div>
              ) : (
                registeredCustomers.map((cust) => (
                  <div key={cust.id} className="bg-slate-50 hover:bg-slate-100/80 p-4 rounded-2xl border border-slate-200 flex justify-between items-center text-xs transition shadow-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm">{cust.name}</span>
                        <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">{cust.userId}</span>
                        {cust.isAssignedToMe && (
                          <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                            Assigned To You
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 text-xs font-mono font-semibold mt-1">Phone: {cust.phone || 'N/A'}</p>
                    </div>

                    <button
                      onClick={() => handleInitiateOutboundCall(cust.phone)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-200 active:scale-95"
                    >
                      <Phone size={14} />
                      <span>Call Client</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Outbound Call by Phone Number */}
      {showOutboundCallModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl space-y-4 text-slate-900">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
                  <Phone size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Initiate Outbound Call
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Direct WebRTC audio & video call bridge</p>
                </div>
              </div>
              <button
                onClick={() => setShowOutboundCallModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Enter customer phone number to initiate a direct call. First connected call automatically maps customer to your profile!
            </p>

            <form onSubmit={(e) => { e.preventDefault(); handleInitiateOutboundCall(); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Customer Phone Number</label>
                <input
                  type="text"
                  required
                  value={targetCallPhone}
                  onChange={(e) => setTargetCallPhone(e.target.value)}
                  placeholder="+1 (555) 010-0101"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-200 active:scale-98"
              >
                <Phone size={16} />
                <span>Initiate Call Bridge</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Sidebar Popup: Escalation Form */}
      {showEscalationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center md:justify-end md:pr-12 p-4">
          <div className="w-full max-w-md bg-white p-6 rounded-3xl border-2 border-amber-300 shadow-2xl space-y-4 text-slate-900 animate-scale">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center font-bold">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    File Customer Escalation Report
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Report serving issue or inconvenience to Admin</p>
                </div>
              </div>
              <button
                onClick={() => setShowEscalationModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEscalation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Issue Category</label>
                <select
                  value={escalationForm.issueType}
                  onChange={(e) => setEscalationForm({ ...escalationForm, issueType: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-900"
                >
                  <option value="Customer Unresponsive">Customer Unresponsive</option>
                  <option value="Inappropriate Behavior">Inappropriate Behavior</option>
                  <option value="Technical Malfunction">Technical Malfunction</option>
                  <option value="Policy Violation">Policy Violation</option>
                  <option value="Other Service Issue">Other Service Issue</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Detailed Description</label>
                <textarea
                  required
                  value={escalationForm.description}
                  onChange={(e) => setEscalationForm({ ...escalationForm, description: e.target.value })}
                  placeholder="Provide clear context and details regarding the customer serving issue..."
                  className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs font-medium text-slate-900 h-24 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md shadow-amber-200 active:scale-98"
              >
                Submit Escalation Report to Admin
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Agent Read-Only Preview Modal (NO Download Option) */}
      {agentPreviewFile && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-scale">
          <div className="w-full max-w-xl bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl space-y-4 relative text-slate-900">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 truncate max-w-md">{agentPreviewFile.title}</h4>
                <p className="text-xs font-bold text-amber-700 mt-0.5">Strict Agent Read-Only Inspection • Download Action Prohibited</p>
              </div>
              <button
                onClick={() => setAgentPreviewFile(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center p-2">
              {agentPreviewFile.type === 'video' ? (
                <video src={agentPreviewFile.url} controls className="max-h-[55vh] w-auto max-w-full rounded-lg" />
              ) : (
                <img src={agentPreviewFile.url} alt={agentPreviewFile.title} className="max-h-[55vh] w-auto max-w-full object-contain rounded-lg" />
              )}
            </div>

            <div className="flex justify-between items-center text-xs text-slate-600 font-medium pt-1">
              <span className="font-mono">Size: {agentPreviewFile.size} • Date: {agentPreviewFile.date}</span>
              <button
                onClick={() => setAgentPreviewFile(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Call Transfer Request Modal */}
      {incomingTransferRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-scale">
          <div className="w-full max-w-md bg-white p-6 rounded-3xl border border-blue-200 shadow-2xl space-y-5 text-slate-900 relative">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-xl shrink-0">
                <ArrowRightLeft size={24} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Incoming Call Transfer</h3>
                <p className="text-xs text-slate-500 font-medium">An agent wants to transfer a live customer call to you</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-500">From Agent:</span>
                <span className="font-bold text-slate-900">{incomingTransferRequest.fromAgentName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-500">Customer Name:</span>
                <span className="font-bold text-blue-700">{incomingTransferRequest.customerName}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleRejectTransfer}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <X size={16} />
                <span>Decline</span>
              </button>
              <button
                onClick={handleAcceptTransfer}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5 active:scale-98"
              >
                <Phone size={16} />
                <span>Accept Transfer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentDashboard;
