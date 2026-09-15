/**
 * Centralized Record Status Enums
 * Governs financial record approval lifecycle across all accounting and property modules.
 */
export const RECORD_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  VOID: 'VOID',
  REVERSED: 'REVERSED',
});

export const RECORD_STATUSES = Object.freeze(Object.values(RECORD_STATUS));

/**
 * Validates whether a status string is a recognized record status
 * @param {string} status
 * @returns {boolean}
 */
export const isValidRecordStatus = (status) => {
  return RECORD_STATUSES.includes(status);
};

export default RECORD_STATUS;
