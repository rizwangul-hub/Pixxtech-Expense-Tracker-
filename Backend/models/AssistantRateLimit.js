import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  resetAt: { type: Date, required: true },
});
schema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('AssistantRateLimit', schema);
