import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './SocketContext';

const WebRtcContext = createContext(null);

export const useWebRtc = () => useContext(WebRtcContext);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:8443' },
    { urls: 'stun:stun.services.mozilla.com:3478' },
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
  const isCallerRef = useRef(false); // Track if this peer is the caller
  const silentBargeInPeersRef = useRef(new Map()); // Map adminUserId -> RTCPeerConnection for silent barge-in

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

  const isPartnerScreenSharingRef = useRef(false);

  const updateRemoteStreamState = useCallback(() => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const receivers = pc.getReceivers();
    const activeTracks = receivers
      .map((r) => r.track)
      .filter((t) => t && t.readyState === 'live' && !t.muted);

    const hasVideo = isPartnerScreenSharingRef.current && activeTracks.some((t) => t.kind === 'video');

    if (hasVideo && activeTracks.length > 0) {
      const newStream = new MediaStream(activeTracks);
      setRemoteStream(newStream);
      if (remoteVideoElRef.current) {
        remoteVideoElRef.current.srcObject = newStream;
      }
      if (remoteAudioElRef.current) {
        remoteAudioElRef.current.srcObject = newStream;
        remoteAudioElRef.current.play().catch((e) => console.warn('Audio play error:', e));
      }
    } else {
      const audioTracks = receivers
        .map((r) => r.track)
        .filter((t) => t && t.readyState === 'live' && t.kind === 'audio');
      const audioOnlyStream = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
      setRemoteStream(audioOnlyStream);
      if (remoteVideoElRef.current) {
        remoteVideoElRef.current.srcObject = audioOnlyStream;
      }
      if (remoteAudioElRef.current) {
        remoteAudioElRef.current.srcObject = audioOnlyStream;
        remoteAudioElRef.current.play().catch((e) => console.warn('Audio play error:', e));
      }
    }
  }, []);

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
        video: false,
        audio: MEDIA_CONSTRAINTS.audio,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check your browser audio permissions.');
      return null;
    }
  };

  const initPeerConnection = (partnerUserId, stream, isCaller = false) => {
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
    isCallerRef.current = isCaller;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;
    setConnectionStatus('connecting');

    // Add local tracks (audio)
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Add video transceiver to reserve video m-line for customer screen sharing
    try {
      pc.addTransceiver('video', { direction: 'sendrecv' });
    } catch (trigErr) {
      console.warn('Transceiver add warning:', trigErr);
    }

    // Handle ICE candidates - CRITICAL FIX: Always send candidates when available
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && isConnected) {
        console.log('Sending ICE candidate to:', partnerUserId);
        socket.emit('signal', {
          to: partnerUserId,
          signalData: { candidate: event.candidate },
        });
      }
    };

    // Handle incoming tracks - CRITICAL FIX: Properly construct stream from all active receivers
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);

      updateRemoteStreamState();

      event.track.onmute = () => {
        console.log('Remote track muted:', event.track.kind);
        updateRemoteStreamState();
      };

      event.track.onunmute = () => {
        console.log('Remote track unmuted:', event.track.kind);
        updateRemoteStreamState();
      };

      event.track.onended = () => {
        console.log('Remote track ended:', event.track.kind);
        updateRemoteStreamState();
      };
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

    // Monitor signaling state
    pc.onsignalingstatechange = () => {
      console.log('Signaling state:', pc.signalingState);
    };

    return pc;
  };

  // Start peer call (initiator)
  const startPeerCall = async (callData) => {
    const { partnerUserId, callId, roomId, role } = callData;

    // Set active call
    setActiveCall(callData);

    // Get user media
    const stream = await getUserMedia();
    if (!stream) {
      console.error('Failed to get user media, cannot start call');
      return;
    }

    // Initialize peer connection - this peer is the caller
    const pc = initPeerConnection(partnerUserId, stream, true);

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

      // Also send the call assignment to the partner if this is the agent initiating
      if (role === 'Agent') {
        socket.emit('call-assigned', {
          callId,
          roomId,
          partnerUserId: partnerUserId,
          partnerName: callData.partnerName,
        });
      }
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
      if (signalData.isBargeIn) {
        const pc = silentBargeInPeersRef.current.get(from);
        if (pc && pc.signalingState !== 'closed') {
          if (signalData.sdp && signalData.sdp.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
          } else if (signalData.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
            } catch (candErr) {
              console.warn('Silent barge-in candidate error:', candErr);
            }
          }
        }
        return;
      }

      let currentCall = activeCallRef.current;

      // Auto-populate active call if an incoming offer arrives before React state update
      if (!currentCall) {
        if (signalData.sdp && signalData.sdp.type === 'offer') {
          console.log('Received WebRTC offer without active call state. Auto-populating call context for:', from);
          currentCall = {
            partnerUserId: from,
            role: 'Customer',
          };
          setActiveCall(currentCall);
        } else {
          console.warn('Received WebRTC signal but no active call. from:', from);
          return;
        }
      }

      // Validate caller matches partner (or allow incoming offer from transferred partner)
      if (currentCall.partnerUserId && String(currentCall.partnerUserId) !== String(from)) {
        if (signalData.sdp && signalData.sdp.type === 'offer') {
          console.log('Received new WebRTC offer from new partner (e.g. Call Transfer):', from);
          currentCall = { ...currentCall, partnerUserId: from };
          setActiveCall(currentCall);
          if (peerConnectionRef.current) {
            try {
              peerConnectionRef.current.close();
            } catch (e) {
              console.warn('Error closing peer connection during partner transfer:', e);
            }
            peerConnectionRef.current = null;
          }
        } else {
          console.warn('Received signal from non-partner user:', from, 'expected:', currentCall.partnerUserId);
          return;
        }
      }

      let pc = peerConnectionRef.current;

      try {
        if (signalData.screenShareStopped) {
          console.log('Received notification: partner stopped screen sharing');
          isPartnerScreenSharingRef.current = false;
          updateRemoteStreamState();
          return;
        }

        if (signalData.screenShareStarted) {
          console.log('Received notification: partner started screen sharing');
          isPartnerScreenSharingRef.current = true;
        }

        if (signalData.sdp) {
          const sdp = new RTCSessionDescription(signalData.sdp);

          if (sdp.type === 'offer') {
            console.log('Received WebRTC offer from:', from);

            // Get or create stream
            let stream = localStreamRef.current;
            if (!stream) {
              stream = await getUserMedia();
            }

            // Create peer connection if not exists - this peer is the answerer
            if (!pc || pc.signalingState === 'closed') {
              pc = initPeerConnection(from, stream, false);
              // Important: Set partnerUserId from the offer sender
              if (!currentCall.partnerUserId) {
                setActiveCall({ ...currentCall, partnerUserId: from });
              }
            }

            // Glare handling: if local offer was sent simultaneously, rollback local description
            if (pc.signalingState === 'have-local-offer') {
              console.warn('WebRTC Glare detected: Both peers sent offers simultaneously. Rolling back local offer...');
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch (e) {
                console.warn('Rollback failed, re-initializing peer connection:', e);
                pc = initPeerConnection(from, stream, false);
              }
            }

            await pc.setRemoteDescription(sdp);
            await processQueuedCandidates(pc);

            if (pc.getReceivers) {
              pc.getReceivers().forEach((r) => {
                if (r.track) {
                  r.track.onmute = () => updateRemoteStreamState();
                  r.track.onunmute = () => updateRemoteStreamState();
                  r.track.onended = () => updateRemoteStreamState();
                }
              });
            }
            updateRemoteStreamState();

            // Only create answer if signalingState is in have-remote-offer state
            if (pc.signalingState === 'have-remote-offer') {
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
            } else {
              console.warn('Cannot create answer: signalingState is', pc.signalingState);
            }

          } else if (sdp.type === 'answer') {
            console.log('Received WebRTC answer from:', from);

            if (pc && pc.signalingState !== 'closed') {
              await pc.setRemoteDescription(sdp);
              await processQueuedCandidates(pc);

              if (pc.getReceivers) {
                pc.getReceivers().forEach((r) => {
                  if (r.track) {
                    r.track.onmute = () => updateRemoteStreamState();
                    r.track.onunmute = () => updateRemoteStreamState();
                    r.track.onended = () => updateRemoteStreamState();
                  }
                });
              }
              updateRemoteStreamState();
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

    const handleSilentBargeInRequested = async ({ adminUserId }) => {
      if (!adminUserId) return;
      console.log('Silent barge-in requested by Admin:', adminUserId);

      if (silentBargeInPeersRef.current.has(adminUserId)) {
        try {
          silentBargeInPeersRef.current.get(adminUserId).close();
        } catch (e) {}
        silentBargeInPeersRef.current.delete(adminUserId);
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      silentBargeInPeersRef.current.set(adminUserId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getVideoTracks().forEach((track) => {
          pc.addTrack(track, screenStreamRef.current);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && isConnected) {
          socket.emit('signal', {
            to: adminUserId,
            signalData: { candidate: event.candidate, isBargeIn: true, fromUserId: socket.userId },
          });
        }
      };

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);

        socket.emit('signal', {
          to: adminUserId,
          signalData: { sdp: offer, isBargeIn: true, fromUserId: socket.userId },
        });
      } catch (err) {
        console.error('Error creating silent barge-in offer:', err);
      }
    };

    const handleSilentBargeInStopped = ({ adminUserId }) => {
      if (adminUserId && silentBargeInPeersRef.current.has(adminUserId)) {
        try {
          silentBargeInPeersRef.current.get(adminUserId).close();
        } catch (e) {}
        silentBargeInPeersRef.current.delete(adminUserId);
      }
    };

    socket.on('signal', handleSignal);
    socket.on('silent-barge-in-requested', handleSilentBargeInRequested);
    socket.on('silent-barge-in-stopped', handleSilentBargeInStopped);

    return () => {
      socket.off('signal', handleSignal);
      socket.off('silent-barge-in-requested', handleSilentBargeInRequested);
      socket.off('silent-barge-in-stopped', handleSilentBargeInStopped);
    };
  }, [socket, isConnected, setActiveCall, updateRemoteStreamState, isScreenSharing]);

  // Helper to stop screen sharing
  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      stopMediaTracks(screenStreamRef.current);
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);

    const pc = peerConnectionRef.current;
    if (pc) {
      const videoTransceiver = pc.getTransceivers().find(
        (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
      );
      const sender = videoTransceiver?.sender || pc.getSenders().find((s) => s.track?.kind === 'video');

      if (sender) {
        const cameraStream = localStreamRef.current;
        const cameraVideoTrack = cameraStream?.getVideoTracks()[0];

        if (cameraVideoTrack) {
          try {
            await sender.replaceTrack(cameraVideoTrack);
            console.log('Replaced screen share with camera track');
          } catch (err) {
            console.warn('Error replacing track with camera:', err);
          }
        } else {
          try {
            await sender.replaceTrack(null);
            console.log('Cleared video track on sender via replaceTrack(null)');
          } catch (err) {
            console.warn('Error clearing video track on sender:', err);
          }
        }
      }

      // Notify remote peer immediately that screen sharing has stopped
      const partnerId = activeCallRef.current?.partnerUserId;
      if (partnerId && socket && isConnected) {
        socket.emit('signal', {
          to: partnerId,
          signalData: { screenShareStopped: true },
        });
      }

      // Trigger SDP renegotiation so remote peer updates stream state
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);

        if (partnerId && socket && isConnected) {
          console.log('Sending renegotiation offer after stopping screen share to:', partnerId);
          socket.emit('signal', {
            to: partnerId,
            signalData: { sdp: offer },
          });
        }
      } catch (renegErr) {
        console.warn('Renegotiation after stopping screen share failed:', renegErr);
      }
    }
  }, [socket, isConnected]);

  // Toggle Screen Sharing (For Customer Only)
  const toggleScreenShare = async () => {
    if (isScreenSharing || screenStreamRef.current) {
      await stopScreenShare();
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert(
          'Screen sharing is available on Desktop web browsers (Windows/macOS Chrome, Edge, Safari, Firefox).\n\nMobile web browsers (iOS/Android) restrict screen recording for security reasons.'
        );
        setIsScreenSharing(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        });

        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        const videoTrack = stream.getVideoTracks()[0];

        if (peerConnectionRef.current && videoTrack) {
          const pc = peerConnectionRef.current;

          const videoTransceiver = pc.getTransceivers().find(
            (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
          );

          if (videoTransceiver) {
            videoTransceiver.direction = 'sendrecv';
          }

          let sender = videoTransceiver?.sender || pc.getSenders().find((s) => s.track?.kind === 'video');

          if (sender) {
            await sender.replaceTrack(videoTrack);
            console.log('Replaced track on existing video sender for screen share');
          } else {
            sender = pc.addTrack(videoTrack, stream);
            console.log('Added new video track sender for screen share');
          }

          // Trigger renegotiation offer so remote receives the new video track
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);

          const partnerId = activeCallRef.current?.partnerUserId;
          if (partnerId && socket && isConnected) {
            console.log('Sending renegotiation offer for screen share to:', partnerId);
            socket.emit('signal', {
              to: partnerId,
              signalData: { screenShareStarted: true, sdp: offer },
            });
          }
        }

        // Handle user stopping screen share via browser floating bar
        videoTrack.onended = () => {
          console.log('Screen sharing ended by user browser control');
          stopScreenShare();
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
        setIsScreenSharing(false);
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

  const remoteAudioElRef = useRef(null);

  useEffect(() => {
    if (remoteAudioElRef.current && remoteStream) {
      remoteAudioElRef.current.srcObject = remoteStream;
      remoteAudioElRef.current.play().catch((e) => console.warn('Remote audio playback:', e));
    }
  }, [remoteStream]);

  return (
    <WebRtcContext.Provider value={value}>
      {/* Background audio element for seamless continuous remote voice playback */}
      <audio ref={remoteAudioElRef} autoPlay playsInline style={{ display: 'none' }} />
      {children}
    </WebRtcContext.Provider>
  );
};

export default WebRtcProvider;