import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Camera, Check, CheckCheck, ChevronUp, ImagePlus, LoaderCircle, Mic,
  MessagesSquare, Phone, PhoneCall, Send, Square, Video, X,
} from 'lucide-react';
import { communicationsAPI } from '../services/api.js';
import { useCommunications } from '../communications/CommunicationsProvider.jsx';

const PAGE_SIZE = 50;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const responseData = (response) => response?.data || {};
const messageError = (error) => error?.response?.data?.message || error?.message || 'Something went wrong. Please try again.';
const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
const formatDate = (value) => value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const formatDuration = (value) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
const sortMessages = (items) => [...items].sort((a, b) => (
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  || String(a.id).localeCompare(String(b.id))
));
const mergeMessages = (current, next) => {
  const byKey = new Map(current.map((message) => [String(message.id || message.clientMessageId), message]));
  next.forEach((message) => {
    const key = String(message.id || message.clientMessageId);
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...message } : message);
  });
  return sortMessages(Array.from(byKey.values()));
};

function AttachmentView({ attachment, type }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let refreshTimer;
    const loadUrl = async () => {
      try {
        const result = responseData(await communicationsAPI.getAttachmentUrl(attachment.id));
        if (mounted) {
          setUrl(result.url || '');
          setError(result.url ? '' : 'This attachment is unavailable.');
        }
      } catch (requestError) {
        if (mounted) setError(messageError(requestError));
      }
    };
    loadUrl();
    refreshTimer = window.setInterval(loadUrl, 4 * 60 * 1000);
    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
    };
  }, [attachment.id]);

  if (error) return <p role="status" className="mt-2 text-sm text-rose-600">{error}</p>;
  if (!url) return <span className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={15} className="animate-spin" />Loading secure attachment…</span>;
  if (type === 'IMAGE') {
    return (
      <a href={url} target="_blank" rel="noreferrer" aria-label={`Open image ${attachment.originalName}`}>
        <img src={url} alt={attachment.originalName || 'Shared image'} loading="lazy" className="mt-2 max-h-72 max-w-full rounded-xl border border-slate-200 object-contain" />
      </a>
    );
  }
  return <audio className="mt-2 w-full max-w-xs" controls preload="none" src={url} aria-label={`Voice message ${attachment.originalName}`} />;
}

