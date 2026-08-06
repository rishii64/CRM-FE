import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './SocketContext';

const WebRtcContext = createContext(null);

export const useWebRtc = () => useContext(WebRtcContext);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN servers for NAT traversal (needed for LAN / cross-device connectivity)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export const WebRtcProvider = ({ children }) => {
  const { socket, isConnected } = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeCallState, setActiveCallState] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const activeCallRef = useRef(null);
  const iceCandidatesQueueRef = useRef([]);
  // Refs to hold the actual DOM <video> elements for callback-ref binding
  const localVideoElRef = useRef(null);
  const remoteVideoElRef = useRef(null);

  // Wrapped setActiveCall that ALWAYS syncs the ref immediately (synchronously)
  // This is the critical fix — React's setState is async, but the ref must be
  // available instantly for the signal handler to accept incoming WebRTC messages.
  const setActiveCall = useCallback((callData) => {
    if (typeof callData === 'function') {
      // Handle functional updates: setActiveCall(prev => ...)
      const newVal = callData(activeCallRef.current);
      activeCallRef.current = newVal;
      setActiveCallState(newVal);
    } else {
      activeCallRef.current = callData;
      setActiveCallState(callData);
    }
  }, []);

  // Process queued ICE candidates after setting remote description
  const processQueuedCandidates = async (pc) => {
    while (iceCandidatesQueueRef.current.length > 0) {
      const candidate = iceCandidatesQueueRef.current.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Processed queued ICE candidate');
      } catch (err) {
        console.error('Error adding queued ICE candidate:', err);
      }
    }
  };

  // Stop all media tracks
  const stopMediaTracks = (stream) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  // Get user media (camera and microphone)
  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing camera and microphone:', error);
      // Fallback to audio only if camera is blocked/unavailable
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        return audioStream;
      } catch (audioError) {
        console.error('Error accessing microphone:', audioError);
        alert('Could not access microphone or camera. Please check permissions.');
        return null;
      }
    }
  };

  // Initialize RTCPeerConnection
  const initPeerConnection = (partnerUserId, stream) => {
    // Close any existing peer connection first
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch (e) { /* ignore */ }
    }

    iceCandidatesQueueRef.current = [];
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;
    setConnectionStatus('connecting');

    // Add local tracks to peer connection
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('signal', {
          to: partnerUserId,
          signalData: { candidate: event.candidate },
        });
      }
    };

    // Handle incoming stream tracks
    pc.ontrack = (event) => {
      const track = event.track;
      const stream = event.streams[0];
      console.log(`Received remote track: kind=${track.kind}, id=${track.id}, readyState=${track.readyState}`);
      console.log(`Remote stream id=${stream?.id}, tracks=${stream?.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', ')}`);
      setRemoteStream(stream);
      // Directly bind to the video element if it already exists (callback ref may have already fired)
      if (remoteVideoElRef.current && stream) {
        remoteVideoElRef.current.srcObject = stream;
      }
    };

    // Monitor connection states
    pc.onconnectionstatechange = () => {
      console.log('PeerConnection state:', pc.connectionState);
      setConnectionStatus(pc.connectionState);
      if (pc.connectionState === 'failed') {
        console.warn('PeerConnection failed — attempting ICE restart...');
        setConnectionStatus('reconnecting');
        // Attempt ICE restart
        try {
          pc.restartIce();
        } catch (e) {
          console.error('ICE restart failed:', e);
          setConnectionStatus('disconnected');
        }
      } else if (pc.connectionState === 'closed') {
        setConnectionStatus('disconnected');
      }
    };

    // Also monitor ICE connection state for better debugging
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.warn('ICE connection failed — attempting ICE restart...');
        try {
          pc.restartIce();
        } catch (e) {
          console.error('ICE restart error:', e);
        }
      }
    };

    // Monitor ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState);
    };

    return pc;
  };

  // Start peer call (the initiator — typically the agent)
  const startPeerCall = async (callData) => {
    const { partnerUserId } = callData;
    
    // CRITICAL: Set the ref synchronously BEFORE any async work
    // so that incoming signals won't be rejected during getUserMedia/offer creation
    setActiveCall(callData);

    const stream = await getUserMedia();
    if (!stream) {
      console.error('Failed to get user media, cannot start call');
      return;
    }

    const pc = initPeerConnection(partnerUserId, stream);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('Sending WebRTC offer to', partnerUserId);
      socket.emit('signal', {
        to: partnerUserId,
        signalData: { sdp: offer },
      });
    } catch (err) {
      console.error('Error creating WebRTC offer:', err);
    }
  };

  // Handle incoming signaling messages
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleSignal = async ({ from, signalData }) => {
      let currentCall = activeCallRef.current;
      
      // Auto-assign partnerUserId if call is active but partnerUserId is missing/empty
      if (currentCall && (!currentCall.partnerUserId || currentCall.partnerUserId === '')) {
        console.log('Auto-assigning partnerUserId to', from);
        currentCall.partnerUserId = from;
        setActiveCall({ ...currentCall, partnerUserId: from });
      }

      // If no active call at all, reject
      if (!currentCall) {
        console.warn('Received WebRTC signal but no active call. from:', from);
        return;
      }

      // If partnerUserId is set but doesn't match, reject (compare as strings for safety)
      if (currentCall.partnerUserId && 
          String(currentCall.partnerUserId) !== String(from)) {
        console.warn('Received WebRTC signal from non-partner user:', from, 'expected:', currentCall.partnerUserId);
        return;
      }

      let pc = peerConnectionRef.current;

      try {
        if (signalData.sdp) {
          const sdp = new RTCSessionDescription(signalData.sdp);
          
          if (sdp.type === 'offer') {
            console.log('Received WebRTC offer from', from, '— creating answer...');
            let stream = localStreamRef.current;
            if (!stream) {
              stream = await getUserMedia();
            }

            if (!pc || pc.signalingState === 'closed') {
              pc = initPeerConnection(from, stream);
            }

            await pc.setRemoteDescription(sdp);
            await processQueuedCandidates(pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            console.log('Sending WebRTC answer to', from);
            socket.emit('signal', {
              to: from,
              signalData: { sdp: answer },
            });
          } else if (sdp.type === 'answer') {
            console.log('Received WebRTC answer from', from);
            if (pc && pc.signalingState !== 'closed') {
              await pc.setRemoteDescription(sdp);
              await processQueuedCandidates(pc);
            }
          }
        } else if (signalData.candidate) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } else {
            console.log('Queueing ICE candidate until remote description is set');
            iceCandidatesQueueRef.current.push(signalData.candidate);
          }
        }
      } catch (err) {
        console.error('Error handling WebRTC signaling:', err);
      }
    };

    socket.on('signal', handleSignal);

    return () => {
      socket.off('signal', handleSignal);
    };
  }, [socket, isConnected]);

  // Toggle Screen Sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Revert to camera stream
      stopMediaTracks(screenStreamRef.current);
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      if (localStreamRef.current && peerConnectionRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const senders = peerConnectionRef.current.getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'video');
        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack);
        }
      }
    } else {
      // Start screen sharing
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        const videoTrack = stream.getVideoTracks()[0];
        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const sender = senders.find((s) => s.track && s.track.kind === 'video');
          if (sender && videoTrack) {
            await sender.replaceTrack(videoTrack);
          }
        }

        // Listen for user stopping screen share via browser bar
        videoTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    }
  };

  // Close and cleanup call connection
  const leaveCall = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    stopMediaTracks(localStreamRef.current);
    stopMediaTracks(screenStreamRef.current);

    localStreamRef.current = null;
    screenStreamRef.current = null;
    iceCandidatesQueueRef.current = [];

    setLocalStream(null);
    setRemoteStream(null);
    setIsScreenSharing(false);
    setActiveCall(null);
    setConnectionStatus('disconnected');
  }, [setActiveCall]);

  // Callback ref for the local <video> element.
  // Directly sets srcObject when the DOM element mounts — avoids the race condition
  // where useEffect fires before the conditionally-rendered element's ref is assigned.
  const localVideoCallbackRef = useCallback((node) => {
    localVideoElRef.current = node;
    if (node && localStreamRef.current) {
      node.srcObject = localStreamRef.current;
    }
  }, []);

  // Callback ref for the remote <video> element.
  const remoteVideoCallbackRef = useCallback((node) => {
    remoteVideoElRef.current = node;
    if (node && remoteStream) {
      node.srcObject = remoteStream;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStream]);

  // Also keep localStream in sync with the local video element whenever it changes
  useEffect(() => {
    if (localVideoElRef.current && localStream) {
      localVideoElRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Also keep remoteStream in sync with the remote video element whenever it changes
  useEffect(() => {
    if (remoteVideoElRef.current && remoteStream) {
      remoteVideoElRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <WebRtcContext.Provider
      value={{
        localStream,
        remoteStream,
        activeCall: activeCallState,
        isScreenSharing,
        connectionStatus,
        setActiveCall,
        startPeerCall,
        leaveCall,
        toggleScreenShare,
        getUserMedia,
        localVideoCallbackRef,
        remoteVideoCallbackRef,
      }}
    >
      {children}
    </WebRtcContext.Provider>
  );
};
