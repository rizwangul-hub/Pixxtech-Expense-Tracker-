import mongoose from 'mongoose';
import {
  PROPERTY_TYPE_LIST,
  PROPERTY_STATUS_LIST,
  UNIT_TYPE_LIST,
  UNIT_STATUS_LIST,
  AREA_UNIT_LIST,
} from '../constants/propertyTypes.js';

/**
 * Unit Subdocument Schema
 * Represents an individual leasable space, shop, floor, or apartment within a property/plaza.
 */
const unitSchema = new mongoose.Schema(
  {
    unitName: {
      type: String,
      required: [true, 'Unit name is required'],
      trim: true,
    },
    unitNumber: {
      type: String,
      trim: true,
      default: '',
    },
    unitType: {
      type: String,
      enum: {
        values: UNIT_TYPE_LIST,
        message: 'Unit type must be SHOP, OFFICE, HOUSE, APARTMENT, FLAT, or OTHER',
      },
      default: 'SHOP',
    },
    floor: {
      type: String,
      trim: true,
      default: 'Ground Floor',
    },
    area: {
      type: Number,
      min: [0, 'Area cannot be negative'],
      default: 0,
    },
    areaUnit: {
      type: String,
      enum: {
        values: AREA_UNIT_LIST,
        message: 'Area unit must be SQ_FT, MARLA, or KANAL',
      },
      default: 'SQ_FT',
    },
    status: {
      type: String,
      enum: {
        values: UNIT_STATUS_LIST,
        message: 'Unit status must be OCCUPIED, VACANT, MAINTENANCE, or INACTIVE',
      },
      default: 'VACANT',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
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

    // Lease & Financial metadata (Preserved for backward compatibility)
    tenantName: {
      type: String,
      trim: true,
      default: null,
    },
    dueDay: {
      type: Number,
      min: [1, 'Due day must be between 1 and 31'],
      max: [31, 'Due day must be between 1 and 31'],
      default: 1,
    },
    agreedRent: {
      type: Number,
      min: [0, 'Agreed rent cannot be negative'],
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    renewalDate: {
      type: Date,
      default: null,
    },
    julyReceivable: {
      type: Number,
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    defaultReceivingAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Property / Plaza Schema
 * Tracks commercial and residential plazas and their composite units.
 */
const propertySchema = new mongoose.Schema(
  {
    propertyName: {
      type: String,
      required: [true, 'Property name is required'],
      trim: true,
      index: true,
    },
    plazaName: {
      type: String,
      trim: true,
      index: true,
    },
    propertyCode: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
    },
    propertyType: {
      type: String,
      enum: {
        values: PROPERTY_TYPE_LIST,
        message: 'Property type must be PLAZA, HOUSE, BUILDING, SHOPS, or OTHER',
      },
      default: 'PLAZA',
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
    area: {
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
        values: PROPERTY_STATUS_LIST,
        message: 'Property status must be ACTIVE or INACTIVE',
      },
      default: 'ACTIVE',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
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
    units: [unitSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-validate & pre-save hook to synchronize propertyName and plazaName, and ensure propertyCode
propertySchema.pre('validate', function () {
  if (this.propertyName && !this.plazaName) {
    this.plazaName = this.propertyName;
  } else if (this.plazaName && !this.propertyName) {
    this.propertyName = this.plazaName;
  }

  if (!this.propertyCode && this.propertyName) {
    // Generate clean code: e.g. "PX-289Q" or "PROP-1234"
    const cleaned = this.propertyName
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase();
    const suffix = Math.floor(100 + Math.random() * 900);
    this.propertyCode = `PX-${cleaned || 'PROP'}-${suffix}`;
  }
});

// Auto-derive unit statuses on legacy seeded units if not explicitly set
propertySchema.pre('save', function () {
  if (this.units && Array.isArray(this.units)) {
    this.units.forEach((unit) => {
      // If tenantName exists and status was default VACANT, set to OCCUPIED
      if (unit.tenantName && unit.tenantName.trim() && unit.status === 'VACANT') {
        unit.status = 'OCCUPIED';
      }
      if (!unit.unitNumber) {
        unit.unitNumber = unit.unitName;
      }
    });
  }
});

// Virtual: Total active units
propertySchema.virtual('totalUnits').get(function () {
  if (!this.units || !Array.isArray(this.units)) return 0;
  return this.units.filter((u) => u.isActive !== false).length;
});

// Virtual: Occupied units count
propertySchema.virtual('occupiedUnits').get(function () {
  if (!this.units || !Array.isArray(this.units)) return 0;
  return this.units.filter((u) => u.isActive !== false && u.status === 'OCCUPIED').length;
});

// Virtual: Vacant units count
propertySchema.virtual('vacantUnits').get(function () {
  if (!this.units || !Array.isArray(this.units)) return 0;
  return this.units.filter((u) => u.isActive !== false && u.status === 'VACANT').length;
});

// Virtual: Maintenance units count
propertySchema.virtual('maintenanceUnits').get(function () {
  if (!this.units || !Array.isArray(this.units)) return 0;
  return this.units.filter((u) => u.isActive !== false && u.status === 'MAINTENANCE').length;
});

// Virtual: Inactive units count
propertySchema.virtual('inactiveUnits').get(function () {
  if (!this.units || !Array.isArray(this.units)) return 0;
  return this.units.filter((u) => u.isActive === false || u.status === 'INACTIVE').length;
});

// Virtual: Occupancy percentage rate
propertySchema.virtual('occupancyRate').get(function () {
  const total = this.totalUnits;
  if (!total || total === 0) return 0;
  return Math.round((this.occupiedUnits / total) * 100);
});

// Virtual: Total monthly agreed rent roll across active units
propertySchema.virtual('totalMonthlyRentRoll').get(function () {
  if (!this.units || !Array.isArray(this.units)) return 0;
  return this.units.reduce(
    (sum, unit) => (unit.isActive !== false ? sum + (unit.agreedRent || 0) : sum),
    0
  );
});

export const Property = mongoose.model('Property', propertySchema);
export default Property;
