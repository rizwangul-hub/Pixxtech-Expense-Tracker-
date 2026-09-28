import { Readable } from 'node:stream';
import Ably from 'ably';
import multer from 'multer';
import { User } from '../models/User.js';
import CommunicationMessage from '../models/CommunicationMessage.js';
import CommunicationAttachment from '../models/CommunicationAttachment.js';
import CommunicationCall from '../models/CommunicationCall.js';
import cloudinary, { configureCloudinary } from '../config/cloudinary.js';
import {
  CLOUDINARY_URL_TTL_SECONDS,
  CommunicationError,
  getCallTransition,
  getConversationContext,
  getIceServers,
  normalizeEmail,
  resolveConfiguredParticipants,
  validateAttachmentFile,
  validateMessageInput,
  validateSignalInput,
} from '../services/communicationService.js';

const getContext = async (req) => {
  const adminEmail = normalizeEmail(process.env.COMMUNICATION_ADMIN_EMAIL);
  const dataEntryEmail = normalizeEmail(process.env.COMMUNICATION_DATA_ENTRY_EMAIL);
  const participants = resolveConfiguredParticipants(
    { adminEmail, dataEntryEmail },
    await User.find({ email: { $in: [adminEmail, dataEntryEmail].filter(Boolean) } }).select('name email role isActive')
  );
  return getConversationContext(participants, req.user._id);
};

const getAbly = () => {
  if (!process.env.ABLY_API_KEY) {
    throw new CommunicationError('Communications are unavailable: ABLY_API_KEY is not configured.', 503, 'COMMUNICATION_CONFIG_ERROR');
  }
  return new Ably.Rest({ key: process.env.ABLY_API_KEY });
};

const publish = async (channelName, eventName, data) => {
  try {
    await getAbly().channels.get(channelName).publish(eventName, data);
  } catch (error) {
    if (error instanceof CommunicationError) throw error;
    console.error(`[Communications] Ably publish failed (${eventName}).`);
    throw new CommunicationError('The item was saved, but realtime delivery failed. Retry the request or refresh.', 503, 'REALTIME_DELIVERY_FAILED');
  }
};

const toAttachment = (attachment) => {
  if (!attachment) return null;
  return {
    id: String(attachment._id),
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
};

const toMessage = (message) => ({
  id: String(message._id),
  clientMessageId: message.clientMessageId,
  type: message.type,
  text: message.text,
  attachment: toAttachment(message.attachment),
  sender: {
    id: String(message.sender._id),
    name: message.sender.name,
    role: message.sender.role,
  },
  deliveredAt: message.deliveredAt,
  readAt: message.readAt,
  createdAt: message.createdAt,
});

const populateMessage = (query) =>
  query
    .populate('sender', 'name role')
    .populate('attachment', 'originalName mimeType size');

const handleAsync = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export const bootstrap = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const [unreadCount] = await Promise.all([
    CommunicationMessage.countDocuments({
      conversationId: context.conversationId,
      recipient: context.self._id,
      readAt: null,
    }),
  ]);
  return res.json({
    success: true,
    data: {
      self: { id: String(context.self._id), name: context.self.name, role: context.self.role },
      peer: { id: String(context.peer._id), name: context.peer.name, role: context.peer.role },
      conversationId: context.conversationId,
      channelName: context.channelName,
      unreadCount,
      iceServers: getIceServers(),
    },
  });
});

export const createTokenRequest = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const tokenRequest = await getAbly().auth.createTokenRequest({
    clientId: String(context.self._id),
    capability: JSON.stringify({ [context.channelName]: ['subscribe'] }),
  });
  return res.json({ success: true, data: tokenRequest });
});

export const listMessages = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const rawLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1) {
    throw new CommunicationError('limit must be a positive integer.');
  }
  const limit = Math.min(rawLimit, 100);
  const query = { conversationId: context.conversationId };
  if (req.query.before !== undefined) {
    const before = new Date(req.query.before);
    if (Number.isNaN(before.getTime())) throw new CommunicationError('before must be a valid ISO date.');
    query.createdAt = { $lt: before };
  }
  const records = await populateMessage(
    CommunicationMessage.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit)
  );
  const messages = records.reverse().map(toMessage);
  return res.json({ success: true, data: { messages, hasMore: records.length === limit } });
});

