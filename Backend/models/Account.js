import mongoose from 'mongoose';

/**
 * Account Schema
 * Tracks financial liquidity sources: Bank Accounts and Cash-in-Hand custodians.
 * Serves as the source/destination for all monetary transactions and transfers.
 */
const accountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Account name is required'],
      unique: true,
      trim: true,
      index: true,
    },
    accountName: {
      type: String,
      trim: true,
      index: true,
    },
    accountCode: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Account type is required'],
      enum: {
        values: ['BANK', 'CASH'],
        message: 'Account type must be either BANK or CASH',
      },
      default: 'BANK',
      index: true,
    },
    accountType: {
      type: String,
      enum: {
        values: ['BANK', 'CASH'],
        message: 'Account type must be either BANK or CASH',
      },
      index: true,
    },
    ownerName: {
      type: String,
      trim: true,
      default: '',
    },
    bankName: {
      type: String,
      trim: true,
      default: '',
    },
    cashHolder: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    accountNumber: {
      type: String,
      trim: true,
      default: '',
    },
    iban: {
      type: String,
      trim: true,
      default: '',
    },
    branch: {
      type: String,
      trim: true,
      default: '',
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'PKR',
    },
    openingBalance: {
      type: Number,
      required: [true, 'Opening balance is required'],
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    openingBalanceDate: {
      type: Date,
      default: () => new Date('2026-07-31T00:00:00.000Z'),
    },
    currentBalance: {
      type: Number,
      required: [true, 'Current balance is required'],
      default: 0,
      set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isClearing: {
      type: Boolean,
      default: false,
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

// Virtual property for closingBalance mapping to currentBalance
accountSchema.virtual('closingBalance').get(function () {
  return this.currentBalance;
});

// Pre-validate hook to keep name <-> accountName and type <-> accountType dual-synchronized
accountSchema.pre('validate', function () {
  if (this.accountName && !this.name) {
    this.name = this.accountName.trim();
  } else if (this.name && !this.accountName) {
    this.accountName = this.name.trim();
  }

  if (this.accountType && !this.type) {
    this.type = this.accountType;
  } else if (this.type && !this.accountType) {
    this.accountType = this.type;
  }

  // Auto-generate a clean accountCode if not provided
  if (!this.accountCode && this.name) {
    const isCash = this.type === 'CASH';
    const prefix = isCash ? 'CSH' : 'BNK';
    const cleanLetters = this.name
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase();
    const suffix = Math.floor(100 + Math.random() * 900);
    this.accountCode = `${prefix}-${cleanLetters || 'ACC'}-${suffix}`;
  }

  // If CASH account, ensure cashHolder is populated if in name (e.g. "Cash in Hand (Majid Javed)")
  if (this.type === 'CASH' && !this.cashHolder && this.name) {
    const match = this.name.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      this.cashHolder = match[1].trim();
    }
  }

  // If BANK account, infer bankName and ownerName if in name (e.g. "Bank Al Falah (Kamran Ijaz Sb)")
  if (this.type === 'BANK' && this.name) {
    if (!this.bankName) {
      const parts = this.name.split('(');
      this.bankName = parts[0]?.trim() || '';
    }
    if (!this.ownerName) {
      const match = this.name.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        this.ownerName = match[1].trim();
      }
    }
  }
});

accountSchema.index({ type: 1, isActive: 1 });
accountSchema.index({ accountType: 1, isActive: 1 });

export const Account = mongoose.model('Account', accountSchema);
export default Account;
