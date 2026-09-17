import mongoose from 'mongoose';

const staffSettingSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      default: 'PIXX TECHNOLOGIES PAKISTAN',
    },
    defaultShiftOpeningTime: {
      type: String,
      default: '12:30',
    },
    defaultGracePeriodMinutes: {
      type: Number,
      default: 15,
    },
    salaryCalculationBasis: {
      type: String, // "FIXED_30_DAYS", "CALENDAR_DAYS", "WORKING_DAYS"
      enum: ['FIXED_30_DAYS', 'CALENDAR_DAYS', 'WORKING_DAYS'],
      default: 'FIXED_30_DAYS',
    },
    defaultAllowedLeaves: {
      type: Number,
      default: 2,
    },
    whtRate: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const StaffSetting = mongoose.model('StaffSetting', staffSettingSchema);
export default StaffSetting;
