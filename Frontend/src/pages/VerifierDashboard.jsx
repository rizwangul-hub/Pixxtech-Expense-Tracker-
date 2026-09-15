import React, { useState, useEffect } from 'react';
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
  Eye,
  PlusCircle,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { verificationAPI, accountsAPI, propertiesAPI } from '../services/api.js';
import { formatPKR } from '../utils/formatters.js';
import { VoucherEntryForm } from '../components/VoucherEntryForm.jsx';
import { RentCollectionModal } from '../components/RentCollectionModal.jsx';

export const VerifierDashboard = ({ user, onOpenMasterAccounts, onOpenProperties }) => {
  const [pendingEntries, setPendingEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: '', type: '' });

  // Filter state
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('PENDING_VERIFICATION');
  const [searchQuery, setSearchQuery] = useState('');

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
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [properties, setProperties] = useState([]);

  // Load pending list & KPIs
  const loadData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType !== 'ALL') params.entryType = filterType;
      if (filterStatus !== 'ALL') params.status = filterStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const [listRes, sumRes, accRes, catRes, propRes] = await Promise.all([
        verificationAPI.getPending(params),
        verificationAPI.getSummary(),
        accountsAPI.getActiveSummary().catch(() => ({ accounts: [] })),
        accountsAPI.getCategories().catch(() => ({ categories: [] })),
        accountsAPI.getProperties().catch(() => ({ properties: [] })),
      ]);

      setPendingEntries(listRes.data?.entries || listRes.entries || []);
      setSummary(sumRes.data || sumRes || null);
      setAccounts(accRes.accounts || []);
      setCategories(catRes.categories || []);
      setProperties(propRes.properties || []);
    } catch (err) {
      console.error('Failed to load verifier data:', err);
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to fetch verification queue.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterType, filterStatus]);

  // Handle Search Submission
  const handleSearch = (e) => {
    e.preventDefault();
    loadData();
  };

  // Verify / Approve Entry (Atomic post to Ledger)
  const handleVerify = async (entry) => {
    if (!window.confirm(`Are you sure you want to verify and post this ${entry.entryType} of ${formatPKR(entry.amount)} into the official system?`)) {
      return;
    }

    try {
      setActionLoading(true);
      setFeedback({ message: '', type: '' });
      const res = await verificationAPI.verifyEntry(entry._id);
      if (res.success) {
        setFeedback({
          message: `Entry verified successfully! Officially posted to central financial ledger.`,
          type: 'success',
        });
        await loadData();
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Verification failed.',
        type: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (entry) => {
    setEditingEntry(entry);
    setEditForm({
      amount: entry.amount || '',
      detail: entry.detail || '',
      voucherNo: entry.voucherNo || '',
      date: entry.date ? new Date(entry.date).toISOString().split('T')[0] : '',
      rentMonth: entry.rentMonth || '',
      editNotes: '',
    });
  };

  // Save Edits
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEntry) return;

    try {
      setActionLoading(true);
      const res = await verificationAPI.updatePending(editingEntry._id, editForm);
      if (res.success) {
        setFeedback({
          message: 'Entry details corrected successfully. You can now verify it.',
          type: 'success',
        });
        setEditingEntry(null);
        await loadData();
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to update entry.',
        type: 'error',
      });
    } finally {
      setActionLoading(false);
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

    try {
      setActionLoading(true);
      const res = await verificationAPI.rejectEntry(rejectingEntry._id, rejectionReason);
      if (res.success) {
        setFeedback({
          message: 'Entry has been rejected. It will not affect the ledger or accounts.',
          type: 'success',
        });
        setRejectingEntry(null);
        await loadData();
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to reject entry.',
        type: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Entry
  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete this draft entry permanently? This action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(true);
      const res = await verificationAPI.deletePending(entry._id);
      if (res.success) {
        setFeedback({
          message: 'Draft entry deleted permanently.',
          type: 'success',
        });
        await loadData();
      }
    } catch (err) {
      setFeedback({
        message: err.response?.data?.message || err.message || 'Failed to delete draft entry.',
        type: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  };

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
              onClick={loadData}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Refresh Queue"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pending Total</span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-300">
            {summary?.totalPendingCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Awaiting your signoff</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pending Rent</span>
            <Building2 size={16} className="text-blue-400" />
          </div>
          <div className="text-2xl font-black font-mono text-blue-300">
            {summary?.pendingRentCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Tenant rent collections</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pending Expenses</span>
            <DollarSign size={16} className="text-rose-400" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-300">
            {summary?.pendingExpenseCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Expense vouchers</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Verified (7 Days)</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            {summary?.recentlyVerifiedCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Approved & posted</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
            {['ALL', 'RENT', 'EXPENSE'].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded text-xs font-bold transition ${
                  filterType === t
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t === 'ALL' ? 'All Types' : t === 'RENT' ? 'Rent Receipts' : 'Expense Vouchers'}
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
                    ? 'bg-slate-800 text-white'
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
              {pendingEntries.length} items
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
        ) : pendingEntries.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500/50" />
            No pending entries found matching your selected filters. All clear!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
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
                {pendingEntries.map((entry) => {
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
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/70 text-rose-300 border border-rose-700/50">
                            <DollarSign size={10} /> Expense
                          </span>
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
                        ) : (
                          <div>
                            <div>
                              <span className="text-emerald-400 font-medium">Dr: </span>
                              <span className="text-slate-200">{entry.drAccountId?.name || 'Debit'}</span>
                            </div>
                            <div>
                              <span className="text-rose-400 font-medium">Cr: </span>
                              <span className="text-slate-200">{entry.crAccountId?.name || 'Credit'}</span>
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
                              disabled={actionLoading}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow transition"
                              title="Verify & Post to Ledger"
                            >
                              <Check size={12} />
                              <span>Verify / OK</span>
                            </button>

                            <button
                              onClick={() => handleOpenEdit(entry)}
                              disabled={actionLoading}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition"
                              title="Edit Entry"
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              onClick={() => handleOpenReject(entry)}
                              disabled={actionLoading}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700 transition"
                              title="Reject Entry"
                            >
                              <XCircle size={13} />
                            </button>

                            <button
                              onClick={() => handleDelete(entry)}
                              disabled={actionLoading}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
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
                  <label className="block text-slate-400 font-semibold mb-1">Voucher # (VN)</label>
                  <input
                    type="text"
                    value={editForm.voucherNo}
                    onChange={(e) => setEditForm({ ...editForm, voucherNo: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
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

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Narration / Detail</label>
                <textarea
                  rows="3"
                  value={editForm.detail}
                  onChange={(e) => setEditForm({ ...editForm, detail: e.target.value })}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                />
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
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5"
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
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1.5"
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
