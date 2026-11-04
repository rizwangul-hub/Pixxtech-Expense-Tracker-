import React from 'react';
import { AlertCircle, ArrowLeft, RefreshCw, X } from 'lucide-react';
import { useSystemUpdate } from '../../context/SystemUpdateContext.jsx';

export const UnsavedChangesModal = () => {
  const { unsavedWarning, closeUnsavedWarning, confirmRefreshAnyway, isRefreshing } =
    useSystemUpdate();

  if (!unsavedWarning.isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-warning-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border-2 border-rose-500/80 rounded-3xl shadow-2xl max-w-md w-full p-6 text-white relative overflow-hidden ring-4 ring-rose-500/20">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/40">
            <AlertCircle size={28} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 id="unsaved-warning-title" className="text-base sm:text-lg font-black text-white">
              ⚠️ You have unsaved changes!
            </h3>

            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Please save your work before updating the system. Refreshing now may cause you to lose your changes.
            </p>

            {/* List of dirty forms */}
            {unsavedWarning.dirtyForms && unsavedWarning.dirtyForms.length > 0 && (
              <div className="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                <span className="font-bold text-rose-300 block mb-1">
                  Unsaved progress detected in:
                </span>
                <ul className="list-disc list-inside text-slate-300 space-y-0.5 font-medium">
                  {unsavedWarning.dirtyForms.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-5 flex flex-col sm:flex-row items-center gap-2">
              <button
                type="button"
                onClick={closeUnsavedWarning}
                className="w-full sm:flex-1 py-2.5 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Save / Finish Work</span>
              </button>

              <button
                type="button"
                disabled={isRefreshing}
                onClick={confirmRefreshAnyway}
                className="w-full sm:w-auto py-2.5 px-3.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 hover:text-white font-semibold text-xs rounded-xl border border-rose-500/30 transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                <span>Refresh Anyway</span>
              </button>

              <button
                type="button"
                onClick={closeUnsavedWarning}
                className="w-full sm:w-auto py-2.5 px-3 text-slate-400 hover:text-white font-medium text-xs transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
