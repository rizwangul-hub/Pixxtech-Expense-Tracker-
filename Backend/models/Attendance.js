import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Attendance date is required'],
      index: true,
    },
    dateStr: {
      type: String, // YYYY-MM-DD format for fast querying
      required: true,
      index: true,
    },
    shiftOpeningTime: {
      type: String, // e.g. "12:30"
      default: '12:30',
    },
    arrivalTime: {
      type: String, // e.g. "12:45"
      default: '',
    },
    status: {
      type: String,
      enum: ['PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'LEAVE'],
      default: 'PRESENT',
      index: true,
    },
    lateMinutes: {
      type: Number,
      default: 0,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one attendance entry per employee per day
attendanceSchema.index({ employeeId: 1, dateStr: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
