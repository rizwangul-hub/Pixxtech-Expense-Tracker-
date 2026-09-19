import mongoose from 'mongoose';
import { EXPENSE_CLASSIFICATION_LIST } from '../constants/expenseClassification.js';

/**
 * PendingEntry Schema
 * Staging collection for rent receipts and expense vouchers submitted by Data Entry users.
 * Kept strictly isolated from official Transaction ledger, Account balances, and reports
 * until reviewed and verified by Khurshid Anwar (VERIFICATION_MANAGER) or Fahad Sb (ADMIN).
 */
const pendingEntrySchema = new mongoose.Schema(
  {
    entryType: {
      type: String,
      required: [true, 'Entry type is required'],
      enum: {
        values: ['RENT', 'EXPENSE', 'TRANSFER', 'SALARY', 'OTHER_INCOME'],
        message: 'Invalid entryType',
      },
      index: true,
    },
    expenseClassification: {
      type: String,
      enum: EXPENSE_CLASSIFICATION_LIST,
      default: null,
      index: true,
    },
    attachments: {
      type: [
        {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
          originalName: { type: String, default: '' },
          mimeType: { type: String, default: '' },
          size: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EDITED'],
        message: 'Invalid pending entry status',
      },
      default: 'PENDING_VERIFICATION',
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Submitter user reference is required'],
      index: true,
    },
    submittedByName: {
      type: String,
      required: [true, 'Submitter name is required'],
      trim: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    voucherNo: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    rentMonth: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
      index: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentalAgreement',
      default: null,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    drAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
      index: true,
    },
    crAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
      index: true,
    },
    receivingAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
      index: true,
    },
    detail: {
      type: String,
      trim: true,
      default: '',
    },
    paymentMethod: {
      type: String,
      default: 'CASH',
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: '',
    },
    // Raw JSON data payload submitted by the user
    entryData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Verification & Approval Metadata
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verifiedByName: {
      type: String,
      default: null,
      trim: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    // Rejection Metadata
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedByName: {
      type: String,
      default: null,
      trim: true,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    // Single-edit Enforcement Metadata
    isEdited: {
      type: Boolean,
      default: false,
      index: true,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    editedByName: {
      type: String,
      default: null,
      trim: true,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    // References to Official Posted Documents (Populated once verified)
    postedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
      index: true,
    },
    postedRentReceivedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentReceived',
      default: null,
      index: true,
    },
    // Full Audit History
    auditLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        performedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
        changes: { type: mongoose.Schema.Types.Mixed, default: null },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual getters for normalized classification structure
pendingEntrySchema.virtual('expenseScope').get(function () {
  if (this.expenseClassification === 'GENERAL_EXPENSE') return 'GENERAL';
  if (this.expenseClassification === 'PROPERTY_OWN_EXPENSE' || this.expenseClassification === 'UNIT_EXPENSE') return 'PROPERTY';
  return this.propertyId ? 'PROPERTY' : 'GENERAL';
});

pendingEntrySchema.virtual('propertyExpenseType').get(function () {
  if (this.expenseClassification === 'PROPERTY_OWN_EXPENSE') return 'OWN';
  if (this.expenseClassification === 'UNIT_EXPENSE') return 'UNIT';
  if (this.unitId) return 'UNIT';
  if (this.propertyId) return 'OWN';
  return null;
});

// Strategic compound indexes for performant querying and filtering
pendingEntrySchema.index({ status: 1, submittedAt: -1 });
pendingEntrySchema.index({ entryType: 1, status: 1 });
pendingEntrySchema.index({ submittedBy: 1, status: 1 });
pendingEntrySchema.index({ rentMonth: 1, propertyId: 1 });

export const PendingEntry = mongoose.model('PendingEntry', pendingEntrySchema);
export default PendingEntry;
