import CommunicationRateLimit from '../models/CommunicationRateLimit.js';

export const communicationRateLimit = ({ action, limit, windowMs }) => async (req, res, next) => {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${String(req.user._id)}:${action}:${bucket}`;
  try {
    const counter = await CommunicationRateLimit.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { resetAt: new Date((bucket + 1) * windowMs) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (counter.count > limit) {
      return res.status(429).json({ success: false, message: 'Too many communication requests. Please retry shortly.' });
    }
    return next();
  } catch (error) {
    if (error?.code === 11000) {
      try {
        const counter = await CommunicationRateLimit.findOneAndUpdate(
          { key },
          { $inc: { count: 1 } },
          { new: true }
        );
        if (counter.count > limit) {
          return res.status(429).json({ success: false, message: 'Too many communication requests. Please retry shortly.' });
        }
        return next();
      } catch (retryError) {
        return next(retryError);
      }
    }
    return next(error);
  }
};
