import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, Clock, Sparkles } from 'lucide-react';
import { useSystemUpdate } from '../../context/SystemUpdateContext.jsx';

export const CriticalUpdateModal = () => {
  const { updateAvailable, updateInfo, requestSystemUpdate, isRefreshing } = useSystemUpdate();
  const [timeLeft, setTimeLeft] = useState(null);

  const isCritical = updateAvailable && updateInfo.updateType === 'CRITICAL';

  // Countdown timer for enforced deadline
  useEffect(() => {
    if (!isCritical || !updateInfo.criticalDeadline) {
      setTimeLeft(null);
      return;
    }

    const targetDate = new Date(updateInfo.criticalDeadline).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, targetDate - now);
      if (diff <= 0) {
        setTimeLeft('00:00');
        // Deadline reached: automatically prompt update
        requestSystemUpdate(false);
      } else {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeLeft(
          `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        );
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isCritical, updateInfo.criticalDeadline, requestSystemUpdate]);

  if (!isCritical) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="critical-update-title"
      className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
    >
      <div className="bg-slate-900 border-2 border-amber-500/80 rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 text-white relative overflow-hidden ring-4 ring-amber-500/20">
        {/* Top Warning Glow Strip */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 animate-pulse" />

        <div className="flex flex-col items-center text-center">
          {/* Animated Warning Shield */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-xl shadow-amber-500/30 mb-4 animate-bounce">
            <ShieldAlert size={36} />
          </div>

          <h3
            id="critical-update-title"
            className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center justify-center gap-2 flex-wrap"
          >
            <span>{updateInfo.title || '⚠️ Important System Update Required!'}</span>
            {updateInfo.version && (
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                v{updateInfo.version}
              </span>
            )}
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 mt-2.5 leading-relaxed max-w-md">
            A critical system update is available.
            <br />
            We have made important improvements to system security, reliability, and functionality.
            <br />
            Please update your system to continue using the latest version.
          </p>

          {/* Optional Countdown Deadline */}
          {timeLeft && (
            <div className="mt-4 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-amber-300 text-xs font-bold font-mono">
              <Clock size={15} className="animate-spin" />
              <span>Mandatory update deadline remaining: {timeLeft}</span>
            </div>
          )}

          {/* Release Notes */}
          {updateInfo.description && updateInfo.description.length > 0 && (
            <div className="mt-4 w-full p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-left text-xs text-slate-300 space-y-1.5">
              <div className="font-bold text-amber-400 text-[11px] uppercase tracking-wider mb-1">
                Security & System Fixes:
              </div>
              {updateInfo.description.map((item, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <Sparkles size={12} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* Primary Action Button */}
          <div className="mt-6 w-full">
            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => requestSystemUpdate(false)}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-extrabold text-sm sm:text-base shadow-xl transition transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Applying Update...' : 'Update System Now'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-3 font-medium">
            Your login session will remain active. Any unsaved changes will be safely checked before reload.
          </p>
        </div>
      </div>
    </div>
  );
};
