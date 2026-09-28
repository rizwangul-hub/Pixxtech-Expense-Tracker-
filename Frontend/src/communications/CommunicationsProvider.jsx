import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Realtime } from 'ably';
import { Camera, CameraOff, MessagesSquare, Mic, MicOff, Phone, PhoneOff, X } from 'lucide-react';
import { communicationsAPI } from '../services/api.js';

const CommunicationsContext = createContext(null);
const configuredAdminEmail = import.meta.env.VITE_COMMUNICATION_ADMIN_EMAIL?.trim().toLowerCase();
const configuredDataEntryEmail = import.meta.env.VITE_COMMUNICATION_DATA_ENTRY_EMAIL?.trim().toLowerCase();

export const canUseCommunications = (user) => {
  if (!user) return false;
  if (configuredAdminEmail || configuredDataEntryEmail) {
    const email = String(user.email || '').trim().toLowerCase();
    return (Boolean(configuredAdminEmail) && email === configuredAdminEmail && user.role === 'ADMIN')
      || (Boolean(configuredDataEntryEmail) && email === configuredDataEntryEmail && user.role === 'DATA_ENTRY');
  }
  const name = String(user.name || '').trim().toLowerCase();
  return (name === 'khurshid anwar' && user.role === 'ADMIN')
    || (name === 'sarfraz' && user.role === 'DATA_ENTRY');
};

export const useCommunications = () => useContext(CommunicationsContext) || {};
const responseData = (response) => response?.data || {};
const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;
const terminalCallStatuses = new Set(['ENDED', 'DECLINED', 'CANCELLED', 'MISSED']);

