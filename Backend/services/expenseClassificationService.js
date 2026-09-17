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

  const categoryPropertyId = cleanId(category.propertyId);
  const categoryUnitId = cleanId(category.unitId);
  const normalizedPropertyId = cleanId(propertyId);
  const normalizedUnitId = cleanId(unitId);

  // If category is tied to a specific property, ensure it matches
  if (categoryPropertyId && normalizedPropertyId && categoryPropertyId !== normalizedPropertyId) {
    throw new Error('Selected expense category belongs to a different property.');
  }

  // If category is tied to a specific unit, ensure it matches
  if (categoryUnitId && normalizedUnitId && categoryUnitId !== normalizedUnitId) {
    throw new Error('Selected expense category belongs to a different unit.');
  }

  return category;
};

export const getExpenseClassificationLabel = (classification) =>
  ({
    [EXPENSE_CLASSIFICATIONS.GENERAL]: 'General Expense',
    [EXPENSE_CLASSIFICATIONS.PROPERTY_OWN]: 'Property Own Expense',
    [EXPENSE_CLASSIFICATIONS.UNIT]: 'Unit Expense',
  }[classification] || 'General Expense');

/**
 * Get or create the single canonical expense head for a scope.
 * - General: Name 'General' (propertyId = null, unitId = null)
 * - Property: Name = Property Name (propertyId = propId, unitId = null)
 * - Unit: Name = Property Name - Unit Name (propertyId = propId, unitId = unitId)
 */
export const getOrCreateCanonicalHead = async ({
  expenseClassification,
  propertyId,
  unitId,
  session = null,
}) => {
  let classification = expenseClassification;
  const propId = cleanId(propertyId);
  const uId = cleanId(unitId);

  if (uId) {
    classification = EXPENSE_CLASSIFICATIONS.UNIT;
  } else if (propId) {
    classification = EXPENSE_CLASSIFICATIONS.PROPERTY_OWN;
  } else {
    classification = EXPENSE_CLASSIFICATIONS.GENERAL;
  }

  const queryFilter = {
    type: 'EXPENSE',
    expenseClassification: classification,
    propertyId: propId,
    unitId: uId,
  };

  let query = Category.findOne(queryFilter).sort({ createdAt: 1 });
  if (session) query = query.session(session);
  let head = await query;

  let expectedName = 'General';

  if (classification === EXPENSE_CLASSIFICATIONS.PROPERTY_OWN || classification === EXPENSE_CLASSIFICATIONS.UNIT) {
    let propQuery = Property.findById(propId);
    if (session) propQuery = propQuery.session(session);
    const property = await propQuery.lean();
    if (!property) throw new Error('Property not found for expense head.');

    const plazaName = (property.plazaName || property.propertyName || 'Property').trim();

    if (classification === EXPENSE_CLASSIFICATIONS.UNIT) {
      const unitObj = (property.units || []).find((u) => u._id.toString() === uId);
      const unitName = unitObj ? (unitObj.unitName || unitObj.unitNumber || 'Unit').trim() : 'Unit';
      expectedName = `${plazaName} - ${unitName}`;
    } else {
      expectedName = plazaName;
    }
  }

  if (head) {
    if (head.name !== expectedName) {
      head.name = expectedName;
      await head.save();
    }
    return head;
  }

  const [newHead] = await Category.create(
    [
      {
        name: expectedName,
        type: 'EXPENSE',
        expenseClassification: classification,
        propertyId: propId,
        unitId: uId,
        isRentalHead: false,
      },
    ],
    session ? { session } : {}
  );

  return newHead;
};

export default {
  validateExpenseClassification,
  validateExpenseCategory,
  getOrCreateCanonicalHead,
  deriveExpenseClassification,
  getExpenseScope,
  getPropertyExpenseType,
  getExpenseClassificationLabel,
};
