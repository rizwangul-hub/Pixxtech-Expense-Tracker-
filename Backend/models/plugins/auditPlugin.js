import mongoose from 'mongoose';

/**
 * Reusable Audit Fields Definition
 * Provides a standard audit trail architecture for financial and operational records.
 */
export const auditFields = {
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  submittedAt: {
    type: Date,
    default: null,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  approvedAt: {
    type: Date,
    default: null,
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  rejectedAt: {
    type: Date,
    default: null,
  },
};

/**
 * Mongoose schema plugin that injects standard audit fields
 * @param {mongoose.Schema} schema
 */
export const auditPlugin = (schema) => {
  schema.add(auditFields);
};

export default auditPlugin;
