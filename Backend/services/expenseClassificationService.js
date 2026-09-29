import mongoose from 'mongoose';
import Property from '../models/Property.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import Employee from '../models/Employee.js';
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
  const categoryPropertyId = cleanId(category.propertyId);
  const categoryUnitId = cleanId(category.unitId);
  const normalizedPropertyId = cleanId(propertyId);
  const normalizedUnitId = cleanId(unitId);

  if (normalizedUnitId) {
    if (categoryClassification !== 'UNIT_EXPENSE' || categoryUnitId !== normalizedUnitId) {
      throw new Error('Selected category is not an expense category for the selected unit.');
    }
  } else if (normalizedPropertyId) {
    if (categoryClassification !== 'PROPERTY_OWN_EXPENSE' || categoryPropertyId !== normalizedPropertyId) {
      throw new Error('Selected category is not an expense category for the selected property.');
    }
  } else {
    if (categoryClassification !== 'GENERAL_EXPENSE' || categoryPropertyId || categoryUnitId) {
      throw new Error('Selected category is not a general expense category.');
    }
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
    isMainHead: true,
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
    }
    if (!head.isMainHead || head.parentCategoryId) {
      head.isMainHead = true;
      head.parentCategoryId = null;
    }
    await head.save();
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
        isMainHead: true,
        isRentalHead: false,
      },
    ],
    session ? { session } : {}
  );

  return newHead;
};

let isProvisioning = false;
let hasProvisioned = false;

/**
 * Automatically provision standard property and unit expense categories
 * for all properties and units in the system if they don't already exist.
 * - Standard Property Expenses: 'Property tax', 'Entertainment'
 * - Standard Unit Expenses: 'Maintenance', 'Electricity', 'Repair Maintenance', 'Commission'
 */
export const provisionStandardCategories = async (force = false) => {
  if (hasProvisioned && !force) return { createdCount: 0 };
  if (isProvisioning) return { createdCount: 0 };
  isProvisioning = true;
  try {
    const properties = await Property.find({}).lean();
    if (!properties || properties.length === 0) {
      hasProvisioned = true;
      return { createdCount: 0 };
    }

    const STANDARD_PROPERTY_EXPENSES = ['Property tax', 'Entertainment'];
    const STANDARD_UNIT_EXPENSES = ['Maintenance', 'Electricity', 'Repair Maintenance', 'Commission'];

    let createdCount = 0;

    for (const prop of properties) {
      const pId = prop._id.toString();

      // 1. Provision Property Own Expenses
      for (const expName of STANDARD_PROPERTY_EXPENSES) {
        const existing = await Category.findOne({
          type: 'EXPENSE',
          expenseClassification: 'PROPERTY_OWN_EXPENSE',
          propertyId: pId,
          unitId: null,
          name: { $regex: `^${expName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        });

        if (!existing) {
          const parent = await getOrCreateCanonicalHead({
            expenseClassification: EXPENSE_CLASSIFICATIONS.PROPERTY_OWN,
            propertyId: pId,
          });
          await Category.create({
            name: expName,
            type: 'EXPENSE',
            expenseClassification: 'PROPERTY_OWN_EXPENSE',
            propertyId: pId,
            unitId: null,
            parentCategoryId: parent._id,
            isRentalHead: false,
          });
          createdCount++;
        } else if (!existing.parentCategoryId) {
          const parent = await getOrCreateCanonicalHead({
            expenseClassification: EXPENSE_CLASSIFICATIONS.PROPERTY_OWN,
            propertyId: pId,
          });
          existing.parentCategoryId = parent._id;
          await existing.save();
        }
      }

      // 2. Provision Unit Expenses
      if (prop.units && Array.isArray(prop.units)) {
        for (const unit of prop.units) {
          const uId = unit._id.toString();

          for (const expName of STANDARD_UNIT_EXPENSES) {
            const existing = await Category.findOne({
              type: 'EXPENSE',
              expenseClassification: 'UNIT_EXPENSE',
              propertyId: pId,
              unitId: uId,
              name: { $regex: `^${expName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
            });

            if (!existing) {
              const parent = await getOrCreateCanonicalHead({
                expenseClassification: EXPENSE_CLASSIFICATIONS.UNIT,
                propertyId: pId,
                unitId: uId,
              });
              await Category.create({
                name: expName,
                type: 'EXPENSE',
                expenseClassification: 'UNIT_EXPENSE',
                propertyId: pId,
                unitId: uId,
                parentCategoryId: parent._id,
                isRentalHead: false,
              });
              createdCount++;
            } else if (!existing.parentCategoryId) {
              const parent = await getOrCreateCanonicalHead({
                expenseClassification: EXPENSE_CLASSIFICATIONS.UNIT,
                propertyId: pId,
                unitId: uId,
              });
              existing.parentCategoryId = parent._id;
              await existing.save();
            }
          }
        }
      }
    }

    // 3. Provision Boss / Owner Personal Categories (Inflow & Outflow)
    let expenseMain = await Category.findOne({
      name: { $regex: /^Boss \/ Owner Personal Expenses$/i },
      type: 'EXPENSE',
    });
    if (!expenseMain) {
      expenseMain = await Category.create({
        name: 'Boss / Owner Personal Expenses',
        type: 'EXPENSE',
        expenseClassification: 'GENERAL_EXPENSE',
        propertyId: null,
        unitId: null,
        parentCategoryId: null,
        isMainHead: true,
        isRentalHead: false,
      });
      createdCount++;
    }

    const subHeads = [
      'Daughter Education Fee',
      'Vehicle / Car Purchase & Expenses',
      'Personal Drawings & Outflows',
    ];
    for (const name of subHeads) {
      const existing = await Category.findOne({
        name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        type: 'EXPENSE',
      });
      if (!existing) {
        await Category.create({
          name,
          type: 'EXPENSE',
          expenseClassification: 'GENERAL_EXPENSE',
          propertyId: null,
          unitId: null,
          parentCategoryId: expenseMain._id,
          isMainHead: false,
          isRentalHead: false,
        });
        createdCount++;
      } else if (!existing.parentCategoryId) {
        existing.parentCategoryId = expenseMain._id;
        existing.isMainHead = false;
        await existing.save();
      }
    }

    const incomeHead = await Category.findOne({
      name: { $regex: /^Boss \/ Owner Personal Funds$/i },
      type: 'INCOME',
    });
    if (!incomeHead) {
      await Category.create({
        name: 'Boss / Owner Personal Funds',
        type: 'INCOME',
        expenseClassification: 'GENERAL_EXPENSE',
        propertyId: null,
        unitId: null,
        parentCategoryId: null,
        isMainHead: true,
        isRentalHead: false,
      });
      createdCount++;
    }

    hasProvisioned = true;
    return { createdCount };
  } catch (err) {
    console.error('[Provision Standard Categories Error]:', err.message);
    return { createdCount: 0, error: err.message };
  } finally {
    isProvisioning = false;
  }
};

