import { createHash } from 'node:crypto';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_SIGNAL_BYTES = 16 * 1024;
export const CLOUDINARY_URL_TTL_SECONDS = 5 * 60;

export class CommunicationError extends Error {
  constructor(message, status = 400, code = 'COMMUNICATION_ERROR') {
    super(message);
    this.name = 'CommunicationError';
    this.status = status;
    this.code = code;
  }
}

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const resolveConfiguredParticipants = (config, users) => {
  const adminEmail = normalizeEmail(config.adminEmail);
  const dataEntryEmail = normalizeEmail(config.dataEntryEmail);
  if (!adminEmail || !dataEntryEmail || adminEmail === dataEntryEmail) {
    throw new CommunicationError(
      'Communications are unavailable: set distinct COMMUNICATION_ADMIN_EMAIL and COMMUNICATION_DATA_ENTRY_EMAIL values.',
      503,
      'COMMUNICATION_CONFIG_ERROR'
    );
  }

  const activeUsers = (users || []).filter((user) => user?.isActive === true);
  const findUnique = (email, role, settingName) => {
    const matches = activeUsers.filter((user) => normalizeEmail(user.email) === email);
    if (matches.length !== 1 || matches[0].role !== role) {
      throw new CommunicationError(
        `Communications are unavailable: ${settingName} must resolve to exactly one active ${role} account.`,
        503,
        'COMMUNICATION_CONFIG_ERROR'
      );
    }
    return matches[0];
  };

  const admin = findUnique(adminEmail, 'ADMIN', 'COMMUNICATION_ADMIN_EMAIL');
  const dataEntry = findUnique(dataEntryEmail, 'DATA_ENTRY', 'COMMUNICATION_DATA_ENTRY_EMAIL');
  if (String(admin._id) === String(dataEntry._id)) {
    throw new CommunicationError(
      'Communications are unavailable: the configured participant accounts must be different users.',
      503,
      'COMMUNICATION_CONFIG_ERROR'
    );
  }
  return [admin, dataEntry];
};

export const getConversationContext = (participants, authenticatedUserId) => {
  const self = participants.find((user) => String(user._id) === String(authenticatedUserId));
  if (!self) {
    throw new CommunicationError('This account is not authorized to use communications.', 403, 'COMMUNICATION_FORBIDDEN');
  }
  const peer = participants.find((user) => String(user._id) !== String(self._id));
  const sortedIds = participants.map((user) => String(user._id)).sort();
  const conversationId = createHash('sha256').update(sortedIds.join(':')).digest('hex');
  return {
    self,
    peer,
    conversationId,
    channelName: `communications:${conversationId}`,
  };
};

