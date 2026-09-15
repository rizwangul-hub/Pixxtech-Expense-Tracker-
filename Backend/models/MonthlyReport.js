import mongoose from 'mongoose';

/**
 * MonthlyReport Schema
 * Tracks official monthly report lifecycle, audit snapshots,
 * reconciliation status, and publishing locks.
 */
const monthlyReportSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: [true, 'Report month is required (format: YYYY-MM)'],
      unique: true,
      trim: true,
      index: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format'],
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    monthNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'REVIEWED', 'PUBLISHED'],
      default: 'DRAFT',
      index: true,
    },
    reconciliationStatus: {
      type: String,
      enum: ['RECONCILED', 'DISCREPANCY', 'PENDING'],
      default: 'PENDING',
    },
    reconciliationNotes: {
      type: String,
      default: '',
    },
    summarySnapshot: {
      totalRentalIncome: { type: Number, default: 0 },
      totalOtherIncome: { type: Number, default: 0 },
      totalIncome: { type: Number, default: 0 },
      totalExpenses: { type: Number, default: 0 },
      totalTransfers: { type: Number, default: 0 },
      openingBalance: { type: Number, default: 0 },
      closingBalance: { type: Number, default: 0 },
      netPosition: { type: Number, default: 0 },
      totalBankClosing: { type: Number, default: 0 },
      totalCashClosing: { type: Number, default: 0 },
    },
    preparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    preparedByName: {
      type: String,
      default: 'System Operator',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedByName: {
      type: String,
      default: '',
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedByName: {
      type: String,
      default: '',
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
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

export const MonthlyReport = mongoose.model('MonthlyReport', monthlyReportSchema);
export default MonthlyReport;