export const createMessage = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const input = validateMessageInput(req.body);
  let attachment = null;
  if (input.attachmentId) {
    attachment = await CommunicationAttachment.findOne({
      _id: input.attachmentId,
      conversationId: context.conversationId,
      sender: context.self._id,
    });
    if (!attachment) throw new CommunicationError('Attachment not found or does not belong to this sender.', 404, 'ATTACHMENT_NOT_FOUND');
    if ((input.type === 'IMAGE' && attachment.resourceType !== 'image') ||
        (input.type === 'VOICE' && attachment.resourceType !== 'video')) {
      throw new CommunicationError('Attachment media type does not match the message type.');
    }
  }

  let message;
  try {
    message = await CommunicationMessage.create({
      conversationId: context.conversationId,
      sender: context.self._id,
      recipient: context.peer._id,
      clientMessageId: input.clientMessageId,
      type: input.type,
      text: input.text,
      attachment: attachment?._id || null,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    message = await CommunicationMessage.findOne({
      sender: context.self._id,
      clientMessageId: input.clientMessageId,
    });
    if (!message) throw error;
    const samePayload =
      message.type === input.type &&
      message.text === input.text &&
      String(message.attachment || '') === String(attachment?._id || '');
    if (!samePayload) {
      throw new CommunicationError('clientMessageId has already been used with different message content.', 409, 'IDEMPOTENCY_CONFLICT');
    }
  }

  const saved = await populateMessage(CommunicationMessage.findById(message._id));
  const publicMessage = toMessage(saved);
  await publish(context.channelName, 'message:new', publicMessage);
  return res.status(201).json({ success: true, data: publicMessage });
});

export const markDelivered = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const message = await CommunicationMessage.findOneAndUpdate(
    {
      _id: req.params.id,
      conversationId: context.conversationId,
      recipient: context.self._id,
      deliveredAt: null,
    },
    { $set: { deliveredAt: new Date() } },
    { new: true }
  );
  if (message) {
    await publish(context.channelName, 'message:delivered', {
      messageId: String(message._id),
      deliveredAt: message.deliveredAt,
      recipientId: String(context.self._id),
    });
  } else {
    const existing = await CommunicationMessage.findOne({
      _id: req.params.id,
      conversationId: context.conversationId,
      recipient: context.self._id,
    }).select('_id');
    if (!existing) throw new CommunicationError('Message not found.', 404, 'MESSAGE_NOT_FOUND');
  }
  return res.json({ success: true, data: { messageId: req.params.id, delivered: true } });
});

export const markRead = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const readAt = new Date();
  const result = await CommunicationMessage.updateMany(
    { conversationId: context.conversationId, recipient: context.self._id, readAt: null },
    { $set: { readAt, deliveredAt: readAt } }
  );
  if (result.modifiedCount > 0) {
    await publish(context.channelName, 'messages:read', {
      readerId: String(context.self._id),
      readAt,
    });
  }
  return res.json({ success: true, data: { readCount: result.modifiedCount, readAt } });
});

const uploadToCloudinary = (file, resourceType) =>
  new Promise((resolve, reject) => {
    if (!configureCloudinary()) {
      reject(new CommunicationError('Communications are unavailable: Cloudinary is not configured.', 503, 'COMMUNICATION_CONFIG_ERROR'));
      return;
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'pixx-expense-tracker/communications',
        resource_type: resourceType,
        type: 'authenticated',
        access_mode: 'authenticated',
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    Readable.from(file.buffer).pipe(stream);
  });

export const uploadAttachment = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const file = req.file;
  const metadata = validateAttachmentFile(file);
  let cloudAsset;
  try {
    cloudAsset = await uploadToCloudinary(file, metadata.resourceType);
    const attachment = await CommunicationAttachment.create({
      conversationId: context.conversationId,
      sender: context.self._id,
      publicId: cloudAsset.public_id,
      resourceType: metadata.resourceType,
      deliveryType: 'authenticated',
      format: cloudAsset.format,
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      size: metadata.size,
    });
    return res.status(201).json({
      success: true,
      data: {
        id: String(attachment._id),
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
      },
    });
  } catch (error) {
    if (cloudAsset?.public_id && configureCloudinary()) {
      cloudinary.uploader.destroy(cloudAsset.public_id, { resource_type: metadata.resourceType, type: 'authenticated' }).catch(() => {});
    }
    if (error instanceof CommunicationError) throw error;
    console.error('[Communications] Cloudinary upload failed.');
    throw new CommunicationError('Attachment storage failed. Please retry.', 502, 'ATTACHMENT_UPLOAD_FAILED');
  }
});

