import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  DollarSign,
  Building2,
  Landmark,
  User,
  RefreshCw,
  FileText,
  Check,
  ArrowRight,
  ArrowLeftRight,
  Eye,
  PlusCircle,
  Sparkles,
  ExternalLink,
  Download,
  Image as ImageIcon,
  Paperclip,
  Upload,
  X,
  ImagePlus,
} from 'lucide-react';
import { verificationAPI, accountsAPI, propertiesAPI, uploadAPI } from '../services/api.js';
import { formatPKR } from '../utils/formatters.js';
import { VoucherEntryForm } from '../components/VoucherEntryForm.jsx';
import { RentCollectionModal } from '../components/RentCollectionModal.jsx';
import { ReceiptViewerModal } from '../components/ReceiptViewerModal.jsx';
import {
  downloadAllReceipts,
  downloadReceiptImage,
  downloadReceiptEvidenceDocument,
  downloadReceiptEvidenceImage,
} from '../utils/downloadReceipt.js';

// Persistent in-memory cache for instant tab switching without blocking loading screens
let verifierDataCache = {
  pendingEntries: null,
  summary: null,
  accounts: [],
  categories: [],
  properties: [],
};

const SalaryBreakdown = ({ entry }) => {
  const salary = entry?.salaryDetails || entry?.entryData?.payrollSnapshot;
  if (entry?.entryType !== 'SALARY' || !salary) return null;

  const gross = Number(salary.grossSalary || 0);
  const loanDed = Number(salary.loanDeduction ?? entry.entryData?.loanDeduction ?? 0);
  const lopDed = Number(salary.lopDeduction || 0);
  const otherDed = Number(salary.otherDeduction || 0);
  const netPay = Number(salary.netPayable || Math.max(0, gross - (loanDed + lopDed + otherDed)));
  const paidNow = Number(entry.amount || 0);
  const alreadyPaid = Number(salary.alreadyPaid || 0);
  const totalPaidAfter = alreadyPaid + paidNow;
  const remaining = Math.max(0, netPay - totalPaidAfter);
  const isFullySettled = (remaining <= 0.01) || Boolean(salary.isFullySettled);
  const currentLoanBal = Number(salary.currentLoanBalance || 0);

  return (
    <div className="mt-2 pt-2 border-t border-slate-700/60 text-xs space-y-1.5">
      {/* Staff identity inline */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-700/70 text-indigo-300 font-bold text-[11px]">
          💼 {salary.employeeName || 'Staff Member'}
        </span>
        {salary.designation && (
          <span className="text-[10px] text-slate-400 font-mono">
            {salary.designation}{salary.department ? ` (${salary.department})` : ''}
          </span>
        )}
      </div>

      {/* Clean inline chips */}
      <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-mono">
        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
          Gross: <b className="text-white">{formatPKR(gross)}</b>
        </span>

        {loanDed > 0 && (
          <span className="px-2 py-0.5 rounded bg-orange-950/70 border border-orange-800/70 text-orange-300">
            Loan Ded: <b className="text-orange-200">−{formatPKR(loanDed)}</b>
          </span>
        )}

        {lopDed > 0 && (
          <span className="px-2 py-0.5 rounded bg-rose-950/70 border border-rose-800/70 text-rose-300">
            Absent: <b className="text-rose-200">−{formatPKR(lopDed)}</b>
          </span>
        )}

        {otherDed > 0 && (
          <span className="px-2 py-0.5 rounded bg-rose-950/70 border border-rose-800/70 text-rose-300">
            Other Ded: <b className="text-rose-200">−{formatPKR(otherDed)}</b>
          </span>
        )}

        <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/70 text-emerald-300">
          Net Payable: <b className="text-white">{formatPKR(netPay)}</b>
        </span>

        {alreadyPaid > 0 && (
          <span className="px-2 py-0.5 rounded bg-sky-950/70 border border-sky-800/70 text-sky-300">
            Prev Paid: <b className="text-sky-200">{formatPKR(alreadyPaid)}</b>
          </span>
        )}

        <span className="px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/70 text-blue-300">
          This Payout: <b className="text-white">{formatPKR(paidNow)}</b>
        </span>

        {/* Dynamic Remaining Salary: shows remaining only if not fully settled */}
        {isFullySettled ? (
          <span className="px-2 py-0.5 rounded bg-emerald-900/90 border border-emerald-500/80 text-emerald-200 font-bold inline-flex items-center gap-1 shadow-sm">
            ✓ Full Salary Settled
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 font-bold">
            Remaining: {formatPKR(remaining)}
          </span>
        )}
      </div>

      {loanDed > 0 && (
        <div className="text-[10px] text-orange-300/90 flex items-center gap-2 pt-0.5 flex-wrap">
          <span>📉 Loan recovery: −{formatPKR(loanDed)} will be deducted from {salary.employeeName}'s loan upon verification</span>
          {currentLoanBal > 0 && (
            <span className="text-slate-400">
              (Current Bal: {formatPKR(currentLoanBal)} → <strong className="text-white">{formatPKR(Math.max(0, currentLoanBal - loanDed))}</strong>)
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const VerifierDashboard = ({ user, onOpenMasterAccounts, onOpenProperties }) => {
  const isAdmin = ['ADMIN', 'ADMIN_PUBLISHER'].includes(user?.role);
  const hasCache = verifierDataCache.pendingEntries !== null;

  const [pendingEntries, setPendingEntries] = useState(verifierDataCache.pendingEntries || []);
  const [summary, setSummary] = useState(verifierDataCache.summary || null);
  const [accounts, setAccounts] = useState(verifierDataCache.accounts || []);
  const [categories, setCategories] = useState(verifierDataCache.categories || []);
  const [properties, setProperties] = useState(verifierDataCache.properties || []);

  const [loading, setLoading] = useState(!hasCache);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Per-entry loading: stores the _id of the entry currently being acted on
  // so only that row's buttons are disabled (not the entire table)
  const [savingEntryId, setSavingEntryId] = useState(null);
  const [feedback, setFeedback] = useState({ message: '', type: '' });

  // Filter state
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('PENDING_VERIFICATION');
  const [searchQuery, setSearchQuery] = useState('');

  // Receipt Evidence Viewer & Downloader state
  const [viewingReceiptEntry, setViewingReceiptEntry] = useState(null);
  const [downloadingEntryId, setDownloadingEntryId] = useState(null);

  // Helper to extract attachments safely from entry or nested entryData
  const getEntryAttachments = (entry) => {
    const list =
      entry?.attachments && entry.attachments.length > 0
        ? entry.attachments
        : entry?.entryData?.attachments && entry.entryData.attachments.length > 0
        ? entry.entryData.attachments
        : [];
    return list.filter((a) => a && (typeof a === 'string' || a.url));
  };

  // Instant download of formatted receipt evidence document (top voucher details + bottom receipt photo)
  const handleQuickDownloadReceipts = async (e, entry) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const atts = getEntryAttachments(entry);
    if (!atts || atts.length === 0) return;

    try {
      setDownloadingEntryId(entry._id);
      const vLabel = entry.voucherNo ? `VN #${entry.voucherNo}` : 'Receipt';
      const success = await downloadReceiptEvidenceDocument(entry);
      if (success) {
        setFeedback({
          message: `Downloaded official Receipt Evidence Slip for ${vLabel} (voucher details on top + receipt image on bottom).`,
          type: 'success',
        });
      } else {
        setViewingReceiptEntry(entry);
      }
      setTimeout(() => setFeedback({ message: '', type: '' }), 4000);
    } catch (err) {
      console.error('Receipt document download error:', err);
      setFeedback({
        message: 'Direct download failed. Opening receipt viewer with details.',
        type: 'error',
      });
      setViewingReceiptEntry(entry);
    } finally {
      setDownloadingEntryId(null);
    }
  };


  // Instant client-side memoized list for 0ms tab switching & filtering
  const filteredEntries = useMemo(() => {
    let list = pendingEntries;

    // Filter by Entry Type tab
    if (filterType !== 'ALL') {
      list = list.filter((e) => e.entryType === filterType);
    }

    // Filter by Status tab
    if (filterStatus === 'PENDING_VERIFICATION') {
      list = list.filter((e) => e.status === 'PENDING_VERIFICATION' || e.status === 'EDITED');
    } else if (filterStatus !== 'ALL') {
      list = list.filter((e) => e.status === filterStatus);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((e) => {
        const vn = (e.voucherNo || '').toLowerCase();
        const detail = (e.detail || '').toLowerCase();
        const submitter = (e.submittedByName || e.submittedBy?.name || '').toLowerCase();
        const ref = (e.referenceNumber || '').toLowerCase();
        const prop = (e.propertyId?.plazaName || '').toLowerCase();
        return vn.includes(q) || detail.includes(q) || submitter.includes(q) || ref.includes(q) || prop.includes(q);
      });
    }

    return list;
  }, [pendingEntries, filterType, filterStatus, searchQuery]);

  // Edit Modal State
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    detail: '',
    voucherNo: '',
    date: '',
    rentMonth: '',
    editNotes: '',
    attachments: [],
  });
  const [editNewFiles, setEditNewFiles] = useState([]);
  const [editUploading, setEditUploading] = useState(false);
  const editFileInputRef = useRef(null);

  // Rejection Modal State
  const [rejectingEntry, setRejectingEntry] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Direct Entry Mode Switcher for Khurshid
  const [directEntryMode, setDirectEntryMode] = useState(false);
  const [directEntryTab, setDirectEntryTab] = useState('voucher');

  // Load pending list & KPIs
  // Accept explicit filter overrides so the function always uses fresh values
  // (avoids the stale-closure problem where useEffect captures old state)
  const loadData = async (forceShowLoading = false, overrides = {}) => {
    try {
      const currentType   = overrides.filterType   !== undefined ? overrides.filterType   : filterType;
      const currentStatus = overrides.filterStatus !== undefined ? overrides.filterStatus : filterStatus;
      const currentSearch = overrides.searchQuery  !== undefined ? overrides.searchQuery  : searchQuery;

      if (forceShowLoading || verifierDataCache.pendingEntries === null) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      const params = { limit: 200 };
      if (currentType   !== 'ALL') params.entryType = currentType;
      if (currentStatus !== 'ALL') params.status    = currentStatus;
      if (currentSearch.trim())    params.search     = currentSearch.trim();

      // Only fetch heavy master dropdown data (accounts, categories, properties) if not loaded yet
      const needsMaster = accounts.length === 0 || categories.length === 0 || properties.length === 0;

      const promises = [
        verificationAPI.getPending(params),
        verificationAPI.getSummary(),
      ];

      if (needsMaster) {
        promises.push(
          accountsAPI.getActiveSummary().catch(() => ({ accounts: [] })),
          accountsAPI.getCategories().catch(() => ({ categories: [] })),
          accountsAPI.getProperties().catch(() => ({ properties: [] }))
        );
      }

      const results = await Promise.all(promises);

      const listRes = results[0];
      const sumRes  = results[1];
      const newEntries = listRes.data?.entries || listRes.entries || [];
      const newSummary = sumRes.data || sumRes || null;

      setPendingEntries(newEntries);
      setSummary(newSummary);

      let newAccounts   = accounts;
      let newCategories = categories;
      let newProperties = properties;

      if (needsMaster) {
        const accRes  = results[2] || {};
        const catRes  = results[3] || {};
        const propRes = results[4] || {};

        newAccounts   = accRes.accounts   || [];
        newCategories = catRes.categories || [];
        newProperties = propRes.properties || [];

        setAccounts(newAccounts);
        setCategories(newCategories);
        setProperties(newProperties);
      }

      // Save to cache
      verifierDataCache = {
        pendingEntries: newEntries,
        summary: newSummary,
        accounts: newAccounts,
        categories: newCategories,
        properties: newProperties,
      };
    } catch (err) {
      console.error('Failed to load verifier data:', err);
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to fetch verification queue.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Re-fetch whenever type or status filters change, passing the new values
  // explicitly to avoid the stale-closure problem
  useEffect(() => {
    loadData(false, { filterType, filterStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus]);

  // Handle Search Submission
  const handleSearch = (e) => {
    e.preventDefault();
    loadData(true);
  };

  // Verify / Approve Entry (Atomic post to Ledger)
  const handleVerify = async (entry) => {
    if (entry.entryType === 'SALARY') {
      const snap = entry.salaryDetails || entry.entryData?.payrollSnapshot || {};
      const empName = snap.employeeName || entry.submittedByName || 'Employee';
      const gross = snap.grossSalary || entry.amount;
      const loanDed = snap.loanDeduction || entry.entryData?.loanDeduction || 0;
      const confirmMsg = loanDed > 0
        ? `Confirm Salary Payout Verification for ${empName}:\n\n• Gross Salary: Rs. ${formatPKR(gross)}\n• Loan Deduction: − Rs. ${formatPKR(loanDed)} (Will decrease staff loan balance)\n• Net Bank Payout: Rs. ${formatPKR(entry.amount)}\n\nProceed to verify and disburse from ${entry.crAccountId?.name || 'Bank Account'}?`
        : `Confirm Salary Payout Verification for ${empName}:\n\n• Net Bank Payout: Rs. ${formatPKR(entry.amount)}\n\nProceed to verify and disburse from ${entry.crAccountId?.name || 'Bank Account'}?`;
      if (!window.confirm(confirmMsg)) return;
    } else if (!window.confirm(`Are you sure you want to verify and post this ${entry.entryType} of ${formatPKR(entry.amount)} into the official system?`)) {
      return;
    }

    const entryId = entry._id;
    try {
      setSavingEntryId(entryId);
      setFeedback({ message: '', type: '' });
      const res = await verificationAPI.verifyEntry(entryId);
      if (res.success) {
        setFeedback({
          message: `Entry verified successfully! Officially posted to central financial ledger.`,
          type: 'success',
        });
        // Optimistically remove or mark as VERIFIED in local state immediately
        setPendingEntries((prev) =>
          prev.map((e) => e._id === entryId ? { ...e, status: 'VERIFIED' } : e)
        );
        loadData(false, { filterType, filterStatus });
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Verification failed.',
        type: 'error',
      });
    } finally {
      setSavingEntryId(null);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (entry) => {
    setEditingEntry(entry);
    const drAcc =
      entry.drAccountId?._id ||
      entry.drAccountId ||
      entry.receivingAccountId?._id ||
      entry.receivingAccountId ||
      '';
    const crAcc = entry.crAccountId?._id || entry.crAccountId || '';
    const recAcc = entry.receivingAccountId?._id || entry.receivingAccountId || drAcc;

    const isSalary = entry.entryType === 'SALARY';
    const salary = entry.salaryDetails || entry.entryData?.payrollSnapshot || {};
    const gross = Number(salary.grossSalary ?? (isSalary ? entry.amount : 0));
    const loanDed = Number(salary.loanDeduction ?? entry.entryData?.loanDeduction ?? 0);
    const lopDed = Number(salary.lopDeduction || 0);
    const otherDed = Number(salary.otherDeduction || 0);
    const totalDed = loanDed + lopDed + otherDed;
    const netPayable = Number(salary.netPayable ?? Math.max(0, gross - totalDed));

    const existingAtts = getEntryAttachments(entry) || [];
    setEditNewFiles([]);
    setEditUploading(false);

    setEditForm({
      amount: entry.amount || '',
      detail: entry.detail || '',
      voucherNo: entry.voucherNo || '',
      date: entry.date ? new Date(entry.date).toISOString().split('T')[0] : '',
      rentMonth: entry.rentMonth || '',
      expenseClassification: entry.expenseClassification || 'GENERAL_EXPENSE',
      propertyId: entry.propertyId?._id || entry.propertyId || '',
      unitId: entry.unitId || '',
      categoryId: entry.categoryId?._id || entry.categoryId || '',
      crAccountId: crAcc,
      drAccountId: drAcc,
      receivingAccountId: recAcc,
      editNotes: '',
      attachments: existingAtts,
      // Salary-specific fields
      grossSalary: gross,
      loanDeduction: loanDed,
      lopDeduction: lopDed,
      otherDeduction: otherDed,
      netPayable: netPayable,
      employeeName: salary.employeeName || entry.submittedByName || 'Staff Member',
      currentLoanBalance: Number(salary.currentLoanBalance || 0),
      alreadyPaid: Number(salary.alreadyPaid || 0),
    });
  };

  const handleRemoveExistingAttachment = (indexToRemove) => {
    setEditForm((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_, idx) => idx !== indexToRemove),
    }));
  };

  const handleRemoveNewFile = (indexToRemove) => {
    setEditNewFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSalaryFieldChange = (field, value) => {
    setEditForm((prev) => {
      const updated = { ...prev, [field]: value };
      const g = Number(updated.grossSalary || 0);
      const loan = Number(updated.loanDeduction || 0);
      const lop = Number(updated.lopDeduction || 0);
      const other = Number(updated.otherDeduction || 0);
      const totalDed = loan + lop + other;
      const net = Math.max(0, g - totalDed);
      updated.netPayable = net;
      return updated;
    });
  };

  // Save Edits
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEntry) return;

    const entryId = editingEntry._id;
    try {
      setSavingEntryId(entryId);

      let finalAttachments = [...(editForm.attachments || [])];
      if (editNewFiles.length > 0) {
        setEditUploading(true);
        try {
          const uploadRes = await uploadAPI.images(editNewFiles);
          if (uploadRes?.images?.length) {
            finalAttachments = [...finalAttachments, ...uploadRes.images];
          }
        } catch (uploadErr) {
          console.error('Evidence upload error:', uploadErr);
          setFeedback({
            message: 'Failed to upload new evidence images. Please check the files and try again.',
            type: 'error',
          });
          setSavingEntryId(null);
          setEditUploading(false);
          return;
        }
        setEditUploading(false);
      }

      const payload = {
        ...editForm,
        attachments: finalAttachments,
      };

      const res = await verificationAPI.updatePending(entryId, payload);
      if (res.success) {
        setFeedback({
          message: 'Entry details and evidence updated successfully. You can now verify it.',
          type: 'success',
        });
        // Close modal immediately
        setEditingEntry(null);
        setEditNewFiles([]);
        // Optimistically mark entry as edited in local state so the Edit button
        // disappears right away without waiting for the background refetch
        setPendingEntries((prev) =>
          prev.map((e) =>
            e._id === entryId
              ? {
                  ...e,
                  isEdited: true,
                  status: 'EDITED',
                  attachments: finalAttachments,
                  entryData: {
                    ...(e.entryData || {}),
                    attachments: finalAttachments,
                  },
                  amount: Number(editForm.amount) || e.amount,
                  date: editForm.date ? new Date(editForm.date).toISOString() : e.date,
                  detail: editForm.detail ?? e.detail,
                  rentMonth: editForm.rentMonth || e.rentMonth,
                  crAccountId: accounts.find((a) => String(a._id) === String(editForm.crAccountId)) || e.crAccountId,
                  salaryDetails: e.entryType === 'SALARY' ? {
                    ...(e.salaryDetails || {}),
                    grossSalary: Number(editForm.grossSalary) || e.salaryDetails?.grossSalary,
                    loanDeduction: Number(editForm.loanDeduction) ?? e.salaryDetails?.loanDeduction,
                    lopDeduction: Number(editForm.lopDeduction) ?? e.salaryDetails?.lopDeduction,
                    otherDeduction: Number(editForm.otherDeduction) ?? e.salaryDetails?.otherDeduction,
                    totalDeduction: (Number(editForm.loanDeduction) || 0) + (Number(editForm.lopDeduction) || 0) + (Number(editForm.otherDeduction) || 0),
                    netPayable: Number(editForm.netPayable) || e.salaryDetails?.netPayable,
                    thisPayout: Number(editForm.amount) || e.amount,
                    remainingAfterThis: Math.max(0, (Number(editForm.netPayable) || 0) - ((e.salaryDetails?.alreadyPaid || 0) + (Number(editForm.amount) || 0))),
                    isFullySettled: Math.max(0, (Number(editForm.netPayable) || 0) - ((e.salaryDetails?.alreadyPaid || 0) + (Number(editForm.amount) || 0))) <= 0.01,
                  } : e.salaryDetails,
                }
              : e
          )
        );
        // Background refresh to pull server truth (don't await — keep UI fast)
        loadData(false, { filterType, filterStatus });
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to update entry.',
        type: 'error',
      });
    } finally {
      setSavingEntryId(null);
      setEditUploading(false);
    }
  };

  // Open Reject Modal
  const handleOpenReject = (entry) => {
    setRejectingEntry(entry);
    setRejectionReason('');
  };

  // Confirm Rejection
  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectingEntry) return;

    const entryId = rejectingEntry._id;
    try {
      setSavingEntryId(entryId);
      const res = await verificationAPI.rejectEntry(entryId, rejectionReason);
      if (res.success) {
        setFeedback({
          message: 'Entry has been rejected. It will not affect the ledger or accounts.',
          type: 'success',
        });
        setRejectingEntry(null);
        // Optimistically mark as rejected in local state
        setPendingEntries((prev) =>
          prev.map((e) => e._id === entryId ? { ...e, status: 'REJECTED' } : e)
        );
        loadData(false, { filterType, filterStatus });
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to reject entry.',
        type: 'error',
      });
    } finally {
      setSavingEntryId(null);
    }
  };

  // Delete Entry
  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete this draft entry permanently? This action cannot be undone.`)) {
      return;
    }

    try {
      setSavingEntryId(entry._id);
      const res = await verificationAPI.deletePending(entry._id);
      if (res.success) {
        setFeedback({
          message: 'Draft entry deleted permanently.',
          type: 'success',
        });
        // Optimistically remove deleted entry from local state
        setPendingEntries((prev) => prev.filter((e) => e._id !== entry._id));
        loadData(false, { filterType, filterStatus });
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to delete draft entry.',
        type: 'error',
      });
    } finally {
      setSavingEntryId(null);
    }
  };

  // Compute active categories filtered by scope for the edit modal
  const activeScopeCategories = categories.filter((c) => {
    if (c.type !== 'EXPENSE') return false;
    if (editForm.unitId) {
      const uId = c.unitId?._id || c.unitId;
      return c.expenseClassification === 'UNIT_EXPENSE' && (!uId || String(uId) === String(editForm.unitId));
    }
    if (editForm.propertyId) {
      const pId = c.propertyId?._id || c.propertyId;
      return c.expenseClassification === 'PROPERTY_OWN_EXPENSE' && (!pId || String(pId) === String(editForm.propertyId));
    }
    return (!c.propertyId || !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE');
  });

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-xs font-semibold mb-2">
              <ShieldCheck size={14} className="text-indigo-400" />
              <span>Verifier & Operational Oversight</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Verification & Operations Control Center
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Logged in as <span className="text-white font-semibold">{user?.name || 'Khurshid Anwar'}</span>. Review temporary entries submitted by Sarfraz, verify into central ledger, or record direct entries.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setDirectEntryMode(!directEntryMode)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg ${
                directEntryMode
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50'
              }`}
            >
              <PlusCircle size={16} />
              <span>{directEntryMode ? 'Close Direct Entry Mode' : 'Direct Data Entry Mode (Sarfraz View)'}</span>
            </button>

            <button
              onClick={() => loadData(true)}
              disabled={loading || isRefreshing}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-2 text-xs font-bold"
              title="Refresh Queue Data"
            >
              <RefreshCw size={16} className={loading || isRefreshing ? 'animate-spin text-indigo-400' : ''} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Queue'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback.message && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/50 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback({ message: '', type: '' })}
            className="text-slate-400 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Direct Data Entry Mode */}
      {directEntryMode && (
        <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" />
                Direct Operational Data Entry Mode
              </h2>
              <p className="text-xs text-slate-400">
                You are entering transactions with Verifier Authority. Entries recorded here post directly to the official ledger.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDirectEntryTab('voucher')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  directEntryTab === 'voucher'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Expense Voucher
              </button>
              <button
                onClick={() => setDirectEntryTab('rent')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  directEntryTab === 'rent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Rent Received
              </button>
            </div>
          </div>

          {directEntryTab === 'voucher' ? (
            <VoucherEntryForm
              accounts={accounts}
              categories={categories}
              properties={properties}
              canManageMasterData={true}
              onMasterDataChanged={loadData}
              onVoucherCreated={async () => {
                setFeedback({ message: 'Direct voucher recorded and verified into ledger!', type: 'success' });
                await loadData();
              }}
            />
          ) : (
            <RentCollectionModal
              properties={properties}
              accounts={accounts}
              onRentCollected={async () => {
                setFeedback({ message: 'Direct rent payment recorded and verified into ledger!', type: 'success' });
                await loadData();
              }}
            />
          )}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
            <span className="font-semibold">Pending Total</span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-300">
            {summary?.totalPendingCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Awaiting signoff</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
            <span className="font-semibold">Pending Rent</span>
            <Building2 size={16} className="text-blue-400" />
          </div>
          <div className="text-2xl font-black font-mono text-blue-300">
            {summary?.pendingRentCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Rent collections</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
            <span className="font-semibold">Pending Expenses</span>
            <DollarSign size={16} className="text-rose-400" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-300">
            {summary?.pendingExpenseCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Expense vouchers</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
            <span className="font-semibold">Pending Transfers</span>
            <ArrowLeftRight size={16} className="text-purple-400" />
          </div>
          <div className="text-2xl font-black font-mono text-purple-300">
            {summary?.pendingTransferCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Internal transfers</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 col-span-2 sm:col-span-1 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
            <span className="font-semibold">Verified (7 Days)</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            {summary?.recentlyVerifiedCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Approved & posted</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Filter Type Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1.5 w-full sm:w-auto">
            {[
              { id: 'ALL', label: 'All Types' },
              { id: 'RENT', label: 'Rent Receipts' },
              { id: 'EXPENSE', label: 'Expense Vouchers' },
              { id: 'SALARY', label: '💼 Staff Salaries' },
              { id: 'TRANSFER', label: 'Internal Transfers' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterType(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex-1 sm:flex-initial text-center ${
                  filterType === t.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filter Status Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1.5 w-full sm:w-auto">
            {[
              { id: 'PENDING_VERIFICATION', label: 'Pending Review' },
              { id: 'EDITED', label: 'Edited' },
              { id: 'VERIFIED', label: 'Verified' },
              { id: 'REJECTED', label: 'Rejected' },
              { id: 'ALL', label: 'All Statuses' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setFilterStatus(s.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex-1 sm:flex-initial text-center ${
                  filterStatus === s.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full lg:w-80">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search narration, voucher #, submitter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition whitespace-nowrap"
          >
            Find
          </button>
        </form>
      </div>

      {/* Main Verification Queue */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h3 className="font-bold text-white text-sm">Temporary Entries Review Queue</h3>
            <span className="text-xs bg-slate-800 text-indigo-300 border border-slate-700 font-bold px-2.5 py-0.5 rounded-full font-mono">
              {filteredEntries.length} items
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Click <strong className="text-emerald-400">Verify / OK</strong> to commit to Central Ledger
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            <RefreshCw size={24} className="mx-auto animate-spin mb-2 text-indigo-400" />
            Loading verification queue...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500/50" />
            No pending entries found matching your selected filters. All clear!
          </div>
        ) : (
          <>
            {/* MOBILE / SMALL SCREEN CARD VIEW (Distinct Cards with Ample Spacing) */}
            <div className="block md:hidden p-3.5 sm:p-4 space-y-4">
              {filteredEntries.map((entry) => {
                const isPending = entry.status === 'PENDING_VERIFICATION' || entry.status === 'EDITED';
                const isVerified = entry.status === 'VERIFIED';
                const isRejected = entry.status === 'REJECTED';
                const entryAttachments = getEntryAttachments(entry);

                return (
                  <div
                    key={entry._id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3.5 hover:border-slate-700 transition shadow-sm"
                  >
                    {/* Header Row: Type, Status, Voucher/Date */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.entryType === 'RENT' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700/60">
                              <Building2 size={12} /> Rent Receipt
                            </span>
                          ) : entry.entryType === 'TRANSFER' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-purple-950/80 text-purple-300 border border-purple-700/60">
                              <ArrowLeftRight size={12} /> Transfer
                            </span>
                          ) : entry.entryType === 'SALARY' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                              <DollarSign size={12} /> Salary Payout
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-rose-950/80 text-rose-300 border border-rose-700/60">
                              <DollarSign size={12} /> Expense
                            </span>
                          )}

                          {entry.voucherNo && (
                            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                              VN: #{entry.voucherNo}
                            </span>
                          )}

                          {entry.rentMonth && (
                            <span className="text-[11px] font-mono text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50">
                              Month: {entry.rentMonth}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 font-medium">
                          Date: <span className="text-slate-200 font-semibold">{entry.date ? new Date(entry.date).toLocaleDateString('en-PK') : '—'}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60 whitespace-nowrap">
                            <Clock size={11} /> Pending Review
                          </span>
                        ) : isVerified ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 whitespace-nowrap">
                            <CheckCircle2 size={11} /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-700/60 whitespace-nowrap">
                            <XCircle size={11} /> Rejected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount Highlight */}
                    <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800/80 rounded-lg p-3">
                      <span className="text-xs font-semibold text-slate-400">Total Transaction Amount</span>
                      <span className="text-lg font-black font-mono text-emerald-400">
                        {formatPKR(entry.amount)}
                      </span>
                    </div>

                    {/* Details / Narration */}
                    <div className="space-y-1.5 text-xs">
                      <div className="font-semibold text-slate-100 leading-snug">
                        {entry.detail || 'No description provided'}
                      </div>
                      {entry.categoryId?.name && (
                        <div className="text-[11px] text-amber-300 font-mono">
                          Head / Category: <span className="font-semibold text-amber-200">{entry.categoryId.name}</span>
                        </div>
                      )}
                      {entry.propertyId?.plazaName && (
                        <div className="text-[11px] text-blue-300">
                          Property: <span className="font-semibold text-white">{entry.propertyId.plazaName}</span>
                          {entry.tenantId?.fullName && (
                            <span className="text-slate-400 ml-2">(Tenant: {entry.tenantId.fullName})</span>
                          )}
                        </div>
                      )}
                      {entry.entryType === 'SALARY' && <SalaryBreakdown entry={entry} />}
                    </div>

                    {/* Attached Evidence (Uploaded by Sarfraz / Admin) */}
                    {entryAttachments.length === 0 && (
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-950/20 border border-amber-800/30 text-[10px] text-amber-400/80 font-medium mt-1">
                        <ImageIcon size={11} className="shrink-0 text-amber-400/60" />
                        <span>
                          {entry.entryType === 'SALARY'
                            ? 'No salary payment evidence attached — Admin can add via Edit'
                            : entry.entryType === 'TRANSFER'
                            ? 'No transfer evidence attached — Admin can add via Edit'
                            : 'No receipt evidence attached — Admin can add via Edit'}
                        </span>
                      </div>
                    )}
                    {entryAttachments.length > 0 && (
                      <div className="p-3 bg-slate-900/90 rounded-xl border border-blue-900/50 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="p-1.5 rounded-lg bg-blue-950 border border-blue-800 text-blue-400 shrink-0">
                              <ImageIcon size={14} />
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-blue-200 truncate">
                                {entry.entryType === 'SALARY'
                                  ? `${entryAttachments.length} Payment Evidence ${entryAttachments.length === 1 ? 'File' : 'Files'}`
                                  : entry.entryType === 'TRANSFER'
                                  ? `${entryAttachments.length} Transfer Evidence ${entryAttachments.length === 1 ? 'File' : 'Files'}`
                                  : `${entryAttachments.length} Purchase / Receipt ${entryAttachments.length === 1 ? 'Image' : 'Images'}`}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {(typeof entryAttachments[0] !== 'string' && entryAttachments[0].originalName) ||
                                  (entry.entryType === 'SALARY'
                                    ? 'Salary payment proof'
                                    : entry.entryType === 'TRANSFER'
                                    ? 'Transfer supporting document'
                                    : 'Attached receipt voucher')}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setViewingReceiptEntry(entry)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 text-xs font-bold border border-slate-700 flex items-center gap-1 transition"
                              title="Preview receipt in viewer"
                            >
                              <Eye size={12} />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleQuickDownloadReceipts(e, entry)}
                              disabled={downloadingEntryId === entry._id}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow transition disabled:opacity-50"
                              title="Download official receipt evidence document (voucher details on top + receipt image on bottom)"
                            >
                              <Download size={12} className={downloadingEntryId === entry._id ? 'animate-bounce' : ''} />
                              <span>{downloadingEntryId === entry._id ? 'Saving...' : 'Download'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Thumbnail Row */}
                        <div className="flex items-center gap-2 overflow-x-auto pt-1">
                          {entryAttachments.map((att, idx) => (
                            <img
                              key={idx}
                              src={typeof att === 'string' ? att : att.url}
                              alt={`Receipt ${idx + 1}`}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-700 hover:border-blue-500 cursor-pointer transition shrink-0"
                              onClick={() => setViewingReceiptEntry(entry)}
                              title="Click to view full receipt"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Accounts Involved */}
                    <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/60 text-xs space-y-1">
                      {entry.entryType === 'RENT' ? (
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400 font-bold">Receiving Account (Dr):</span>
                          <span className="text-slate-200 font-semibold">{entry.receivingAccountId?.name || 'Bank / Cash'}</span>
                        </div>
                      ) : entry.entryType === 'TRANSFER' ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-emerald-400 font-bold">To Account (Dr):</span>
                            <span className="text-slate-200 font-semibold">{entry.drAccountId?.name || entry.receivingAccountId?.name || '—'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-rose-400 font-bold">From Account (Cr):</span>
                            <span className="text-slate-200 font-semibold">{entry.crAccountId?.name || '—'}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-emerald-400 font-bold">Debit (Expense):</span>
                            <span className="text-slate-200 font-semibold">{entry.drAccountId?.name || 'Expense Account'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-rose-400 font-bold">Credit (Paid From):</span>
                            <span className="text-slate-200 font-semibold">{entry.crAccountId?.name || 'Bank / Cash'}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Submitter & Time */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>Submitted by: <strong className="text-slate-300">{entry.submittedByName || entry.submittedBy?.name || 'Sarfraz'}</strong></span>
                      <span>{new Date(entry.submittedAt || entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {/* Actions Row */}
                    {isPending && (
                      <div className="pt-2 border-t border-slate-800 flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleVerify(entry)}
                          disabled={savingEntryId === entry._id}
                          className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition disabled:opacity-50"
                        >
                          <Check size={15} />
                          <span>Verify / OK</span>
                        </button>

                        <button
                          onClick={() => handleOpenEdit(entry)}
                          disabled={savingEntryId === entry._id}
                          className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition disabled:opacity-50 flex items-center gap-1 text-xs font-bold"
                          title="Edit Entry"
                        >
                          <Edit3 size={15} />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => handleOpenReject(entry)}
                          disabled={savingEntryId === entry._id}
                          className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700 transition disabled:opacity-50 flex items-center gap-1 text-xs font-bold"
                          title="Reject Entry"
                        >
                          <XCircle size={15} />
                          <span>Reject</span>
                        </button>

                        <button
                          onClick={() => handleDelete(entry)}
                          disabled={savingEntryId === entry._id}
                          className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition disabled:opacity-50"
                          title="Delete Draft"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE VIEW (Horizontally Scrollable & Generously Spaced) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[1050px]">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3.5 w-32">Date / Month</th>
                    <th className="py-3 px-3 w-28">Type</th>
                    <th className="py-3 px-3 w-28">Submitter</th>
                    <th className="py-3 px-3.5 w-72 min-w-[220px] max-w-[320px]">Narration / Details</th>
                    <th className="py-3 px-3 w-40">Property / Unit</th>
                    <th className="py-3 px-3 w-56">Accounts Involved</th>
                    <th className="py-3 px-3.5 text-right w-32">Amount (PKR)</th>
                    <th className="py-3 px-3 text-center w-32">Status</th>
                    <th className="py-3 px-3 text-center w-36">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredEntries.map((entry) => {
                    const isPending = entry.status === 'PENDING_VERIFICATION' || entry.status === 'EDITED';
                    const isVerified = entry.status === 'VERIFIED';
                    const isRejected = entry.status === 'REJECTED';
                    const entryAttachments = getEntryAttachments(entry);

                    return (
                      <tr key={entry._id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3.5 whitespace-nowrap align-middle">
                          <div className="font-semibold text-white">
                            {entry.date ? new Date(entry.date).toLocaleDateString('en-PK') : '—'}
                          </div>
                          {entry.rentMonth && (
                            <div className="text-[10px] font-mono text-indigo-400 font-semibold">
                              Month: {entry.rentMonth}
                            </div>
                          )}
                          {entry.voucherNo && (
                            <div className="text-[10px] text-amber-400 font-mono font-bold">
                              VN: #{entry.voucherNo}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                          {entry.entryType === 'RENT' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/70 text-blue-300 border border-blue-700/50">
                              <Building2 size={11} /> Rent
                            </span>
                          ) : entry.entryType === 'TRANSFER' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/70 text-purple-300 border border-purple-700/50">
                              <ArrowLeftRight size={11} /> Transfer
                            </span>
                          ) : entry.entryType === 'SALARY' ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-700/50">
                                💼 Salary
                              </span>
                              <span className="text-[9px] font-mono font-semibold text-emerald-400 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
                                Staff Payroll
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/70 text-rose-300 border border-rose-700/50">
                                <DollarSign size={11} /> Expense
                              </span>
                              <span className="text-[9px] font-mono font-semibold text-slate-400 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
                                {entry.expenseClassification === 'PROPERTY_OWN_EXPENSE'
                                  ? 'Property Own'
                                  : entry.expenseClassification === 'UNIT_EXPENSE'
                                  ? 'Unit Expense'
                                  : 'General'}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                          <div className="font-semibold text-slate-200">
                            {entry.submittedByName || entry.submittedBy?.name || 'Sarfraz'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(entry.submittedAt || entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        <td className="py-2.5 px-3.5 max-w-[280px] lg:max-w-[340px] align-middle">
                          <div
                            className="text-slate-200 font-medium text-xs leading-snug"
                            title={entry.detail}
                          >
                            {entry.detail || '—'}
                          </div>
                          {entry.categoryId?.name && (
                            <div className="text-[10px] text-amber-400 font-mono truncate mt-0.5" title={entry.categoryId.name}>
                              Head: {entry.categoryId.name}
                            </div>
                          )}
                          {entry.entryType === 'SALARY' && <SalaryBreakdown entry={entry} />}

                          {/* Attached Evidence (Sarfraz / Admin) */}
                          {entryAttachments.length === 0 && (
                            <div className="mt-1 flex items-center gap-1 text-[9px] text-amber-400/80 font-medium">
                              <ImageIcon size={9} className="text-amber-400/60" />
                              <span>No evidence — can attach via Edit</span>
                            </div>
                          )}
                          {entryAttachments.length > 0 && (
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setViewingReceiptEntry(entry)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/60 text-[10px] font-bold transition cursor-pointer"
                                title={
                                  entry.entryType === 'SALARY'
                                    ? 'Click to view salary payment evidence'
                                    : entry.entryType === 'TRANSFER'
                                    ? 'Click to view transfer evidence'
                                    : 'Click to view attached receipt evidence image(s)'
                                }
                              >
                                <Paperclip size={10} className="text-blue-400" />
                                <span>
                                  {entryAttachments.length}{' '}
                                  {entry.entryType === 'SALARY' || entry.entryType === 'TRANSFER'
                                    ? 'Evidence'
                                    : entryAttachments.length === 1
                                    ? 'Receipt'
                                    : 'Receipts'}
                                </span>
                                <Eye size={10} className="opacity-75" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleQuickDownloadReceipts(e, entry)}
                                disabled={downloadingEntryId === entry._id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                                title={
                                  entry.entryType === 'SALARY'
                                    ? 'Download payment evidence document'
                                    : entry.entryType === 'TRANSFER'
                                    ? 'Download transfer evidence document'
                                    : 'Download official receipt evidence document'
                                }
                              >
                                <Download size={10} className={downloadingEntryId === entry._id ? 'animate-bounce text-emerald-400' : 'text-emerald-400'} />
                                <span>{downloadingEntryId === entry._id ? 'Saving...' : 'Download'}</span>
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                          <div className="text-white font-semibold truncate max-w-[160px]" title={entry.propertyId?.plazaName}>
                            {entry.propertyId?.plazaName || '—'}
                          </div>
                          {entry.tenantId?.fullName && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[160px]" title={entry.tenantId.fullName}>
                              Tenant: {entry.tenantId.fullName}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap text-xs align-middle">
                          {entry.entryType === 'RENT' ? (
                            <div>
                              <span className="text-emerald-400 font-bold">Dr: </span>
                              <span className="text-slate-200 font-medium">
                                {entry.receivingAccountId?.name || 'Receiving Account'}
                              </span>
                            </div>
                          ) : entry.entryType === 'TRANSFER' ? (
                            <div className="space-y-0.5">
                              <div>
                                <span className="text-emerald-400 font-bold">Dr (Receiving): </span>
                                <span className="text-slate-200 font-medium">{entry.drAccountId?.name || entry.receivingAccountId?.name || 'Debit Account'}</span>
                              </div>
                              <div>
                                <span className="text-rose-400 font-bold">Cr (Paying): </span>
                                <span className="text-slate-200 font-medium">{entry.crAccountId?.name || 'Credit Account'}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div>
                                <span className="text-emerald-400 font-bold">Dr: </span>
                                <span className="text-slate-200 font-medium">{entry.drAccountId?.name || 'Debit Account'}</span>
                              </div>
                              <div>
                                <span className="text-rose-400 font-bold">Cr: </span>
                                <span className="text-slate-200 font-medium">{entry.crAccountId?.name || 'Credit Account'}</span>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap font-mono font-black text-emerald-400 text-sm align-middle">
                          {formatPKR(entry.amount)}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap align-middle">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700/60">
                              <Clock size={10} /> Pending Review
                            </span>
                          ) : isVerified ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                              <CheckCircle2 size={10} /> Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-700/60" title={entry.rejectionReason}>
                              <XCircle size={10} /> Rejected
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap align-middle">
                          {isPending ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleVerify(entry)}
                                disabled={savingEntryId === entry._id}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow transition disabled:opacity-50"
                                title="Verify & Post to Ledger"
                              >
                                <Check size={13} />
                                <span>Verify / OK</span>
                              </button>

                              <button
                                onClick={() => handleOpenEdit(entry)}
                                disabled={savingEntryId === entry._id}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition disabled:opacity-50"
                                title="Edit Entry"
                              >
                                <Edit3 size={13} />
                              </button>

                              <button
                                onClick={() => handleOpenReject(entry)}
                                disabled={savingEntryId === entry._id}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700 transition disabled:opacity-50"
                                title="Reject Entry"
                              >
                                <XCircle size={13} />
                              </button>

                              <button
                                onClick={() => handleDelete(entry)}
                                disabled={savingEntryId === entry._id}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition disabled:opacity-50"
                                title="Delete Draft"
                              >
                                <Trash2 size={13} />
                              </button>

                              {entryAttachments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setViewingReceiptEntry(entry)}
                                  className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/60 transition"
                                  title="View & Download Attached Receipt Image"
                                >
                                  <ImageIcon size={13} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500">
                              {isVerified ? (
                                <div>
                                  <div>Verified by {entry.verifiedByName || 'Khurshid'}</div>
                                  {entryAttachments.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingReceiptEntry(entry)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/60 text-[10px] font-bold transition"
                                      title="View & Download Attached Receipt"
                                    >
                                      <ImageIcon size={11} />
                                      <span>Receipt ({entryAttachments.length})</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span>Rejected</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 size={16} className="text-indigo-400" />
                Edit Temporary Entry Before Verification
              </h3>
              <button
                onClick={() => setEditingEntry(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              {editingEntry?.entryType === 'SALARY' ? (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Payout Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Amount (PKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Date</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>
              )}

              {(editingEntry?.entryType === 'EXPENSE' || editingEntry?.entryType === 'RENT' || editingEntry?.entryType === 'SALARY') && (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Narration / Description
                  </label>
                  <textarea
                    value={editForm.detail}
                    onChange={(e) => setEditForm({ ...editForm, detail: e.target.value })}
                    rows={2}
                    maxLength={1000}
                    placeholder={
                      editingEntry.entryType === 'RENT'
                        ? 'Enter the rent receipt narration or description'
                        : editingEntry.entryType === 'SALARY'
                        ? 'Enter salary payout narration or notes'
                        : 'Enter the expense narration or description'
                    }
                    className="w-full resize-y bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white leading-relaxed"
                  />
                  <div className="mt-1 text-right text-[10px] text-slate-500">
                    {editForm.detail.length}/1000
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Voucher # (VN) <span className="text-[10px] text-amber-400 font-normal">(Locked / Auto-assigned)</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.voucherNo}
                    readOnly
                    disabled
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-slate-400 font-mono font-bold cursor-not-allowed select-none opacity-80"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    {editingEntry?.entryType === 'SALARY' ? 'Salary Month (YYYY-MM)' : 'Rent Month (YYYY-MM)'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-08"
                    value={editForm.rentMonth}
                    onChange={(e) => setEditForm({ ...editForm, rentMonth: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {editingEntry?.entryType === 'EXPENSE' && (
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 size={14} className="text-amber-400" />
                      Property & Unit Allocation (Derives Scope)
                    </span>
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded">
                      Scope: {editForm.unitId ? 'UNIT EXPENSE' : editForm.propertyId ? 'PROPERTY OWN' : 'GENERAL EXPENSE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 font-semibold mb-1">Select Property (Optional)</label>
                      <select
                        value={editForm.propertyId}
                        onChange={(e) => {
                          const pId = e.target.value;
                          const classification = pId ? (editForm.unitId ? 'UNIT_EXPENSE' : 'PROPERTY_OWN_EXPENSE') : 'GENERAL_EXPENSE';
                          const newUnitId = pId ? editForm.unitId : '';
                          const nextCats = categories.filter((c) => {
                            if (c.type !== 'EXPENSE') return false;
                            if (newUnitId && pId) {
                              const uId = c.unitId?._id || c.unitId;
                              return c.expenseClassification === 'UNIT_EXPENSE' && (!uId || String(uId) === String(newUnitId));
                            }
                            if (pId) {
                              const propId = c.propertyId?._id || c.propertyId;
                              return c.expenseClassification === 'PROPERTY_OWN_EXPENSE' && (!propId || String(propId) === String(pId));
                            }
                            return (!c.propertyId || !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE');
                          });
                          const isCurrentValid = nextCats.some((c) => String(c._id) === String(editForm.categoryId));
                          const newCatId = isCurrentValid ? editForm.categoryId : (nextCats[0]?._id || '');

                          setEditForm({
                            ...editForm,
                            propertyId: pId,
                            unitId: newUnitId,
                            expenseClassification: classification,
                            categoryId: newCatId,
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                      >
                        <option value="">-- None (General Expense) --</option>
                        {properties.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.plazaName || p.propertyName || p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {editForm.propertyId && (
                      <div>
                        <label className="block text-[11px] text-slate-400 font-semibold mb-1">Select Unit (Optional)</label>
                        <select
                          value={editForm.unitId}
                          onChange={(e) => {
                            const uId = e.target.value;
                            const classification = uId ? 'UNIT_EXPENSE' : 'PROPERTY_OWN_EXPENSE';
                            const nextCats = categories.filter((c) => {
                              if (c.type !== 'EXPENSE') return false;
                              if (uId) {
                                const unitIdVal = c.unitId?._id || c.unitId;
                                return c.expenseClassification === 'UNIT_EXPENSE' && (!unitIdVal || String(unitIdVal) === String(uId));
                              }
                              if (editForm.propertyId) {
                                const propId = c.propertyId?._id || c.propertyId;
                                return c.expenseClassification === 'PROPERTY_OWN_EXPENSE' && (!propId || String(propId) === String(editForm.propertyId));
                              }
                              return (!c.propertyId || !c.expenseClassification || c.expenseClassification === 'GENERAL_EXPENSE');
                            });
                            const isCurrentValid = nextCats.some((c) => String(c._id) === String(editForm.categoryId));
                            const newCatId = isCurrentValid ? editForm.categoryId : (nextCats[0]?._id || '');

                            setEditForm({
                              ...editForm,
                              unitId: uId,
                              expenseClassification: classification,
                              categoryId: newCatId,
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                        >
                          <option value="">-- None (Property Own Expense) --</option>
                          {(properties.find((p) => p._id === editForm.propertyId)?.units || []).map((u) => (
                            <option key={u._id || u.unitName || u} value={u._id || u.unitName || u}>
                              {u.unitName || u.unitNumber || u.name || u} {u.tenantName ? `(${u.tenantName})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {editingEntry?.entryType === 'SALARY' ? (
                <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-1">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      💼 Edit Salary Breakdown — <strong className="text-indigo-400">{editForm.employeeName}</strong>
                    </span>
                    {editForm.currentLoanBalance > 0 && (
                      <span className="text-[10px] text-orange-400 font-mono bg-orange-950/60 border border-orange-800/60 px-2 py-0.5 rounded">
                        Active Loan Bal: {formatPKR(editForm.currentLoanBalance)}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-400 font-semibold mb-1">Gross Salary</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.grossSalary}
                        onChange={(e) => handleSalaryFieldChange('grossSalary', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-orange-400 font-semibold mb-1">Loan Deduction</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.loanDeduction}
                        onChange={(e) => handleSalaryFieldChange('loanDeduction', e.target.value)}
                        className="w-full bg-slate-900 border border-orange-800/60 rounded-lg px-2.5 py-1.5 text-orange-300 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-rose-400 font-semibold mb-1">Absent / LOP Ded</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.lopDeduction}
                        onChange={(e) => handleSalaryFieldChange('lopDeduction', e.target.value)}
                        className="w-full bg-slate-900 border border-rose-800/60 rounded-lg px-2.5 py-1.5 text-rose-300 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-rose-400 font-semibold mb-1">Other Ded</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.otherDeduction}
                        onChange={(e) => handleSalaryFieldChange('otherDeduction', e.target.value)}
                        className="w-full bg-slate-900 border border-rose-800/60 rounded-lg px-2.5 py-1.5 text-rose-300 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/70">
                    <div>
                      <label className="block text-[11px] text-emerald-400 font-semibold mb-1">
                        Net Payable (Gross − Ded)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.netPayable}
                        onChange={(e) => setEditForm({ ...editForm, netPayable: e.target.value })}
                        className="w-full bg-slate-900 border border-emerald-700/60 rounded-lg px-2.5 py-1.5 text-emerald-300 font-mono font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-blue-400 font-semibold mb-1">
                        This Payout Amount (Installment)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        required
                        className="w-full bg-slate-900 border border-blue-700/60 rounded-lg px-2.5 py-1.5 text-blue-200 font-mono font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                      Paid From (Cr. Bank / Cash Account)
                    </label>
                    <select
                      value={editForm.crAccountId}
                      onChange={(e) => setEditForm({ ...editForm, crAccountId: e.target.value })}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium text-xs"
                    >
                      <option value="">-- Select Disbursing Bank / Cash Account --</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} ({a.type}) — Bal: {formatPKR(a.currentBalance || 0)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : editingEntry?.entryType === 'EXPENSE' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">
                      Expense Head / Category
                      <span className="text-[10px] font-mono text-amber-400 ml-1">
                        ({activeScopeCategories.length} available)
                      </span>
                    </label>
                    <select
                      value={editForm.categoryId}
                      onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium"
                    >
                      <option value="">-- Select Scoped Category --</option>
                      {activeScopeCategories.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Paid From (Cr. Bank / Cash)</label>
                    <select
                      value={editForm.crAccountId}
                      onChange={(e) => setEditForm({ ...editForm, crAccountId: e.target.value })}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium"
                    >
                      <option value="">-- Select Disbursing Account --</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : editingEntry?.entryType === 'TRANSFER' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">From Account (Cr. Disbursing)</label>
                    <select
                      value={editForm.crAccountId}
                      onChange={(e) => setEditForm({ ...editForm, crAccountId: e.target.value })}
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium"
                    >
                      <option value="">-- Select Source / Disbursing Account --</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">To Account (Dr. Receiving)</label>
                    <select
                      value={editForm.drAccountId || editForm.receivingAccountId}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          drAccountId: e.target.value,
                          receivingAccountId: e.target.value,
                        })
                      }
                      required
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium"
                    >
                      <option value="">-- Select Destination / Receiving Account --</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Receiving Bank / Cash Account (Dr.)</label>
                  <select
                    value={editForm.receivingAccountId}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        receivingAccountId: e.target.value,
                        drAccountId: e.target.value,
                      })
                    }
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium"
                  >
                    <option value="">-- Select Receiving Account --</option>
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Evidence & Supporting Documents Section (Attach, Change, or Delete) */}
              <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ImagePlus size={15} className="text-blue-400" />
                    <span>
                      {editingEntry?.entryType === 'SALARY'
                        ? 'Salary Payment Evidence'
                        : editingEntry?.entryType === 'TRANSFER'
                        ? 'Transfer Evidence & Bank Slips'
                        : 'Receipt / Payment Evidence'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {(editForm.attachments?.length || 0) + editNewFiles.length} total
                    </span>
                  </div>

                  {/* Attach / Upload Button */}
                  <div>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={savingEntryId === editingEntry?._id || editUploading}
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
                      disabled={savingEntryId === editingEntry?._id || editUploading}
                      onClick={() => editFileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow disabled:opacity-50"
                    >
                      <Upload size={12} />
                      <span>Attach / Upload Evidence</span>
                    </button>
                  </div>
                </div>

                {/* Existing Attachments List */}
                {editForm.attachments && editForm.attachments.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                      <span>Current Attached Files ({editForm.attachments.length}):</span>
                      <span className="text-[10px] text-slate-500">Click image to view • Click × to remove</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
                      {editForm.attachments.map((att, idx) => {
                        const imgUrl = typeof att === 'string' ? att : att.url;
                        const origName = (typeof att !== 'string' && att.originalName) || `Evidence #${idx + 1}`;
                        return (
                          <div key={idx} className="relative group shrink-0">
                            <img
                              src={imgUrl}
                              alt={origName}
                              className="w-16 h-16 rounded-lg object-cover border border-slate-700 cursor-pointer hover:border-blue-500 transition"
                              onClick={() => setViewingReceiptEntry({ attachments: [att], voucherNo: editForm.voucherNo })}
                              title={`Click to view: ${origName}`}
                            />
                            {/* Delete / Remove button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveExistingAttachment(idx)}
                              className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full p-1 shadow-lg transition opacity-80 group-hover:opacity-100"
                              title="Remove this attachment"
                            >
                              <X size={11} />
                            </button>
                            {/* Download button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadReceiptImage(imgUrl, origName);
                              }}
                              className="absolute bottom-1 right-1 p-1 rounded bg-black/80 hover:bg-emerald-600 text-white transition shadow"
                              title="Download this image"
                            >
                              <Download size={10} />
                            </button>
                            <div className="text-[9px] text-slate-400 truncate max-w-[64px] mt-0.5 font-mono" title={origName}>
                              {origName}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Newly Selected Files (Staged for upload on save) */}
                {editNewFiles.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Sparkles size={12} />
                        New Files to Add ({editNewFiles.length}):
                      </span>
                      <span className="text-[10px] text-slate-400">Will be uploaded and attached upon clicking Save</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
                      {editNewFiles.map((file, idx) => {
                        const previewUrl = URL.createObjectURL(file);
                        return (
                          <div key={`${file.name}-${idx}`} className="relative group shrink-0">
                            <img
                              src={previewUrl}
                              alt={file.name}
                              className="w-16 h-16 rounded-lg object-cover border-2 border-emerald-500/70"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveNewFile(idx)}
                              className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full p-1 shadow-lg transition"
                              title="Unselect this file"
                            >
                              <X size={11} />
                            </button>
                            <div className="text-[9px] text-emerald-300 truncate max-w-[64px] mt-0.5 font-mono" title={file.name}>
                              {file.name}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty State when no attachments exist */}
                {(!editForm.attachments || editForm.attachments.length === 0) && editNewFiles.length === 0 && (
                  <div
                    onClick={() => editFileInputRef.current?.click()}
                    className="border border-dashed border-slate-700 hover:border-blue-500 bg-slate-900/50 hover:bg-slate-900 rounded-xl p-3.5 text-center cursor-pointer transition space-y-1"
                  >
                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs font-semibold">
                      <Upload size={14} className="text-blue-400" />
                      <span>No evidence currently attached. Click here to attach proof of payment / receipt.</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Supports JPG, PNG, WEBP, GIF (bank transfer screenshots, deposit slips, payment vouchers)
                    </p>
                  </div>
                )}

                {editUploading && (
                  <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold py-1">
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Uploading new evidence images to secure storage...</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Edit Notes / Reason for Correction</label>
                <input
                  type="text"
                  placeholder="e.g. Corrected typo in amount"
                  value={editForm.editNotes}
                  onChange={(e) => setEditForm({ ...editForm, editNotes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEntryId === editingEntry?._id}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Check size={14} />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingEntry && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <XCircle size={16} className="text-rose-400" />
                Reject Temporary Entry
              </h3>
              <button
                onClick={() => setRejectingEntry(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to reject this entry for <strong className="text-white">{formatPKR(rejectingEntry.amount)}</strong>? It will remain marked as rejected and will NOT post to the ledger.
            </p>

            <form onSubmit={handleConfirmReject} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Rejection Reason</label>
                <textarea
                  rows="3"
                  placeholder="e.g. Duplicate voucher, incorrect bank selected, invalid receipt"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingEntry(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEntryId === rejectingEntry?._id}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1.5 disabled:opacity-60"
                >
                  <XCircle size={14} />
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attached Purchase / Receipt Evidence Viewer & Downloader Modal */}
      {viewingReceiptEntry && (
        <ReceiptViewerModal
          entry={viewingReceiptEntry}
          onClose={() => setViewingReceiptEntry(null)}
        />
      )}
    </div>
  );
};

export default VerifierDashboard;
