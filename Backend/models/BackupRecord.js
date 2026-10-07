import mongoose from 'mongoose';

/**
 * BackupRecord Schema
 * Persists metadata for created and uploaded backups.
 */
const backupRecordSchema = new mongoose.Schema(
  {
    backupMonth: {
      type: String, // '2026-08' or 'ALL'
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: '',
    },
    backupVersion: {
      type: String,
      default: '1.0.0',
    },
    schemaVersion: {
      type: String,
      default: '1.0.0',
    },
    checksum: {
      type: String,
      default: '',
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    collectionsCount: {
      type: Number,
      default: 0,
    },
    totalDocuments: {
      type: Number,
      default: 0,
    },
    documentCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    collectionsList: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'FAILED', 'VALIDATED', 'RESTORED'],
      default: 'COMPLETED',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByName: {
      type: String,
      default: 'Administrator',
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

export const BackupRecord = mongoose.model('BackupRecord', backupRecordSchema);
export default BackupRecord;