export const validateMessageInput = (body = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const { clientMessageId, type } = body;
  if (typeof clientMessageId !== 'string' || !clientMessageId.trim() || clientMessageId.length > 128) {
    throw new CommunicationError('clientMessageId is required and must be at most 128 characters.');
  }
  if (!['TEXT', 'IMAGE', 'VOICE'].includes(type)) {
    throw new CommunicationError('type must be TEXT, IMAGE, or VOICE.');
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (type === 'TEXT' && (!text || text.length > 5000)) {
    throw new CommunicationError('Text messages must contain 1–5000 characters.');
  }
  if (type !== 'TEXT' && text.length > 1000) {
    throw new CommunicationError('Attachment captions must be at most 1000 characters.');
  }
  if (type === 'TEXT' && body.attachmentId) {
    throw new CommunicationError('Text messages cannot include an attachment.');
  }
  if (type !== 'TEXT' && (typeof body.attachmentId !== 'string' || !body.attachmentId)) {
    throw new CommunicationError(`${type} messages require attachmentId.`);
  }

  return { clientMessageId: clientMessageId.trim(), type, text, attachmentId: body.attachmentId || null };
};

export const validateAttachmentFile = (file) => {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new CommunicationError('Select a supported image or audio file.');
  }
  const extension = String(file.originalname || '').split('.').pop().toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();
  const imageTypes = new Map([
    ['image/jpeg', ['jpg', 'jpeg']],
    ['image/png', ['png']],
    ['image/webp', ['webp']],
    ['image/gif', ['gif']],
  ]);
  const audioTypes = new Map([
    ['audio/mpeg', ['mp3']],
    ['audio/mp4', ['m4a']],
    ['audio/aac', ['aac']],
    ['audio/wav', ['wav']],
    ['audio/x-wav', ['wav']],
    ['audio/ogg', ['ogg', 'oga']],
    ['audio/webm', ['webm']],
  ]);

  const isImage = imageTypes.get(mimeType)?.includes(extension) === true;
  const isAudio = audioTypes.get(mimeType)?.includes(extension) === true;
  if (!isImage && !isAudio) {
    throw new CommunicationError('File MIME type and extension must match a supported image or audio format.');
  }
  const maximum = isImage ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (file.size > maximum) {
    throw new CommunicationError(
      `${isImage ? 'Images' : 'Audio'} must not exceed ${isImage ? '10 MB' : '20 MB'}.`,
      413,
      'COMMUNICATION_FILE_TOO_LARGE'
    );
  }

  const bytes = file.buffer;
  const matchesSignature = isImage
    ? (mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (mimeType === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) ||
      (mimeType === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    : (mimeType === 'audio/mpeg' && (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) ||
      ((mimeType === 'audio/wav' || mimeType === 'audio/x-wav') && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') ||
      (mimeType === 'audio/ogg' && bytes.subarray(0, 4).toString() === 'OggS') ||
      (mimeType === 'audio/webm' && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) ||
      ((mimeType === 'audio/mp4' || mimeType === 'audio/aac') &&
        (bytes.subarray(4, 8).toString() === 'ftyp' || (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0)));
  if (!matchesSignature) {
    throw new CommunicationError('File contents do not match the declared image or audio format.');
  }

  return {
    kind: isImage ? 'IMAGE' : 'VOICE',
    resourceType: isImage ? 'image' : 'video',
    originalName: String(file.originalname).split(/[\\/]/).pop().slice(0, 255),
    mimeType,
    size: file.size,
  };
};

export const getCallTransition = (call, actorId, action) => {
  const actor = String(actorId);
  const caller = String(call.caller);
  const callee = String(call.callee);
  if (!['accept', 'decline', 'cancel', 'end', 'missed'].includes(action)) {
    throw new CommunicationError('action must be accept, decline, cancel, end, or missed.');
  }
  if (call.status === 'RINGING') {
    if (action === 'accept' && actor === callee) return { status: 'ACCEPTED', active: true, startedAt: new Date() };
    if (action === 'decline' && actor === callee) return { status: 'DECLINED', active: false };
    if (action === 'missed' && actor === callee) return { status: 'MISSED', active: false };
    if (action === 'cancel' && actor === caller) return { status: 'CANCELLED', active: false };
  } else if (call.status === 'ACCEPTED' && action === 'end' && (actor === caller || actor === callee)) {
    const endedAt = new Date();
    const startedAt = call.startedAt ? new Date(call.startedAt) : endedAt;
    return {
      status: 'ENDED',
      active: false,
      endedAt,
      durationSeconds: Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)),
    };
  }
  throw new CommunicationError('This action is not allowed for the current call state or participant.', 409, 'INVALID_CALL_TRANSITION');
};

export const validateSignalInput = (body = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const { kind, payload } = body;
  if (!['offer', 'answer', 'ice-candidate'].includes(kind)) {
    throw new CommunicationError('kind must be offer, answer, or ice-candidate.');
  }
  if (payload === undefined || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CommunicationError('payload must be a JSON object.');
  }
  if (kind === 'offer' || kind === 'answer') {
    if (payload.type !== kind || typeof payload.sdp !== 'string' || !payload.sdp.trim()) {
      throw new CommunicationError(`${kind} payload must include matching type and SDP.`);
    }
    if (payload.sdp.length > MAX_SIGNAL_BYTES) {
      throw new CommunicationError('Signaling payload must not exceed 16 KB.', 413, 'SIGNAL_TOO_LARGE');
    }
  } else if (
    typeof payload.candidate !== 'string' ||
    !payload.candidate.trim() ||
    payload.candidate.length > 4096 ||
    (payload.sdpMid !== undefined && payload.sdpMid !== null && typeof payload.sdpMid !== 'string') ||
    (payload.sdpMLineIndex !== undefined && payload.sdpMLineIndex !== null &&
      (!Number.isInteger(payload.sdpMLineIndex) || payload.sdpMLineIndex < 0))
  ) {
    throw new CommunicationError('ice-candidate payload must contain a valid candidate and optional media identifiers.');
  }
  let size;
  try {
    size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    throw new CommunicationError('payload must be valid JSON.');
  }
  if (size > MAX_SIGNAL_BYTES) {
    throw new CommunicationError('Signaling payload must not exceed 16 KB.', 413, 'SIGNAL_TOO_LARGE');
  }
  return { kind, payload };
};

export const getIceServers = (env = process.env) => {
  const urlsValue = String(env.TURN_URLS || '').trim();
  const username = String(env.TURN_USERNAME || '').trim();
  const credential = String(env.TURN_CREDENTIAL || '').trim();
  if (!urlsValue && !username && !credential) {
    return [{ urls: ['stun:stun.l.google.com:19302'] }];
  }
  const urls = urlsValue.startsWith('[')
    ? (() => {
        try {
          return JSON.parse(urlsValue);
        } catch {
          return null;
        }
      })()
    : urlsValue.split(',').map((url) => url.trim()).filter(Boolean);
  if (
    !Array.isArray(urls) ||
    urls.length === 0 ||
    urls.some((url) => typeof url !== 'string' || !/^turns?:/i.test(url)) ||
    !username ||
    !credential
  ) {
    throw new CommunicationError(
      'TURN configuration is incomplete or invalid; configure TURN_URLS, TURN_USERNAME, and TURN_CREDENTIAL together.',
      503,
      'COMMUNICATION_CONFIG_ERROR'
    );
  }
  return [{ urls, username, credential }];
};
