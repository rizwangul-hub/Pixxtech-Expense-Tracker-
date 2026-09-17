import mongoose from 'mongoose';

const staffDesignationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Designation title is required'],
      unique: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
      default: 'General',
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

export const StaffDesignation = mongoose.model('StaffDesignation', staffDesignationSchema);
export default StaffDesignation;
