import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { verificationAPI, accountsAPI, propertiesAPI } from '../services/api.js';
import { formatPKR } from '../utils/formatters.js';
import { VoucherEntryForm } from '../components/VoucherEntryForm.jsx';
import { RentCollectionModal } from '../components/RentCollectionModal.jsx';

// Persistent in-memory cache for instant tab switching without blocking loading screens
let verifierDataCache = {
  pendingEntries: null,
  summary: null,
  accounts: [],
  categories: [],
  properties: [],
};

export const VerifierDashboard = ({ user, onOpenMasterAccounts, onOpenProperties }) => {
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
  });

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
    if (!window.confirm(`Are you sure you want to verify and post this ${entry.entryType} of ${formatPKR(entry.amount)} into the official system?`)) {
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
    });
  };

  // Save Edits
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEntry) return;

    const entryId = editingEntry._id;
    try {
      setSavingEntryId(entryId);
      const res = await verificationAPI.updatePending(entryId, editForm);
      if (res.success) {
        setFeedback({
          message: 'Entry details corrected successfully. You can now verify it.',
          type: 'success',
        });
        // Close modal immediately
        setEditingEntry(null);
        // Optimistically mark entry as edited in local state so the Edit button
        // disappears right away without waiting for the background refetch
        setPendingEntries((prev) =>
          prev.map((e) =>
            e._id === entryId
              ? {
                  ...e,
                  isEdited: true,
                  status: 'EDITED',
                  amount: Number(editForm.amount) || e.amount,
                  date: editForm.date ? new Date(editForm.date).toISOString() : e.date,
                  detail: editForm.detail ?? e.detail,
                  rentMonth: editForm.rentMonth || e.rentMonth,
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pending Total</span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="text-xl font-black font-mono text-amber-300">
            {summary?.totalPendingCount ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Awaiting signoff</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pending Rent</span>
            <Building2 size={16} className="text-blue-400" />
          </div>
          <div className="text-xl font-black font-mono text-blue-300">
            {summary?.pendingRentCount ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Rent collections</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pending Expenses</span>
            <DollarSign size={16} className="text-rose-400" />
          </div>
          <div className="text-xl font-black font-mono text-rose-300">
            {summary?.pendingExpenseCount ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Expense vouchers</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pending Transfers</span>
            <ArrowLeftRight size={16} className="text-purple-400" />
          </div>
          <div className="text-xl font-black font-mono text-purple-300">
            {summary?.pendingTransferCount ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Internal transfers</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Verified (7 Days)</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-xl font-black font-mono text-emerald-300">
            {summary?.recentlyVerifiedCount ?? 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Approved & posted</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
            {[
              { id: 'ALL', label: 'All Types' },
              { id: 'RENT', label: 'Rent Receipts' },
              { id: 'EXPENSE', label: 'Expense Vouchers' },
              { id: 'TRANSFER', label: 'Internal Transfers' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFilterType(t.id)}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  filterType === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
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
                className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                  filterStatus === s.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full md:w-80">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search narration, voucher #, submitter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition"
          >
            Find
          </button>
        </form>
      </div>

      {/* Main Verification Queue Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-sm">Temporary Entries Review Queue</h3>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
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
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Date / Month</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Submitter</th>
                  <th className="py-3 px-4">Narration / Details</th>
                  <th className="py-3 px-3">Property / Unit</th>
                  <th className="py-3 px-3">Accounts Involved</th>
                  <th className="py-3 px-4 text-right">Amount (PKR)</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredEntries.map((entry) => {
                  const isPending = entry.status === 'PENDING_VERIFICATION' || entry.status === 'EDITED';
                  const isVerified = entry.status === 'VERIFIED';
                  const isRejected = entry.status === 'REJECTED';

                  return (
                    <tr key={entry._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-white">
                          {entry.date ? new Date(entry.date).toLocaleDateString('en-PK') : '—'}
                        </div>
                        {entry.rentMonth && (
                          <div className="text-[10px] font-mono text-indigo-400">
                            Month: {entry.rentMonth}
                          </div>
                        )}
                        {entry.voucherNo && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            VN: #{entry.voucherNo}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {entry.entryType === 'RENT' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/70 text-blue-300 border border-blue-700/50">
                            <Building2 size={10} /> Rent
                          </span>
                        ) : entry.entryType === 'TRANSFER' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/70 text-purple-300 border border-purple-700/50">
                            <ArrowLeftRight size={10} /> Transfer
                          </span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/70 text-rose-300 border border-rose-700/50">
                              <DollarSign size={10} /> Expense
                            </span>
                            <span className="text-[9px] font-mono font-semibold text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                              {entry.expenseClassification === 'PROPERTY_OWN_EXPENSE'
                                ? 'Property Own'
                                : entry.expenseClassification === 'UNIT_EXPENSE'
                                ? 'Unit Expense'
                                : 'General'}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-200">
                          {entry.submittedByName || entry.submittedBy?.name || 'Sarfraz'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(entry.submittedAt || entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-slate-200 truncate font-medium" title={entry.detail}>
                          {entry.detail || '—'}
                        </div>
                        {entry.categoryId?.name && (
                          <div className="text-[10px] text-amber-400/90 font-mono">
                            Head: {entry.categoryId.name}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="text-white font-medium">
                          {entry.propertyId?.plazaName || '—'}
                        </div>
                        {entry.tenantId?.fullName && (
                          <div className="text-[10px] text-slate-400">
                            Tenant: {entry.tenantId.fullName}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap text-[11px]">
                        {entry.entryType === 'RENT' ? (
                          <div>
                            <span className="text-emerald-400 font-medium">Dr: </span>
                            <span className="text-slate-200">
                              {entry.receivingAccountId?.name || 'Receiving Account'}
                            </span>
                          </div>
                        ) : entry.entryType === 'TRANSFER' ? (
                          <div>
                            <div>
                              <span className="text-emerald-400 font-medium">Dr (Receiving): </span>
                              <span className="text-slate-200">{entry.drAccountId?.name || entry.receivingAccountId?.name || 'Debit Account'}</span>
                            </div>
                            <div>
                              <span className="text-rose-400 font-medium">Cr (Paying): </span>
                              <span className="text-slate-200">{entry.crAccountId?.name || 'Credit Account'}</span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div>
                              <span className="text-emerald-400 font-medium">Dr: </span>
                              <span className="text-slate-200">{entry.drAccountId?.name || 'Debit Account'}</span>
                            </div>
                            <div>
                              <span className="text-rose-400 font-medium">Cr: </span>
                              <span className="text-slate-200">{entry.crAccountId?.name || 'Credit Account'}</span>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono font-bold text-white text-sm">
                        {formatPKR(entry.amount)}
                      </td>

                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
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

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isPending ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleVerify(entry)}
                              disabled={savingEntryId === entry._id}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow transition disabled:opacity-50"
                              title="Verify & Post to Ledger"
                            >
                              <Check size={12} />
                              <span>Verify / OK</span>
                            </button>

                            {!entry.isEdited && (
                            <button
                              onClick={() => handleOpenEdit(entry)}
                              disabled={savingEntryId === entry._id}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition disabled:opacity-50"
                              title="Edit Entry"
                            >
                              <Edit3 size={13} />
                            </button>
                            )}

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
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500">
                            {isVerified ? (
                              <span>Verified by {entry.verifiedByName || 'Khurshid'}</span>
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
                  <label className="block text-slate-400 font-semibold mb-1">Rent Month (YYYY-MM)</label>
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

              {editingEntry?.entryType === 'EXPENSE' ? (
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
    </div>
  );
};

export default VerifierDashboard;
