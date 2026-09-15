/**
 * Centralized Record Status Enums (Frontend)
 * Governs record approval lifecycle badges and state filters.
 */
export const RECORD_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  VOID: 'VOID',
  REVERSED: 'REVERSED',
});

export const RECORD_STATUS_CONFIG = Object.freeze({
  [RECORD_STATUS.DRAFT]: {
    label: 'Draft',
    color: 'bg-slate-700/60 text-slate-300 border-slate-600',
  },
  [RECORD_STATUS.SUBMITTED]: {
    label: 'Submitted',
    color: 'bg-amber-950/60 text-amber-300 border-amber-600',
  },
  [RECORD_STATUS.APPROVED]: {
    label: 'Approved',
    color: 'bg-emerald-950/60 text-emerald-300 border-emerald-600',
  },
  [RECORD_STATUS.REJECTED]: {
    label: 'Rejected',
    color: 'bg-rose-950/60 text-rose-300 border-rose-600',
  },
  [RECORD_STATUS.VOID]: {
    label: 'Void',
    color: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  },
  [RECORD_STATUS.REVERSED]: {
    label: 'Reversed',
    color: 'bg-purple-950/60 text-purple-300 border-purple-600',
  },
});

export default RECORD_STATUS;