export function CommunicationsProvider({ user, onOpenMessages, children }) {
  const authorized = canUseCommunications(user);
  const [bootstrap, setBootstrap] = useState(null);
  const [bootstrapError, setBootstrapError] = useState('');
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connection, setConnection] = useState('offline');
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [peerOnline, setPeerOnline] = useState(null);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [call, setCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callError, setCallError] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const channelRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const activeCallRef = useRef(null);
  const callStartRef = useRef(false);
  const conversationOpenRef = useRef(false);
  const timeoutRef = useRef(null);
  const toastTimerRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const pendingCallUpdatesRef = useRef(new Map());
  const handleCallUpdateRef = useRef(null);
  const offerStartedRef = useRef(false);
  const selfUserIdRef = useRef('');
  const seenMessagesRef = useRef(new Set());
  const onOpenMessagesRef = useRef(onOpenMessages);

  useEffect(() => {
    onOpenMessagesRef.current = onOpenMessages;
  }, [onOpenMessages]);

  const cleanupMedia = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
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
    offerStartedRef.current = false;
    setMuted(false);
    setCameraEnabled(true);
  }, []);

  const publishCallStatus = useCallback(async (id, action) => {
    if (!id) return;
    try {
      await communicationsAPI.updateCall(id, { action });
    } catch (error) {
      setCallError(errorMessage(error, 'Could not update call status.'));
    }
  }, []);

  const finishCall = useCallback(async (action) => {
    const current = activeCallRef.current;
    if (!current || current.finishing) return;
    activeCallRef.current = { ...current, finishing: true };
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    await publishCallStatus(current.id, action);
    cleanupMedia();
    const finished = { ...current, status: action.toUpperCase(), connected: false, finishing: false };
    activeCallRef.current = finished;
    setCall(finished);
    window.setTimeout(() => {
      if (activeCallRef.current?.id === current.id) {
        activeCallRef.current = null;
        setCall(null);
      }
    }, 1500);
  }, [cleanupMedia, publishCallStatus]);

  const addRemoteCandidate = useCallback(async (payload) => {
    if (!payload) return;
    let candidate;
    try {
      candidate = new RTCIceCandidate(payload.candidate || payload);
      if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(candidate);
      else pendingCandidatesRef.current.push(candidate);
    } catch (error) {
      console.warn('Unable to apply remote ICE candidate', error);
    }
  }, []);

  const applyPendingCandidates = useCallback(async () => {
    if (!pcRef.current?.remoteDescription) return;
    for (const candidate of pendingCandidatesRef.current.splice(0)) {
      try {
        await pcRef.current.addIceCandidate(candidate);
      } catch (error) {
        console.warn('Unable to apply queued ICE candidate', error);
      }
    }
  }, []);

  const processSignal = useCallback(async (signal) => {
    const current = activeCallRef.current;
    if (!current || String(signal?.callId || '') !== String(current.id)) return;
    if (String(signal.senderId || '') === String(selfUserIdRef.current || '')) return;
    const { kind, payload } = signal;
    try {
      if (kind === 'offer' && current.direction === 'incoming') {
        if (!pcRef.current) {
          pendingOfferRef.current = payload;
          return;
        }
        if (pcRef.current.signalingState !== 'stable') return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload));
        await applyPendingCandidates();
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        await communicationsAPI.sendSignal(current.id, { kind: 'answer', payload: pcRef.current.localDescription });
      } else if (kind === 'answer' && current.direction === 'outgoing' && pcRef.current) {
        if (pcRef.current.signalingState !== 'have-local-offer') return;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload));
        await applyPendingCandidates();
      } else if (kind === 'ice-candidate') {
        await addRemoteCandidate(payload);
      }
    } catch (error) {
      setCallError(errorMessage(error, 'Could not establish the call connection.'));
    }
  }, [addRemoteCandidate, applyPendingCandidates]);

  const createPeerConnection = useCallback((callInfo, stream) => {
    if (!window.isSecureContext || typeof RTCPeerConnection === 'undefined') {
      throw new Error('Calls require a secure browser (HTTPS) with WebRTC support.');
    }
    const pc = new RTCPeerConnection({ iceServers: bootstrap?.iceServers || [] });
    pcRef.current = pc;
    remoteStreamRef.current = new MediaStream();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (event) => {
      const remote = remoteStreamRef.current;
      const tracks = event.streams?.[0]?.getTracks() || [event.track];
      tracks.forEach((track) => {
        if (!remote.getTracks().some((existing) => existing.id === track.id)) remote.addTrack(track);
      });
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        communicationsAPI.sendSignal(callInfo.id, {
          kind: 'ice-candidate',
          payload: event.candidate.toJSON(),
        }).catch((error) => setCallError(errorMessage(error, 'Network signal could not be sent.')));
      }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        activeCallRef.current = { ...activeCallRef.current, connected: true, connectionState: state };
        setCall((previous) => previous?.id === callInfo.id
          ? { ...previous, connected: true, connectionState: state }
          : previous);
      } else {
        activeCallRef.current = { ...activeCallRef.current, connectionState: state };
        setCall((previous) => previous?.id === callInfo.id
          ? { ...previous, connected: false, connectionState: state }
          : previous);
        if (state === 'failed') setCallError('Call connection failed. Check your network and try again.');
      }
    };
    return pc;
  }, [bootstrap?.iceServers]);

  const acquireMedia = useCallback(async (type) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Calls need HTTPS and microphone access' + (type === 'VIDEO' ? ' plus camera access.' : '.'));
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' });
  }, []);

  const startCall = useCallback(async (type) => {
    if (activeCallRef.current || callStartRef.current) return;
    callStartRef.current = true;
    setCallError('');
    let stream;
    try {
      stream = await acquireMedia(type);
      localStreamRef.current = stream;
      const created = responseData(await communicationsAPI.createCall({ type }));
      if (!created.callId) throw new Error('The server did not return a call id.');
      const nextCall = {
        id: created.callId,
        type,
        direction: 'outgoing',
        status: created.status || 'RINGING',
        connected: false,
        connectionState: 'ringing',
      };
      activeCallRef.current = nextCall;
      setCall(nextCall);
      createPeerConnection(nextCall, stream);
      timeoutRef.current = window.setTimeout(() => {
        if (!activeCallRef.current?.connected) finishCall('cancel');
      }, 30000);
      const pendingUpdate = pendingCallUpdatesRef.current.get(nextCall.id);
      pendingCallUpdatesRef.current.delete(nextCall.id);
      if (pendingUpdate) handleCallUpdateRef.current?.(pendingUpdate);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setCallError(errorMessage(error, 'Unable to start the call.'));
      if (activeCallRef.current) {
        await publishCallStatus(activeCallRef.current.id, 'cancel');
        cleanupMedia();
        activeCallRef.current = null;
        setCall(null);
      }
    } finally {
      callStartRef.current = false;
    }
  }, [acquireMedia, cleanupMedia, createPeerConnection, finishCall, publishCallStatus]);

  const startOffer = useCallback(async (callInfo) => {
    if (offerStartedRef.current || !pcRef.current || callInfo.direction !== 'outgoing') return;
    offerStartedRef.current = true;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (!activeCallRef.current?.connected) finishCall('end');
    }, 30000);
    try {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      await communicationsAPI.sendSignal(callInfo.id, { kind: 'offer', payload: pcRef.current.localDescription });
      activeCallRef.current = { ...activeCallRef.current, status: 'ACCEPTED', connectionState: 'connecting' };
      setCall((previous) => previous?.id === callInfo.id
        ? { ...previous, status: 'ACCEPTED', connectionState: 'connecting' }
        : previous);
    } catch (error) {
      setCallError(errorMessage(error, 'Could not send the call offer.'));
      offerStartedRef.current = false;
    }
  }, [finishCall]);

  const handleCallUpdate = useCallback((event) => {
    const id = String(event.callId || '');
    const current = activeCallRef.current;
    const status = String(event.status || '').toUpperCase();
    window.dispatchEvent(new CustomEvent('communications:call-update', { detail: event }));
    if (!current || String(current.id) !== id) {
      if (id) {
        pendingCallUpdatesRef.current.set(id, event);
        if (pendingCallUpdatesRef.current.size > 10) {
          pendingCallUpdatesRef.current.delete(pendingCallUpdatesRef.current.keys().next().value);
        }
      }
      return;
    }
    if (status === 'ACCEPTED') {
      activeCallRef.current = { ...current, status, connectionState: 'connecting' };
      setCall((previous) => previous?.id === id
        ? { ...previous, status, connectionState: 'connecting' }
        : previous);
      if (current.direction === 'outgoing' && String(event.actorId || '') !== String(selfUserIdRef.current)) {
        startOffer({ ...current, status });
      } else if (current.direction === 'incoming') {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
          if (!activeCallRef.current?.connected) finishCall('end');
        }, 30000);
      }
    } else if (terminalCallStatuses.has(status)) {
      window.clearTimeout(timeoutRef.current);
      cleanupMedia();
      activeCallRef.current = null;
      setCall(null);
    }
  }, [cleanupMedia, finishCall, startOffer]);

  useEffect(() => {
    handleCallUpdateRef.current = handleCallUpdate;
  }, [handleCallUpdate]);

  const acceptCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current || current.direction !== 'incoming' || pcRef.current) return;
    setCallError('');
    let stream;
    try {
      stream = await acquireMedia(current.type || 'AUDIO');
      localStreamRef.current = stream;
      createPeerConnection(current, stream);
      await communicationsAPI.updateCall(current.id, { action: 'accept' });
      activeCallRef.current = { ...current, status: 'ACCEPTED', connectionState: 'connecting' };
      setCall((previous) => previous?.id === current.id
        ? { ...previous, status: 'ACCEPTED', connectionState: 'connecting' }
        : previous);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        if (!activeCallRef.current?.connected) finishCall('end');
      }, 30000);
      if (pendingOfferRef.current) {
        const offer = pendingOfferRef.current;
        pendingOfferRef.current = null;
        await processSignal({ callId: current.id, senderId: '', kind: 'offer', payload: offer });
      }
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      cleanupMedia();
      setCallError(errorMessage(error, 'Unable to accept the call. Check microphone/camera permissions.'));
    }
  }, [acquireMedia, cleanupMedia, createPeerConnection, finishCall, processSignal]);

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
      setBootstrapError('');
      setUnreadCount(0);
      setPeerOnline(null);
      setNotifications([]);
      setConnection('offline');
      setRealtimeReady(false);
      return undefined;
    }
    let mounted = true;
    let realtime;
    let channel;
    const subscriptions = [];
    const subscribe = (event, handler) => {
      subscriptions.push(event);
      return channel.subscribe(event, (message) => handler(message.data || {}));
    };
    const emit = (event, detail) => window.dispatchEvent(new CustomEvent(event, { detail }));
    const onNewMessage = (message) => {
      if (!message?.id) return;
      const key = String(message.id || message.clientMessageId);
      if (seenMessagesRef.current.has(key)) return;
      seenMessagesRef.current.add(key);
      if (seenMessagesRef.current.size > 500) seenMessagesRef.current.delete(seenMessagesRef.current.values().next().value);
      emit('communications:message', message);
      const selfId = String(selfUserIdRef.current || '');
      if (String(message.sender?.id || '') === selfId) return;
      const notification = {
        id: key,
        title: message.sender?.name || 'New message',
        body: message.text || (message.type === 'IMAGE' ? 'Sent an image' : 'Sent a voice message'),
        createdAt: message.createdAt,
      };
      setToast(notification);
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
      communicationsAPI.markDelivered(message.id).catch(() => {});
      if (conversationOpenRef.current) {
        communicationsAPI.markRead().then((result) => {
          const count = Number(responseData(result).readCount) || 0;
          if (count || conversationOpenRef.current) setUnreadCount(0);
        }).catch(() => {});
      } else {
        setUnreadCount((count) => count + 1);
        setNotifications((items) => [notification, ...items.filter((item) => item.id !== key)].slice(0, 20));
      }
    };

    (async () => {
      try {
        setBootstrapError('');
        const info = responseData(await communicationsAPI.getBootstrap());
        if (!mounted) return;
        setBootstrap(info);
        selfUserIdRef.current = String(info.self?.id || '');
        setUnreadCount(Number(info.unreadCount) || 0);
        setNotifications((Array.isArray(info.unreadMessages) ? info.unreadMessages : []).map((message) => ({
          id: String(message.id),
          title: message.sender?.name || 'New message',
          body: message.text || (message.type === 'IMAGE' ? 'Sent an image' : 'Sent a voice message'),
          createdAt: message.createdAt,
        })));
        realtime = new Realtime({
          authCallback: (_params, callback) => {
            communicationsAPI.getToken().then((result) => callback(null, responseData(result)))
              .catch((error) => callback(error, null));
          },
        });
        realtime.connection.on((state) => {
          if (!mounted) return;
          const status = state.current || state.status || 'offline';
          setConnection(status);
          if (status !== 'connected') setPeerOnline(status === 'failed' ? false : null);
        });
        channel = realtime.channels.get(info.channelName);
        channelRef.current = channel;
        await Promise.all([
          subscribe('message:new', onNewMessage),
          subscribe('message:delivered', (event) => emit('communications:delivered', event)),
          subscribe('messages:read', (event) => {
            emit('communications:read', event);
            if (String(event.readerId || '') === String(info.self?.id || '')) {
              setUnreadCount(0);
              setNotifications([]);
            }
          }),
          subscribe('typing', (event) => emit('communications:typing', event)),
          subscribe('call:invite', (event) => {
            if (String(event.callerId || '') === String(info.self?.id || '')) return;
            if (!event.callId || activeCallRef.current) return;
            const incoming = {
              id: event.callId,
              type: event.type || 'AUDIO',
              direction: 'incoming',
              status: event.status || 'RINGING',
              connected: false,
              connectionState: 'ringing',
            };
            activeCallRef.current = incoming;
            setCall(incoming);
            setCallError('');
            timeoutRef.current = window.setTimeout(() => {
              if (activeCallRef.current?.id === incoming.id && !activeCallRef.current.connected) {
                finishCall('missed');
              }
            }, 30000);
          }),
          subscribe('call:update', handleCallUpdate),
          subscribe('call:signal', processSignal),
        ]);
        if (mounted) setRealtimeReady(true);
        channel.presence.subscribe('enter', (member) => {
          if (String(member.clientId) === String(info.peer?.id)) setPeerOnline(true);
        });
        channel.presence.subscribe('update', (member) => {
          if (String(member.clientId) === String(info.peer?.id)) setPeerOnline(true);
        });
        channel.presence.subscribe('leave', async (member) => {
          if (String(member.clientId) !== String(info.peer?.id)) return;
          try {
            const members = await channel.presence.get();
            if (mounted) setPeerOnline(members.some((entry) => String(entry.clientId) === String(info.peer.id)));
          } catch {
            if (mounted) setPeerOnline(null);
          }
        });
        if (realtime.connection.state === 'connected') {
          try {
            await channel.presence.enter({ name: info.self?.name, role: info.self?.role });
            const members = await channel.presence.get();
            if (mounted) setPeerOnline(members.some((entry) => String(entry.clientId) === String(info.peer?.id)));
          } catch {
            if (mounted) setPeerOnline(null);
          }
        } else {
          realtime.connection.once('connected', async () => {
            try {
              await channel.presence.enter({ name: info.self?.name, role: info.self?.role });
              const members = await channel.presence.get();
              if (mounted) setPeerOnline(members.some((entry) => String(entry.clientId) === String(info.peer?.id)));
            } catch {
              if (mounted) setPeerOnline(null);
            }
            if (mounted) setRealtimeReady(true);
          });
        }
      } catch (error) {
        if (mounted) {
          setConnection(error?.response?.status === 403 ? 'failed' : 'offline');
          setPeerOnline(null);
          setBootstrapError(errorMessage(error, 'Could not connect to Messages & Calls.'));
        }
      }
    })();

    return () => {
      mounted = false;
      subscriptions.forEach((event) => channel?.unsubscribe(event));
      channel?.presence.unsubscribe();
      channel?.presence.leave().catch(() => {});
      realtime?.close();
      channelRef.current = null;
      window.clearTimeout(toastTimerRef.current);
      cleanupMedia();
      activeCallRef.current = null;
    };
  }, [authorized, bootstrapAttempt, cleanupMedia, finishCall, handleCallUpdate, processSignal]);

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
    return () => window.clearInterval(timer);
  }, [call?.connected, call?.id]);

  const setConversationOpen = useCallback((open) => {
    conversationOpenRef.current = open;
    if (open && authorized) {
      setNotifications([]);
      communicationsAPI.markRead().then(() => setUnreadCount(0)).catch(() => {});
    }
  }, [authorized]);

  const retryBootstrap = useCallback(() => {
    setBootstrap(null);
    setBootstrapError('');
    setRealtimeReady(false);
    setConnection('connecting');
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const contextValue = useMemo(() => ({
    authorized,
    bootstrap,
    bootstrapError,
    unreadCount,
    toast,
    notifications,
    setUnreadCount,
    connection,
    realtimeReady,
    peerOnline,
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
    retryBootstrap,
    startCall,
    acceptCall,
    finishCall,
    toggleMute,
    toggleCamera,
  }), [authorized, bootstrap, bootstrapError, unreadCount, toast, notifications, connection, realtimeReady, peerOnline, call, callError, callDuration, muted, cameraEnabled, setConversationOpen, retryBootstrap, startCall, acceptCall, finishCall, toggleMute, toggleCamera]);

  const terminalAction = call?.direction === 'incoming' && call.status !== 'ACCEPTED'
    ? 'decline'
    : call?.direction === 'outgoing' && call.status !== 'ACCEPTED'
      ? 'cancel'
      : 'end';

  return (
    <CommunicationsContext.Provider value={contextValue}>
      {children}
      {authorized && toast && (
        <button
          type="button"
          onClick={() => { setToast(null); onOpenMessagesRef.current?.(); }}
          className="fixed right-4 top-4 z-[70] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-2xl border border-indigo-200 bg-white p-4 text-left shadow-xl"
          aria-label={`Open new message from ${toast.title}`}
          aria-live="polite"
        >
          <MessagesSquare className="mt-1 shrink-0 text-indigo-600" size={20} />
          <span className="min-w-0"><strong className="block text-sm text-slate-900">{toast.title}</strong><span className="block truncate text-sm text-slate-600">{toast.body}</span></span>
          <X className="shrink-0 text-slate-400" size={16} />
        </button>
      )}
      {authorized && call && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm" role="presentation">
          <section className="relative flex max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-slate-900 text-white shadow-2xl" role="dialog" aria-modal="true" aria-label={`${call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} ${call.type === 'VIDEO' ? 'video' : 'audio'} call`}>
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="truncate font-bold">{bootstrap?.peer?.name || 'Secure call'}</p>
                <p className="text-sm text-slate-300">
                  {call.connected ? `Connected · ${Math.floor(callDuration / 60)}:${String(callDuration % 60).padStart(2, '0')}` : callError || (call.direction === 'incoming' ? 'Incoming call' : call.status === 'ACCEPTED' ? 'Connecting…' : 'Ringing…')}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${call.connected ? 'bg-emerald-500/20 text-emerald-300' : callError ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-200'}`}>
                {call.connected ? 'CONNECTED' : call.connectionState === 'disconnected' ? 'RECONNECTING' : call.status === 'ACCEPTED' ? 'CONNECTING' : 'RINGING'}
              </span>
            </div>
            <div className="relative min-h-[260px] flex-1 bg-slate-950">
              {call.type === 'VIDEO' ? (
                <>
                  <video ref={remoteVideoRef} autoPlay playsInline muted className="h-full max-h-[65vh] w-full object-contain" aria-label="Remote video" />
                  <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-4 right-4 h-24 w-36 rounded-xl border border-white/20 bg-slate-800 object-cover sm:h-36 sm:w-52" aria-label="Your video preview" />
                </>
              ) : (
                <div className="grid h-full min-h-[260px] place-items-center">
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-indigo-500/20 text-indigo-200"><Phone size={42} /></div>
                </div>
              )}
              <audio ref={remoteAudioRef} autoPlay />
            </div>
            {callError && <p role="alert" className="px-5 pt-3 text-center text-sm text-rose-300">{callError}</p>}
            <div className="flex items-center justify-center gap-3 p-4">
              {call.direction === 'incoming' && call.status !== 'ACCEPTED' ? (
                <>
                  <button type="button" onClick={acceptCall} className="rounded-full bg-emerald-500 p-4 text-white" aria-label="Accept call"><Phone size={22} /></button>
                  <button type="button" onClick={() => finishCall('decline')} className="rounded-full bg-rose-500 p-4 text-white" aria-label="Decline call"><PhoneOff size={22} /></button>
                </>
              ) : (
                <>
                  <button type="button" onClick={toggleMute} className="rounded-full bg-slate-700 p-3" aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
                  {call.type === 'VIDEO' && <button type="button" onClick={toggleCamera} className="rounded-full bg-slate-700 p-3" aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{cameraEnabled ? <Camera size={20} /> : <CameraOff size={20} />}</button>}
                  <button type="button" onClick={() => finishCall(terminalAction)} className="rounded-full bg-rose-500 p-4" aria-label={terminalAction === 'cancel' ? 'Cancel call' : terminalAction === 'decline' ? 'Decline call' : 'End call'}><PhoneOff size={22} /></button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </CommunicationsContext.Provider>
  );
}
