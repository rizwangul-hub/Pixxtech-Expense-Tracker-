import React, { useState } from 'react';
import { Rocket, RefreshCw, Clock, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';
import { useSystemUpdate } from '../../context/SystemUpdateContext.jsx';

export const UpdateNotificationBanner = () => {
  const { updateAvailable, updateInfo, snoozed, snoozeUpdate, requestSystemUpdate, isRefreshing } =
    useSystemUpdate();

  const [expanded, setExpanded] = useState(false);

  // Show banner only if update is available, not snoozed, and is a NORMAL update
  if (!updateAvailable || snoozed || updateInfo.updateType === 'CRITICAL') {
    return null;
  }

  return (
    <aside
      role="region"
      aria-label="System Update"
      className="fixed bottom-5 right-4 sm:right-6 z-[9990] max-w-[92vw] sm:max-w-md w-full animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-sky-500/40 rounded-2xl shadow-2xl p-4 sm:p-5 text-white ring-1 ring-white/10 relative overflow-hidden">
        {/* Subtle top accent gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400" />

        <div className="flex items-start gap-3.5">
          {/* Animated Rocket Icon */}
          <div className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/30">
            <Rocket className="w-5 h-5 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                {updateInfo.title || '🚀 System Update Available!'}
              </h4>
              {updateInfo.version && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  v{updateInfo.version}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              We have improved the system with new features, enhancements, and bug fixes.
              Please refresh the system to experience the latest improvements.
            </p>

            {/* Expandable Release Notes */}
            {updateInfo.description && updateInfo.description.length > 0 && (
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition"
                >
                  <span>{expanded ? 'Hide what is new' : 'See what is new'}</span>
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {expanded && (
                  <div className="mt-2 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1 animate-in fade-in duration-200">
                    {updateInfo.description.map((note, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <Sparkles size={11} className="text-amber-400 shrink-0 mt-0.5" />
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 flex items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isRefreshing}
                onClick={() => requestSystemUpdate(false)}
                className="flex-1 py-2 px-3.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh Now'}</span>
              </button>

              <button
                type="button"
                onClick={snoozeUpdate}
                className="py-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer"
              >
                <Clock size={13} />
                <span>Later</span>
              </button>
            </div>
          </div>

          {/* Quick Close Button */}
          <button
            type="button"
            onClick={snoozeUpdate}
            className="shrink-0 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
            title="Snooze for 30 minutes"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
};
