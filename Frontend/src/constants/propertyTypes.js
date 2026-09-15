/**
 * Centralized Property and Unit Constants & UI Badges
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

export const PROPERTY_TYPE_CONFIG = Object.freeze({
  [PROPERTY_TYPES.PLAZA]: {
    label: 'Commercial Plaza',
    color: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/50',
  },
  [PROPERTY_TYPES.HOUSE]: {
    label: 'Residential House',
    color: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50',
  },
  [PROPERTY_TYPES.BUILDING]: {
    label: 'Office Building',
    color: 'bg-cyan-950/70 text-cyan-300 border-cyan-700/50',
  },
  [PROPERTY_TYPES.SHOPS]: {
    label: 'Retail Shops',
    color: 'bg-amber-950/70 text-amber-300 border-amber-700/50',
  },
  [PROPERTY_TYPES.OTHER]: {
    label: 'Other Property',
    color: 'bg-slate-800 text-slate-300 border-slate-700',
  },
});

export const UNIT_STATUS_CONFIG = Object.freeze({
  [UNIT_STATUSES.OCCUPIED]: {
    label: 'Occupied',
    dotColor: 'bg-emerald-400',
    badgeColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
  },
  [UNIT_STATUSES.VACANT]: {
    label: 'Vacant',
    dotColor: 'bg-amber-400',
    badgeColor: 'bg-amber-950/60 text-amber-300 border-amber-700/50',
  },
  [UNIT_STATUSES.MAINTENANCE]: {
    label: 'Under Maintenance',
    dotColor: 'bg-rose-400',
    badgeColor: 'bg-rose-950/60 text-rose-300 border-rose-700/50',
  },
  [UNIT_STATUSES.INACTIVE]: {
    label: 'Inactive',
    dotColor: 'bg-slate-500',
    badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
  },
});

export const UNIT_TYPE_CONFIG = Object.freeze({
  [UNIT_TYPES.SHOP]: { label: 'Shop', color: 'text-amber-300 bg-amber-950/50 border-amber-800/40' },
  [UNIT_TYPES.OFFICE]: { label: 'Office', color: 'text-sky-300 bg-sky-950/50 border-sky-800/40' },
  [UNIT_TYPES.HOUSE]: { label: 'House', color: 'text-emerald-300 bg-emerald-950/50 border-emerald-800/40' },
  [UNIT_TYPES.APARTMENT]: { label: 'Apartment', color: 'text-purple-300 bg-purple-950/50 border-purple-800/40' },
  [UNIT_TYPES.FLAT]: { label: 'Flat', color: 'text-indigo-300 bg-indigo-950/50 border-indigo-800/40' },
  [UNIT_TYPES.OTHER]: { label: 'Other', color: 'text-slate-300 bg-slate-800 border-slate-700' },
});

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
  PROPERTY_TYPE_CONFIG,
  UNIT_STATUS_CONFIG,
  UNIT_TYPE_CONFIG,
};
