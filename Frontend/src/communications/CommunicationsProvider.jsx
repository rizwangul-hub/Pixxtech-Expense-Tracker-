import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Realtime } from 'ably';
import { Phone, PhoneOff, Video, Mic, MicOff, Camera, CameraOff, MessagesSquare, X } from 'lucide-react';
import { communicationsAPI } from '../services/api.js';

const CommunicationsContext = createContext(null);
const allowed = (user) => {
  if (!user) return false;
  const adminEmail = import.meta.env.VITE_COMMUNICATION_ADMIN_EMAIL?.trim().toLowerCase();
  const dataEntryEmail = import.meta.env.VITE_COMMUNICATION_DATA_ENTRY_EMAIL?.trim().toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  if (adminEmail || dataEntryEmail) {
    return (adminEmail && email === adminEmail && user.role === 'ADMIN')
      || (dataEntryEmail && email === dataEntryEmail && user.role === 'DATA_ENTRY');
  }
  const name = String(user.name || '').trim().toLowerCase();
  return (name === 'khurshid anwar' && user.role === 'ADMIN')
    || (name === 'sarfraz' && user.role === 'DATA_ENTRY');
};

export const canUseCommunications = allowed;
export const useCommunications = () => useContext(CommunicationsContext) || {};

const dataOf = (response) => response?.data || response || {};
const callOf = (value) => value?.call || value?.data?.call || value?.data || value;
const messageOf = (value) => value?.message || value?.data?.message || value?.data || value;

