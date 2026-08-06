import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './SocketContext';

const WebRtcContext = createContext(null);

export const useWebRtc = () => useContext(WebRtcContext);

// Improved ICE servers with more reliable TURN
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // TURN servers - replace with your own or use a free one
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
  iceCandidatePoolSize: 10,
};

// Media constraints for better compatibility
const MEDIA_CONSTRAINTS = {
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
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
  const localVideoElRef = useRef(null);
  const remoteVideoElRef = useRef(null);
  const connectionAttemptsRef = useRef(0);

  // Wrapped setActiveCall that syncs the ref synchronously
  const setActiveCall = useCallback((callData) => {
    if (typeof callData === 'function') {
      const newVal = callData(activeCallRef.current);
      activeCallRef.current = newVal;
      setActiveCallState(newVal);
    } else {
      activeCallRef.current = callData;
      setActiveCallState(callData);
    }
  }, []);

  // Process queued ICE candidates
  const processQueuedCandidates = async (pc) => {
    if (!pc || pc.remoteDescription === null) {
      console.log('Cannot process ICE candidates: remote description not set');
      return;
    }

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

  const stopMediaTracks = (stream) => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
    }
  };

  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: MEDIA_CONSTRAINTS.video,
        audio: MEDIA_CONSTRAINTS.audio,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      if (localVideoElRef.current) {
        localVideoElRef.current.srcObject = stream;
      }
      
      return stream;
    } catch (error) {
      console.error('Error accessing camera and microphone:', error);
      
      // Fallback: try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: MEDIA_CONSTRAINTS.audio,
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        
        if (localVideoElRef.current) {
          localVideoElRef.current.srcObject = audioStream;
        }
        
        return audioStream;
      } catch (audioError) {
        console.error('Error accessing microphone:', audioError);
        alert('Could not access microphone or camera. Please check permissions.');
        return null;
      }
    }
  };

  const initPeerConnection = (partnerUserId, stream) => {
    // Close existing connection
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (e) {
        console.warn('Error closing existing peer connection:', e);
      }
      peerConnectionRef.current = null;
    }

    iceCandidatesQueueRef.current = [];
    connectionAttemptsRef.current = 0;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;
    setConnectionStatus('connecting');

    // Add local tracks
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && isConnected) {
        console.log('Sending ICE candidate to:', partnerUserId);
        socket.emit('signal', {
          to: partnerUserId,
          signalData: { candidate: event.candidate },
        });
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      const [stream] = event.streams;
      
      if (stream) {
        console.log('Remote stream received with tracks:', stream.getTracks().length);
        setRemoteStream(stream);
        
        if (remoteVideoElRef.current) {
          remoteVideoElRef.current.srcObject = stream;
        }
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log('Connection state changed:', pc.connectionState);
      setConnectionStatus(pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        console.log('WebRTC connection established successfully');
        connectionAttemptsRef.current = 0;
      } else if (pc.connectionState === 'failed') {
        console.warn('Connection failed, attempting ICE restart...');
        setConnectionStatus('reconnecting');
        
        if (connectionAttemptsRef.current < 3) {
          connectionAttemptsRef.current++;
          try {
            pc.restartIce();
          } catch (e) {
            console.error('ICE restart failed:', e);
            setConnectionStatus('disconnected');
          }
        } else {
          setConnectionStatus('disconnected');
        }
      } else if (pc.connectionState === 'closed') {
        setConnectionStatus('disconnected');
      }
    };

    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'failed') {
        console.warn('ICE connection failed');
        if (connectionAttemptsRef.current < 3) {
          connectionAttemptsRef.current++;
          try {
            pc.restartIce();
          } catch (e) {
            console.error('ICE restart error:', e);
          }
        }
      }
    };

    // Monitor ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState);
    };

    return pc;
  };

  const startPeerCall = async (callData) => {
    const { partnerUserId } = callData;
    
    // Set active call first
    setActiveCall(callData);

    // Get user media
    const stream = await getUserMedia();
    if (!stream) {
      console.error('Failed to get user media, cannot start call');
      return;
    }

    // Initialize peer connection
    const pc = initPeerConnection(partnerUserId, stream);

    try {
      // Create offer with proper options
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      };
      
      const offer = await pc.createOffer(offerOptions);
      await pc.setLocalDescription(offer);

      console.log('Sending WebRTC offer to:', partnerUserId);
      socket.emit('signal', {
        to: partnerUserId,
        signalData: { sdp: offer },
      });
    } catch (err) {
      console.error('Error creating WebRTC offer:', err);
      // Try again with simpler options
      try {
        const simpleOffer = await pc.createOffer();
        await pc.setLocalDescription(simpleOffer);
        socket.emit('signal', {
          to: partnerUserId,
          signalData: { sdp: simpleOffer },
        });
      } catch (retryErr) {
        console.error('Retry failed:', retryErr);
      }
    }
  };

  // Handle incoming signaling messages
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleSignal = async ({ from, signalData }) => {
      const currentCall = activeCallRef.current;
      
      // Validate call exists
      if (!currentCall) {
        console.warn('Received WebRTC signal but no active call. from:', from);
        return;
      }

      // Validate caller matches partner
      if (currentCall.partnerUserId && 
          String(currentCall.partnerUserId) !== String(from)) {
        console.warn('Received signal from non-partner user:', from);
        return;
      }

      let pc = peerConnectionRef.current;

      try {
        if (signalData.sdp) {
          const sdp = new RTCSessionDescription(signalData.sdp);
          
          if (sdp.type === 'offer') {
            console.log('Received WebRTC offer from:', from);
            
            // Get or create stream
            let stream = localStreamRef.current;
            if (!stream) {
              stream = await getUserMedia();
            }

            // Create peer connection if not exists
            if (!pc || pc.signalingState === 'closed') {
              pc = initPeerConnection(from, stream);
              // Important: Set partnerUserId from the offer sender
              if (!currentCall.partnerUserId) {
                setActiveCall({ ...currentCall, partnerUserId: from });
              }
            }

            // Set remote description
            await pc.setRemoteDescription(sdp);
            await processQueuedCandidates(pc);

            // Create answer with proper options
            const answerOptions = {
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            };
            
            const answer = await pc.createAnswer(answerOptions);
            await pc.setLocalDescription(answer);

            console.log('Sending WebRTC answer to:', from);
            socket.emit('signal', {
              to: from,
              signalData: { sdp: answer },
            });
            
          } else if (sdp.type === 'answer') {
            console.log('Received WebRTC answer from:', from);
            
            if (pc && pc.signalingState !== 'closed') {
              await pc.setRemoteDescription(sdp);
              await processQueuedCandidates(pc);
            } else {
              console.warn('No valid peer connection for answer');
            }
          }
        } else if (signalData.candidate) {
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
              console.log('Added ICE candidate successfully');
            } catch (err) {
              console.warn('Error adding ICE candidate:', err);
            }
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
  }, [socket, isConnected, setActiveCall]);

  // Toggle Screen Sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      stopMediaTracks(screenStreamRef.current);
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      if (localStreamRef.current && peerConnectionRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const senders = peerConnectionRef.current.getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'video');
        if (sender && videoTrack) {
          try {
            await sender.replaceTrack(videoTrack);
          } catch (err) {
            console.error('Error replacing track:', err);
          }
        }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true,
          audio: false,
        });
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

        videoTrack.onended = () => {
          toggleScreenShare();
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    }
  };

  // Close and cleanup call
  const leaveCall = useCallback(() => {
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (err) {
        console.warn('Error closing peer connection:', err);
      }
      peerConnectionRef.current = null;
    }

    stopMediaTracks(localStreamRef.current);
    stopMediaTracks(screenStreamRef.current);

    localStreamRef.current = null;
    screenStreamRef.current = null;
    iceCandidatesQueueRef.current = [];
    connectionAttemptsRef.current = 0;

    setLocalStream(null);
    setRemoteStream(null);
    setIsScreenSharing(false);
    setActiveCall(null);
    setConnectionStatus('disconnected');

    if (remoteVideoElRef.current) {
      remoteVideoElRef.current.srcObject = null;
    }
    if (localVideoElRef.current) {
      localVideoElRef.current.srcObject = null;
    }
  }, [setActiveCall]);

  // Callback refs for video elements
  const localVideoCallbackRef = useCallback((node) => {
    localVideoElRef.current = node;
    if (node && localStreamRef.current) {
      node.srcObject = localStreamRef.current;
    }
  }, []);

  const remoteVideoCallbackRef = useCallback((node) => {
    remoteVideoElRef.current = node;
    if (node && remoteStream) {
      node.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Sync video elements with streams
  useEffect(() => {
    if (localVideoElRef.current && localStream) {
      localVideoElRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoElRef.current && remoteStream) {
      remoteVideoElRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, [leaveCall]);

  const value = {
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
  };

  return (
    <WebRtcContext.Provider value={value}>
      {children}
    </WebRtcContext.Provider>
  );
};

export default WebRtcProvider;

// import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
// import { useSocket } from './SocketContext';

// const WebRtcContext = createContext(null);

// export const useWebRtc = () => useContext(WebRtcContext);

// const ICE_SERVERS = {
//   iceServers: [
//     { urls: 'stun:stun.l.google.com:19302' },
//     { urls: 'stun:stun1.l.google.com:19302' },
//     // TURN servers for NAT traversal (needed for LAN / cross-device connectivity)
//     {
//       urls: 'turn:openrelay.metered.ca:80',
//       username: 'openrelayproject',
//       credential: 'openrelayproject',
//     },
//     {
//       urls: 'turn:openrelay.metered.ca:443',
//       username: 'openrelayproject',
//       credential: 'openrelayproject',
//     },
//     {
//       urls: 'turn:openrelay.metered.ca:443?transport=tcp',
//       username: 'openrelayproject',
//       credential: 'openrelayproject',
//     },
//   ],
// };

// export const WebRtcProvider = ({ children }) => {
//   const { socket, isConnected } = useSocket();
//   const [localStream, setLocalStream] = useState(null);
//   const [remoteStream, setRemoteStream] = useState(null);
//   const [isScreenSharing, setIsScreenSharing] = useState(false);
//   const [activeCallState, setActiveCallState] = useState(null);
//   const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
//   const peerConnectionRef = useRef(null);
//   const localStreamRef = useRef(null);
//   const screenStreamRef = useRef(null);
//   const activeCallRef = useRef(null);
//   const iceCandidatesQueueRef = useRef([]);
//   // Refs to hold the actual DOM <video> elements for callback-ref binding
//   const localVideoElRef = useRef(null);
//   const remoteVideoElRef = useRef(null);

//   // Wrapped setActiveCall that ALWAYS syncs the ref immediately (synchronously)
//   // This is the critical fix — React's setState is async, but the ref must be
//   // available instantly for the signal handler to accept incoming WebRTC messages.
//   const setActiveCall = useCallback((callData) => {
//     if (typeof callData === 'function') {
//       // Handle functional updates: setActiveCall(prev => ...)
//       const newVal = callData(activeCallRef.current);
//       activeCallRef.current = newVal;
//       setActiveCallState(newVal);
//     } else {
//       activeCallRef.current = callData;
//       setActiveCallState(callData);
//     }
//   }, []);

//   // Process queued ICE candidates after setting remote description
//   const processQueuedCandidates = async (pc) => {
//     while (iceCandidatesQueueRef.current.length > 0) {
//       const candidate = iceCandidatesQueueRef.current.shift();
//       try {
//         await pc.addIceCandidate(new RTCIceCandidate(candidate));
//         console.log('Processed queued ICE candidate');
//       } catch (err) {
//         console.error('Error adding queued ICE candidate:', err);
//       }
//     }
//   };

//   // Stop all media tracks
//   const stopMediaTracks = (stream) => {
//     if (stream) {
//       stream.getTracks().forEach((track) => track.stop());
//     }
//   };

//   // Get user media (camera and microphone)
//   const getUserMedia = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: true,
//         audio: true,
//       });
//       localStreamRef.current = stream;
//       setLocalStream(stream);
//       return stream;
//     } catch (error) {
//       console.error('Error accessing camera and microphone:', error);
//       // Fallback to audio only if camera is blocked/unavailable
//       try {
//         const audioStream = await navigator.mediaDevices.getUserMedia({
//           video: false,
//           audio: true,
//         });
//         localStreamRef.current = audioStream;
//         setLocalStream(audioStream);
//         return audioStream;
//       } catch (audioError) {
//         console.error('Error accessing microphone:', audioError);
//         alert('Could not access microphone or camera. Please check permissions.');
//         return null;
//       }
//     }
//   };

//   // Initialize RTCPeerConnection
//   const initPeerConnection = (partnerUserId, stream) => {
//     // Close any existing peer connection first
//     if (peerConnectionRef.current) {
//       try { peerConnectionRef.current.close(); } catch (e) { /* ignore */ }
//     }

//     iceCandidatesQueueRef.current = [];
//     const pc = new RTCPeerConnection(ICE_SERVERS);
//     peerConnectionRef.current = pc;
//     setConnectionStatus('connecting');

//     // Add local tracks to peer connection
//     if (stream) {
//       stream.getTracks().forEach((track) => {
//         pc.addTrack(track, stream);
//       });
//     }

//     // Handle ICE Candidates
//     pc.onicecandidate = (event) => {
//       if (event.candidate && socket) {
//         socket.emit('signal', {
//           to: partnerUserId,
//           signalData: { candidate: event.candidate },
//         });
//       }
//     };

//     // Handle incoming stream tracks
//     pc.ontrack = (event) => {
//       const track = event.track;
//       const stream = event.streams[0];
//       console.log(`Received remote track: kind=${track.kind}, id=${track.id}, readyState=${track.readyState}`);
//       console.log(`Remote stream id=${stream?.id}, tracks=${stream?.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', ')}`);
//       setRemoteStream(stream);
//       // Directly bind to the video element if it already exists (callback ref may have already fired)
//       if (remoteVideoElRef.current && stream) {
//         remoteVideoElRef.current.srcObject = stream;
//       }
//     };

//     // Monitor connection states
//     pc.onconnectionstatechange = () => {
//       console.log('PeerConnection state:', pc.connectionState);
//       setConnectionStatus(pc.connectionState);
//       if (pc.connectionState === 'failed') {
//         console.warn('PeerConnection failed — attempting ICE restart...');
//         setConnectionStatus('reconnecting');
//         // Attempt ICE restart
//         try {
//           pc.restartIce();
//         } catch (e) {
//           console.error('ICE restart failed:', e);
//           setConnectionStatus('disconnected');
//         }
//       } else if (pc.connectionState === 'closed') {
//         setConnectionStatus('disconnected');
//       }
//     };

//     // Also monitor ICE connection state for better debugging
//     pc.oniceconnectionstatechange = () => {
//       console.log('ICE connection state:', pc.iceConnectionState);
//       if (pc.iceConnectionState === 'failed') {
//         console.warn('ICE connection failed — attempting ICE restart...');
//         try {
//           pc.restartIce();
//         } catch (e) {
//           console.error('ICE restart error:', e);
//         }
//       }
//     };

//     // Monitor ICE gathering state
//     pc.onicegatheringstatechange = () => {
//       console.log('ICE gathering state:', pc.iceGatheringState);
//     };

//     return pc;
//   };

//   // Start peer call (the initiator — typically the agent)
//   const startPeerCall = async (callData) => {
//     const { partnerUserId } = callData;
    
//     // CRITICAL: Set the ref synchronously BEFORE any async work
//     // so that incoming signals won't be rejected during getUserMedia/offer creation
//     setActiveCall(callData);

//     const stream = await getUserMedia();
//     if (!stream) {
//       console.error('Failed to get user media, cannot start call');
//       return;
//     }

//     const pc = initPeerConnection(partnerUserId, stream);

//     try {
//       const offer = await pc.createOffer();
//       await pc.setLocalDescription(offer);

//       console.log('Sending WebRTC offer to', partnerUserId);
//       socket.emit('signal', {
//         to: partnerUserId,
//         signalData: { sdp: offer },
//       });
//     } catch (err) {
//       console.error('Error creating WebRTC offer:', err);
//     }
//   };

//   // Handle incoming signaling messages
//   useEffect(() => {
//     if (!socket || !isConnected) return;

//     const handleSignal = async ({ from, signalData }) => {
//       let currentCall = activeCallRef.current;
      
//       // Auto-assign partnerUserId if call is active but partnerUserId is missing/empty
//       if (currentCall && (!currentCall.partnerUserId || currentCall.partnerUserId === '')) {
//         console.log('Auto-assigning partnerUserId to', from);
//         currentCall.partnerUserId = from;
//         setActiveCall({ ...currentCall, partnerUserId: from });
//       }

//       // If no active call at all, reject
//       if (!currentCall) {
//         console.warn('Received WebRTC signal but no active call. from:', from);
//         return;
//       }

//       // If partnerUserId is set but doesn't match, reject (compare as strings for safety)
//       if (currentCall.partnerUserId && 
//           String(currentCall.partnerUserId) !== String(from)) {
//         console.warn('Received WebRTC signal from non-partner user:', from, 'expected:', currentCall.partnerUserId);
//         return;
//       }

//       let pc = peerConnectionRef.current;

//       try {
//         if (signalData.sdp) {
//           const sdp = new RTCSessionDescription(signalData.sdp);
          
//           if (sdp.type === 'offer') {
//             console.log('Received WebRTC offer from', from, '— creating answer...');
//             let stream = localStreamRef.current;
//             if (!stream) {
//               stream = await getUserMedia();
//             }

//             if (!pc || pc.signalingState === 'closed') {
//               pc = initPeerConnection(from, stream);
//             }

//             await pc.setRemoteDescription(sdp);
//             await processQueuedCandidates(pc);

//             const answer = await pc.createAnswer();
//             await pc.setLocalDescription(answer);

//             console.log('Sending WebRTC answer to', from);
//             socket.emit('signal', {
//               to: from,
//               signalData: { sdp: answer },
//             });
//           } else if (sdp.type === 'answer') {
//             console.log('Received WebRTC answer from', from);
//             if (pc && pc.signalingState !== 'closed') {
//               await pc.setRemoteDescription(sdp);
//               await processQueuedCandidates(pc);
//             }
//           }
//         } else if (signalData.candidate) {
//           if (pc && pc.remoteDescription && pc.remoteDescription.type) {
//             await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
//           } else {
//             console.log('Queueing ICE candidate until remote description is set');
//             iceCandidatesQueueRef.current.push(signalData.candidate);
//           }
//         }
//       } catch (err) {
//         console.error('Error handling WebRTC signaling:', err);
//       }
//     };

//     socket.on('signal', handleSignal);

//     return () => {
//       socket.off('signal', handleSignal);
//     };
//   }, [socket, isConnected]);

//   // Toggle Screen Sharing
//   const toggleScreenShare = async () => {
//     if (isScreenSharing) {
//       // Revert to camera stream
//       stopMediaTracks(screenStreamRef.current);
//       screenStreamRef.current = null;
//       setIsScreenSharing(false);

//       if (localStreamRef.current && peerConnectionRef.current) {
//         const videoTrack = localStreamRef.current.getVideoTracks()[0];
//         const senders = peerConnectionRef.current.getSenders();
//         const sender = senders.find((s) => s.track && s.track.kind === 'video');
//         if (sender && videoTrack) {
//           await sender.replaceTrack(videoTrack);
//         }
//       }
//     } else {
//       // Start screen sharing
//       try {
//         const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
//         screenStreamRef.current = stream;
//         setIsScreenSharing(true);

//         const videoTrack = stream.getVideoTracks()[0];
//         if (peerConnectionRef.current) {
//           const senders = peerConnectionRef.current.getSenders();
//           const sender = senders.find((s) => s.track && s.track.kind === 'video');
//           if (sender && videoTrack) {
//             await sender.replaceTrack(videoTrack);
//           }
//         }

//         // Listen for user stopping screen share via browser bar
//         videoTrack.onended = () => {
//           toggleScreenShare();
//         };
//       } catch (error) {
//         console.error('Error sharing screen:', error);
//       }
//     }
//   };

//   // Close and cleanup call connection
//   const leaveCall = useCallback(() => {
//     if (peerConnectionRef.current) {
//       peerConnectionRef.current.close();
//       peerConnectionRef.current = null;
//     }

//     stopMediaTracks(localStreamRef.current);
//     stopMediaTracks(screenStreamRef.current);

//     localStreamRef.current = null;
//     screenStreamRef.current = null;
//     iceCandidatesQueueRef.current = [];

//     setLocalStream(null);
//     setRemoteStream(null);
//     setIsScreenSharing(false);
//     setActiveCall(null);
//     setConnectionStatus('disconnected');
//   }, [setActiveCall]);

//   // Callback ref for the local <video> element.
//   // Directly sets srcObject when the DOM element mounts — avoids the race condition
//   // where useEffect fires before the conditionally-rendered element's ref is assigned.
//   const localVideoCallbackRef = useCallback((node) => {
//     localVideoElRef.current = node;
//     if (node && localStreamRef.current) {
//       node.srcObject = localStreamRef.current;
//     }
//   }, []);

//   // Callback ref for the remote <video> element.
//   const remoteVideoCallbackRef = useCallback((node) => {
//     remoteVideoElRef.current = node;
//     if (node && remoteStream) {
//       node.srcObject = remoteStream;
//     }
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [remoteStream]);

//   // Also keep localStream in sync with the local video element whenever it changes
//   useEffect(() => {
//     if (localVideoElRef.current && localStream) {
//       localVideoElRef.current.srcObject = localStream;
//     }
//   }, [localStream]);

//   // Also keep remoteStream in sync with the remote video element whenever it changes
//   useEffect(() => {
//     if (remoteVideoElRef.current && remoteStream) {
//       remoteVideoElRef.current.srcObject = remoteStream;
//     }
//   }, [remoteStream]);

//   return (
//     <WebRtcContext.Provider
//       value={{
//         localStream,
//         remoteStream,
//         activeCall: activeCallState,
//         isScreenSharing,
//         connectionStatus,
//         setActiveCall,
//         startPeerCall,
//         leaveCall,
//         toggleScreenShare,
//         getUserMedia,
//         localVideoCallbackRef,
//         remoteVideoCallbackRef,
//       }}
//     >
//       {children}
//     </WebRtcContext.Provider>
//   );
// };
