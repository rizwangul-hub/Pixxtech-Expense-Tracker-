import mongoose from 'mongoose';

/**
 * Other Income Receipt Schema
 * Represents non-rental income receipts (miscellaneous business receipts, recoveries, refunds, etc.).
 * Connects Income Head, Receiving Account, Central Voucher, and Financial Transaction.
 */
const otherIncomeSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: [true, 'Receipt number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    receiptDate: {
      type: Date,
      required: [true, 'Receipt date is required'],
      default: Date.now,
      index: true,
    },
    incomeHeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OtherIncomeHead',
      required: [true, 'Income Head is required'],
      index: true,
    },
    headName: {
      type: String,
      required: [true, 'Income Head name is required'],
      trim: true,
    },
    category: {
      type: String,
      default: 'Other Income',
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Receipt amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    receivingAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Receiving account is required'],
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
    receivedFrom: {
      type: String,
      trim: true,
      default: '',
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: '',
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
    transactionDetail: {
      type: String,
      required: [true, 'Transaction detail is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['POSTED', 'DRAFT', 'VOID', 'REVERSED'],
        message: 'Status must be POSTED, DRAFT, VOID, or REVERSED',
      },
      default: 'POSTED',
      index: true,
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Voucher',
      default: null,
      index: true,
    },
    voucherNo: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
      index: true,
    },
    checkedBy: {
      type: String,
      trim: true,
      default: null,
    },
    reversalReason: {
      type: String,
      default: null,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

// Strategic Indexes for reporting and query performance
otherIncomeSchema.index({ receiptDate: -1, status: 1 });
otherIncomeSchema.index({ incomeHeadId: 1, receiptDate: -1 });
otherIncomeSchema.index({ receivingAccountId: 1, receiptDate: -1 });
otherIncomeSchema.index({ propertyId: 1, receiptDate: -1 });

export const OtherIncome = mongoose.model('OtherIncome', otherIncomeSchema);
export default OtherIncome;
