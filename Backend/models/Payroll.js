import mongoose from 'mongoose';

const payrollSchema = new mongoose.Schema(
  {
    payrollMonth: {
      type: String, // YYYY-MM format, e.g. "2026-08"
      required: [true, 'Payroll month is required'],
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required'],
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    designation: {
      type: String,
      required: true,
    },
    department: {
      type: String,
      required: true,
    },
    basicSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    fuelAllowance: {
      type: Number,
      default: 0,
    },
    foodAllowance: {
      type: Number,
      default: 0,
    },
    mobileAllowance: {
      type: Number,
      default: 0,
    },
    performanceAllowance: {
      type: Number,
      default: 0,
    },
    otherAllowances: {
      type: Number,
      default: 0,
    },
    extraAllowance: {
      type: Number,
      default: 0,
    },
    allowanceReason: {
      type: String,
      default: '',
    },
    grossSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    totalDays: {
      type: Number,
      default: 30,
    },
    presentDays: {
      type: Number,
      default: 0,
    },
    lateDays: {
      type: Number,
      default: 0,
    },
    leaveDays: {
      type: Number,
      default: 0,
    },
    lopDays: {
      type: Number,
      default: 0,
    },
    lopDeduction: {
      type: Number,
      default: 0,
    },
    loanDeduction: {
      type: Number,
      default: 0,
    },
    otherDeduction: {
      type: Number,
      default: 0,
    },
    totalDeduction: {
      type: Number,
      default: 0,
    },
    netPayable: {
      type: Number,
      required: true,
      default: 0,
    },
    accountTitle: {
      type: String,
      default: '',
    },
    ibanNumber: {
      type: String,
      default: '',
    },
    bankName: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['DRAFT', 'FINALIZED', 'PAID'],
      default: 'FINALIZED',
    },
    paidDate: {
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

payrollSchema.index({ payrollMonth: 1, employeeId: 1 }, { unique: true });

export const Payroll = mongoose.model('Payroll', payrollSchema);
export default Payroll;
