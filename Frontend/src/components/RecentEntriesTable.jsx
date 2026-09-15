import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle,
  Edit3,
  Search,
  RefreshCw,
  X,
  Save,
} from 'lucide-react';
import { transactionsAPI } from '../services/api.js';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK').format(Number(val));
};

export const RecentEntriesTable = ({
  entries = [],
  loading = false,
  onRefresh,
  onEntryUpdated,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [editDetail, setEditDetail] = useState('');
  const [editCheckedBy, setEditCheckedBy] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  // Filter entries
  const filtered = entries.filter((tx) => {
    const q = searchTerm.toLowerCase();
    return (
      tx.voucherNo?.toLowerCase().includes(q) ||
      tx.detail?.toLowerCase().includes(q) ||
      tx.categoryId?.name?.toLowerCase().includes(q) ||
      tx.drAccountId?.name?.toLowerCase().includes(q) ||
      tx.crAccountId?.name?.toLowerCase().includes(q)
    );
  });

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setEditDetail(entry.detail || '');
    setEditCheckedBy(entry.checkedBy || '');
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingEntry(null);
    setEditDetail('');
    setEditCheckedBy('');
    setEditError(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEntry) return;

    try {
      setSavingEdit(true);
      setEditError(null);
      const res = await transactionsAPI.updatePending(editingEntry._id, {
        detail: editDetail,
        checkedBy: editCheckedBy,
      });

      if (onEntryUpdated) {
        onEntryUpdated(res.transaction);
      }
      closeEditModal();
    } catch (err) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update entry.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">Recent Journal Entries</h2>
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
            {filtered.length} entries
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search V.N, Head, Detail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48 sm:w-64"
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh Entries"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition border border-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">Date</th>
              <th className="py-2.5 px-3">V.N</th>
              <th className="py-2.5 px-3">Detail / Narration</th>
              <th className="py-2.5 px-3">Account Head</th>
              <th className="py-2.5 px-3">Dr. Account</th>
              <th className="py-2.5 px-3">Cr. Account</th>
              <th className="py-2.5 px-3 text-right">Amount (Rs)</th>
              <th className="py-2.5 px-3 text-center">Status</th>
              <th className="py-2.5 px-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="9" className="py-8 text-center text-slate-500">
                  {loading ? 'Loading transactions...' : 'No journal transactions found.'}
                </td>
              </tr>
            ) : (
              filtered.map((tx) => {
                const isVerified = tx.status === 'VERIFIED';
                const formattedDate = tx.date
                  ? new Date(tx.date).toISOString().split('T')[0]
                  : 'N/A';

                return (
                  <tr
                    key={tx._id}
                    className="hover:bg-slate-800/40 transition-colors text-slate-300"
                  >
                    <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      #{tx.voucherNo}
                    </td>
                    <td className="py-2.5 px-3 max-w-xs truncate" title={tx.detail}>
                      {tx.detail}
                      {tx.propertyId?.plazaName && (
                        <span className="block text-[10px] text-blue-400">
                          {tx.propertyId.plazaName}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 border border-slate-700/60">
                        {tx.categoryId?.name || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-emerald-300/90 whitespace-nowrap">
                      {tx.drAccountId?.name || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-rose-300/90 whitespace-nowrap">
                      {tx.crAccountId?.name || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                      {formatPKR(tx.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                          <Clock className="w-3 h-3" />
                          Pending Review
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {!isVerified ? (
                        <button
                          onClick={() => openEditModal(tx)}
                          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                          title="Edit pending voucher"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Pending Voucher Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                Edit Pending Voucher #{editingEntry.voucherNo}
              </h3>
              <button
                onClick={closeEditModal}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="mb-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Transaction Detail</label>
                <textarea
                  rows="3"
                  value={editDetail}
                  onChange={(e) => setEditDetail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Checked By Personnel</label>
                <input
                  type="text"
                  value={editCheckedBy}
                  onChange={(e) => setEditCheckedBy(e.target.value)}
                  placeholder="e.g. Fahad Sb"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-3 py-1.5 text-slate-300 hover:bg-slate-800 rounded transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentEntriesTable;