export const getAttachmentUrl = handleAsync(async (req, res) => {
  const context = await getContext(req);
  if (!configureCloudinary()) {
    throw new CommunicationError('Communications are unavailable: Cloudinary is not configured.', 503, 'COMMUNICATION_CONFIG_ERROR');
  }
  const attachment = await CommunicationAttachment.findOne({
    _id: req.params.id,
    conversationId: context.conversationId,
  }).select('+publicId');
  if (!attachment) throw new CommunicationError('Attachment not found.', 404, 'ATTACHMENT_NOT_FOUND');
  const expiresAt = Math.floor(Date.now() / 1000) + CLOUDINARY_URL_TTL_SECONDS;
  const url = cloudinary.utils.private_download_url(attachment.publicId, attachment.format, {
    resource_type: attachment.resourceType,
    type: attachment.deliveryType,
    expires_at: expiresAt,
    secure: true,
  });
  return res.json({ success: true, data: { url, expiresAt } });
});

export const listCalls = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const rawLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1) throw new CommunicationError('limit must be a positive integer.');
  const calls = await CommunicationCall.find({ conversationId: context.conversationId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(rawLimit, 100))
    .populate('caller', 'name role')
    .populate('callee', 'name role');
  return res.json({
    success: true,
    data: calls.map((call) => ({
      id: String(call._id),
      type: call.type,
      status: call.status,
      caller: { id: String(call.caller._id), name: call.caller.name, role: call.caller.role },
      callee: { id: String(call.callee._id), name: call.callee.name, role: call.callee.role },
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      durationSeconds: call.durationSeconds,
      createdAt: call.createdAt,
    })),
  });
});

export const createCall = handleAsync(async (req, res) => {
  const context = await getContext(req);
  if (!['AUDIO', 'VIDEO'].includes(req.body?.type)) {
    throw new CommunicationError('type must be AUDIO or VIDEO.');
  }
  let call;
  try {
    call = await CommunicationCall.create({
      conversationId: context.conversationId,
      caller: context.self._id,
      callee: context.peer._id,
      type: req.body.type,
      status: 'RINGING',
      active: true,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new CommunicationError('A call is already active for this conversation.', 409, 'CALL_BUSY');
    }
    throw error;
  }
  const event = {
    callId: String(call._id),
    type: call.type,
    status: call.status,
    callerId: String(context.self._id),
    calleeId: String(context.peer._id),
    createdAt: call.createdAt,
  };
  await publish(context.channelName, 'call:invite', event);
  return res.status(201).json({ success: true, data: event });
});

export const updateCall = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const call = await CommunicationCall.findOne({
    _id: req.params.id,
    conversationId: context.conversationId,
    $or: [{ caller: context.self._id }, { callee: context.self._id }],
  });
  if (!call) throw new CommunicationError('Call not found.', 404, 'CALL_NOT_FOUND');
  const updates = getCallTransition(call, context.self._id, req.body?.action);
  const updated = await CommunicationCall.findOneAndUpdate(
    { _id: call._id, status: call.status, active: true },
    { $set: updates },
    { new: true }
  );
  if (!updated) throw new CommunicationError('Call state changed; refresh call history and retry.', 409, 'INVALID_CALL_TRANSITION');
  const event = {
    callId: String(updated._id),
    status: updated.status,
    actorId: String(context.self._id),
    startedAt: updated.startedAt,
    endedAt: updated.endedAt,
    durationSeconds: updated.durationSeconds,
  };
  await publish(context.channelName, 'call:update', event);
  return res.json({ success: true, data: event });
});

export const sendCallSignal = handleAsync(async (req, res) => {
  const context = await getContext(req);
  const signal = validateSignalInput(req.body);
  const call = await CommunicationCall.findOne({
    _id: req.params.id,
    conversationId: context.conversationId,
    status: 'ACCEPTED',
    active: true,
    $or: [{ caller: context.self._id }, { callee: context.self._id }],
  }).select('_id');
  if (!call) throw new CommunicationError('Active call not found or signaling is not allowed in its current state.', 409, 'CALL_NOT_SIGNALABLE');
  await publish(context.channelName, 'call:signal', {
    callId: String(call._id),
    senderId: String(context.self._id),
    kind: signal.kind,
    payload: signal.payload,
  });
  return res.status(202).json({ success: true });
});

export const publishTyping = handleAsync(async (req, res) => {
  const context = await getContext(req);
  if (typeof req.body?.typing !== 'boolean') throw new CommunicationError('typing must be a boolean.');
  await publish(context.channelName, 'typing', {
    senderId: String(context.self._id),
    typing: req.body.typing,
  });
  return res.status(202).json({ success: true });
});

export const uploadErrorHandler = (upload) => (req, res, next) => {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File exceeds the maximum upload size of 20 MB.' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(400).json({ success: false, message: error.message || 'Invalid upload.' });
  });
};
