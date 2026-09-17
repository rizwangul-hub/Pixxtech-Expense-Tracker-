import mongoose from 'mongoose';

const staffAuditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    userName: {
      type: String,
      default: 'System Admin',
    },
    action: {
      type: String, // e.g. "EMPLOYEE_CREATED", "SALARY_CHANGED", "LOAN_DISBURSED", "PAYROLL_FINALIZED"
      required: true,
      index: true,
    },
    recordId: {
      type: String,
      default: '',
    },
    details: {
      type: String,
      required: true,
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const StaffAuditLog = mongoose.model('StaffAuditLog', staffAuditLogSchema);
export default StaffAuditLog;
