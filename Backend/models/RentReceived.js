import mongoose from 'mongoose';

/**
 * Rent Received Schema
 * Represents an actual payment received for property rental.
 * Connects Tenant, Agreement, Rent Due, Receiving Account, and Financial Journal Transaction.
 */
const rentReceivedSchema = new mongoose.Schema(
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
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant is required'],
      index: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'Property is required'],
      index: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Unit ID is required'],
      index: true,
    },
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentalAgreement',
      required: [true, 'Rental agreement is required'],
      index: true,
    },
    rentDueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentDue',
      default: null,
      index: true,
    },
    rentMonth: {
      type: String,
      required: [true, 'Rent month is required (YYYY-MM)'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Rent month must be in YYYY-MM format (e.g. 2026-08)'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Receipt amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    allocatedCurrentMonth: {
      type: Number,
      default: 0,
      min: [0, 'Allocated current month cannot be negative'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    allocatedPreviousReceivable: {
      type: Number,
      default: 0,
      min: [0, 'Allocated previous receivable cannot be negative'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    allocatedAdvance: {
      type: Number,
      default: 0,
      min: [0, 'Allocated advance cannot be negative'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    previousReceivableBalance: {
      type: Number,
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    remainingReceivable: {
      type: Number,
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    receivingAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Receiving account is required'],
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: {
        values: ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER'],
        message: 'Payment method must be BANK_TRANSFER, CASH, CHEQUE, or OTHER',
      },
      default: 'CASH',
      index: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['RECEIVED', 'VERIFIED', 'REVERSED'],
        message: 'Receipt status must be RECEIVED, VERIFIED, or REVERSED',
      },
      default: 'RECEIVED',
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
    checkedAt: {
      type: Date,
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
rentReceivedSchema.index({ rentMonth: 1, propertyId: 1, status: 1 });
rentReceivedSchema.index({ tenantId: 1, agreementId: 1, rentMonth: 1 });
rentReceivedSchema.index({ receivingAccountId: 1, receiptDate: 1 });

export const RentReceived = mongoose.model('RentReceived', rentReceivedSchema);
export default RentReceived;
