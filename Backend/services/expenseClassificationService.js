import mongoose from 'mongoose';
import Property from '../models/Property.js';
import {
  EXPENSE_CLASSIFICATIONS,
  EXPENSE_CLASSIFICATION_LIST,
} from '../constants/expenseClassification.js';

const cleanId = (value) => (value ? value.toString() : null);

/**
 * Normalize and validate expense classification and its property/unit links.
 * Existing callers that omit classification retain the legacy deterministic
 * behavior: no property is general, property without unit is property-owned,
 * and property plus unit is unit expense.
 */
export const validateExpenseClassification = async ({
  expenseClassification,
  propertyId,
  unitId,
  session = null,
}) => {
  const normalizedPropertyId = cleanId(propertyId);
  const normalizedUnitId = cleanId(unitId);
  let classification = expenseClassification;

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

export const getExpenseClassificationLabel = (classification) => ({
  [EXPENSE_CLASSIFICATIONS.GENERAL]: 'General Expense',
  [EXPENSE_CLASSIFICATIONS.PROPERTY_OWN]: 'Property Own Expense',
  [EXPENSE_CLASSIFICATIONS.UNIT]: 'Unit Expense',
}[classification] || 'Unclassified Expense');
