import mongoose from 'mongoose';

/**
 * Rental Agreement Schema
 * Represents a formal lease agreement binding a Tenant to a specific Property and Unit.
 * This is the historical source of truth for occupancy, monthly rent, and billing cycles.
 */
const rentalAgreementSchema = new mongoose.Schema(
  {
    agreementNumber: {
      type: String,
      required: [true, 'Agreement number is required'],
      unique: true,
      trim: true,
      uppercase: true,
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
      required: [true, 'Unit is required'],
      index: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    renewalDate: {
      type: Date,
      default: null,
    },
    dueDay: {
      type: Number,
      min: [1, 'Due day must be between 1 and 31'],
      max: [31, 'Due day must be between 1 and 31'],
      default: 5,
    },
    monthlyRent: {
      type: Number,
      required: [true, 'Monthly rent is required'],
      min: [0, 'Monthly rent cannot be negative'],
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    previousRent: {
      type: Number,
      min: [0, 'Previous rent cannot be negative'],
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    securityDeposit: {
      type: Number,
      min: [0, 'Security deposit cannot be negative'],
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    rentIncreaseAmount: {
      type: Number,
      min: [0, 'Rent increase amount cannot be negative'],
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    rentIncreasePercentage: {
      type: Number,
      min: [0, 'Rent increase percentage cannot be negative'],
      default: 0,
    },
    paymentFrequency: {
      type: String,
      enum: {
        values: ['MONTHLY', 'QUARTERLY', 'BI_ANNUAL', 'ANNUAL'],
        message: 'Payment frequency must be MONTHLY, QUARTERLY, BI_ANNUAL, or ANNUAL',
      },
      default: 'MONTHLY',
    },
    status: {
      type: String,
      enum: {
        values: ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED', 'INACTIVE'],
        message: 'Invalid agreement status',
      },
      default: 'ACTIVE',
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

// Virtual to determine if agreement is currently in its active date window
rentalAgreementSchema.virtual('isCurrentlyActive').get(function () {
  const now = new Date();
  return (
    this.status === 'ACTIVE' &&
    new Date(this.startDate) <= now &&
    new Date(this.endDate) >= now
  );
});

export const RentalAgreement = mongoose.model('RentalAgreement', rentalAgreementSchema);
export default RentalAgreement;
