import mongoose from 'mongoose';

const aiPdfReportSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: 'Financial Report',
    },
    mimeType: {
      type: String,
      default: 'application/pdf',
    },
    buffer: {
      type: Buffer,
      required: true,
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    reportType: {
      type: String,
      default: 'GENERAL',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    userId: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically prune PDF reports from MongoDB after expiration
aiPdfReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiPdfReport = mongoose.model('AiPdfReport', aiPdfReportSchema);
export default AiPdfReport;