export const isSalaryHeadName = (value = '') => /^salar(?:y|ies)$/i.test(String(value).trim());

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isOwnerPersonalCategory = (category = {}) => {
  if (!category || typeof category !== 'object') return false;
  const name = String(category.name || '').trim();
  return /boss|owner personal|kamran ijaz sb personal|drawings/i.test(name);
};

export const isOwnerPersonalTransaction = (tx = {}) => {
  if (!tx || typeof tx !== 'object') return false;
  const category = tx.categoryId && typeof tx.categoryId === 'object' ? tx.categoryId : {};
  const parent = category.parentCategoryId && typeof category.parentCategoryId === 'object'
    ? category.parentCategoryId
    : {};
  const categoryName = String(category.name || tx.categoryName || '').trim();
  const parentName = String(parent.name || '').trim();
  return (
    isOwnerPersonalCategory(category) ||
    isOwnerPersonalCategory(parent) ||
    /boss|owner personal|kamran ijaz sb personal/i.test(categoryName) ||
    /boss|owner personal|kamran ijaz sb personal/i.test(parentName)
  );
};

export const isNonExpenseChartCategory = (category = {}) => {
  if (!category || typeof category !== 'object') return false;
  const type = String(category.type || '').toUpperCase();
  if (type && type !== 'EXPENSE') return true;
  if (category.isRentalHead) return true;
  const name = String(category.name || '').trim();
  if (/^(?:rent|rental income|internal(?: funds?)?\s+transfers?)$/i.test(name)) return true;
  if (isOwnerPersonalCategory(category)) return true;
  return false;
};

export const isNonExpenseTransaction = (tx = {}) => {
  const type = String(tx.transactionType || '').toUpperCase();
  if (['TRANSFER', 'INCOME', 'OPENING_BALANCE'].includes(type)) return true;
  const reportCategory = String(tx.reportCategory || '').toLowerCase();
  if (['rent', 'other income', 'transfer', 'opening balance'].includes(reportCategory)) return true;
  const sourceModule = String(tx.sourceModule || '').toUpperCase();
  if (['RENT_RECEIVED', 'TRANSFER', 'OTHER_INCOME', 'OPENING_BALANCE'].includes(sourceModule)) return true;
  const category = tx.categoryId && typeof tx.categoryId === 'object' ? tx.categoryId : {};
  const parent = category.parentCategoryId && typeof category.parentCategoryId === 'object'
    ? category.parentCategoryId
    : {};
  return (
    isNonExpenseChartCategory(category) ||
    isNonExpenseChartCategory(parent) ||
    isOwnerPersonalTransaction(tx)
  );
};

export const isFoundationExpenseContext = (categoryName = '', parentName = '') =>
  /foundation/i.test(`${parentName} ${categoryName}`);

