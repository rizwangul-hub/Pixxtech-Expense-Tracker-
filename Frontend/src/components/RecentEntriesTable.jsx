import React, { useState, useRef } from 'react';
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
  Paperclip,
  Eye,
  Image as ImageIcon,
  Upload,
  ImagePlus,
  Sparkles,
  RotateCcw,
  Building2,
  Landmark,
} from 'lucide-react';
import { transactionsAPI, vouchersAPI, verificationAPI, uploadAPI } from '../services/api.js';
import { SingleVoucherPrintModal } from './SingleVoucherPrintModal.jsx';
import { ReceiptViewerModal } from './ReceiptViewerModal.jsx';
import { downloadReceiptEvidenceDocument, downloadReceiptImage } from '../utils/downloadReceipt.js';
import { resolveTransactionAccounts } from '../utils/formatters.js';


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
  properties = [],
  categories = [],
  accounts = [],
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
  const [editPropertyId, setEditPropertyId] = useState('');
  const [editUnitId, setEditUnitId] = useState('');
  const [editParentCategoryId, setEditParentCategoryId] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);
  const [deletingPendingId, setDeletingPendingId] = useState(null);
  const [editAttachments, setEditAttachments] = useState([]);
  const [editNewFiles, setEditNewFiles] = useState([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const editFileInputRef = useRef(null);

  // Receipt Evidence States
  const [selectedReceiptItem, setSelectedReceiptItem] = useState(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState(null);

  const getItemAttachments = (item) => {
    if (!item) return [];
    const list =
      item.attachments && item.attachments.length > 0
        ? item.attachments
        : item.entryData?.attachments && item.entryData.attachments.length > 0
        ? item.entryData.attachments
        : [];
    return list.filter((a) => a && (typeof a === 'string' || a.url));
  };

  const handleDownloadReceiptEvidence = async (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setDownloadingReceiptId(item._id);
      const success = await downloadReceiptEvidenceDocument(item);
      if (!success) {
        setSelectedReceiptItem(item);
      }
    } catch (err) {
      console.error('Download receipt evidence error:', err);
      setSelectedReceiptItem(item);
    } finally {
      setDownloadingReceiptId(null);
    }
  };

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

    const propId = entry.propertyId?._id || entry.propertyId || '';
    const unitId = entry.unitId?._id || entry.unitId || '';
    const catId = entry.categoryId?._id || entry.categoryId || '';
    const currentCat = categories.find((c) => String(c._id) === String(catId));
    const parentId =
      entry.parentCategoryId?._id ||
      entry.parentCategoryId ||
      entry.entryData?.parentCategoryId ||
      currentCat?.parentCategoryId?._id ||
      currentCat?.parentCategoryId ||
      '';

    const accId =
      entry.crAccountId?._id ||
      (typeof entry.crAccountId === 'string' ? entry.crAccountId : '') ||
      entry.receivingAccountId?._id ||
      (typeof entry.receivingAccountId === 'string' ? entry.receivingAccountId : '') ||
      entry.entryData?.paidFromAccountId ||
      '';

    setEditPropertyId(propId);
    setEditUnitId(unitId);
    setEditParentCategoryId(parentId);
    setEditCategoryId(catId);
    setEditAccountId(accId ? String(accId) : '');

    setEditAttachments(getItemAttachments(entry) || []);
    setEditNewFiles([]);
    setUploadingEvidence(false);
    setEditError(null);
  };

  const closeEditPending = () => {
    setEditingPending(null);
    setEditAmount('');
    setEditDetail('');
    setEditVoucherNo('');
    setEditDate('');
    setEditPropertyId('');
    setEditUnitId('');
    setEditParentCategoryId('');
    setEditCategoryId('');
    setEditAccountId('');
    setEditAttachments([]);
    setEditNewFiles([]);
    setUploadingEvidence(false);
    setEditError(null);
  };

  const handleRemoveExistingAttachment = (indexToRemove) => {
    setEditAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleRemoveNewFile = (indexToRemove) => {
    setEditNewFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Compute active categories filtered by scope for the edit pending modal
  const activeScopeCategories = categories.filter((c) => {
    if (c.type !== 'EXPENSE') return false;
    if (c.isMainHead) return false;
    if (editUnitId) {
      const uId = c.unitId?._id || c.unitId;
      return c.expenseClassification === 'UNIT_EXPENSE' && (!uId || String(uId) === String(editUnitId));
    }
    if (editPropertyId) {
      const pId = c.propertyId?._id || c.propertyId;
      return c.expenseClassification === 'PROPERTY_OWN_EXPENSE' && (!pId || String(pId) === String(editPropertyId));
    }
    const isGeneral = !c.propertyId || !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE';
    if (!isGeneral) return false;
    if (editParentCategoryId) {
      const parentId = c.parentCategoryId?._id || c.parentCategoryId;
      return String(parentId) === String(editParentCategoryId);
    }
    return true;
  });

  const handleSavePendingEdit = async (e) => {
    e.preventDefault();
    if (!editingPending) return;
    try {
      setSavingEdit(true);
      setEditError(null);

      let finalAttachments = [...editAttachments];
      if (editNewFiles.length > 0) {
        setUploadingEvidence(true);
        try {
          const uploadRes = await uploadAPI.images(editNewFiles);
          if (uploadRes?.images?.length) {
            finalAttachments = [...finalAttachments, ...uploadRes.images];
          }
        } catch (uploadErr) {
          console.error('Evidence upload error:', uploadErr);
          setEditError('Failed to upload evidence images. Please check the files and try again.');
          setSavingEdit(false);
          setUploadingEvidence(false);
          return;
        }
        setUploadingEvidence(false);
      }

      const payload = {
        amount: Number(editAmount),
        detail: editDetail.trim(),
        voucherNo: editVoucherNo.trim(),
        date: editDate,
        attachments: finalAttachments,
      };

      if (editingPending.entryType === 'EXPENSE') {
        const classification = editUnitId
          ? 'UNIT_EXPENSE'
          : editPropertyId
          ? 'PROPERTY_OWN_EXPENSE'
          : 'GENERAL_EXPENSE';
        payload.propertyId = editPropertyId || null;
        payload.unitId = editUnitId || null;
        payload.expenseClassification = classification;
        if (editCategoryId) {
          payload.categoryId = editCategoryId;
        }
        if (editParentCategoryId) {
          payload.parentCategoryId = editParentCategoryId;
        }
      }

      if (editAccountId) {
        payload.crAccountId = editAccountId;
        payload.paidFromAccountId = editAccountId;
        payload.receivingAccountId = editAccountId;
      }

      await verificationAPI.updatePending(editingPending._id, payload);
      closeEditPending();
      if (onEntryUpdated) onEntryUpdated();
    } catch (err) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update entry.');
    } finally {
      setSavingEdit(false);
      setUploadingEvidence(false);
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

  // Separate any pending entries in entries prop so they never appear under 'Verified & Posted'
  const pendingFromEntries = entries.filter((tx) => tx.status === 'PENDING');
  const verifiedOnlyEntries = entries.filter((tx) => tx.status !== 'PENDING');

  // Combine pendingEntries prop with any pending entries from entries prop (avoiding duplicate IDs)
  const combinedPending = [
    ...pendingEntries,
    ...pendingFromEntries.filter((tx) => !pendingEntries.some((p) => p._id?.toString() === tx._id?.toString())),
  ];

  const filteredPending = combinedPending.filter((e) =>
    !q ||
    e.voucherNo?.toLowerCase().includes(q) ||
    e.detail?.toLowerCase().includes(q) ||
    e.entryType?.toLowerCase().includes(q) ||
    (e.categoryId?.name || e.categoryId || '').toString().toLowerCase().includes(q)
  );

  const filteredVerified = verifiedOnlyEntries.filter((tx) =>
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
        <div className="overflow-x-auto table-responsive rounded-lg border border-slate-200">
          <table className="custom-table compact-table w-full table-fixed">
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

                  const canEdit = entry.status !== 'REJECTED' && entry.status !== 'VERIFIED';

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
                      <td className="max-w-xs font-bold text-slate-900" title={entry.detail}>
                        <div className="truncate">{entry.detail || '—'}</div>
                        {entry.propertyId?.plazaName && (
                          <span className="block text-xs font-normal text-blue-600">{entry.propertyId.plazaName}</span>
                        )}
                        {entry.tenantId?.fullName && (
                          <span className="block text-xs font-normal text-purple-600">Tenant: {entry.tenantId.fullName}</span>
                        )}
                        {entry.rentMonth && (
                          <span className="block text-[10px] font-semibold text-slate-500">{entry.rentMonth}</span>
                        )}
                        {/* Disbursing / Payment Bank or Cash Account */}
                        {(() => {
                          const bankName =
                            entry.crAccountId?.name ||
                            entry.receivingAccountId?.name ||
                            accounts.find((a) => String(a._id) === String(entry.crAccountId || entry.receivingAccountId || entry.entryData?.paidFromAccountId))?.name;
                          if (!bankName) return null;
                          return (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded w-fit">
                              <Landmark size={10} className="text-emerald-600 shrink-0" />
                              <span className="truncate">
                                {entry.entryType === 'SALARY' ? 'Bank: ' : 'Account: '}
                                {bankName}
                              </span>
                            </div>
                          );
                        })()}
                        {/* Attached Purchase / Receipt Evidence */}
                        {getItemAttachments(entry).length > 0 && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptItem(entry)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold transition cursor-pointer"
                              title="Click to view receipt evidence with voucher details"
                            >
                              <Paperclip size={10} className="text-blue-600" />
                              <span>{getItemAttachments(entry).length} {getItemAttachments(entry).length === 1 ? 'Receipt' : 'Receipts'}</span>
                              <Eye size={10} className="opacity-75" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDownloadReceiptEvidence(e, entry)}
                              disabled={downloadingReceiptId === entry._id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                              title="Download official receipt evidence slip (voucher details on top + receipt image on bottom)"
                            >
                              <Download size={10} className={downloadingReceiptId === entry._id ? 'animate-bounce text-emerald-600' : 'text-emerald-600'} />
                              <span>{downloadingReceiptId === entry._id ? 'Saving...' : 'Download Slip'}</span>
                            </button>
                          </div>
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
                          {getItemAttachments(entry).length > 0 && (
                            <button
                              onClick={(e) => handleDownloadReceiptEvidence(e, entry)}
                              disabled={downloadingReceiptId === entry._id}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition border border-emerald-300 disabled:opacity-50"
                              title="Download Receipt Evidence Slip (voucher details on top + receipt photo on bottom)"
                            >
                              {downloadingReceiptId === entry._id ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-emerald-600" />
                              )}
                            </button>
                          )}
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
        <div className="overflow-x-auto table-responsive rounded-lg border border-slate-200">
          <table className="custom-table compact-table w-full table-fixed">
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
                  const formattedDate = tx.date
                    ? new Date(tx.date).toISOString().split('T')[0]
                    : 'N/A';
                  const { dr, cr, location } = resolveTransactionAccounts(tx);
                  const isVerified = tx.status === 'VERIFIED';

                  return (
                    <tr key={tx._id} className="hover:bg-slate-50 transition-colors">
                      <td className="font-mono text-slate-800 whitespace-nowrap">{formattedDate}</td>
                      <td className="font-mono font-bold text-blue-700 whitespace-nowrap">#{tx.voucherNo}</td>
                      <td className="max-w-xs font-bold text-slate-900" title={tx.detail}>
                        <div className="truncate">{tx.detail}</div>
                        {location && (
                          <span className="block text-xs font-normal text-blue-600">{location}</span>
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

                        {/* Attached Purchase / Receipt Evidence (Verified) */}
                        {getItemAttachments(tx).length > 0 && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptItem(tx)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold transition cursor-pointer"
                              title="Click to view receipt evidence with voucher details"
                            >
                              <Paperclip size={10} className="text-blue-600" />
                              <span>{getItemAttachments(tx).length} {getItemAttachments(tx).length === 1 ? 'Receipt' : 'Receipts'}</span>
                              <Eye size={10} className="opacity-75" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDownloadReceiptEvidence(e, tx)}
                              disabled={downloadingReceiptId === tx._id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                              title="Download official receipt evidence slip (voucher details on top + receipt image on bottom)"
                            >
                              <Download size={10} className={downloadingReceiptId === tx._id ? 'animate-bounce text-emerald-600' : 'text-emerald-600'} />
                              <span>{downloadingReceiptId === tx._id ? 'Saving...' : 'Download Slip'}</span>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="bg-slate-100 px-2.5 py-0.5 rounded-md text-slate-800 font-bold border border-slate-300 text-xs">
                          {tx.categoryId?.name || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="text-emerald-800 font-bold whitespace-nowrap">{dr}</td>
                      <td className="text-rose-800 font-bold whitespace-nowrap">{cr}</td>
                      <td className="text-right font-mono font-bold text-slate-900 whitespace-nowrap currency-amount">
                        {formatPKR(tx.amount)}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        {tx.status === 'REVERSED' ? (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <RotateCcw className="w-3.5 h-3.5 text-rose-700" />
                            Reversed
                          </span>
                        ) : tx.status === 'VOID' ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <XCircle className="w-3.5 h-3.5 text-slate-600" />
                            Void
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-xs font-bold">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                            Verified
                          </span>
                        )}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {getItemAttachments(tx).length > 0 && (
                            <button
                              onClick={(e) => handleDownloadReceiptEvidence(e, tx)}
                              disabled={downloadingReceiptId === tx._id}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition border border-emerald-300 disabled:opacity-50"
                              title="Download Receipt Evidence Slip (voucher details on top + receipt photo on bottom)"
                            >
                              {downloadingReceiptId === tx._id ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-emerald-600" />
                              )}
                            </button>
                          )}
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl">
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

              {editingPending?.entryType === 'EXPENSE' && (
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg space-y-3">
                  <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 size={14} className="text-amber-400" />
                      Property & Unit Allocation (Derives Scope)
                    </span>
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded">
                      Scope: {editUnitId ? 'UNIT EXPENSE' : editPropertyId ? 'PROPERTY OWN' : editParentCategoryId ? `GENERAL (${categories.find((c) => String(c._id) === String(editParentCategoryId))?.name || 'OFFICE'})` : 'GENERAL EXPENSE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 font-semibold mb-1">Select Property (Optional)</label>
                      <select
                        value={editPropertyId}
                        onChange={(e) => {
                          const pId = e.target.value;
                          const newUnitId = pId ? editUnitId : '';
                          const newParentCatId = pId ? '' : editParentCategoryId;
                          const nextCats = categories.filter((c) => {
                            if (c.type !== 'EXPENSE') return false;
                            if (c.isMainHead) return false;
                            if (newUnitId && pId) {
                              const uId = c.unitId?._id || c.unitId;
                              return c.expenseClassification === 'UNIT_EXPENSE' && (!uId || String(uId) === String(newUnitId));
                            }
                            if (pId) {
                              const propId = c.propertyId?._id || c.propertyId;
                              return c.expenseClassification === 'PROPERTY_OWN_EXPENSE' && (!propId || String(propId) === String(pId));
                            }
                            const isGeneral = !c.propertyId || !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE';
                            if (!isGeneral) return false;
                            if (newParentCatId) {
                              const parId = c.parentCategoryId?._id || c.parentCategoryId;
                              return String(parId) === String(newParentCatId);
                            }
                            return true;
                          });
                          const isCurrentValid = nextCats.some((c) => String(c._id) === String(editCategoryId));
                          setEditPropertyId(pId);
                          setEditUnitId(newUnitId);
                          setEditParentCategoryId(newParentCatId);
                          if (!isCurrentValid) {
                            setEditCategoryId(nextCats[0]?._id || '');
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                      >
                        <option value="">-- None (General Expense) --</option>
                        {properties.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.plazaName || p.propertyName || p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {editPropertyId ? (
                      <div>
                        <label className="block text-[11px] text-slate-400 font-semibold mb-1">Select Unit (Optional)</label>
                        <select
                          value={editUnitId}
                          onChange={(e) => {
                            const uId = e.target.value;
                            const nextCats = categories.filter((c) => {
                              if (c.type !== 'EXPENSE') return false;
                              if (c.isMainHead) return false;
                              if (uId) {
                                const unitIdVal = c.unitId?._id || c.unitId;
                                return c.expenseClassification === 'UNIT_EXPENSE' && (!unitIdVal || String(unitIdVal) === String(uId));
                              }
                              if (editPropertyId) {
                                const propId = c.propertyId?._id || c.propertyId;
                                return c.expenseClassification === 'PROPERTY_OWN_EXPENSE' && (!propId || String(propId) === String(editPropertyId));
                              }
                              return (!c.propertyId || !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE');
                            });
                            const isCurrentValid = nextCats.some((c) => String(c._id) === String(editCategoryId));
                            setEditUnitId(uId);
                            if (!isCurrentValid) {
                              setEditCategoryId(nextCats[0]?._id || '');
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono"
                        >
                          <option value="">-- None (Property Own Expense) --</option>
                          {(properties.find((p) => p._id === editPropertyId)?.units || []).map((u) => (
                            <option key={u._id || u.unitName || u} value={u._id || u.unitName || u}>
                              {u.unitName || u.unitNumber || u.name || u} {u.tenantName ? `(${u.tenantName})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] text-slate-400 font-semibold mb-1">Main Head / Office (Optional)</label>
                        <select
                          value={editParentCategoryId}
                          onChange={(e) => {
                            const pCatId = e.target.value;
                            const nextCats = categories.filter((c) => {
                              if (c.type !== 'EXPENSE') return false;
                              if (c.isMainHead) return false;
                              if (c.propertyId || (c.expenseClassification && c.expenseClassification !== 'GENERAL_EXPENSE')) return false;
                              if (pCatId) {
                                const parId = c.parentCategoryId?._id || c.parentCategoryId;
                                return String(parId) === String(pCatId);
                              }
                              return true;
                            });
                            const isCurrentValid = nextCats.some((c) => String(c._id) === String(editCategoryId));
                            setEditParentCategoryId(pCatId);
                            if (!isCurrentValid) {
                              setEditCategoryId(nextCats[0]?._id || '');
                            }
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                        >
                          <option value="">-- All General Heads / Offices --</option>
                          {categories
                            .filter(
                              (c) =>
                                c.type === 'EXPENSE' &&
                                (!c.propertyId || !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE') &&
                                (c.isMainHead || !c.parentCategoryId)
                            )
                            .map((c) => (
                              <option key={c._id} value={c._id}>
                                🏢 {c.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                      Expense Head / Sub-Category
                      <span className="text-[10px] font-mono text-amber-400 ml-1">
                        ({activeScopeCategories.length} available)
                      </span>
                    </label>
                    <select
                      value={editCategoryId}
                      onChange={(e) => setEditCategoryId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                    >
                      <option value="">-- Select Expense Category --</option>
                      {activeScopeCategories.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Disbursing / Payment Bank or Cash Account */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Landmark size={13} className="text-amber-400" />
                    <span>
                      {editingPending?.entryType === 'SALARY'
                        ? 'Paid From Bank / Cash Account *'
                        : editingPending?.entryType === 'RENT' || editingPending?.entryType === 'RENT_RECEIVED'
                        ? 'Receiving Bank / Cash Account *'
                        : 'Payment Bank / Cash Account *'}
                    </span>
                  </span>
                  {editAccountId && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Current Bal: Rs. {formatPKR(accounts.find((a) => String(a._id) === String(editAccountId))?.currentBalance || 0)}
                    </span>
                  )}
                </label>
                <select
                  value={editAccountId}
                  onChange={(e) => setEditAccountId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-emerald-300 font-medium focus:outline-none focus:border-amber-500 text-xs font-mono"
                >
                  <option value="">-- Select Bank / Cash Account --</option>
                  {accounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.name} ({acc.type}) — Bal: Rs. {formatPKR(acc.currentBalance || 0)}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  The funds for this voucher will be processed through this account upon verification.
                </p>
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

              {/* Evidence & Purchase / Receipt Images Section */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <ImagePlus className="w-4 h-4" />
                    <span>Evidence / Receipt Images</span>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      {editAttachments.length + editNewFiles.length} files
                    </span>
                  </div>

                  <div>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={savingEdit || uploadingEvidence}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) {
                          setEditNewFiles((prev) => [...prev, ...files].slice(0, 10));
                        }
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={savingEdit || uploadingEvidence}
                      onClick={() => editFileInputRef.current?.click()}
                      className="px-2 py-1 rounded bg-amber-600/80 hover:bg-amber-600 text-white font-semibold text-[11px] flex items-center gap-1 transition shadow disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Attach Images</span>
                    </button>
                  </div>
                </div>

                {/* Existing Attachments */}
                {editAttachments.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between">
                      <span>Currently Attached ({editAttachments.length}):</span>
                      <span className="text-slate-500">Click to view • Click × to remove</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
                      {editAttachments.map((att, idx) => {
                        const imgUrl = typeof att === 'string' ? att : att.url;
                        const origName = (typeof att !== 'string' && att.originalName) || `Receipt #${idx + 1}`;
                        return (
                          <div key={idx} className="relative group shrink-0">
                            <img
                              src={imgUrl}
                              alt={origName}
                              className="w-14 h-14 rounded-lg object-cover border border-slate-700 cursor-pointer hover:border-amber-500 transition"
                              onClick={() => setSelectedReceiptItem({ attachments: [att], voucherNo: editVoucherNo, detail: editDetail })}
                              title={`Click to preview: ${origName}`}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveExistingAttachment(idx)}
                              className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full p-0.5 shadow-md transition opacity-80 group-hover:opacity-100"
                              title="Remove this receipt"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadReceiptImage(imgUrl, origName);
                              }}
                              className="absolute bottom-1 right-1 p-0.5 rounded bg-black/80 hover:bg-emerald-600 text-white transition shadow"
                              title="Download image"
                            >
                              <Download className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Newly Selected Files */}
                {editNewFiles.length > 0 && (
                  <div className="space-y-1 pt-1.5 border-t border-slate-800">
                    <div className="text-[10px] font-semibold text-emerald-400 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        New Images to Upload ({editNewFiles.length}):
                      </span>
                      <span className="text-slate-500">Will upload upon clicking Save</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
                      {editNewFiles.map((file, idx) => {
                        const previewUrl = URL.createObjectURL(file);
                        return (
                          <div key={`${file.name}-${idx}`} className="relative group shrink-0">
                            <img
                              src={previewUrl}
                              alt={file.name}
                              className="w-14 h-14 rounded-lg object-cover border-2 border-emerald-500/70"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveNewFile(idx)}
                              className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full p-0.5 shadow-md transition"
                              title="Unselect"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <div className="text-[9px] text-emerald-300 truncate max-w-[56px] mt-0.5 font-mono" title={file.name}>
                              {file.name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {editAttachments.length === 0 && editNewFiles.length === 0 && (
                  <div
                    onClick={() => editFileInputRef.current?.click()}
                    className="border border-dashed border-slate-800 hover:border-amber-500/60 bg-slate-900/50 hover:bg-slate-900/80 rounded-lg p-2.5 text-center cursor-pointer transition space-y-0.5"
                  >
                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>No images attached. Click here to attach evidence / receipt photo.</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Supports JPG, PNG, WEBP, GIF
                    </p>
                  </div>
                )}

                {uploadingEvidence && (
                  <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-medium py-0.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Uploading new images to storage...</span>
                  </div>
                )}
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

      {/* Single Voucher Print Modal */}
      {printingTx && (
        <SingleVoucherPrintModal
          transactionId={printingTx._id}
          voucherId={printingTx.voucherId}
          initialData={printingTx}
          onClose={() => setPrintingTx(null)}
        />
      )}

      {/* Attached Purchase / Receipt Evidence Viewer & Downloader Modal */}
      {selectedReceiptItem && (
        <ReceiptViewerModal
          entry={selectedReceiptItem}
          onClose={() => setSelectedReceiptItem(null)}
        />
      )}
    </div>
  );
};

export default RecentEntriesTable;
