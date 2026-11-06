import mongoose from 'mongoose';

/**
 * BankStatementAttachment Schema
 * Stores uploaded bank statement documents (PDF or images) associated with
 * a specific bank or cash account for a given financial month.
 * Automatically merged into the official monthly report PDF right after
 * the account's computed ledger statement.
 */
const statementFileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true,
    trim: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    enum: ['PDF', 'IMAGE'],
    required: true,
  },
  size: {
    type: Number,
    default: 0,
  },
  url: {
    type: String,
    default: '',
  },
  dataBase64: {
    type: String,
    default: '',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const bankStatementAttachmentSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: true,
      trim: true,
      index: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format'],
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      default: '',
    },
    files: [statementFileSchema],
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedByName: {
      type: String,
      default: 'System User',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

bankStatementAttachmentSchema.index({ month: 1, accountId: 1 }, { unique: true });

export const BankStatementAttachment = mongoose.model(
  'BankStatementAttachment',
  bankStatementAttachmentSchema
);

export default BankStatementAttachment;
