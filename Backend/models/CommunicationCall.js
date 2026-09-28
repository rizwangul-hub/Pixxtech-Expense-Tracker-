import mongoose from 'mongoose';

const communicationCallSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    callee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['AUDIO', 'VIDEO'], required: true },
    status: {
      type: String,
      enum: ['RINGING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'ENDED', 'MISSED'],
      default: 'RINGING',
      required: true,
    },
    active: { type: Boolean, default: true, required: true },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

communicationCallSchema.index(
  { conversationId: 1, active: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);
communicationCallSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.model('CommunicationCall', communicationCallSchema);
