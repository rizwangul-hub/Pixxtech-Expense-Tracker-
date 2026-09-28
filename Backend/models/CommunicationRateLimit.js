import mongoose from 'mongoose';

const communicationRateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  resetAt: { type: Date, required: true },
});

communicationRateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('CommunicationRateLimit', communicationRateLimitSchema);
