import React from 'react';
import { UpdateNotificationBanner } from './UpdateNotificationBanner.jsx';
import { UpdateFloatingPill } from './UpdateFloatingPill.jsx';
import { CriticalUpdateModal } from './CriticalUpdateModal.jsx';
import { UnsavedChangesModal } from './UnsavedChangesModal.jsx';

/**
 * SystemUpdateManager
 * Consolidates all smart system update notifications and modals into one clean mount.
 */
export const SystemUpdateManager = () => {
  return (
    <>
      <UpdateNotificationBanner />
      <UpdateFloatingPill />
      <CriticalUpdateModal />
      <UnsavedChangesModal />
    </>
  );
};

export default SystemUpdateManager;