function MessageBubble({ message, own }) {
  return (
    <article className={`flex min-w-0 ${own ? 'justify-end' : 'justify-start'}`}>
      <div className={`min-w-0 max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[75%] ${own ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'}`}>
        {!own && <p className="mb-1 text-xs font-bold text-indigo-700">{message.sender?.name || 'Contact'}</p>}
        {message.type === 'TEXT' && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>}
        {(message.type === 'IMAGE' || message.type === 'VOICE') && (
          <>
            {message.text && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>}
            {message.attachment?.id
              ? <AttachmentView attachment={message.attachment} type={message.type} />
              : <p className="mt-2 text-sm opacity-80">Attachment unavailable.</p>}
          </>
        )}
        <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] ${own ? 'text-indigo-100' : 'text-slate-500'}`}>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {own && (message.readAt
            ? <CheckCheck size={14} aria-label="Read" />
            : message.deliveredAt
              ? <CheckCheck size={14} aria-label="Delivered" />
              : <Check size={14} aria-label="Sent" />)}
        </div>
      </div>
    </article>
  );
}

export function MessagesCallsPage() {
  const {
    authorized, bootstrap, bootstrapError, unreadCount, connection, realtimeReady, peerOnline, call, startCall,
    callError, setCallError, retryBootstrap, setConversationOpen, setUnreadCount,
  } = useCommunications();
  const [messages, setMessages] = useState([]);
  const [calls, setCalls] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [activeTab, setActiveTab] = useState('messages');
  const messageListRef = useRef(null);
  const messageInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const peerTypingTimerRef = useRef(null);
  const localTypingTimerRef = useRef(null);
  const localTypingSentRef = useRef(false);
  const conversationOpenRef = useRef(false);
  const earlierScrollRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const recordingSecondsRef = useRef(0);
  const peerId = String(bootstrap?.peer?.id || '');
  const selfId = String(bootstrap?.self?.id || '');

  const loadMessages = useCallback(async (before) => {
    if (!bootstrap?.conversationId) return;
    if (before) setLoadingEarlier(true);
    else setLoading(true);
    setError('');
    try {
      const result = responseData(await communicationsAPI.getMessages({ limit: PAGE_SIZE, ...(before ? { before } : {}) }));
      const page = Array.isArray(result.messages) ? result.messages : [];
      if (before && messageListRef.current) {
        earlierScrollRef.current = {
          height: messageListRef.current.scrollHeight,
          top: messageListRef.current.scrollTop,
        };
      }
      setMessages((current) => mergeMessages(current, page));
      setHasMore(Boolean(result.hasMore));
      const undelivered = page.filter((message) => String(message.sender?.id) !== selfId && !message.deliveredAt);
      await Promise.all(undelivered.map((message) => communicationsAPI.markDelivered(message.id).catch(() => {})));
      if (conversationOpenRef.current) {
        await communicationsAPI.markRead().catch(() => {});
        setUnreadCount(0);
      }
    } catch (requestError) {
      setError(messageError(requestError));
    } finally {
      setLoading(false);
      setLoadingEarlier(false);
    }
  }, [bootstrap?.conversationId, selfId, setUnreadCount]);

  const loadCalls = useCallback(async () => {
    if (!bootstrap?.conversationId) return;
    try {
      const result = responseData(await communicationsAPI.getCalls({ limit: 50 }));
      setCalls(Array.isArray(result) ? result : []);
    } catch (requestError) {
      setError(messageError(requestError));
    }
  }, [bootstrap?.conversationId]);

  const sendTyping = useCallback((value) => {
    communicationsAPI.setTyping(value).catch(() => {});
  }, []);

  useEffect(() => {
    if (realtimeReady && bootstrap?.conversationId) {
      loadMessages();
      loadCalls();
    }
  }, [realtimeReady, bootstrap?.conversationId, loadMessages, loadCalls]);

  useEffect(() => {
    if (!authorized || !bootstrap?.conversationId) return undefined;
    conversationOpenRef.current = true;
    setConversationOpen(true);
    loadMessages();
    loadCalls();
    const onMessage = (event) => {
      const message = event.detail;
      if (!message?.id) return;
      wasAtBottomRef.current = messageListRef.current
        ? messageListRef.current.scrollHeight - messageListRef.current.scrollTop - messageListRef.current.clientHeight < 100
        : true;
      setMessages((current) => mergeMessages(current, [message]));
      if (String(message.sender?.id || '') !== selfId) {
        communicationsAPI.markDelivered(message.id).catch(() => {});
        communicationsAPI.markRead().then(() => setUnreadCount(0)).catch(() => {});
      }
    };
    const onDelivered = (event) => {
      const { messageId, deliveredAt } = event.detail || {};
      setMessages((current) => current.map((message) => String(message.id) === String(messageId)
        ? { ...message, deliveredAt: message.deliveredAt || deliveredAt }
        : message));
    };
    const onRead = (event) => {
      const { readerId, readAt } = event.detail || {};
      if (String(readerId) !== peerId) return;
      setMessages((current) => current.map((message) => String(message.sender?.id) === selfId
        ? { ...message, deliveredAt: message.deliveredAt || readAt, readAt: message.readAt || readAt }
        : message));
    };
    const onTyping = (event) => {
      const detail = event.detail || {};
      if (String(detail.senderId) !== peerId) return;
      setTyping(Boolean(detail.typing));
      window.clearTimeout(peerTypingTimerRef.current);
      if (detail.typing) peerTypingTimerRef.current = window.setTimeout(() => setTyping(false), 3500);
    };
    const onCallUpdate = () => loadCalls();
    window.addEventListener('communications:message', onMessage);
    window.addEventListener('communications:delivered', onDelivered);
    window.addEventListener('communications:read', onRead);
    window.addEventListener('communications:typing', onTyping);
    window.addEventListener('communications:call-update', onCallUpdate);
    const refreshHistory = () => {
      if (document.visibilityState === 'visible') {
        loadMessages();
        loadCalls();
      }
    };
    window.addEventListener('focus', refreshHistory);
    return () => {
      conversationOpenRef.current = false;
      setConversationOpen(false);
      window.clearTimeout(peerTypingTimerRef.current);
      window.clearTimeout(localTypingTimerRef.current);
      if (localTypingSentRef.current) sendTyping(false);
      localTypingSentRef.current = false;
      window.clearInterval(recordingTimerRef.current);
      window.removeEventListener('communications:message', onMessage);
      window.removeEventListener('communications:delivered', onDelivered);
      window.removeEventListener('communications:read', onRead);
      window.removeEventListener('communications:typing', onTyping);
      window.removeEventListener('communications:call-update', onCallUpdate);
      window.removeEventListener('focus', refreshHistory);
    };
  }, [authorized, bootstrap?.conversationId, loadCalls, loadMessages, peerId, selfId, sendTyping, setConversationOpen, setUnreadCount]);

  useLayoutEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    if (earlierScrollRef.current) {
      const previous = earlierScrollRef.current;
      list.scrollTop = previous.top + list.scrollHeight - previous.height;
      earlierScrollRef.current = null;
    } else if (wasAtBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => () => {
    if (voicePreview?.url) URL.revokeObjectURL(voicePreview.url);
    window.clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, [voicePreview]);

  useEffect(() => () => {
    if (imagePreview?.url) URL.revokeObjectURL(imagePreview.url);
  }, [imagePreview]);

  const handleTextChange = (event) => {
    setText(event.target.value);
    if (!localTypingSentRef.current) {
      localTypingSentRef.current = true;
      sendTyping(true);
    }
    window.clearTimeout(localTypingTimerRef.current);
    localTypingTimerRef.current = window.setTimeout(() => {
      localTypingSentRef.current = false;
      sendTyping(false);
    }, 1400);
  };

  const sendMessage = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const result = responseData(await communicationsAPI.sendMessage({
        clientMessageId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...payload,
      }));
      setMessages((current) => mergeMessages(current, [result]));
      wasAtBottomRef.current = true;
      return true;
    } catch (requestError) {
      setError(messageError(requestError));
      return false;
    } finally {
      setBusy(false);
      setUploading(false);
      setUploadProgress(0);
      sendTyping(false);
    }
  };

  const submitText = async (event) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    const submitted = text.trim();
    if (await sendMessage({ type: 'TEXT', text: submitted })) setText('');
  };

  const uploadAndSend = async (file, type) => {
    if (busy) return;
    setBusy(true);
    setUploading(true);
    setError('');
    setUploadProgress(0);
    try {
      const attachment = responseData(await communicationsAPI.uploadAttachment(file, (event) => {
        if (event.total) setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }));
      setUploading(false);
      const message = responseData(await communicationsAPI.sendMessage({
        clientMessageId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        attachmentId: attachment.id,
        text: text.trim(),
      }));
      setMessages((current) => mergeMessages(current, [message]));
      setText('');
      wasAtBottomRef.current = true;
      setVoicePreview(null);
      setImagePreview(null);
    } catch (requestError) {
      setError(messageError(requestError));
    } finally {
      setBusy(false);
      setUploading(false);
      setUploadProgress(0);
      sendTyping(false);
    }
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Images must not exceed 10 MB.');
      return;
    }
    setError('');
    setImagePreview({ file, url: URL.createObjectURL(file) });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const startRecording = async () => {
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording requires a secure browser with microphone recording support.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        const normalizedMime = blob.type.split(';')[0].toLowerCase();
        const extensions = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };
        if (!extensions[normalizedMime]) {
          setError('This browser produced an audio format the server cannot accept.');
          setRecording(false);
          return;
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          setError('Voice recordings must not exceed 20 MB.');
          setRecording(false);
          return;
        }
        if (!blob.size) {
          setError('No audio was recorded. Check microphone permission and try again.');
          setRecording(false);
          return;
        }
        const file = new File([blob], `voice-message-${Date.now()}.${extensions[normalizedMime]}`, { type: normalizedMime });
        setVoicePreview({ file, url: URL.createObjectURL(blob), duration: recordingSecondsRef.current });
        setRecording(false);
        window.clearInterval(recordingTimerRef.current);
      };
      recorder.onerror = () => {
        setError('The microphone recording failed. Please try again.');
        if (recorder.state === 'recording') recorder.stop();
      };
      mediaRecorderRef.current = recorder;
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
      setRecording(true);
      recorder.start(1000);
      const startedAt = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        recordingSecondsRef.current = elapsed;
        setRecordingSeconds(elapsed);
        if (elapsed >= 180 && mediaRecorderRef.current?.state === 'recording') {
          setError('Voice recordings are limited to 3 minutes.');
          mediaRecorderRef.current.stop();
        }
      }, 1000);
    } catch (requestError) {
      setError(requestError?.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access and try again.'
        : requestError?.name === 'NotFoundError'
          ? 'No microphone was found on this device.'
          : messageError(requestError));
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  };

  const loadEarlier = () => {
    if (messages.length && hasMore && !loadingEarlier) loadMessages(messages[0].createdAt);
  };

  const connectionLabel = connection === 'connected'
    ? peerOnline === true ? 'Online' : peerOnline === false ? 'Offline' : 'Checking availability'
    : connection === 'connecting' || connection === 'initialized' ? 'Connecting…'
      : connection === 'failed' ? 'Connection unavailable' : 'Reconnecting…';

  if (!authorized) return null;

  return (
    <section className="mx-auto flex h-[calc(100dvh-4rem)] min-h-[520px] w-full max-w-7xl flex-col overflow-hidden bg-slate-50 sm:h-[calc(100dvh-5rem)] sm:p-4">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:rounded-t-2xl sm:border sm:px-5">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black text-slate-900 sm:text-xl">Messages & Calls</h1>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${peerOnline === true ? 'bg-emerald-500' : peerOnline === false ? 'bg-slate-300' : 'animate-pulse bg-amber-400'}`} />
            <span>
              {bootstrap?.peer?.name || 'Secure conversation'}
              {bootstrap?.peer?.role ? ` · ${bootstrap.peer.role.replaceAll('_', ' ')}` : ''}
              {' · '}{connectionLabel}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => startCall('AUDIO')} disabled={!bootstrap || Boolean(call)} className="rounded-xl p-2.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40" aria-label="Start audio call" title="Audio call"><Phone size={19} /></button>
          <button type="button" onClick={() => startCall('VIDEO')} disabled={!bootstrap || Boolean(call)} className="rounded-xl p-2.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40" aria-label="Start video call" title="Video call"><Video size={19} /></button>
        </div>
      </header>
      {callError && <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert"><span>{callError}</span><button type="button" onClick={() => setCallError('')} aria-label="Dismiss call error"><X size={16} /></button></div>}

      <nav className="flex shrink-0 border-b border-slate-200 bg-white sm:hidden" aria-label="Messages and call history">
        <button type="button" onClick={() => setActiveTab('messages')} className={`flex-1 py-2.5 text-sm font-bold ${activeTab === 'messages' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}>Messages {unreadCount > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-xs text-rose-700">{unreadCount}</span>}</button>
        <button type="button" onClick={() => setActiveTab('calls')} className={`flex-1 py-2.5 text-sm font-bold ${activeTab === 'calls' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}>Call history</button>
      </nav>

      <div className="flex min-h-0 flex-1 overflow-hidden sm:rounded-b-2xl sm:border sm:border-t-0 sm:border-slate-200">
        <aside className={`${activeTab === 'calls' ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-slate-200 bg-white sm:flex sm:w-72 lg:w-80`}>
          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className="m-3 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-left hover:bg-indigo-50"
            aria-label={`Open conversation with ${bootstrap?.peer?.name || 'contact'}`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white">
              {(bootstrap?.peer?.name || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900">{bootstrap?.peer?.name || 'Loading contact…'}</span>
              <span className="block truncate text-xs text-slate-500">
                {bootstrap?.peer?.role?.replaceAll('_', ' ') || 'Conversation'}{messages.length ? ` · ${messages[messages.length - 1].text || (messages[messages.length - 1].type === 'IMAGE' ? 'Image' : 'Voice message')}` : ' · No messages yet'}
              </span>
            </span>
            {unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 font-bold text-slate-800"><PhoneCall size={17} className="text-indigo-600" />Recent calls</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {calls.length ? calls.map((entry) => {
              const outgoing = String(entry.caller?.id) === selfId;
              const status = String(entry.status || '').toLowerCase();
              return (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl px-2 py-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${status === 'accepted' || status === 'ended' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {entry.type === 'VIDEO' ? <Camera size={16} /> : <Phone size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{outgoing ? `You called ${entry.callee?.name || bootstrap?.peer?.name}` : entry.caller?.name || bootstrap?.peer?.name}</p>
                    <p className="truncate text-xs capitalize text-slate-500">{status} {entry.durationSeconds ? `· ${formatDuration(entry.durationSeconds)}` : ''}</p>
                  </div>
                  <time className="shrink-0 text-[10px] text-slate-400" dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                </div>
              );
            }) : <p className="p-4 text-center text-sm text-slate-500">No calls yet.</p>}
          </div>
        </aside>

        <div className={`${activeTab === 'messages' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col bg-slate-100 sm:flex`}>
          <div ref={messageListRef} onScroll={(event) => {
            const list = event.currentTarget;
            wasAtBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
          }} className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5">
            {hasMore && <div className="text-center"><button type="button" onClick={loadEarlier} disabled={loadingEarlier} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-white disabled:opacity-50">{loadingEarlier ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronUp size={14} />}Load earlier messages</button></div>}
            {!bootstrap && <div className="mx-auto max-w-md py-10 text-center"><p className="text-sm font-semibold text-slate-700">{bootstrapError || 'Connecting to secure conversation…'}</p>{bootstrapError && <button type="button" onClick={retryBootstrap} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">Retry connection</button>}</div>}
            {loading && bootstrap && <p className="py-8 text-center text-sm text-slate-500">Loading conversation…</p>}
            {!loading && messages.length === 0 && <div className="grid h-full place-items-center text-center"><div><MessagesSquare size={32} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No messages yet</p><p className="mt-1 text-xs text-slate-500">Send a message to start the conversation.</p></div></div>}
            {messages.map((message) => (
              <MessageBubble key={message.id || message.clientMessageId} message={message} own={String(message.sender?.id) === selfId} />
            ))}
            {typing && <p className="pl-2 text-xs font-medium text-slate-500" aria-live="polite">{bootstrap?.peer?.name || 'Contact'} is typing…</p>}
            <div aria-live="polite" className="sr-only">{unreadCount ? `${unreadCount} unread messages` : ''}</div>
          </div>
          {error && <div className="flex items-start justify-between gap-2 border-t border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
          {voicePreview && (
            <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
              <audio controls src={voicePreview.url} className="h-9 min-w-0 flex-1" aria-label="Recorded voice preview" />
              <span className="shrink-0 text-xs text-slate-500">{formatDuration(voicePreview.duration)}</span>
              <button type="button" onClick={() => setVoicePreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Discard voice recording"><X size={17} /></button>
              <button type="button" onClick={() => uploadAndSend(voicePreview.file, 'VOICE')} disabled={busy} className="rounded-lg bg-indigo-600 p-2 text-white disabled:opacity-50" aria-label="Send voice recording"><Send size={17} /></button>
            </div>
          )}
          {imagePreview && (
            <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-3 py-2">
              <img src={imagePreview.url} alt="Image preview before sending" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{imagePreview.file.name}</span>
              <button type="button" onClick={() => setImagePreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cancel image attachment"><X size={17} /></button>
              <button type="button" onClick={() => uploadAndSend(imagePreview.file, 'IMAGE')} disabled={busy} className="rounded-lg bg-indigo-600 p-2 text-white disabled:opacity-50" aria-label="Send image"><Send size={17} /></button>
            </div>
          )}
          {recording && <div className="flex items-center gap-2 border-t border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />Recording · {formatDuration(recordingSeconds)}<button type="button" onClick={stopRecording} className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold hover:bg-rose-100" aria-label="Stop recording"><Square size={14} />Stop</button></div>}
          {uploading && <div className="h-1 w-full bg-slate-200" role="progressbar" aria-label="Attachment upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><div className="h-full bg-indigo-500 transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>}
          <form onSubmit={submitText} className="flex shrink-0 items-end gap-1.5 border-t border-slate-200 bg-white p-2.5 sm:gap-2 sm:p-3">
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={selectImage} aria-label="Choose an image" />
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={busy || recording || Boolean(voicePreview) || Boolean(imagePreview)} className="rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label="Attach image"><ImagePlus size={20} /></button>
            <button type="button" onClick={recording ? stopRecording : startRecording} disabled={busy || Boolean(voicePreview) || Boolean(imagePreview)} className={`rounded-xl p-2.5 hover:bg-slate-100 disabled:opacity-40 ${recording ? 'text-rose-600' : 'text-slate-600'}`} aria-label={recording ? 'Stop voice recording' : 'Record voice message'}>{recording ? <Square size={19} /> : <Mic size={20} />}</button>
            <textarea
              ref={messageInputRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submitText(event);
                }
              }}
              maxLength={5000}
              rows={1}
              placeholder="Write a message… (Enter to send)"
              disabled={busy || recording || Boolean(voicePreview) || Boolean(imagePreview)}
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
              aria-label="Message"
            />
            <button type="submit" disabled={busy || !text.trim() || recording || Boolean(voicePreview) || Boolean(imagePreview)} className="rounded-xl bg-indigo-600 p-3 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">{busy ? <LoaderCircle size={19} className="animate-spin" /> : <Send size={19} />}</button>
          </form>
          <p className="bg-white pb-2 text-center text-[10px] text-slate-400">Shift + Enter for a new line · Attachments are securely shared</p>
        </div>
      </div>
    </section>
  );
}

export default MessagesCallsPage;
