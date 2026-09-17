import mongoose from 'mongoose';

const staffLoanSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required'],
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    type: {
      type: String,
      enum: ['DISBURSEMENT', 'REPAYMENT'], // DISBURSEMENT = Advance/Loan given (+), REPAYMENT = Deducted (-)
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    previousBalance: {
      type: Number,
      required: true,
    },
    newBalance: {
      type: Number,
      required: true,
    },
    payrollMonth: {
      type: String, // e.g. "2026-08" if deducted in salary
      default: '',
    },
    description: {
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
  }
);

export const StaffLoan = mongoose.model('StaffLoan', staffLoanSchema);
export default StaffLoan;
