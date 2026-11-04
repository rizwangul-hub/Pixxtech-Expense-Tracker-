import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { waitForActiveRequests, getActiveRequestsCount, systemAPI } from '../services/api.js';
import { getUnsavedChangesStatus } from '../utils/unsavedChangesRegistry.js';

const SystemUpdateContext = createContext(null);

const POLLING_INTERVAL_MS = 45000; // 45 seconds polling
const SNOOZE_DURATION_MS = 30 * 60 * 1000; // 30 minutes snooze for Normal updates

// Global client build info (injected by Vite at build time)
export const CLIENT_BUILD_INFO = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.6.0',
  buildId: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev_local',
  buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString(),
};

export const SystemUpdateProvider = ({ children }) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState({
    version: CLIENT_BUILD_INFO.version,
    buildId: CLIENT_BUILD_INFO.buildId,
    buildTime: CLIENT_BUILD_INFO.buildTime,
    updateType: 'NORMAL', // 'NORMAL' | 'CRITICAL'
    title: '🚀 System Update Available!',
    description: [
      'New system features and performance enhancements',
      'Stability improvements and user experience updates',
    ],
    criticalDeadline: null,
  });

  const [snoozed, setSnoozed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unsavedWarning, setUnsavedWarning] = useState({
    isOpen: false,
    dirtyForms: [],
    pendingAction: null,
  });

  const broadcastChannelRef = useRef(null);
  const checkTimerRef = useRef(null);
  const isCheckingRef = useRef(false);

  // Initialize BroadcastChannel for cross-tab update coordination
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('pixx_system_update');
        broadcastChannelRef.current = bc;

        bc.onmessage = (event) => {
          const { type, data } = event.data || {};
          if (type === 'SNOOZE') {
            setSnoozed(true);
          } else if (type === 'UPDATE_DETECTED') {
            setUpdateAvailable(true);
            setUpdateInfo((prev) => ({ ...prev, ...data }));
          } else if (type === 'REFRESH_STARTED') {
            setIsRefreshing(true);
          }
        };
      } catch (err) {
        console.warn('[BroadcastChannel Error]', err);
      }
    }

    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  // Safe Version Checking Engine
  const checkForUpdates = useCallback(async () => {
    if (isCheckingRef.current || isRefreshing) return;
    isCheckingRef.current = true;

    try {
      // 1. Fetch static version.json with zero-cache timestamp
      let remoteVersion = null;
      try {
        const response = await fetch(`/version.json?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (response.ok) {
          remoteVersion = await response.json();
        }
      } catch (e) {
        // Fallback to backend version endpoint if static fetch has network glitch
      }

      // 2. Fetch backend version endpoint for broadcasted admin notices
      let serverUpdate = null;
      try {
        const apiData = await systemAPI.getVersion();
        if (apiData && apiData.success) {
          serverUpdate = apiData;
        }
      } catch (e) {
        // Ignore API failures during routine background check
      }

      const activePayload = serverUpdate?.isCustomBroadcast ? serverUpdate : remoteVersion || serverUpdate;

      if (!activePayload) {
        return;
      }

      // Compare remote build with running client
      const remoteBuildId = activePayload.buildId;
      const remoteVersionNum = activePayload.version;
      const isCritical = activePayload.updateType === 'CRITICAL' || activePayload.isCritical;

      // Detection logic:
      // A) Different buildId in production
      // B) Version mismatch
      // C) Critical broadcast from Admin
      const hasBuildDiff =
        remoteBuildId &&
        remoteBuildId !== CLIENT_BUILD_INFO.buildId &&
        CLIENT_BUILD_INFO.buildId !== 'dev_local';

      const hasVersionDiff =
        remoteVersionNum && remoteVersionNum !== CLIENT_BUILD_INFO.version;

      const isTargetedUpdate = activePayload.isCustomBroadcast && activePayload.active !== false;

      if (hasBuildDiff || hasVersionDiff || isTargetedUpdate) {
        const updateData = {
          version: remoteVersionNum || activePayload.version || CLIENT_BUILD_INFO.version,
          buildId: remoteBuildId || activePayload.buildId,
          buildTime: activePayload.buildTime || new Date().toISOString(),
          updateType: isCritical ? 'CRITICAL' : 'NORMAL',
          title: activePayload.title || (isCritical ? '⚠️ Important System Update Required!' : '🚀 System Update Available!'),
          description: Array.isArray(activePayload.description) && activePayload.description.length
            ? activePayload.description
            : [
                'We have improved the system with new features, enhancements, and bug fixes.',
                'Please refresh the system to experience the latest improvements.',
              ],
          criticalDeadline: activePayload.criticalDeadline || null,
        };

        setUpdateAvailable(true);
        setUpdateInfo(updateData);

        // Notify other tabs
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'UPDATE_DETECTED',
            data: updateData,
          });
        }
      }
    } catch (err) {
      console.warn('[SystemUpdateCheck Error]', err.message);
    } finally {
      isCheckingRef.current = false;
    }
  }, [isRefreshing]);

  // Periodic polling & Visibility Change listener
  useEffect(() => {
    // Initial check after 3 seconds
    const initialTimer = setTimeout(() => {
      checkForUpdates();
    }, 3000);

    // Periodic check every 45-60 seconds (only when tab is active)
    checkTimerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkForUpdates();
      }
    }, POLLING_INTERVAL_MS);

    // Check immediately when user switches back to this tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    // Stale chunk error catcher: if Vite/Rollup dynamic import fails, prompt update
    const handleWindowError = (e) => {
      const msg = e?.message || e?.reason?.message || '';
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('Importing a module script failed')
      ) {
        console.warn('[SystemUpdate] Stale chunk detected. Prompting update...');
        checkForUpdates();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleWindowError);

    return () => {
      clearTimeout(initialTimer);
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleWindowError);
    };
  }, [checkForUpdates]);

  // Snooze normal update (Later clicked)
  const snoozeUpdate = () => {
    setSnoozed(true);
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: 'SNOOZE' });
    }
    // Auto re-prompt after snooze duration
    setTimeout(() => {
      setSnoozed(false);
    }, SNOOZE_DURATION_MS);
  };

  // Safe Reload Execution
  const executeSafeRefresh = useCallback(() => {
    setIsRefreshing(true);
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({ type: 'REFRESH_STARTED' });
    }

    // Cache-bust refresh
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('_v', Date.now().toString());

    // Small delay to ensure any in-flight toast cleans up
    setTimeout(() => {
      window.location.replace(currentUrl.toString());
    }, 150);
  }, []);

  // Trigger Refresh with Unsaved Changes Protection
  const requestSystemUpdate = useCallback(async (isForced = false) => {
    // 1. If financial/operational API requests are in progress, wait for them to finish!
    if (getActiveRequestsCount() > 0) {
      await waitForActiveRequests(5000);
    }

    // 2. Check for unsaved dirty form changes
    if (!isForced) {
      const { hasUnsaved, dirtyForms } = getUnsavedChangesStatus();
      if (hasUnsaved) {
        setUnsavedWarning({
          isOpen: true,
          dirtyForms,
          pendingAction: () => executeSafeRefresh(),
        });
        return;
      }
    }

    // 3. No dirty forms: execute safe refresh immediately
    executeSafeRefresh();
  }, [executeSafeRefresh]);

  const closeUnsavedWarning = () => {
    setUnsavedWarning({ isOpen: false, dirtyForms: [], pendingAction: null });
  };

  const confirmRefreshAnyway = () => {
    closeUnsavedWarning();
    executeSafeRefresh();
  };

  return (
    <SystemUpdateContext.Provider
      value={{
        updateAvailable,
        updateInfo,
        snoozed,
        isRefreshing,
        checkForUpdates,
        snoozeUpdate,
        requestSystemUpdate,
        unsavedWarning,
        closeUnsavedWarning,
        confirmRefreshAnyway,
        clientBuild: CLIENT_BUILD_INFO,
      }}
    >
      {children}
    </SystemUpdateContext.Provider>
  );
};

export const useSystemUpdate = () => {
  const context = useContext(SystemUpdateContext);
  if (!context) {
    throw new Error('useSystemUpdate must be used within a SystemUpdateProvider');
  }
  return context;
};

export default SystemUpdateContext;
