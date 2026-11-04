import React from 'react';
import { Rocket, RefreshCw } from 'lucide-react';
import { useSystemUpdate } from '../../context/SystemUpdateContext.jsx';

export const UpdateFloatingPill = () => {
  const { updateAvailable, updateInfo, snoozed, requestSystemUpdate, isRefreshing } =
    useSystemUpdate();

  // Show floating pill only when update is available, user chose "Later", and it's not critical
  if (!updateAvailable || !snoozed || updateInfo.updateType === 'CRITICAL') {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9980] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <button
        type="button"
        disabled={isRefreshing}
        onClick={() => requestSystemUpdate(false)}
        className="group flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-900 text-white rounded-full border border-sky-500/50 shadow-xl backdrop-blur-md transition hover:scale-105 cursor-pointer ring-2 ring-sky-500/20"
        title="A newer version is ready. Click to refresh now."
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500" />
        </span>

        <Rocket size={14} className="text-sky-400 group-hover:rotate-12 transition-transform" />

        <span className="text-xs font-bold text-slate-200">
          Update Ready {updateInfo.version ? `(v${updateInfo.version})` : ''} &bull; Refresh
        </span>

        <RefreshCw
          size={12}
          className={`text-slate-400 group-hover:text-sky-400 ${isRefreshing ? 'animate-spin' : ''}`}
        />
      </button>
    </div>
  );
};
