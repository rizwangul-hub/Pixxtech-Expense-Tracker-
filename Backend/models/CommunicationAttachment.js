import mongoose from 'mongoose';

const communicationAttachmentSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publicId: { type: String, required: true, unique: true, select: false },
    resourceType: { type: String, enum: ['image', 'video'], required: true },
    deliveryType: { type: String, enum: ['authenticated'], default: 'authenticated', required: true },
    format: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

communicationAttachmentSchema.index({ conversationId: 1, sender: 1, createdAt: -1 });

export default mongoose.model('CommunicationAttachment', communicationAttachmentSchema);
