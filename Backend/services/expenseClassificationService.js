import mongoose from 'mongoose';
import Property from '../models/Property.js';
import Category from '../models/Category.js';
import {
  EXPENSE_CLASSIFICATIONS,
  EXPENSE_CLASSIFICATION_LIST,
} from '../constants/expenseClassification.js';

const cleanId = (value) => (value ? value.toString() : null);

/**
 * Derive expense classification from 2-level UI parameters:
 * - expenseScope: 'GENERAL' | 'PROPERTY'
 * - propertyExpenseType: 'OWN' | 'UNIT'
 */
export const deriveExpenseClassification = (expenseScope, propertyExpenseType) => {
  if (expenseScope === 'GENERAL' || (!expenseScope && !propertyExpenseType)) {
    return EXPENSE_CLASSIFICATIONS.GENERAL;
  }
  if (expenseScope === 'PROPERTY') {
    if (propertyExpenseType === 'OWN') return EXPENSE_CLASSIFICATIONS.PROPERTY_OWN;
    if (propertyExpenseType === 'UNIT') return EXPENSE_CLASSIFICATIONS.UNIT;
  }
  return null;
};

export const getExpenseScope = (classification) => {
  if (classification === EXPENSE_CLASSIFICATIONS.GENERAL) return 'GENERAL';
  if (
    classification === EXPENSE_CLASSIFICATIONS.PROPERTY_OWN ||
    classification === EXPENSE_CLASSIFICATIONS.UNIT
  ) {
    return 'PROPERTY';
  }
  return 'GENERAL';
};

export const getPropertyExpenseType = (classification) => {
  if (classification === EXPENSE_CLASSIFICATIONS.PROPERTY_OWN) return 'OWN';
  if (classification === EXPENSE_CLASSIFICATIONS.UNIT) return 'UNIT';
  return null;
};

/**
 * Normalize and validate expense classification and its property/unit links.
 */
export const validateExpenseClassification = async ({
  expenseClassification,
  expenseScope,
  propertyExpenseType,
  propertyId,
  unitId,
  session = null,
}) => {
  const normalizedPropertyId = cleanId(propertyId);
  const normalizedUnitId = cleanId(unitId);

  let classification =
    expenseClassification ||
    deriveExpenseClassification(expenseScope, propertyExpenseType);

  if (!classification) {
    classification = normalizedUnitId
      ? EXPENSE_CLASSIFICATIONS.UNIT
      : normalizedPropertyId
      ? EXPENSE_CLASSIFICATIONS.PROPERTY_OWN
      : EXPENSE_CLASSIFICATIONS.GENERAL;
  }

  if (!EXPENSE_CLASSIFICATION_LIST.includes(classification)) {
    throw new Error(
      `Invalid expense classification. Expected one of: ${EXPENSE_CLASSIFICATION_LIST.join(', ')}.`
    );
  }

  if (classification === EXPENSE_CLASSIFICATIONS.GENERAL) {
    if (normalizedPropertyId || normalizedUnitId) {
      throw new Error('General expenses cannot have a property or unit selected.');
    }
    return { expenseClassification: classification, propertyId: null, unitId: null };
  }

  if (!normalizedPropertyId || !mongoose.Types.ObjectId.isValid(normalizedPropertyId)) {
    throw new Error('A valid property is required for property expenses.');
  }

  const propertyQuery = Property.findById(normalizedPropertyId);
  if (session) propertyQuery.session(session);
  const property = await propertyQuery.lean();
  if (!property) throw new Error('Selected property was not found.');

  if (classification === EXPENSE_CLASSIFICATIONS.PROPERTY_OWN) {
    if (normalizedUnitId) {
      throw new Error('Property-own expenses cannot have a unit selected.');
    }
    return { expenseClassification: classification, propertyId: normalizedPropertyId, unitId: null };
  }

  if (!normalizedUnitId || !mongoose.Types.ObjectId.isValid(normalizedUnitId)) {
    throw new Error('A valid unit is required for unit expenses.');
  }

  const unitBelongsToProperty = (property.units || []).some(
    (unit) => unit._id?.toString() === normalizedUnitId
  );
  if (!unitBelongsToProperty) {
    throw new Error('Selected unit does not belong to the selected property.');
  }

  return {
    expenseClassification: classification,
    propertyId: normalizedPropertyId,
    unitId: normalizedUnitId,
  };
};

export const validateExpenseCategory = async ({
  categoryId,
  expenseClassification,
  propertyId,
  unitId,
}) => {
  if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new Error('A valid expense head is required.');
  }

  const category = await Category.findById(categoryId).lean();
  if (!category) throw new Error('Selected expense head was not found.');
  if (category.type !== 'EXPENSE') {
    throw new Error('Selected head is not an expense head.');
  }

  const categoryClassification = category.expenseClassification || 'GENERAL_EXPENSE';
  const categoryPropertyId = category.propertyId?.toString() || null;
  const categoryUnitId = category.unitId?.toString() || null;
  const normalizedPropertyId = cleanId(propertyId);
  const normalizedUnitId = cleanId(unitId);

  if (
    categoryClassification !== expenseClassification ||
    categoryPropertyId !== normalizedPropertyId ||
    categoryUnitId !== normalizedUnitId
  ) {
    throw new Error(
      'The selected expense head does not match the selected general, property, or unit expense scope.'
    );
  }

  return category;
};

export const getExpenseClassificationLabel = (classification) =>
  ({
    [EXPENSE_CLASSIFICATIONS.GENERAL]: 'General Expense',
    [EXPENSE_CLASSIFICATIONS.PROPERTY_OWN]: 'Property Own Expense',
    [EXPENSE_CLASSIFICATIONS.UNIT]: 'Unit Expense',
  }[classification] || 'General Expense');

export default {
  validateExpenseClassification,
  validateExpenseCategory,
  deriveExpenseClassification,
  getExpenseScope,
  getPropertyExpenseType,
  getExpenseClassificationLabel,
};
