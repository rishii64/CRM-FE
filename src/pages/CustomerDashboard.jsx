import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useWebRtc } from '../context/WebRtcContext';
import { 
  Video, VideoOff, Mic, MicOff, PhoneOff, Send, Paperclip, 
  HelpCircle, Clock, Star, MessageSquare, AlertCircle, RefreshCw, Sun, Moon, Monitor, MonitorOff,
  ShieldAlert, Camera, Users, Folder, Lock
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

function CustomerDashboard({ user, onLogout }) {
  const { theme, toggleTheme } = useTheme();
  const { socket, isConnected } = useSocket();
  const {
    localStream,
    remoteStream,
    activeCall,
    isScreenSharing,
    connectionStatus,
    setActiveCall,
    leaveCall,
    toggleScreenShare,
    localVideoCallbackRef,
    remoteVideoCallbackRef,
  } = useWebRtc();

  // Customer states
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [phone, setPhone] = useState(user.phone || '');
  const [notes, setNotes] = useState('');
  
  const [queueItem, setQueueItem] = useState(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);

  // Active call states
  const [chatMessages, setChatMessages] = useState([]);
  const [typedMessage, setTypedMessage] = useState('');

  // Device access permission states
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [tempGallery, setTempGallery] = useState(true);
  const [tempContacts, setTempContacts] = useState(true);
  const [devicePermissions, setDevicePermissions] = useState({
    gallery: false,
    contacts: false,
    granted: false,
  });

  // Feedback states
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // UI devices state
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Fetch departments list
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const res = await fetch('/api/departments');
        if (res.ok) {
          const list = await res.json();
          setDepartments(list);
          if (list.length > 0) setSelectedDeptId(list[0].id.toString());
        }
      } catch (err) {
        console.error('Error fetching departments:', err);
      }
    };
    fetchDepts();
  }, []);

  // Scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Incoming call state
  const [incomingCallData, setIncomingCallData] = useState(null);

  // Direct call assigned agent (with fallback to Admin waiting queue if agent is unavailable)
  const handleCallAssignedAgent = async () => {
    try {
      const res = await fetch('/api/calls/start-assigned', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        // Join call room and start peer call
        socket.emit('join-room', { roomId: data.roomId });
        setActiveCall({
          callId: data.callId,
          roomId: data.roomId,
          partnerName: data.partnerName,
          partnerUserId: data.partnerUserId,
          role: 'Customer',
        });
        setShowPermissionModal(true);
      } else {
        // Assigned agent is offline or busy -> Automatically join waiting queue for Admin dispatch!
        const deptId = user.assignedAgent?.departmentId || (departments[0] ? departments[0].id : 1);
        const queueRes = await fetch('/api/queues/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            departmentId: parseInt(deptId),
            notes: `Attempted call to assigned agent '${user.assignedAgent?.name || 'Agent'}', currently ${data.agentStatus || 'unavailable'}.`,
          }),
        });

        const queueData = await queueRes.json();
        if (queueRes.ok) {
          setQueueItem(queueData.queueItem);
          setQueuePosition(queueData.position);
          setIsWaiting(true);
        } else if (queueData.queueItem) {
          setQueueItem(queueData.queueItem);
          setIsWaiting(true);
        } else {
          alert(data.message || 'Assigned agent is unavailable');
        }
      }
    } catch (err) {
      console.error('Call assigned agent error:', err);
    }
  };

  const handleAcceptIncomingCall = () => {
    if (!incomingCallData) return;
    socket.emit('join-room', { roomId: incomingCallData.roomId });
    setActiveCall({
      callId: incomingCallData.callId,
      roomId: incomingCallData.roomId,
      partnerName: incomingCallData.agentName,
      partnerUserId: incomingCallData.agentUserId || incomingCallData.agentId,
      role: 'Customer',
    });
    setShowPermissionModal(true);
    setIncomingCallData(null);
  };

  // Socket routing for call match, incoming signaling, chat messages, and call end
  useEffect(() => {
    if (!socket || !isConnected) return;

    // 0. Listen for Outbound incoming calls from Agent
    socket.on('incoming-call', (callData) => {
      console.log('Customer received incoming call:', callData);
      socket.emit('join-room', { roomId: callData.roomId });
      setActiveCall({
        callId: callData.callId,
        roomId: callData.roomId,
        partnerName: callData.agentName || 'Support Agent',
        partnerUserId: callData.agentUserId || callData.agentId,
        role: 'Customer',
      });
      setIncomingCallData(callData);
    });

    // 1. Listen for call assignment by Super Admin
    socket.on('call-assigned', (callData) => {
      console.log('Call assigned to customer:', callData);
      
      // Stop waiting, join active call
      setIsWaiting(false);
      setQueueItem(null);
      setChatMessages([]);
      setShowRatingModal(false);
      setFeedbackSubmitted(false);

      // Reset device permissions and prompt customer permission modal upon call start
      setDevicePermissions({ gallery: false, contacts: false, granted: false });
      setShowPermissionModal(true);

      // Join the signaling room
      socket.emit('join-room', { roomId: callData.roomId });

      // Save call metadata
      setActiveCall({
        callId: callData.callId,
        roomId: callData.roomId,
        partnerName: callData.partnerName,
        partnerUserId: callData.partnerUserId,
        role: 'Customer',
      });
    });

    // 2. Listen for Chat Messages
    socket.on('receive-message', (message) => {
      setChatMessages((prev) => [...prev, message]);
    });

    // 3. Listen for Device Permissions Updated
    socket.on('device-permissions-updated', (data) => {
      console.log('Customer received device-permissions-updated:', data);
      if (data.permissions) {
        setDevicePermissions(data.permissions);
      }
    });

    // 4. Listen for Agent re-requesting permissions
    socket.on('prompt-device-permissions', () => {
      console.log('Customer received prompt-device-permissions');
      setShowPermissionModal(true);
    });

    // 5. Listen for Partner ending call (disconnecting)
    socket.on('call-ended', () => {
      console.log('Call ended by agent/server');
      leaveCall();
      // Open the rating feedback prompt!
      setShowRatingModal(true);
    });

    // 6. Listen for call transfer / partner changed
    socket.on('partner-changed', (data) => {
      console.log('Customer received partner-changed:', data);
      setActiveCall((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          partnerName: data.newPartnerName,
          partnerUserId: data.newPartnerUserId || data.newPartnerId,
        };
      });
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-assigned');
      socket.off('receive-message');
      socket.off('device-permissions-updated');
      socket.off('prompt-device-permissions');
      socket.off('call-ended');
      socket.off('partner-changed');
    };
  }, [socket, isConnected, setActiveCall, leaveCall]);

  // Handle Customer Denying or Choosing Later for Device Permissions
  const handleDenyOrLaterPermissions = async () => {
    const perm = { gallery: false, contacts: false, granted: false };
    setDevicePermissions(perm);
    setShowPermissionModal(false);

    if (activeCall) {
      try {
        await fetch(`/api/calls/${activeCall.callId}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gallery: false, contacts: false }),
        });
      } catch (err) {
        console.error('Error saving permissions:', err);
      }

      if (socket) {
        socket.emit('update-device-permissions', {
          roomId: activeCall.roomId,
          permissions: perm,
        });
      }
    }
  };

  // Handle Customer Granting Device Permissions
  const handleGrantPermissions = async (galleryAccess, contactsAccess) => {
    const granted = Boolean(galleryAccess && contactsAccess);
    const perm = { gallery: galleryAccess, contacts: contactsAccess, granted };
    setDevicePermissions(perm);
    setShowPermissionModal(false);

    if (activeCall) {
      try {
        await fetch(`/api/calls/${activeCall.callId}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gallery: galleryAccess, contacts: contactsAccess }),
        });
      } catch (err) {
        console.error('Error saving permissions:', err);
      }

      if (socket) {
        socket.emit('update-device-permissions', {
          roomId: activeCall.roomId,
          permissions: perm,
        });
      }
    }
  };

  // Submit Join Queue
  const handleJoinQueue = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/queues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: parseInt(selectedDeptId),
          notes,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setQueueItem(data.queueItem);
        setQueuePosition(data.position);
        setIsWaiting(true);
      } else {
        alert(data.message || 'Could not join waiting queue');
      }
    } catch (err) {
      console.error('Error joining queue:', err);
    }
  };

  // Submit Leave Queue
  const handleLeaveQueue = async () => {
    try {
      const res = await fetch('/api/queues/leave', { method: 'POST' });
      if (res.ok) {
        setIsWaiting(false);
        setQueueItem(null);
      }
    } catch (err) {
      console.error('Error leaving queue:', err);
    }
  };

  // Toggle devices
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOff(!videoTrack.enabled);
      }
    }
  };

  // End active call
  const handleEndCall = async () => {
    if (!activeCall) return;

    try {
      const res = await fetch(`/api/calls/${activeCall.callId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnectReason: 'Customer hung up' }),
      });

      if (res.ok) {
        leaveCall();
        setShowRatingModal(true);
      }
    } catch (err) {
      console.error('Error ending call:', err);
    }
  };

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!typedMessage.trim() || !activeCall) return;

    try {
      const res = await fetch(`/api/chat/${activeCall.callId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageType: 'Text', content: typedMessage }),
      });

      if (res.ok) {
        const msg = await res.json();
        setChatMessages((prev) => [...prev, msg]);
        socket.emit('send-message', { roomId: activeCall.roomId, message: msg });
        setTypedMessage('');
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Attach and upload file
  const handleFileUpload = async (e) => {
    if (!devicePermissions.granted) {
      alert('File sharing in chat is locked until you grant Gallery & Contact access permissions.');
      return;
    }

    const file = e.target.files[0];
    if (!file || !activeCall) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch(`/api/chat/${activeCall.callId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();

      const saveRes = await fetch(`/api/chat/${activeCall.callId}`, {
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

  // Submit Feedback / Rating Star
  const handleSubmitFeedback = async () => {
    // Simulated database feedback log update
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setShowRatingModal(false);
      setFeedbackSubmitted(false);
      // Smoothly redirect customer back to home screen/form reset
      window.location.href = '/';
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-700 font-extrabold rounded-xl flex items-center justify-center text-lg">
            ZT
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              ZenSupportX <span className="text-blue-700 font-bold text-xs py-0.5 px-2 bg-blue-50 rounded-full border border-blue-200">Customer Portal</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Welcome, {user.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onLogout}
            className="p-2.5 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl text-slate-600 hover:text-red-700 transition cursor-pointer"
            title="Log Out"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </header>

      {/* Main Core viewport */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* If call is active */}
        {activeCall ? (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* Left side Call/Streaming screen */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="flex-1 flex flex-col gap-4">
                
                {/* WebRTC Call Viewport */}
                <div className="relative flex-1 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[340px] flex items-center justify-center shadow-2xl">
                  
                  {/* Clean Audio-Only Call UI */}
                  <div className="flex flex-col items-center justify-center text-center p-8 z-10 space-y-5">
                    <div className="relative">
                      <div className="absolute -inset-3 rounded-full bg-blue-500/20 animate-ping"></div>
                      <div className="absolute -inset-6 rounded-full bg-blue-500/10 animate-pulse"></div>
                      <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border-4 border-slate-800 text-white font-extrabold text-2xl flex items-center justify-center shadow-2xl relative">
                        {activeCall.partnerName ? activeCall.partnerName.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() : 'AG'}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">Support Agent: {activeCall.partnerName}</h3>
                      <p className="text-xs text-blue-400 font-semibold mt-1 flex items-center justify-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Voice Call Active • Connected to Agent
                      </p>
                    </div>

                    {isScreenSharing && (
                      <div className="bg-blue-500/15 border border-blue-500/30 px-4 py-2 rounded-xl text-xs text-blue-300 font-semibold flex items-center gap-2 animate-pulse">
                        <Monitor size={16} className="text-blue-400" />
                        <span>You are currently sharing your screen with {activeCall.partnerName}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
                      <span>Status: {connectionStatus}</span>
                    </div>
                  </div>
                </div>

                {/* Call controls */}
                <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      className={`p-3 rounded-xl transition cursor-pointer ${
                        isMicMuted ? 'bg-red-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300'
                      }`}
                      title={isMicMuted ? 'Unmute Audio' : 'Mute Audio'}
                    >
                      {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>

                    <button
                      onClick={toggleScreenShare}
                      className={`px-4 py-2.5 rounded-xl transition cursor-pointer text-xs font-bold flex items-center gap-2 ${
                        isScreenSharing 
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                      }`}
                      title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen with Agent'}
                    >
                      {isScreenSharing ? <MonitorOff size={16} /> : <Monitor size={16} />}
                      <span>{isScreenSharing ? 'Stop Sharing' : 'Share Screen'}</span>
                    </button>
                  </div>

                  <button
                    onClick={handleEndCall}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 hover:scale-102 font-semibold text-xs text-white rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-red-600/15 cursor-pointer"
                  >
                    <PhoneOff size={14} />
                    <span>End Call</span>
                  </button>
                </div>

              </div>
            </div>

            {/* Right side Text Chat Panel */}
            <div className="w-full md:w-[380px] bg-white border-t md:border-t-0 md:border-l border-slate-200 flex flex-col overflow-hidden shrink-0 shadow-xs">
              <div className="p-3 bg-slate-100/80 border-b border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Chat with Agent</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 mt-8 font-medium">No messages yet. Send a note to the agent.</div>
                ) : (
                  chatMessages.map((msg) => {
                    const isMe = msg.senderId === user.id;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`p-3 rounded-xl max-w-[85%] text-xs font-medium ${
                          isMe 
                            ? 'bg-blue-600 text-white rounded-br-none shadow-xs' 
                            : 'bg-slate-100 text-slate-900 border border-slate-200 rounded-bl-none'
                        }`}>
                          {msg.messageType === 'File' ? (
                            <a
                              href={msg.fileUrl}
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

              {/* Chat Send input */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-slate-50 flex gap-2 items-center">
                <button
                  type="button"
                  disabled={!devicePermissions.granted}
                  onClick={() => {
                    if (!devicePermissions.granted) {
                      setShowPermissionModal(true);
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`p-2.5 rounded-xl transition ${
                    devicePermissions.granted
                      ? 'bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer shadow-xs'
                      : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                  }`}
                  title={devicePermissions.granted ? 'Upload File' : 'File sharing locked (Target device permissions required)'}
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
                  className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />

                <button
                  type="submit"
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition cursor-pointer shadow-xs active:scale-95"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>

          </div>
        ) : isWaiting ? (
          /* Waiting queue screen */
          <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-slate-50">
            {/* Background glowing circle */}
            <div className="absolute w-[400px] h-[400px] bg-blue-100/50 rounded-full blur-[100px] animate-pulse"></div>

            <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl relative text-center space-y-6 text-slate-900">
              <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center animate-bounce border border-blue-100 shadow-xs">
                <Clock size={32} />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-extrabold text-slate-900">Joined Waiting List</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  You are now in line. A support supervisor will assign an agent to bridge calls with you shortly.
                </p>
              </div>

              {/* Waiting metrics */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-200 rounded-2xl shadow-xs">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider block">Queue Position</span>
                  <span className="text-2xl font-extrabold text-blue-700 mt-1 flex items-center justify-center gap-1 font-mono">
                    #{queuePosition && queuePosition > 0 ? queuePosition : 1}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider block">Status</span>
                  <span className="text-xs font-bold text-amber-800 mt-2 flex items-center justify-center gap-1.5 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    <RefreshCw size={12} className="animate-spin text-amber-600" />
                    Waiting...
                  </span>
                </div>
              </div>

              <button
                onClick={handleLeaveQueue}
                className="w-full py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold rounded-xl text-xs transition cursor-pointer shadow-xs active:scale-98"
              >
                Cancel Call Request
              </button>
            </div>
          </div>
        ) : (
          /* Join Request Form */
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden space-y-4">
            {/* Background glowing circles */}
            <div className="absolute top-[10%] left-[20%] w-[350px] h-[350px] bg-blue-900/10 rounded-full blur-[80px]"></div>

            {/* Assigned Agent Banner (If mapped) */}
            {user.assignedAgent && (
              <div className="w-full max-w-lg bg-white p-5 rounded-2xl border border-blue-200 shadow-md relative z-10 space-y-3 text-slate-900">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Your Assigned Primary Support Agent</span>
                    <h3 className="text-lg font-bold text-slate-900 mt-0.5">{user.assignedAgent.name}</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                    user.assignedAgent.status === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    user.assignedAgent.status === 'Busy' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {user.assignedAgent.status}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="text-slate-600">
                    <span className="font-mono text-blue-700 font-bold">{user.assignedAgent.agentCode}</span> • {user.assignedAgent.department}
                  </div>
                  <button
                    onClick={handleCallAssignedAgent}
                    disabled={user.assignedAgent.status !== 'Available'}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Video size={14} />
                    <span>Call Assigned Agent</span>
                  </button>
                </div>
              </div>
            )}

            <div className="w-full max-w-lg bg-white p-8 rounded-2xl border border-slate-200 shadow-md relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-bold">
                  <Video size={22} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Start Support Video Call</h3>
                  <p className="text-xs text-slate-500 font-medium">Fill in details and connect with a live customer representative</p>
                </div>
              </div>

              <form onSubmit={handleJoinQueue} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Select Help Department
                  </label>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl glass-input text-xs font-medium"
                  >
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} ({dept.description.substring(0, 40)}...)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Contact Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-4 py-3 rounded-xl glass-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Describe your problem (Notes)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Briefly describe what help you need today..."
                    className="w-full p-4 rounded-xl glass-input text-xs h-24"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition duration-200 shadow-lg shadow-blue-600/20 active:scale-95 text-xs flex items-center justify-center gap-2"
                >
                  <Video size={16} />
                  Join Waiting Queue
                </button>
              </form>
            </div>
          </div>
        )}

      </div>

      {/* Post-Call Rating / Feedback Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 z-50 bg-[#000]/70 backdrop-blur-md flex items-center justify-center px-4">
          <div className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-gray-800 text-center shadow-2xl relative animate-scale">
            
            <div className="mx-auto w-12 h-12 bg-blue-600/10 text-blue-400 rounded-xl flex items-center justify-center mb-4">
              <MessageSquare size={24} />
            </div>

            <h3 className="text-xl font-bold text-white mb-1">Rate Your Experience</h3>
            <p className="text-xs text-gray-400 mb-6">
              Please rate your call experience with ZenSupportX support.
            </p>

            {feedbackSubmitted ? (
              <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs flex items-center justify-center gap-2 mb-4">
                <CheckCircle size={16} />
                <span>Thank you! Your feedback has been logged.</span>
              </div>
            ) : (
              <div className="space-y-6 mb-4">
                {/* 5 Star Selection */}
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 hover:scale-110 transition"
                    >
                      <Star
                        size={28}
                        className={`${
                          star <= rating 
                            ? 'fill-amber-400 text-amber-400' 
                            : 'text-gray-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleSubmitFeedback}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition"
                >
                  Submit Rating
                </button>
              </div>
            )}

            <button
              onClick={() => { setShowRatingModal(false); window.location.href = '/'; }}
              className="text-xs text-gray-500 hover:text-white transition mt-2 block mx-auto hover:underline cursor-pointer"
            >
              Skip Feedback
            </button>
          </div>
        </div>
      )}

      {/* Modal: Device Permission Settings */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white p-6 rounded-3xl border border-slate-200 shadow-2xl space-y-4 text-slate-900">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Target Device Access Permission
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Grant support team target device access permissions</p>
                </div>
              </div>
              <button 
                onClick={handleDenyOrLaterPermissions} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <label className="flex items-center justify-between pb-3 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                    <Folder size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">Gallery Media Access</p>
                    <p className="text-[10px] text-slate-500 font-medium">Allow support team to inspect uploaded media</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tempGallery}
                  onChange={(e) => setTempGallery(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between border-t border-slate-200 pt-3 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <Users size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-900">Contacts List Access</p>
                    <p className="text-[10px] text-slate-500 font-medium">Allow support team to inspect emergency contacts</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tempContacts}
                  onChange={(e) => setTempContacts(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>

            <div className="text-[11px] text-amber-800 bg-amber-50 p-3 rounded-xl text-center flex items-center gap-1.5 justify-center border border-amber-200 font-semibold">
              <AlertCircle size={14} className="shrink-0 text-amber-600" />
              <span>Prior to granting access, file sharing in chat remains locked.</span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDenyOrLaterPermissions}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Deny / Later
              </button>
              <button
                type="button"
                onClick={() => handleGrantPermissions(tempGallery, tempContacts)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-200 cursor-pointer active:scale-95"
              >
                Allow & Sync Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Incoming Call Notification */}
      {incomingCallData && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white p-6 rounded-3xl border border-emerald-200 shadow-2xl text-center space-y-4 text-slate-900">
            <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center animate-pulse border border-emerald-200 shadow-xs">
              <Video size={30} />
            </div>

            <div>
              <span className="text-[11px] uppercase font-extrabold text-emerald-700 tracking-wider bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Incoming Support Call
              </span>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-3">{incomingCallData.agentName}</h3>
              <p className="text-xs text-slate-600 font-mono font-semibold mt-1">
                Agent Code: <span className="text-blue-700 font-bold">{incomingCallData.agentCode}</span> • {incomingCallData.departmentName}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIncomingCallData(null)}
                className="flex-1 py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold rounded-xl text-xs transition cursor-pointer shadow-xs"
              >
                Decline
              </button>
              <button
                onClick={handleAcceptIncomingCall}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-200 cursor-pointer active:scale-95"
              >
                Accept & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerDashboard;
