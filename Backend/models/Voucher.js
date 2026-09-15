import mongoose from 'mongoose';

/**
 * Voucher Header Schema
 * Encapsulates the financial voucher metadata, voucher number (V.N),
 * type, status, balanced debit/credit totals, and audit trail.
 */
const voucherSchema = new mongoose.Schema(
  {
    voucherNumber: {
      type: String,
      required: [true, 'Voucher number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    voucherDate: {
      type: Date,
      required: [true, 'Voucher date is required'],
      index: true,
      default: Date.now,
    },
    voucherType: {
      type: String,
      required: [true, 'Voucher type is required'],
      enum: {
        values: [
          'RENT_RECEIPT',
          'EXPENSE',
          'TRANSFER',
          'OTHER_INCOME',
          'OTHER_PAYMENT',
          'ADJUSTMENT',
          'OPENING_BALANCE',
        ],
        message: 'Invalid voucher type',
      },
      index: true,
    },
    reference: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Voucher description / narration is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['POSTED', 'DRAFT', 'REVERSED', 'VOID', 'VERIFIED', 'PENDING'],
        message: 'Invalid voucher status',
      },
      default: 'POSTED',
      index: true,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total voucher amount is required'],
      min: [0, 'Total amount cannot be negative'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    totalDebit: {
      type: Number,
      required: true,
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    totalCredit: {
      type: Number,
      required: true,
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    isBalanced: {
      type: Boolean,
      default: true,
      index: true,
    },
    linesCount: {
      type: Number,
      default: 1,
      min: 1,
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

// Strategic Compound Indexes for search and reporting performance
voucherSchema.index({ voucherDate: 1, voucherNumber: 1 });
voucherSchema.index({ status: 1, voucherDate: 1 });
voucherSchema.index({ voucherType: 1, voucherDate: 1 });
voucherSchema.index({ sourceModule: 1, sourceId: 1 });

export const Voucher = mongoose.model('Voucher', voucherSchema);
export default Voucher;
