import mongoose from 'mongoose';

const allowanceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    amount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Employee name is required'],
      trim: true,
      index: true,
    },
    fatherOrHusbandName: {
      type: String,
      trim: true,
      default: '',
    },
    employeeCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },
    cnic: {
      type: String,
      trim: true,
      default: '',
    },
    mobileNumber: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    dateOfBirth: {
      type: Date,
      default: null,
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
      default: 'IT Office',
      index: true,
    },
    staffLocation: {
      type: String,
      trim: true,
      default: 'IT Office',
    },
    shiftOpeningTime: {
      type: String, // e.g. "12:30", "09:00", "12:00", "13:00", "14:00", "15:00", "16:00"
      default: '12:30',
      trim: true,
    },
    employmentType: {
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'],
      default: 'FULL_TIME',
    },
    joiningDate: {
      type: Date,
      default: () => new Date(),
    },
    employmentStatus: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'PROBATION', 'TERMINATED'],
      default: 'ACTIVE',
    },
    profilePhotoUrl: {
      type: String,
      default: '',
    },
    reportingManager: {
      type: String,
      trim: true,
      default: '',
    },
    basicSalary: {
      type: Number,
      required: [true, 'Base/Basic salary is required'],
      default: 0,
      min: 0,
    },
    allowance: {
      type: Number,
      default: 0,
      min: 0,
    },
    allowanceReason: {
      type: String,
      trim: true,
      default: '',
    },
    fuelAllowanceEnabled: {
      type: Boolean,
      default: false,
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
    transportAllowance: {
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
    allowancesList: [allowanceSchema],
    allowedMonthlyLeaves: {
      type: Number,
      default: 2,
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
    branchName: {
      type: String,
      trim: true,
      default: '',
    },
    accountNumber: {
      type: String,
      trim: true,
      default: '',
    },
    paymentMethod: {
      type: String,
      enum: ['BANK_TRANSFER', 'CASH', 'CHEQUE'],
      default: 'BANK_TRANSFER',
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
  const allow = (this.allowance !== undefined && this.allowance !== null && this.allowance > 0)
    ? this.allowance
    : ((this.fuelAllowance || 0) +
       (this.foodAllowance || 0) +
       (this.mobileAllowance || 0) +
       (this.transportAllowance || 0) +
       (this.performanceAllowance || 0) +
       (this.otherAllowances || 0));

  let listSum = 0;
  if (Array.isArray(this.allowancesList)) {
    this.allowancesList.forEach((a) => {
      if (a.isActive) listSum += a.amount || 0;
    });
  }

  return basic + allow + listSum;
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
