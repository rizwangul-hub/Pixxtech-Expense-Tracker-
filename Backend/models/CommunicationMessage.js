import mongoose from 'mongoose';

const communicationMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientMessageId: { type: String, required: true, maxlength: 128 },
    type: { type: String, enum: ['TEXT', 'IMAGE', 'VOICE'], required: true },
    text: { type: String, maxlength: 5000, default: '' },
    attachment: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunicationAttachment', default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

communicationMessageSchema.index({ sender: 1, clientMessageId: 1 }, { unique: true });
communicationMessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
communicationMessageSchema.index({ conversationId: 1, recipient: 1, readAt: 1 });

export default mongoose.model('CommunicationMessage', communicationMessageSchema);
