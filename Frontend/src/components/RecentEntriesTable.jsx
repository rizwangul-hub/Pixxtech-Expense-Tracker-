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
  Printer,
  Download,
  Trash2,
} from 'lucide-react';
import { transactionsAPI, vouchersAPI } from '../services/api.js';
import { SingleVoucherPrintModal } from './SingleVoucherPrintModal.jsx';

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
  const [printingTx, setPrintingTx] = useState(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState(null);
  const [editDetail, setEditDetail] = useState('');
  const [editCheckedBy, setEditCheckedBy] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [deletingTxId, setDeletingTxId] = useState(null);

  const handleDeleteTx = async (tx) => {
    if (!window.confirm(`Are you sure you want to delete Voucher #${tx.voucherNo} (${tx.detail})?`)) return;

    try {
      setDeletingTxId(tx._id);
      await transactionsAPI.deleteTransaction(tx._id);
      if (onRefresh) {
        onRefresh();
      }
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
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
      <div className="section-bar mb-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-white" />
          <span className="section-title">Recent Journal Entries</span>
          <span className="section-count-badge">{filtered.length} entries</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search V.N, Head, Detail..."
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

      {/* Table Container */}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="9" className="py-8 text-center text-slate-500 font-medium">
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
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="font-mono text-slate-800 whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="font-mono font-bold text-blue-700 whitespace-nowrap">
                      #{tx.voucherNo}
                    </td>
                    <td className="max-w-xs truncate font-bold text-slate-900" title={tx.detail}>
                      {tx.detail}
                      {tx.propertyId?.plazaName && (
                        <span className="block text-xs font-normal text-blue-600">
                          {tx.propertyId.plazaName}
                        </span>
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
                    <td className="text-emerald-800 font-bold whitespace-nowrap">
                      {tx.drAccountId?.name || '-'}
                    </td>
                    <td className="text-rose-800 font-bold whitespace-nowrap">
                      {tx.crAccountId?.name || '-'}
                    </td>
                    <td className="text-right font-mono font-bold text-slate-900 whitespace-nowrap currency-amount">
                      {formatPKR(tx.amount)}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                          <Clock className="w-3.5 h-3.5 text-amber-700" />
                          Pending Review
                        </span>
                      )}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleDownloadPdf(tx)}
                          disabled={downloadingPdfId === tx._id}
                          className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-lg transition border border-rose-200 disabled:opacity-50"
                          title="Generate & Download A4 PDF Voucher"
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
                          title="Print A4 Single Voucher Preview"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {!isVerified && (
                          <button
                            onClick={() => openEditModal(tx)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition border border-slate-200"
                            title="Edit pending voucher"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTx(tx)}
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
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Print Single Voucher Modal */}
      {printingTx && (
        <SingleVoucherPrintModal
          transactionId={printingTx._id}
          initialData={printingTx}
          onClose={() => setPrintingTx(null)}
        />
      )}

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