export function CommunicationsProvider({ user, onOpenMessages, children }) {
  const authorized = allowed(user);
  const [bootstrap, setBootstrap] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connection, setConnection] = useState('offline');
  const [toast, setToast] = useState(null);
  const [call, setCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callError, setCallError] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const realtimeRef = useRef(null);
  const channelRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const activeCallRef = useRef(null);
  const seenEventsRef = useRef(new Set());
  const conversationOpenRef = useRef(false);
  const timeoutRef = useRef(null);
  const toastTimerRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const onOpenMessagesRef = useRef(onOpenMessages);
  onOpenMessagesRef.current = onOpenMessages;

  const cleanupMedia = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    [localStreamRef.current, remoteStreamRef.current].forEach((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
    });
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setMuted(false);
    setCameraEnabled(true);
  }, []);

  const publishCallStatus = useCallback(async (id, action) => {
    if (!id) return;
    try {
      await communicationsAPI.updateCall(id, { action });
    } catch (error) {
      setCallError(error?.response?.data?.message || error.message || 'Could not update call status.');
    }
  }, []);

  const finishCall = useCallback(async (action) => {
    const current = activeCallRef.current;
    if (!current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    await publishCallStatus(current.id, action);
    cleanupMedia();
    activeCallRef.current = { ...current, status: action };
    setCall({ ...current, status: action, connected: false });
    window.setTimeout(() => {
      if (activeCallRef.current?.id === current.id) {
        activeCallRef.current = null;
        setCall(null);
      }
    }, 1600);
  }, [cleanupMedia, publishCallStatus]);

  const addRemoteCandidate = useCallback(async (payload) => {
    if (!payload || !pcRef.current) return;
    try {
      const candidate = new RTCIceCandidate(payload.candidate || payload);
      if (pcRef.current.remoteDescription) await pcRef.current.addIceCandidate(candidate);
      else pendingCandidatesRef.current.push(candidate);
    } catch (error) {
      console.warn('Unable to apply remote ICE candidate', error);
    }
  }, []);

  const processSignal = useCallback(async (signal) => {
    const current = activeCallRef.current;
    if (!current || String(signal?.callId || signal?.call?.id || '') !== String(current.id)) return;
    const kind = signal.kind;
    const payload = signal.payload;
    try {
      if (kind === 'offer') {
        pendingOfferRef.current = payload;
        if (pcRef.current && current.direction === 'outgoing') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload));
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          await communicationsAPI.sendSignal(current.id, { kind: 'answer', payload: pcRef.current.localDescription });
        }
      } else if (kind === 'answer' && pcRef.current && current.direction === 'outgoing') {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload));
      } else if (kind === 'ice-candidate') {
        await addRemoteCandidate(payload);
      }
    } catch (error) {
      setCallError(error?.message || 'Could not establish the call connection.');
    }
  }, [addRemoteCandidate]);

  const createPeerConnection = useCallback((callInfo, stream) => {
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('This browser does not support secure audio/video calls.');
    }
    const pc = new RTCPeerConnection({ iceServers: bootstrap?.iceServers || [] });
    pcRef.current = pc;
    remoteStreamRef.current = new MediaStream();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (event) => {
      const remote = remoteStreamRef.current;
      if (event.streams?.[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!remote.getTracks().some((existing) => existing.id === track.id)) remote.addTrack(track);
        });
      } else if (!remote.getTracks().some((existing) => existing.id === event.track.id)) {
        remote.addTrack(event.track);
      }
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        communicationsAPI.sendSignal(callInfo.id, {
          kind: 'ice-candidate',
          payload: event.candidate.toJSON(),
        }).catch((error) => setCallError(error?.response?.data?.message || 'Network signal could not be sent.'));
      }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setCall((previous) => previous?.id === callInfo.id ? { ...previous, connected: true, connectionState: state } : previous);
        activeCallRef.current = { ...activeCallRef.current, connected: true, connectionState: state };
        clearTimeout(timeoutRef.current);
      } else {
        setCall((previous) => previous?.id === callInfo.id ? { ...previous, connected: false, connectionState: state } : previous);
        if (state === 'failed') setCallError('Call connection failed. Check your network and try again.');
      }
    };
    return pc;
  }, [bootstrap]);

  const acquireMedia = useCallback(async (type) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Calls require a secure browser (HTTPS) with microphone and camera support.');
    }
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'VIDEO',
    });
  }, []);

  const startCall = useCallback(async (type) => {
    setCallError('');
    let stream;
    try {
      stream = await acquireMedia(type);
      localStreamRef.current = stream;
      const result = dataOf(await communicationsAPI.createCall({ type }));
      const created = callOf(result);
      if (!created?.id) throw new Error('The server did not return a call id.');
      const nextCall = { ...created, id: created.id, type, direction: 'outgoing', connected: false, connectionState: 'new' };
      activeCallRef.current = nextCall;
      setCall(nextCall);
      createPeerConnection(nextCall, stream);
      const pc = pcRef.current;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await communicationsAPI.sendSignal(nextCall.id, { kind: 'offer', payload: pc.localDescription });
      timeoutRef.current = window.setTimeout(() => {
        if (!activeCallRef.current?.connected) finishCall('missed');
      }, 30000);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setCallError(error?.response?.data?.message || error.message || 'Unable to start the call.');
      if (activeCallRef.current) {
        publishCallStatus(activeCallRef.current.id, 'end');
        cleanupMedia();
        activeCallRef.current = null;
        setCall(null);
      }
    }
  }, [acquireMedia, cleanupMedia, createPeerConnection, finishCall, publishCallStatus]);

  const acceptCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current) return;
    setCallError('');
    try {
      const stream = await acquireMedia(current.type || 'AUDIO');
      localStreamRef.current = stream;
      await communicationsAPI.updateCall(current.id, { action: 'accept' });
      const accepted = { ...current, direction: 'incoming', connectionState: 'new', connected: false };
      activeCallRef.current = accepted;
      setCall(accepted);
      createPeerConnection(accepted, stream);
      if (pendingOfferRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
        for (const candidate of pendingCandidatesRef.current.splice(0)) await pcRef.current.addIceCandidate(candidate);
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        await communicationsAPI.sendSignal(current.id, { kind: 'answer', payload: pcRef.current.localDescription });
      }
      timeoutRef.current = window.setTimeout(() => {
        if (!activeCallRef.current?.connected) finishCall('missed');
      }, 30000);
    } catch (error) {
      setCallError(error?.response?.data?.message || error.message || 'Unable to accept the call.');
      cleanupMedia();
    }
  }, [acquireMedia, cleanupMedia, createPeerConnection, finishCall]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);
  const toggleCamera = useCallback(() => {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraEnabled(next);
  }, [cameraEnabled]);

  useEffect(() => {
    if (!authorized) {
      setBootstrap(null);
      setUnreadCount(0);
      return undefined;
    }
    let mounted = true;
    let realtime;
    let channel;
    const subscriptions = [];
    const subscribe = (event, handler) => {
      channel.subscribe(event, (message) => handler(message.data || {}));
      subscriptions.push(event);
    };
    const onNewMessage = (value) => {
      const message = messageOf(value);
      const key = message?.id || message?.clientMessageId;
      if (!key || seenEventsRef.current.has(String(key))) return;
      seenEventsRef.current.add(String(key));
      if (seenEventsRef.current.size > 500) seenEventsRef.current.delete(seenEventsRef.current.values().next().value);
      if (String(message.senderId) === String(bootstrap?.self?.id)) return;
      if (conversationOpenRef.current) {
        communicationsAPI.markRead().catch(() => {});
        setUnreadCount(0);
      } else {
        setUnreadCount((count) => count + 1);
        setToast({ title: message.senderName || 'New message', body: message.text || (message.type === 'IMAGE' ? 'Sent an image' : 'Sent a voice message') });
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 6500);
      }
    };
    (async () => {
      try {
        const result = dataOf(await communicationsAPI.getBootstrap());
        if (!mounted) return;
        setBootstrap(result);
        setUnreadCount(Number(result.unreadCount) || 0);
        realtime = new Realtime({
          authCallback: (_params, callback) => {
            communicationsAPI.getToken()
              .then((response) => callback(null, dataOf(response).tokenRequest))
              .catch((error) => callback(error, null));
          },
        });
        realtimeRef.current = realtime;
        realtime.connection.on((state) => {
          if (mounted) setConnection(state.current || state.status || 'offline');
        });
        channel = realtime.channels.get(result.channelName);
        channelRef.current = channel;
        subscribe('message:new', onNewMessage);
        subscribe('message', onNewMessage);
        subscribe('message:delivered', () => {});
        subscribe('message:read', () => {});
        subscribe('typing', (value) => window.dispatchEvent(new CustomEvent('communications:typing', { detail: value })));
        subscribe('presence', (value) => window.dispatchEvent(new CustomEvent('communications:presence', { detail: value })));
        subscribe('call:invite', (value) => {
          const incoming = callOf(value);
          if (!incoming?.id || activeCallRef.current) return;
          const nextCall = { ...incoming, direction: 'incoming', connected: false, connectionState: 'ringing', type: incoming.type || 'AUDIO' };
          activeCallRef.current = nextCall;
          setCall(nextCall);
          setCallError('');
          timeoutRef.current = window.setTimeout(() => {
            if (!activeCallRef.current?.connected && activeCallRef.current?.direction === 'incoming') finishCall('missed');
          }, 30000);
        });
        subscribe('call:update', (value) => {
          const update = callOf(value);
          if (update?.id && activeCallRef.current?.id === update.id && ['ended', 'declined', 'cancelled', 'missed'].includes(String(update.status || '').toLowerCase())) {
            cleanupMedia();
            activeCallRef.current = null;
            setCall(null);
          }
        });
        subscribe('call:signal', processSignal);
        channel.presence.subscribe('enter', () => {});
        channel.presence.subscribe('leave', () => {});
      } catch (error) {
        if (mounted) setConnection(error?.response?.status === 403 ? 'failed' : 'offline');
      }
    })();
    return () => {
      mounted = false;
      subscriptions.forEach((event) => channel?.unsubscribe(event));
      channel?.presence.unsubscribe();
      realtime?.close();
      realtimeRef.current = null;
      channelRef.current = null;
      cleanupMedia();
      activeCallRef.current = null;
    };
  }, [authorized, cleanupMedia, finishCall, processSignal]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    if (remoteAudioRef.current && remoteStreamRef.current) remoteAudioRef.current.srcObject = remoteStreamRef.current;
  }, [call]);

  useEffect(() => {
    if (!call?.connected) {
      setCallDuration(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setCallDuration(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [call?.connected, call?.id]);

  const setConversationOpen = useCallback((open) => {
    conversationOpenRef.current = open;
    if (open && authorized) {
      setUnreadCount(0);
      communicationsAPI.markRead().catch(() => {});
    }
  }, [authorized]);

  const contextValue = useMemo(() => ({
    authorized,
    bootstrap,
    unreadCount,
    setUnreadCount,
    connection,
    call,
    callError,
    setCallError,
    callDuration,
    muted,
    cameraEnabled,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    setConversationOpen,
    startCall,
    acceptCall,
    finishCall,
    toggleMute,
    toggleCamera,
  }), [authorized, bootstrap, unreadCount, connection, call, callError, callDuration, muted, cameraEnabled, setConversationOpen, startCall, acceptCall, finishCall, toggleMute, toggleCamera]);

  return (
    <CommunicationsContext.Provider value={contextValue}>
      {children}
      {authorized && toast && (
        <button
          type="button"
          onClick={() => { setToast(null); onOpenMessagesRef.current?.(); }}
          className="fixed right-4 top-20 z-[70] flex max-w-sm items-start gap-3 rounded-2xl border border-indigo-200 bg-white p-4 text-left shadow-xl"
        >
          <MessagesSquare className="mt-1 shrink-0 text-indigo-600" size={20} />
          <span className="min-w-0"><strong className="block text-sm text-slate-900">{toast.title}</strong><span className="block truncate text-sm text-slate-600">{toast.body}</span></span>
          <X className="shrink-0 text-slate-400" size={16} />
        </button>
      )}
      {authorized && call && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm">
          <section className="relative flex max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-slate-900 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div>
                <p className="font-bold">{call.peerName || call.recipientName || bootstrap?.peer?.name || 'Secure call'}</p>
                <p className="text-sm text-slate-300">
                  {call.connected ? `Connected · ${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, '0')}` : callError || (call.connectionState === 'failed' ? 'Connection failed' : call.direction === 'incoming' ? 'Incoming call' : 'Calling…')}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${call.connected ? 'bg-emerald-500/20 text-emerald-300' : callError ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-200'}`}>
                {call.connected ? 'CONNECTED' : call.connectionState === 'disconnected' ? 'RECONNECTING' : 'RINGING'}
              </span>
            </div>
            <div className="relative min-h-[260px] flex-1 bg-slate-950 sm:min-h-[420px]">
              {call.type === 'VIDEO' ? (
                <>
                  <video ref={remoteVideoRef} autoPlay playsInline className="h-full max-h-[65vh] w-full object-contain" />
                  <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-4 right-4 h-24 w-36 rounded-xl border border-white/20 bg-slate-800 object-cover sm:h-36 sm:w-52" />
                </>
              ) : (
                <div className="grid h-full min-h-[260px] place-items-center">
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-indigo-500/20 text-indigo-200"><Phone size={42} /></div>
                </div>
              )}
              <audio ref={remoteAudioRef} autoPlay />
            </div>
            <div className="flex items-center justify-center gap-3 p-4">
              {call.direction === 'incoming' && !call.connected && !pcRef.current && (
                <>
                  <button type="button" onClick={acceptCall} className="rounded-full bg-emerald-500 p-4 text-white" aria-label="Accept call"><Phone size={22} /></button>
                  <button type="button" onClick={() => finishCall('decline')} className="rounded-full bg-rose-500 p-4 text-white" aria-label="Decline call"><PhoneOff size={22} /></button>
                </>
              )}
              {(call.direction !== 'incoming' || pcRef.current) && (
                <>
                  <button type="button" onClick={toggleMute} className="rounded-full bg-slate-700 p-3" aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
                  {call.type === 'VIDEO' && <button type="button" onClick={toggleCamera} className="rounded-full bg-slate-700 p-3" aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{cameraEnabled ? <Camera size={20} /> : <CameraOff size={20} />}</button>}
                  <button type="button" onClick={() => finishCall(call.direction === 'incoming' && !call.connected ? 'decline' : call.direction === 'outgoing' && !call.connected ? 'cancel' : 'end')} className="rounded-full bg-rose-500 p-4" aria-label="End call"><PhoneOff size={22} /></button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </CommunicationsContext.Provider>
  );
}
