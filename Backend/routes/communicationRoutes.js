import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { communicationRateLimit } from '../middleware/communicationRateLimit.js';
import {
  bootstrap,
  createCall,
  createMessage,
  createTokenRequest,
  getAttachmentUrl,
  listCalls,
  listMessages,
  markDelivered,
  markRead,
  publishTyping,
  sendCallSignal,
  updateCall,
  uploadAttachment,
  uploadErrorHandler,
} from '../controllers/communicationController.js';

const router = express.Router();
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const supportedMimeTypes = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav',
      'audio/ogg', 'audio/webm',
    ]);
    if (!supportedMimeTypes.has(String(file.mimetype).toLowerCase())) {
      return callback(new Error('Only supported image and audio formats are allowed.'));
    }
    return callback(null, true);
  },
}).single('file');

router.use(protect);
router.get('/bootstrap', bootstrap);
router.post('/token', createTokenRequest);
router.get('/messages', listMessages);
router.post('/messages', communicationRateLimit({ action: 'message', limit: 30, windowMs: 60_000 }), createMessage);
router.post('/messages/:id/delivered', markDelivered);
router.post('/messages/read', markRead);
router.post(
  '/attachments',
  communicationRateLimit({ action: 'attachment', limit: 10, windowMs: 10 * 60_000 }),
  uploadErrorHandler(attachmentUpload),
  uploadAttachment
);
router.get('/attachments/:id/url', getAttachmentUrl);
router.get('/calls', listCalls);
router.post('/calls', communicationRateLimit({ action: 'call', limit: 5, windowMs: 60_000 }), createCall);
router.patch('/calls/:id', updateCall);
router.post(
  '/calls/:id/signals',
  communicationRateLimit({ action: 'signal', limit: 120, windowMs: 60_000 }),
  sendCallSignal
);
router.post('/typing', communicationRateLimit({ action: 'typing', limit: 60, windowMs: 60_000 }), publishTyping);

export default router;
