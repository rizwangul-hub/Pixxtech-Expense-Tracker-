import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Employee name is required'],
      trim: true,
      index: true,
    },
    employeeCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },
    designation: {
      type: String,
      required: [true, 'Designation is required'],
      trim: true,
    },
    department: {
      type: String,
      required: [true, 'Department / Workplace location is required'],
      trim: true,
      enum: {
        values: [
          'Bahria Town Office',
          'IT Office',
          'Security Guard',
          '4A Home',
          'Admin Rider',
          'Family',
          'Other',
        ],
        message: 'Invalid department or workplace location',
      },
      default: 'IT Office',
      index: true,
    },
    joiningDate: {
      type: Date,
      default: () => new Date(),
    },
    basicSalary: {
      type: Number,
      required: [true, 'Basic salary is required'],
      default: 0,
      min: 0,
    },
    fuelAllowance: {
      type: Number,
      default: 0,
      min: 0,
    },
    foodAllowance: {
      type: Number,
      default: 0,
      min: 0,
    },
    mobileAllowance: {
      type: Number,
      default: 0,
      min: 0,
    },
    performanceAllowance: {
      type: Number,
      default: 0,
      min: 0,
    },
    otherAllowances: {
      type: Number,
      default: 0,
      min: 0,
    },
    accountTitle: {
      type: String,
      trim: true,
      default: '',
    },
    ibanNumber: {
      type: String,
      trim: true,
      default: '',
    },
    bankName: {
      type: String,
      trim: true,
      default: '',
    },
    loanBalance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for Gross Salary
employeeSchema.virtual('grossSalary').get(function () {
  const basic = this.basicSalary || 0;
  const fuel = this.fuelAllowance || 0;
  const food = this.foodAllowance || 0;
  const mobile = this.mobileAllowance || 0;
  const perf = this.performanceAllowance || 0;
  const other = this.otherAllowances || 0;
  return basic + fuel + food + mobile + perf + other;
});

// Auto-generate employeeCode before validation if missing
employeeSchema.pre('validate', function () {
  if (!this.employeeCode && this.name) {
    const cleanLetters = this.name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
    const rand = Math.floor(100 + Math.random() * 900);
    this.employeeCode = `EMP-${cleanLetters || 'PIX'}-${rand}`;
  }
});

export const Employee = mongoose.model('Employee', employeeSchema);
export default Employee;
