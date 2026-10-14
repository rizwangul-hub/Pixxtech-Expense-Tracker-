import mongoose from 'mongoose';

/**
 * Central AuditLog Model
 * Pixx Technologies Property Finance & Expense Tracker
 * Records all system logins, logouts, financial modifications, operational actions, and administrative security events.
 */
const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    userName: {
      type: String,
      required: true,
      default: 'System',
      trim: true,
    },
    userEmail: {
      type: String,
      default: '',
      trim: true,
    },
    userRole: {
      type: String,
      default: '',
    },
    action: {
      type: String, // e.g. LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, CREATE, UPDATE, DELETE, VERIFY, REJECT, UNVERIFY, STATUS_CHANGE, PASSWORD_RESET, BACKUP_CREATE, BACKUP_RESTORE
      required: true,
      index: true,
    },
    module: {
      type: String, // e.g. AUTH, EXPENSE, RENT, OTHER_INCOME, TRANSACTION, VOUCHER, ACCOUNT, PROPERTY, STAFF, PAYROLL, BACKUP, USER
      required: true,
      index: true,
    },
    recordType: {
      type: String, // e.g. User, PendingEntry, Transaction, Voucher, Property, Account, Employee, BackupRecord
      default: '',
      index: true,
    },
    recordId: {
      type: String,
      default: '',
      index: true,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      default: 'SUCCESS',
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    changes: {
      previous: { type: mongoose.Schema.Types.Mixed, default: null },
      updated: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// High performance compound indexes for user history querying and dashboard filtering
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ module: 1, action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
