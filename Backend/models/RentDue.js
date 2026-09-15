import mongoose from 'mongoose';

/**
 * Rent Due Schema
 * Represents the expected monthly rent charge generated from an active Rental Agreement.
 * Serves as the billing schedule foundation for future rent collections and financial reconciliation.
 */
const rentDueSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RentalAgreement',
      required: [true, 'Rental agreement is required'],
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
    rentMonth: {
      type: String,
      required: [true, 'Rent month is required (YYYY-MM)'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Rent month must be in YYYY-MM format (e.g. 2026-08)'],
      index: true,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true,
    },
    expectedRentAmount: {
      type: Number,
      required: [true, 'Expected rent amount is required'],
      min: [0, 'Expected rent amount cannot be negative'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    status: {
      type: String,
      enum: {
        values: ['DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'],
        message: 'Rent due status must be DUE, PARTIAL, PAID, OVERDUE, or CANCELLED',
      },
      default: 'DUE',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
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

// Compound Unique Index: An agreement can have exactly ONE rent due record per rent month
rentDueSchema.index({ agreementId: 1, rentMonth: 1 }, { unique: true });

// Index for high-performance monthly ledger and property lookups
rentDueSchema.index({ rentMonth: 1, propertyId: 1, status: 1 });

export const RentDue = mongoose.model('RentDue', rentDueSchema);
export default RentDue;
