import mongoose from 'mongoose';

/**
 * Tenant Schema
 * Represents individuals or commercial entities who enter into rental agreements.
 * Tenancy is decoupled from individual units to enable movement, renewals, and lease history.
 */
const tenantSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Tenant full name is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      default: null,
    },
    phone: {
      type: String,
      required: [true, 'Contact phone number is required'],
      trim: true,
      index: true,
    },
    alternatePhone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      default: 'Lahore',
    },
    country: {
      type: String,
      trim: true,
      default: 'Pakistan',
    },
    identificationNumber: {
      type: String,
      trim: true,
      sparse: true,
      default: null, // e.g., CNIC "35201-1234567-1" or NTN
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE'],
        message: 'Tenant status must be ACTIVE or INACTIVE',
      },
      default: 'ACTIVE',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

// Virtual for display identifier
tenantSchema.virtual('displayName').get(function () {
  if (this.companyName && this.companyName.trim()) {
    return `${this.fullName} (${this.companyName})`;
  }
  return this.fullName;
});

export const Tenant = mongoose.model('Tenant', tenantSchema);
export default Tenant;
