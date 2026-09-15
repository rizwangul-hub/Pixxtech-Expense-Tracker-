/**
 * Centralized Property and Unit Constants
 * Pixx Technologies — Pakistan Property Finance & Expense Management System
 */

export const PROPERTY_TYPES = Object.freeze({
  PLAZA: 'PLAZA',
  HOUSE: 'HOUSE',
  BUILDING: 'BUILDING',
  SHOPS: 'SHOPS',
  OTHER: 'OTHER',
});

export const PROPERTY_TYPE_LIST = Object.freeze(Object.values(PROPERTY_TYPES));

export const PROPERTY_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
});

export const PROPERTY_STATUS_LIST = Object.freeze(Object.values(PROPERTY_STATUSES));

export const UNIT_TYPES = Object.freeze({
  SHOP: 'SHOP',
  OFFICE: 'OFFICE',
  HOUSE: 'HOUSE',
  APARTMENT: 'APARTMENT',
  FLAT: 'FLAT',
  OTHER: 'OTHER',
});

export const UNIT_TYPE_LIST = Object.freeze(Object.values(UNIT_TYPES));

export const UNIT_STATUSES = Object.freeze({
  OCCUPIED: 'OCCUPIED',
  VACANT: 'VACANT',
  MAINTENANCE: 'MAINTENANCE',
  INACTIVE: 'INACTIVE',
});

export const UNIT_STATUS_LIST = Object.freeze(Object.values(UNIT_STATUSES));

export const AREA_UNITS = Object.freeze({
  SQ_FT: 'SQ_FT',
  MARLA: 'MARLA',
  KANAL: 'KANAL',
});

export const AREA_UNIT_LIST = Object.freeze(Object.values(AREA_UNITS));

export default {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LIST,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LIST,
  UNIT_TYPES,
  UNIT_TYPE_LIST,
  UNIT_STATUSES,
  UNIT_STATUS_LIST,
  AREA_UNITS,
  AREA_UNIT_LIST,
};
