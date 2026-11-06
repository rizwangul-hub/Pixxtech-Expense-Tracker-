import AssistantRateLimit from '../models/AssistantRateLimit.js';
import { validateQuestion } from '../services/ai/assistantSecurity.js';
// Shared MongoDB counters survive serverless restarts and separate instances.
export const aiRateLimiter = (limit = 10, windowMs = 60000, Model = AssistantRateLimit) => async (req, res, next) => {
  if (!req.user?._id) return res.status(401).json({ success: false, message: 'Authentication required.' });
  const bucket = Math.floor(Date.now() / windowMs);
  const key = `${req.user._id}:finance:${bucket}`;
  try {
    let counter;
    try {
      counter = await Model.findOneAndUpdate({ key }, { $inc: { count: 1 }, $setOnInsert: { resetAt: new Date((bucket + 1) * windowMs) } }, { upsert: true, new: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      counter = await Model.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { new: true });
    }
    if (!counter || counter.count > limit) {
      res.set?.('Retry-After', String(Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)));
      return res.status(429).json({ success: false, message: 'Too many assistant requests. Please retry shortly.' });
    }
    next();
  } catch { return res.status(503).json({ success: false, message: 'Assistant rate limiting is temporarily unavailable.' }); }
};
export const validateAiQuestion = (req, res, next) => {
  try { validateQuestion(req.body); req.body.message = req.body.message.trim(); next(); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};
