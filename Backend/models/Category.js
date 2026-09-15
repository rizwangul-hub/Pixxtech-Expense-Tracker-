import mongoose from 'mongoose';

/**
 * Category / Account Head Schema
 * Represents income, expense, and transfer classifications for financial transactions.
 */
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category head name is required'],
      unique: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Category type is required'],
      enum: {
        values: ['INCOME', 'EXPENSE', 'TRANSFER'],
        message: 'Category type must be INCOME, EXPENSE, or TRANSFER',
      },
      index: true,
    },
    isRentalHead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.index({ type: 1, isRentalHead: 1 });

export const Category = mongoose.model('Category', categorySchema);
export default Category;
