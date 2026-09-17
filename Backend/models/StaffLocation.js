import mongoose from 'mongoose';

const staffLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Location name is required'],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    openingTime: {
      type: String, // e.g. "12:30"
      default: '12:30',
    },
    gracePeriodMinutes: {
      type: Number,
      default: 15,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const StaffLocation = mongoose.model('StaffLocation', staffLocationSchema);
export default StaffLocation;
