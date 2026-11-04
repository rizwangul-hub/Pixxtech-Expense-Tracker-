import React, { useState, useEffect } from 'react';
import {
  Rocket,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Plus,
  Send,
  ToggleLeft,
  ToggleRight,
  Layers,
} from 'lucide-react';
import { systemAPI } from '../../services/api.js';
import { useSystemUpdate } from '../../context/SystemUpdateContext.jsx';

export const AdminSystemUpdateModal = ({ isOpen, onClose }) => {
  const { clientBuild, checkForUpdates } = useSystemUpdate();

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ text: '', type: '' });

  // Form State
  const [version, setVersion] = useState(clientBuild?.version || '2.6.0');
  const [updateType, setUpdateType] = useState('NORMAL');
  const [title, setTitle] = useState('🚀 System Update Available!');
  const [descriptionText, setDescriptionText] = useState(
    'Improved system performance and user experience.\nUpdated financial ledgers and attendance controls.\nFixed minor styling and responsiveness.'
  );
  const [deadlineMinutes, setDeadlineMinutes] = useState('15');

  const loadHistory = async () => {
    try {
      setLoading(true);
      const res = await systemAPI.getHistory();
      if (res.success) {
        setHistory(res.updates || []);
      }
    } catch (err) {
      console.warn('[Admin Update History Error]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setFeedback({ text: '', type: '' });
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback({ text: '', type: '' });

    try {
      const descriptionArray = descriptionText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        version: version.trim(),
        updateType,
        title: title.trim(),
        description: descriptionArray,
        deadlineMinutes: updateType === 'CRITICAL' ? Number(deadlineMinutes) : null,
      };

      const res = await systemAPI.publishUpdate(payload);
      if (res.success) {
        setFeedback({
          text: `Successfully broadcasted ${updateType} update to all active users!`,
          type: 'success',
        });
        await loadHistory();
        await checkForUpdates();
      }
    } catch (err) {
      setFeedback({
        text: err.response?.data?.message || err.message || 'Failed to publish update.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await systemAPI.toggleUpdate(id);
      if (res.success) {
        await loadHistory();
        await checkForUpdates();
      }
    } catch (err) {
      console.warn('[Toggle Update Error]', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col text-white relative overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
              <Rocket size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Smart System Update & Version Manager
              </h3>
              <p className="text-xs text-slate-400">
                Broadcast instant update notifications to all active desktop and mobile users
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Active Client Build Info */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-slate-400 font-medium">Currently Running Client Version:</span>
              <span className="ml-2 font-mono font-bold text-sky-400 bg-sky-950/80 px-2.5 py-0.5 rounded border border-sky-800">
                v{clientBuild.version} ({clientBuild.buildId})
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Built: {new Date(clientBuild.buildTime).toLocaleString('en-PK')}
            </div>
          </div>

          {feedback.text && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  : 'bg-rose-950/80 text-rose-300 border-rose-800'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Broadcast Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="font-extrabold text-sm text-slate-200 flex items-center gap-2">
              <Plus size={16} className="text-sky-400" />
              <span>Broadcast New System Update</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Target Version Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2.6.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-semibold focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Update Severity / Type <span className="text-red-400">*</span>
                </label>
                <select
                  value={updateType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setUpdateType(nextType);
                    setTitle(
                      nextType === 'CRITICAL'
                        ? '⚠️ Important System Update Required!'
                        : '🚀 System Update Available!'
                    );
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:outline-none focus:border-sky-500"
                >
                  <option value="NORMAL">Normal Update (Non-intrusive / User can choose Later)</option>
                  <option value="CRITICAL">Critical Update (Required / Security & Schema Fix)</option>
                </select>
              </div>
            </div>

            {updateType === 'CRITICAL' && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold">
                  <AlertTriangle size={15} />
                  <span>Critical Enforcement Settings</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-slate-300 font-medium">
                    Enforcement Deadline (Minutes):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={deadlineMinutes}
                    onChange={(e) => setDeadlineMinutes(e.target.value)}
                    className="w-24 bg-slate-950 border border-amber-500/50 rounded px-2.5 py-1 text-white font-mono font-bold"
                  />
                  <span className="text-slate-400 text-[11px]">
                    (Users will see a live countdown before mandatory reload)
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                Notification Headline / Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                Release Notes / Description (One bullet point per line)
              </label>
              <textarea
                rows={3}
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                placeholder="Added new attendance rota features&#10;Fixed monthly ledger reconciliation&#10;UI speed enhancements"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-medium focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Send size={14} />
                <span>{submitting ? 'Broadcasting...' : 'Publish & Broadcast Update'}</span>
              </button>
            </div>
          </form>

          {/* Past Broadcast History */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-extrabold text-slate-300 flex items-center gap-2">
                <Layers size={15} className="text-slate-400" />
                <span>Previous Broadcasts ({history.length})</span>
              </div>
              <button
                type="button"
                onClick={loadHistory}
                disabled={loading}
                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                <span>Refresh List</span>
              </button>
            </div>

            {history.length === 0 ? (
              <p className="text-slate-500 text-center py-4">No custom broadcasts published yet.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item._id}
                    className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            item.updateType === 'CRITICAL'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          }`}
                        >
                          {item.updateType}
                        </span>
                        <span className="font-bold text-white text-xs truncate">{item.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">v{item.version}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Published by {item.publishedByName || 'Admin'} &bull;{' '}
                        {new Date(item.createdAt).toLocaleString('en-PK')}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggle(item._id)}
                      className={`p-1.5 rounded-lg border transition flex items-center gap-1 text-[11px] font-bold ${
                        item.active
                          ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800 hover:bg-emerald-900/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                      }`}
                      title={item.active ? 'Click to Deactivate' : 'Click to Activate'}
                    >
                      {item.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      <span>{item.active ? 'Active' : 'Inactive'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
