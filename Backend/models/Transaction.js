import mongoose from 'mongoose';

/**
 * Transaction / Master Journal Ledger Schema
 * Records double-entry vouchers with Debit and Credit accounts,
 * category allocation, voucher numbers, property/unit links, and verification status.
 */
const transactionSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
      index: true,
    },
    voucherNo: {
      type: String,
      required: [true, 'Voucher number (voucherNo) is required'],
      trim: true,
      index: true,
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Voucher',
      default: null,
      index: true,
    },
    detail: {
      type: String,
      required: [true, 'Transaction detail / narration is required'],
      trim: true,
    },
    transactionType: {
      type: String,
      enum: {
        values: ['OPENING_BALANCE', 'TRANSFER', 'INCOME', 'EXPENSE', 'ADJUSTMENT'],
        message: 'Invalid transaction type',
      },
      default: 'EXPENSE',
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category head (categoryId) is required'],
      index: true,
    },
    drAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Debit account (drAccountId) is required'],
      index: true,
    },
    crAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Credit account (crAccountId) is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0.01, 'Amount must be at least 0.01'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
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
    },
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentalAgreement',
      default: null,
    },
    reference: {
      type: String,
      trim: true,
      default: '',
    },
    rentMonth: {
      type: String,
      default: null,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'rentMonth must be formatted as YYYY-MM (e.g. 2026-08)'],
      index: true,
    },
    reportCategory: {
      type: String,
      enum: {
        values: ['Payments', 'Rent', 'Other Income', 'Transfer', 'Opening Balance'],
        message: 'Invalid report category',
      },
      default: null,
      index: true,
    },
    sourceModule: {
      type: String,
      enum: {
        values: [
          'RENT_RECEIVED',
          'EXPENSE',
          'TRANSFER',
          'OTHER_INCOME',
          'OTHER_PAYMENT',
          'OPENING_BALANCE',
          'MANUAL_VOUCHER',
        ],
        message: 'Invalid source module',
      },
      default: 'MANUAL_VOUCHER',
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'VERIFIED', 'POSTED', 'REVERSED', 'VOID'],
        message: 'Status must be PENDING, VERIFIED, POSTED, REVERSED, or VOID',
      },
      default: 'POSTED',
      index: true,
    },
    checkedBy: {
      type: String,
      trim: true,
      default: null,
    },
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Prevent identical Debit and Credit accounts on the same transaction
transactionSchema.pre('validate', function () {
  if (
    this.drAccountId &&
    this.crAccountId &&
    this.drAccountId.toString() === this.crAccountId.toString()
  ) {
    this.invalidate(
      'crAccountId',
      'Debit (drAccountId) and Credit (crAccountId) accounts cannot be identical.'
    );
  }
});

// Strategic Compound Indexes for ledger and reporting performance
transactionSchema.index({ date: 1, voucherNo: 1 });
transactionSchema.index({ drAccountId: 1, date: 1 });
transactionSchema.index({ crAccountId: 1, date: 1 });
transactionSchema.index({ categoryId: 1, date: 1 });
transactionSchema.index({ propertyId: 1, date: 1 });
transactionSchema.index({ rentMonth: 1, propertyId: 1 });
transactionSchema.index({ transactionType: 1, date: 1 });
transactionSchema.index({ voucherId: 1, date: 1 });
transactionSchema.index({ reportCategory: 1, date: 1 });

export const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
