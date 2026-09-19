import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Edit3,
  Search,
  RefreshCw,
  X,
  Save,
  Printer,
  Download,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { transactionsAPI, vouchersAPI, verificationAPI } from '../services/api.js';
import { SingleVoucherPrintModal } from './SingleVoucherPrintModal.jsx';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK').format(Number(val) || 0);
};

const ENTRY_TYPE_LABELS = {
  EXPENSE: 'Expense',
  RENT: 'Rent',
  RENT_RECEIVED: 'Rent Received',
  OTHER_INCOME: 'Other Income',
  TRANSFER: 'Transfer',
};

const ENTRY_TYPE_COLORS = {
  EXPENSE: 'bg-rose-100 text-rose-800 border-rose-200',
  RENT: 'bg-purple-100 text-purple-800 border-purple-200',
  RENT_RECEIVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  OTHER_INCOME: 'bg-amber-100 text-amber-800 border-amber-200',
  TRANSFER: 'bg-sky-100 text-sky-800 border-sky-200',
};

export const RecentEntriesTable = ({
  entries = [],
  pendingEntries = [],
  loading = false,
  onRefresh,
  onEntryUpdated,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'verified'

  // Verified/posted transaction states
  const [printingTx, setPrintingTx] = useState(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState(null);
  const [deletingTxId, setDeletingTxId] = useState(null);

  // Pending entry edit/delete states
  const [editingPending, setEditingPending] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editVoucherNo, setEditVoucherNo] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [deletingPendingId, setDeletingPendingId] = useState(null);

  // ─── Verified Entry Handlers ───────────────────────────────────────────────

  const handleDeleteVerified = async (tx) => {
    if (!window.confirm(`Delete Voucher #${tx.voucherNo} (${tx.detail})? This will reverse account balances.`)) return;
    try {
      setDeletingTxId(tx._id);
      await transactionsAPI.deleteTransaction(tx._id);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to delete transaction.');
    } finally {
      setDeletingTxId(null);
    }
  };

  const handleDownloadPdf = async (tx) => {
    try {
      setDownloadingPdfId(tx._id);
      await vouchersAPI.downloadSingleVoucherPDF(tx._id, tx.voucherNo);
    } catch (err) {
      console.error('Download PDF error:', err);
      alert('Failed to generate PDF. Opening Print preview instead...');
      setPrintingTx(tx);
    } finally {
      setDownloadingPdfId(null);
    }
  };

  // ─── Pending Entry Handlers ────────────────────────────────────────────────

  const openEditPending = (entry) => {
    setEditingPending(entry);
    setEditAmount(entry.amount || '');
    setEditDetail(entry.detail || '');
    setEditVoucherNo(entry.voucherNo || '');
    setEditDate(entry.date ? new Date(entry.date).toISOString().split('T')[0] : '');
    setEditError(null);
  };

  const closeEditPending = () => {
    setEditingPending(null);
    setEditAmount('');
    setEditDetail('');
    setEditVoucherNo('');
    setEditDate('');
    setEditError(null);
  };

  const handleSavePendingEdit = async (e) => {
    e.preventDefault();
    if (!editingPending) return;
    try {
      setSavingEdit(true);
      setEditError(null);
      await verificationAPI.updatePending(editingPending._id, {
        amount: Number(editAmount),
        detail: editDetail.trim(),
        voucherNo: editVoucherNo.trim(),
        date: editDate,
      });
      closeEditPending();
      if (onEntryUpdated) onEntryUpdated();
    } catch (err) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update entry.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeletePending = async (entry) => {
    if (!window.confirm(`Delete this pending ${entry.entryType || 'entry'} (${entry.detail || 'No detail'})?\nThis will permanently remove it from the verification queue.`)) return;
    try {
      setDeletingPendingId(entry._id);
      await verificationAPI.deletePending(entry._id);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to delete entry.');
    } finally {
      setDeletingPendingId(null);
    }
  };

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const q = searchTerm.toLowerCase();

  const filteredPending = pendingEntries.filter((e) =>
    !q ||
    e.voucherNo?.toLowerCase().includes(q) ||
    e.detail?.toLowerCase().includes(q) ||
    e.entryType?.toLowerCase().includes(q) ||
    (e.categoryId?.name || e.categoryId || '').toString().toLowerCase().includes(q)
  );

  const filteredVerified = entries.filter((tx) =>
    !q ||
    tx.voucherNo?.toLowerCase().includes(q) ||
    tx.detail?.toLowerCase().includes(q) ||
    tx.categoryId?.name?.toLowerCase().includes(q) ||
    tx.drAccountId?.name?.toLowerCase().includes(q) ||
    tx.crAccountId?.name?.toLowerCase().includes(q)
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
      {/* Header */}
      <div className="section-bar mb-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-white" />
          <span className="section-title">My Submitted Entries</span>
          <span className="section-count-badge">
            {activeTab === 'pending' ? filteredPending.length : filteredVerified.length} entries
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 w-48 sm:w-64 font-semibold"
            />
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh Entries"
            className="p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition border border-slate-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'pending'
              ? 'border-amber-500 text-amber-700 bg-amber-50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Pending Verification
          {filteredPending.length > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
              {filteredPending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('verified')}
          className={`px-4 py-2 text-xs font-bold rounded-t-lg transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'verified'
              ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Verified & Posted
          {filteredVerified.length > 0 && (
            <span className="ml-1 bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
              {filteredVerified.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB A: PENDING ENTRIES ─────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="custom-table">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Type</th>
                <th className="text-left">V.N</th>
                <th className="text-left">Detail / Narration</th>
                <th className="text-left">Category / Head</th>
                <th className="text-right">Amount (Rs)</th>
                <th className="text-center">Status</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-500 font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1" />
                    Loading your submissions...
                  </td>
                </tr>
              ) : filteredPending.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-10 text-center">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-sm font-bold text-slate-600">No pending entries!</p>
                    <p className="text-xs text-slate-400 mt-1">All your submissions have been verified by Khurshid Anwar.</p>
                  </td>
                </tr>
              ) : (
                filteredPending.map((entry) => {
                  const formattedDate = entry.date
                    ? new Date(entry.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A';
                  const statusBadge =
                    entry.status === 'REJECTED'
                      ? { label: 'Rejected', cls: 'bg-rose-100 text-rose-800 border-rose-300', Icon: XCircle }
                      : entry.status === 'EDITED'
                      ? { label: 'Edited / Re-pending', cls: 'bg-blue-100 text-blue-800 border-blue-300', Icon: Edit3 }
                      : { label: 'Awaiting Verification', cls: 'bg-amber-100 text-amber-800 border-amber-300', Icon: Clock };

                  const canEdit = entry.status !== 'REJECTED';

                  return (
                    <tr key={entry._id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="font-mono text-slate-700 whitespace-nowrap text-xs">{formattedDate}</td>
                      <td className="whitespace-nowrap">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[entry.entryType] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {ENTRY_TYPE_LABELS[entry.entryType] || entry.entryType}
                        </span>
                      </td>
                      <td className="font-mono font-bold text-blue-700 whitespace-nowrap">
                        {entry.voucherNo ? `#${entry.voucherNo}` : '—'}
                      </td>
                      <td className="max-w-xs truncate font-bold text-slate-900" title={entry.detail}>
                        {entry.detail || '—'}
                        {entry.propertyId?.plazaName && (
                          <span className="block text-xs font-normal text-blue-600">{entry.propertyId.plazaName}</span>
                        )}
                        {entry.tenantId?.fullName && (
                          <span className="block text-xs font-normal text-purple-600">Tenant: {entry.tenantId.fullName}</span>
                        )}
                        {entry.rentMonth && (
                          <span className="block text-[10px] font-semibold text-slate-500">{entry.rentMonth}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold border border-slate-200 text-[11px]">
                          {entry.categoryId?.name || (typeof entry.categoryId === 'string' ? '—' : '—')}
                        </span>
                      </td>
                      <td className="text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatPKR(entry.amount)}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${statusBadge.cls}`}>
                          <statusBadge.Icon className="w-3 h-3" />
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEditPending(entry)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition border border-slate-200"
                              title="Edit this pending entry"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePending(entry)}
                            disabled={deletingPendingId === entry._id}
                            className="p-1.5 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded-lg transition border border-rose-200 disabled:opacity-50"
                            title="Delete this pending entry"
                          >
                            {deletingPendingId === entry._id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB B: VERIFIED ENTRIES ────────────────────────────────────────── */}
      {activeTab === 'verified' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="custom-table">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">V.N</th>
                <th className="text-left">Detail / Narration</th>
                <th className="text-left">Account Head</th>
                <th className="text-left">Dr. Account</th>
                <th className="text-left">Cr. Account</th>
                <th className="text-right">Amount (Rs)</th>
                <th className="text-center">Status</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-500 font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1" />
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredVerified.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-500 font-medium">
                    No verified journal transactions found.
                  </td>
                </tr>
              ) : (
                filteredVerified.map((tx) => {
                  const isVerified = tx.status === 'VERIFIED';
                  const formattedDate = tx.date
                    ? new Date(tx.date).toISOString().split('T')[0]
                    : 'N/A';

                  return (
                    <tr key={tx._id} className="hover:bg-slate-50 transition-colors">
                      <td className="font-mono text-slate-800 whitespace-nowrap">{formattedDate}</td>
                      <td className="font-mono font-bold text-blue-700 whitespace-nowrap">#{tx.voucherNo}</td>
                      <td className="max-w-xs truncate font-bold text-slate-900" title={tx.detail}>
                        {tx.detail}
                        {tx.propertyId?.plazaName && (
                          <span className="block text-xs font-normal text-blue-600">{tx.propertyId.plazaName}</span>
                        )}
                        {tx.expenseClassification === 'UNIT_EXPENSE' ? (
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                            Unit: {tx.unitId || 'Unit-Linked'}
                          </span>
                        ) : tx.expenseClassification === 'PROPERTY_OWN_EXPENSE' ? (
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                            Property Own
                          </span>
                        ) : tx.expenseClassification === 'GENERAL_EXPENSE' ? (
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            General
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="bg-slate-100 px-2.5 py-0.5 rounded-md text-slate-800 font-bold border border-slate-300 text-xs">
                          {tx.categoryId?.name || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="text-emerald-800 font-bold whitespace-nowrap">{tx.drAccountId?.name || '-'}</td>
                      <td className="text-rose-800 font-bold whitespace-nowrap">{tx.crAccountId?.name || '-'}</td>
                      <td className="text-right font-mono font-bold text-slate-900 whitespace-nowrap currency-amount">
                        {formatPKR(tx.amount)}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <Clock className="w-3.5 h-3.5 text-amber-700" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleDownloadPdf(tx)}
                            disabled={downloadingPdfId === tx._id}
                            className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-lg transition border border-rose-200 disabled:opacity-50"
                            title="Download PDF Voucher"
                          >
                            {downloadingPdfId === tx._id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setPrintingTx(tx)}
                            className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-lg transition border border-blue-200"
                            title="Print A4 Voucher Preview"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {!isVerified && (
                            <button
                              onClick={() => handleDeleteVerified(tx)}
                              disabled={deletingTxId === tx._id}
                              className="p-1.5 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded-lg transition border border-rose-200 disabled:opacity-50"
                              title={`Delete voucher #${tx.voucherNo}`}
                            >
                              {deletingTxId === tx._id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Print Single Voucher Modal */}
      {printingTx && (
        <SingleVoucherPrintModal
          transactionId={printingTx._id}
          initialData={printingTx}
          onClose={() => setPrintingTx(null)}
        />
      )}

      {/* Edit Pending Entry Modal */}
      {editingPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  Edit Pending Entry
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Type: <span className="text-amber-300 font-bold">{ENTRY_TYPE_LABELS[editingPending.entryType] || editingPending.entryType}</span>
                </p>
              </div>
              <button onClick={closeEditPending} className="text-slate-400 hover:text-white p-1 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="mb-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSavePendingEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Voucher No. <span className="text-[10px] text-amber-500 font-normal">(Locked)</span>
                  </label>
                  <input
                    type="text"
                    value={editVoucherNo}
                    readOnly
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-400 font-mono font-bold cursor-not-allowed select-none opacity-80"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Amount (PKR) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Detail / Narration *</label>
                <textarea
                  rows="3"
                  value={editDetail}
                  onChange={(e) => setEditDetail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                  required
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeEditPending}
                  className="px-3 py-1.5 text-slate-300 hover:bg-slate-800 rounded transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
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