export const isHrSalaryTransaction = (tx = {}) => {
  const category = tx.categoryId && typeof tx.categoryId === 'object' ? tx.categoryId : {};
  const parent = category.parentCategoryId && typeof category.parentCategoryId === 'object'
    ? category.parentCategoryId
    : {};
  const categoryName = category.name || tx.categoryName || '';
  const parentName = parent.name || '';
  if (isFoundationExpenseContext(categoryName, parentName)) return false;
  if (isSalaryHeadName(parentName) || isSalaryHeadName(categoryName)) return true;
  return /^(?:ADVANCE SALARY|Salary)\s+(?:-|Payout\b)/i.test(String(tx.detail || ''));
};

export const salaryChildHeadName = (categoryName, detail) => {
  if (categoryName && !isSalaryHeadName(categoryName)) return categoryName;
  const match = String(detail || '').match(/^(?:ADVANCE SALARY|Salary)\s+-\s+([^-]+)/i);
  if (match) return match[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
  return categoryName || 'Salary';
};

const reassignCategoryReferences = async (fromId, toId) => {
  await Transaction.updateMany({ categoryId: fromId }, { categoryId: toId });
  await PendingEntry.updateMany({ categoryId: fromId }, { categoryId: toId });
  await Category.updateMany({ parentCategoryId: fromId }, { parentCategoryId: toId });
};

/**
 * One Salary main head. Employee / HR salary categories nest under it.
 * Rent and internal-transfer categories stay out of the expense chart.
 */
export const ensureCanonicalSalaryHead = async (session = null) => {
  const opts = session ? { session } : {};
  const salaryQuery = Category.find({
    type: 'EXPENSE',
    name: { $regex: /^Salar(?:y|ies)$/i },
    expenseClassification: 'GENERAL_EXPENSE',
  }).sort({ isMainHead: -1, createdAt: 1 });
  if (session) salaryQuery.session(session);
  const salaryHeads = await salaryQuery;

  let master = salaryHeads[0] || null;
  if (!master) {
    const created = await Category.create([{
      name: 'Salary',
      type: 'EXPENSE',
      expenseClassification: 'GENERAL_EXPENSE',
      propertyId: null,
      unitId: null,
      parentCategoryId: null,
      isMainHead: true,
      isRentalHead: false,
    }], opts);
    master = created[0];
  } else {
    master.name = 'Salary';
    master.isMainHead = true;
    master.parentCategoryId = null;
    master.propertyId = null;
    master.unitId = null;
    master.expenseClassification = 'GENERAL_EXPENSE';
    await master.save(opts);
  }

  for (const duplicate of salaryHeads.slice(1)) {
    await reassignCategoryReferences(duplicate._id, master._id);
    await Category.findByIdAndDelete(duplicate._id, opts);
  }

  const childrenQuery = Category.find({ parentCategoryId: master._id });
  if (session) childrenQuery.session(session);
  const children = await childrenQuery;
  for (const child of children) {
    if (child.isMainHead || child.isRentalHead) {
      child.isMainHead = false;
      child.isRentalHead = false;
      await child.save(opts);
    }
  }

  const employeesQuery = Employee.find({}, { name: 1 });
  if (session) employeesQuery.session(session);
  const employees = await employeesQuery.lean();
  for (const employee of employees) {
    const employeeName = String(employee.name || '').trim();
    if (!employeeName || isSalaryHeadName(employeeName)) continue;
    const matchesQuery = Category.find({
      type: 'EXPENSE',
      expenseClassification: 'GENERAL_EXPENSE',
      propertyId: null,
      unitId: null,
      name: { $regex: `^${escapeRegex(employeeName)}$`, $options: 'i' },
    });
    if (session) matchesQuery.session(session);
    const matches = await matchesQuery;
    if (!matches.length) continue;
    const keeper = matches.find((item) => String(item.parentCategoryId || '') === String(master._id)) || matches[0];
    keeper.parentCategoryId = master._id;
    keeper.isMainHead = false;
    keeper.isRentalHead = false;
    keeper.name = employeeName;
    await keeper.save(opts);
    for (const extra of matches.filter((item) => String(item._id) !== String(keeper._id))) {
      await reassignCategoryReferences(extra._id, keeper._id);
      await Category.findByIdAndDelete(extra._id, opts);
    }
  }

  return master;
};

export default {
  validateExpenseClassification,
  validateExpenseCategory,
  getOrCreateCanonicalHead,
  provisionStandardCategories,
  deriveExpenseClassification,
  getExpenseScope,
  getPropertyExpenseType,
  getExpenseClassificationLabel,
  isSalaryHeadName,
  isNonExpenseChartCategory,
  isNonExpenseTransaction,
  isOwnerPersonalCategory,
  isOwnerPersonalTransaction,
  isHrSalaryTransaction,
  salaryChildHeadName,
  ensureCanonicalSalaryHead,
};
