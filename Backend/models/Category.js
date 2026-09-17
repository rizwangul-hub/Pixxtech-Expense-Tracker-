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
      trim: true,
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
    expenseClassification: {
      type: String,
      enum: {
        values: ['GENERAL_EXPENSE', 'PROPERTY_OWN_EXPENSE', 'UNIT_EXPENSE'],
        message: 'Invalid expense classification',
      },
      default: 'GENERAL_EXPENSE',
      index: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
      index: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
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
categorySchema.index({ name: 1, expenseClassification: 1, propertyId: 1, unitId: 1 });

export const Category = mongoose.model('Category', categorySchema);
export default Category;
