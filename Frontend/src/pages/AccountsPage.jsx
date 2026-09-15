import React, { useState, useEffect } from 'react';
import {
  Landmark,
  Wallet,
  Building2,
  User,
  Plus,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  FileText,
  Edit2,
  Power,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { accountsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';

const KNOWN_CUSTODIANS = [
  'Majid Javed',
  'Sabir Nawaz',
  'Sarfaraz',
  'Malik Naveed',
];

export function AccountsPage({ currentUser, onSelectAccount, onNavigateToTransfers }) {
  const userIsAdmin = isAdmin(currentUser);

  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'BANK' | 'CASH'
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    accountName: '',
    accountType: 'BANK',
    bankName: '',
    cashHolder: '',
    accountNumber: '',
    ownerName: '',
    openingBalance: '0',
    openingBalanceDate: '2026-07-31',
    currency: 'PKR',
    notes: '',
  });

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeTab !== 'ALL') params.type = activeTab;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await accountsAPI.getAccounts(params);
      if (res?.success && res.data) {
        setAccounts(res.data.accounts || []);
        setSummary(res.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load accounts:', err);
      setErrorMsg('Failed to load accounts directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAccounts();
    }, 200);
    return () => clearTimeout(timeout);
  }, [activeTab, searchQuery]);

  const handleOpenCreateModal = () => {
    setEditingAccount(null);
    setFormData({
      accountName: '',
      accountType: 'BANK',
      bankName: '',
      cashHolder: '',
      accountNumber: '',
      ownerName: '',
      openingBalance: '0',
      openingBalanceDate: '2026-07-31',
      currency: 'PKR',
      notes: '',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (acc) => {
    setEditingAccount(acc);
    setFormData({
      accountName: acc.accountName || acc.name || '',
      accountType: acc.accountType || acc.type || 'BANK',
      bankName: acc.bankName || '',
      cashHolder: acc.cashHolder || '',
      accountNumber: acc.accountNumber || '',
      ownerName: acc.ownerName || '',
      openingBalance: String(acc.openingBalance ?? 0),
      openingBalanceDate: acc.openingBalanceDate
        ? new Date(acc.openingBalanceDate).toISOString().split('T')[0]
        : '2026-07-31',
      currency: acc.currency || 'PKR',
      notes: acc.notes || '',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmitAccount = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      const payload = {
        accountName: formData.accountName.trim(),
        name: formData.accountName.trim(),
        accountType: formData.accountType,
        type: formData.accountType,
        bankName: formData.accountType === 'BANK' ? formData.bankName.trim() : '',
        cashHolder: formData.accountType === 'CASH' ? formData.cashHolder.trim() : '',
        accountNumber: formData.accountNumber.trim(),
        ownerName: formData.ownerName.trim(),
        openingBalance: Number(formData.openingBalance) || 0,
        openingBalanceDate: formData.openingBalanceDate,
        currency: formData.currency,
        notes: formData.notes.trim(),
      };

      if (!payload.accountName) {
        throw new Error('Account Name is required.');
      }
      if (payload.accountType === 'BANK' && !payload.bankName) {
        throw new Error('Bank Name is required for bank accounts.');
      }
      if (payload.accountType === 'CASH' && !payload.cashHolder) {
        throw new Error('Cash Custodian Holder is required for cash accounts.');
      }

      if (editingAccount) {
        await accountsAPI.updateAccount(editingAccount._id, payload);
        setSuccessMsg(`Account "${payload.accountName}" updated successfully.`);
      } else {
        await accountsAPI.createAccount(payload);
        setSuccessMsg(`Account "${payload.accountName}" created successfully.`);
      }

      setIsModalOpen(false);
      fetchAccounts();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (acc) => {
    const action = acc.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} account "${acc.name}"?`)) {
      return;
    }
    try {
      await accountsAPI.toggleAccountStatus(acc._id);
      setSuccessMsg(`Account "${acc.name}" ${action}d successfully.`);
      fetchAccounts();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update account status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                Financial Core
              </span>
              <span className="text-xs text-slate-400">
                Bank Accounts, Cash Custodians & Liquidity
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Landmark className="text-emerald-400" size={26} />
              Bank & Cash-in-Hand Accounts
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Manage financial custodian accounts for Pixx Technologies. Track real-time balances,
              opening dates, cash-in-hand holders, and complete double-entry transaction ledgers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {onNavigateToTransfers && (
              <button
                onClick={onNavigateToTransfers}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-lg text-xs transition flex items-center gap-2 shadow-sm"
              >
                <ArrowLeftRight size={15} />
                Internal Transfers
              </button>
            )}
            {userIsAdmin && (
              <button
                onClick={handleOpenCreateModal}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs transition flex items-center gap-2 shadow-sm"
              >
                <Plus size={16} />
                New Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Flash Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Liquidity KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Total Liquid Funds</span>
              <Landmark size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-2">
              {formatPKR(summary.totalCompanyLiquidity ?? 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {summary.activeAccountsCount ?? 0} active accounts combined
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Bank Accounts</span>
              <Building2 size={16} className="text-sky-400" />
            </div>
            <div className="text-2xl font-black text-sky-400 font-mono mt-2">
              {formatPKR(summary.bankBalancesTotal ?? 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {summary.bankAccountsCount ?? 0} active bank accounts
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Cash-in-Hand Total</span>
              <Wallet size={16} className="text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400 font-mono mt-2">
              {formatPKR(summary.cashBalancesTotal ?? 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {summary.cashAccountsCount ?? 0} custodian cash accounts
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>August 2026 Audit Base</span>
              <FileText size={16} className="text-indigo-400" />
            </div>
            <div className="text-lg font-black text-indigo-300 font-mono mt-2">
              Rs. 12,367,044.28
            </div>
            <div className="text-[11px] text-emerald-400/80 mt-1 font-semibold flex items-center gap-1">
              <CheckCircle2 size={12} />
              Reconciled with August PDF
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Type Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
              activeTab === 'ALL'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Accounts ({summary?.totalAccounts ?? accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('BANK')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'BANK'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 size={13} />
            Banks ({summary?.bankAccountsCount ?? 0})
          </button>
          <button
            onClick={() => setActiveTab('CASH')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'CASH'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wallet size={13} />
            Cash Holders ({summary?.cashAccountsCount ?? 0})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search account, bank or custodian..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Accounts Directory Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-bold tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Account / Custodian</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Account No / Code</th>
                <th className="py-3 px-4">Opening Balance</th>
                <th className="py-3 px-4 text-right">Current Balance</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Loading financial accounts...
                    </div>
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    No accounts found matching current filters.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => {
                  const isBank = acc.type === 'BANK';
                  const bal = acc.currentBalance ?? 0;
                  const isPositive = bal >= 0;

                  return (
                    <tr key={acc._id} className="hover:bg-slate-800/40 transition">
                      {/* Name & Subtitle */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          {isBank ? (
                            <Building2 size={15} className="text-sky-400 shrink-0" />
                          ) : (
                            <Wallet size={15} className="text-amber-400 shrink-0" />
                          )}
                          <span className="truncate">{acc.accountName || acc.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          {isBank ? (
                            <span>Bank: <strong className="text-slate-300">{acc.bankName || acc.name}</strong></span>
                          ) : (
                            <span>Custodian: <strong className="text-amber-300 font-semibold">{acc.cashHolder || acc.name}</strong></span>
                          )}
                          {acc.ownerName && (
                            <span className="text-slate-500">• {acc.ownerName}</span>
                          )}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border ${
                            isBank
                              ? 'bg-sky-950/80 text-sky-300 border-sky-800/60'
                              : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                          }`}
                        >
                          {acc.type}
                        </span>
                      </td>

                      {/* Account Number / Code */}
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        <div>{acc.accountNumber || '—'}</div>
                        {acc.accountCode && (
                          <div className="text-[10px] text-slate-500">{acc.accountCode}</div>
                        )}
                      </td>

                      {/* Opening Balance */}
                      <td className="py-3.5 px-4 font-mono text-slate-300 text-xs">
                        <div>{formatPKR(acc.openingBalance ?? 0)}</div>
                        <div className="text-[10px] text-slate-500">
                          {acc.openingBalanceDate
                            ? formatDate(acc.openingBalanceDate)
                            : '31-Jul-2026'}
                        </div>
                      </td>

                      {/* Current Balance */}
                      <td className="py-3.5 px-4 text-right">
                        <div
                          className={`font-black font-mono text-sm ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatPKR(bal)}
                        </div>
                        <div className="text-[10px] text-slate-500">Real-time ledger</div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            acc.isActive
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                              : 'bg-rose-950/60 text-rose-400 border-rose-800/40'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              acc.isActive ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          {acc.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectAccount && onSelectAccount(acc._id)}
                            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-700/50 px-2.5 py-1 rounded text-xs font-semibold transition flex items-center gap-1"
                            title="View Account Ledger"
                          >
                            <FileText size={12} />
                            Ledger
                          </button>

                          {userIsAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(acc)}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded transition"
                                title="Edit Account Details"
                              >
                                <Edit2 size={13} />
                              </button>

                              <button
                                onClick={() => handleToggleStatus(acc)}
                                className={`p-1.5 rounded transition ${
                                  acc.isActive
                                    ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40'
                                    : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40'
                                }`}
                                title={acc.isActive ? 'Deactivate Account' : 'Activate Account'}
                              >
                                <Power size={13} />
                              </button>
                            </>
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
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Landmark size={20} className="text-emerald-400" />
                <h3 className="font-bold text-white text-base">
                  {editingAccount ? 'Edit Account' : 'Register New Account'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                &times;
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAccount} className="space-y-3.5 text-xs">
              {/* Type selector */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Account Type <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, accountType: 'BANK' })}
                    className={`py-2 px-3 rounded-lg font-bold border flex items-center justify-center gap-2 transition ${
                      formData.accountType === 'BANK'
                        ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Building2 size={14} />
                    Bank Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, accountType: 'CASH' })}
                    className={`py-2 px-3 rounded-lg font-bold border flex items-center justify-center gap-2 transition ${
                      formData.accountType === 'CASH'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Wallet size={14} />
                    Cash Custodian
                  </button>
                </div>
              </div>

              {/* Account Display Name */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Account Full Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formData.accountType === 'BANK'
                      ? 'e.g. Bank Al Falah (Kamran Ijaz Sb)'
                      : 'e.g. Cash in Hand (Majid Javed)'
                  }
                  value={formData.accountName}
                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Type-specific Fields */}
              {formData.accountType === 'BANK' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">
                      Bank Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bank Al Falah / ABL / UBL"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">
                      Account / IBAN Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PK00BAHL0000..."
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Cash Custodian / Holder Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Majid Javed, Sabir Nawaz, Sarfaraz..."
                    value={formData.cashHolder}
                    onChange={(e) => setFormData({ ...formData, cashHolder: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500">Quick Select:</span>
                    {KNOWN_CUSTODIANS.map((cust) => (
                      <button
                        key={cust}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            cashHolder: cust,
                            accountName: `Cash in Hand (${cust})`,
                          })
                        }
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded transition"
                      >
                        {cust}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Owner / Account Signatory */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Account Signatory / Entity (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kamran Ijaz Sb / Uraan Ventures"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Opening Balance & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Opening Balance (PKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Opening Balance Date
                  </label>
                  <input
                    type="date"
                    value={formData.openingBalanceDate}
                    onChange={(e) => setFormData({ ...formData, openingBalanceDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Notes & Details
                </label>
                <textarea
                  rows="2"
                  placeholder="Special instructions or branch details..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
                  {editingAccount ? 'Update Account' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountsPage;
