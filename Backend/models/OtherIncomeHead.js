import mongoose from 'mongoose';

/**
 * Other Income Head Schema
 * Configurable master for non-rental income heads (e.g., Other Receipts, Recovery, Refund, Misc Income).
 */
const otherIncomeHeadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Income Head name is required'],
      unique: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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
  }
);

export const OtherIncomeHead = mongoose.model('OtherIncomeHead', otherIncomeHeadSchema);
export default OtherIncomeHead;
