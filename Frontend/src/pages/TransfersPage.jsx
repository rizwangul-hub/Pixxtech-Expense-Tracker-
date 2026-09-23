import React, { useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Landmark,
  Wallet,
  Building2,
  Calendar,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { transfersAPI, accountsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';

export function TransfersPage({ currentUser, onSelectAccount }) {
  const [transfers, setTransfers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeAccounts, setActiveAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Transfer Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Transfer Form
  const [formData, setFormData] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    voucherNo: '',
    detail: '',
  });

  const fetchTransfersAndAccounts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedMonth && selectedMonth !== 'ALL') params.month = selectedMonth;
      if (selectedAccountFilter) params.accountId = selectedAccountFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const [transfersRes, accountsRes] = await Promise.all([
        transfersAPI.getTransfers(params),
        accountsAPI.getAccounts({ status: 'ACTIVE', limit: 100 }),
      ]);

      if (transfersRes?.success && transfersRes.data) {
        setTransfers(transfersRes.data.transfers || []);
        setSummary(transfersRes.data.summary || null);
      }
      if (accountsRes?.success && accountsRes.data) {
        setActiveAccounts(accountsRes.data.accounts || []);
      }
    } catch (err) {
      console.error('Failed to load transfers:', err);
      setErrorMsg('Failed to load transfers data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfersAndAccounts();
  }, [selectedMonth, selectedAccountFilter, searchQuery]);

  const handleOpenModal = () => {
    const firstAcc = activeAccounts[0]?._id || '';
    const secondAcc = activeAccounts[1]?._id || '';
    setFormData({
      fromAccountId: firstAcc,
      toAccountId: secondAcc,
      amount: '',
      date: '2026-08-15',
      voucherNo: '',
      detail: '',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleExecuteTransfer = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      const numAmount = Number(formData.amount);
      if (!formData.fromAccountId || !formData.toAccountId) {
        throw new Error('Please select both source and destination accounts.');
      }
      if (formData.fromAccountId === formData.toAccountId) {
        throw new Error('Source and Destination accounts cannot be the same account.');
      }
      if (!numAmount || numAmount <= 0) {
        throw new Error('Transfer amount must be strictly greater than zero.');
      }
      if (!formData.detail.trim()) {
        throw new Error('Please provide a transfer description / reason.');
      }

      const payload = {
        fromAccountId: formData.fromAccountId,
        toAccountId: formData.toAccountId,
        amount: numAmount,
        date: formData.date,
        voucherNo: formData.voucherNo.trim() || undefined,
        detail: formData.detail.trim(),
      };

      const res = await transfersAPI.executeTransfer(payload);
      if (res?.success) {
        setSuccessMsg(
          res?.message || `Transfer of ${formatPKR(numAmount)} executed successfully between accounts.`
        );
        setIsModalOpen(false);
        fetchTransfersAndAccounts();
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        throw new Error(res?.message || 'Transfer failed.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Transfer execution failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const sourceAccount = activeAccounts.find((a) => a._id === formData.fromAccountId);
  const destAccount = activeAccounts.find((a) => a._id === formData.toAccountId);
  const transferNum = Number(formData.amount) || 0;

  return (
    <div className="space-y-6">
      {/* Banner Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                Liquidity Engine
              </span>
              <span className="text-xs text-slate-400">
                Bank ↔ Cash & Cash ↔ Cash Funds Movement
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <ArrowLeftRight className="text-indigo-400" size={26} />
              Internal Funds Transfers
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Execute double-entry transfers between Bank and Cash accounts. Every transfer
              strictly preserves <strong>Transfer Invariance</strong> (decreasing source and increasing
              destination by the exact amount with zero net effect on company revenue or expenses).
            </p>
          </div>

          <button
            onClick={handleOpenModal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition flex items-center gap-2 shadow-sm shrink-0"
          >
            <Plus size={16} />
            Transfer Funds
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Transfers Executed</span>
            <Clock size={16} className="text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-indigo-400 font-mono mt-2">
            {summary?.totalTransfers ?? transfers.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Period: {selectedMonth === 'ALL' ? 'All Time' : selectedMonth}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Transferred Volume</span>
            <ArrowLeftRight size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-2">
            {formatPKR(summary?.totalVolumePKR ?? 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Total funds reallocated
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Transfer Invariance</span>
            <ShieldCheck size={16} className="text-amber-400" />
          </div>
          <div className="text-sm font-bold text-amber-300 mt-2 flex items-center gap-1.5">
            <CheckCircle2 size={16} className="text-emerald-400" />
            Zero P&L Impact Verified
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Disbursement = Collection (Dr = Cr)
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Month selector */}
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-400" />
            <span className="text-xs text-slate-400 font-semibold">Month:</span>
            <input
              type="month"
              value={selectedMonth === 'ALL' ? '' : selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || 'ALL')}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              onClick={() => setSelectedMonth('ALL')}
              className={`text-xs px-2.5 py-1 rounded transition ${
                selectedMonth === 'ALL'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedMonth('2026-08')}
              className={`text-xs px-2.5 py-1 rounded transition ${
                selectedMonth === '2026-08'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Aug 2026
            </button>
          </div>

          {/* Account Filter */}
          <div className="flex items-center gap-2">
            <Landmark size={15} className="text-slate-400" />
            <select
              value={selectedAccountFilter}
              onChange={(e) => setSelectedAccountFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Accounts</option>
              {activeAccounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search voucher, narration or account..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Transfers Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-bold tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Voucher No</th>
                <th className="py-3 px-4">Disbursing Account (From)</th>
                <th className="py-3 px-4 text-center">Transfer</th>
                <th className="py-3 px-4">Receiving Account (To)</th>
                <th className="py-3 px-4 text-right">Amount (PKR)</th>
                <th className="py-3 px-4">Detail / Narration</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                      Loading internal fund transfers...
                    </div>
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-500">
                    No transfers found matching current criteria.
                  </td>
                </tr>
              ) : (
                transfers.map((tx) => {
                  const source = tx.crAccountId;
                  const dest = tx.drAccountId;

                  return (
                    <tr key={tx._id} className="hover:bg-slate-800/40 transition">
                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {formatDate(tx.date)}
                      </td>

                      {/* Voucher No */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-200 whitespace-nowrap">
                        {tx.voucherNo || tx.reference || '—'}
                      </td>

                      {/* Source Account (From) */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-rose-300 flex items-center gap-1.5">
                          {source?.type === 'BANK' ? (
                            <Building2 size={13} className="text-sky-400 shrink-0" />
                          ) : (
                            <Wallet size={13} className="text-amber-400 shrink-0" />
                          )}
                          <span className="truncate">{source?.name || '—'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">Disbursing Source</div>
                      </td>

                      {/* Arrow Icon */}
                      <td className="py-3 px-4 text-center">
                        <ArrowRight size={15} className="text-indigo-400 inline-block" />
                      </td>

                      {/* Dest Account (To) */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                          {dest?.type === 'BANK' ? (
                            <Building2 size={13} className="text-sky-400 shrink-0" />
                          ) : (
                            <Wallet size={13} className="text-amber-400 shrink-0" />
                          )}
                          <span className="truncate">{dest?.name || '—'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">Receiving Destination</div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-black text-white text-sm whitespace-nowrap">
                        {formatPKR(tx.amount)}
                      </td>

                      {/* Detail */}
                      <td className="py-3 px-4 text-slate-300 max-w-xs">
                        <div className="truncate">{tx.detail}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700/60">
                          {tx.status || 'VERIFIED'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Transfer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowLeftRight size={20} className="text-indigo-400" />
                <h3 className="font-bold text-white text-base">
                  Execute Internal Funds Transfer
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

            <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
              {/* Source & Destination Account Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Source Account */}
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    From (Source Account) <span className="text-rose-400">*</span>
                  </label>
                  <select
                    required
                    value={formData.fromAccountId}
                    onChange={(e) => setFormData({ ...formData, fromAccountId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select Disbursing Account</option>
                    {activeAccounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.type}) — Bal: {formatPKR(a.currentBalance || 0)}
                      </option>
                    ))}
                  </select>
                  {sourceAccount && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      Available: <strong className="text-slate-200 font-mono">{formatPKR(sourceAccount.currentBalance || 0)}</strong>
                    </div>
                  )}
                </div>

                {/* Destination Account */}
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    To (Destination Account) <span className="text-rose-400">*</span>
                  </label>
                  <select
                    required
                    value={formData.toAccountId}
                    onChange={(e) => setFormData({ ...formData, toAccountId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select Receiving Account</option>
                    {activeAccounts.map((a) => (
                      <option
                        key={a._id}
                        value={a._id}
                        disabled={a._id === formData.fromAccountId}
                      >
                        {a.name} ({a.type}) — Bal: {formatPKR(a.currentBalance || 0)}
                      </option>
                    ))}
                  </select>
                  {destAccount && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      Current: <strong className="text-slate-200 font-mono">{formatPKR(destAccount.currentBalance || 0)}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Transfer Amount (PKR) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 50000"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Transfer Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Voucher / Reference & Narration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Voucher / Ref No
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={formData.voucherNo}
                    onChange={(e) => setFormData({ ...formData, voucherNo: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Description / Narration <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cash transfer to custodian Majid Javed for site ops"
                    value={formData.detail}
                    onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Dynamic Impact Preview Card */}
              {sourceAccount && destAccount && transferNum > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Balance Movement Preview</span>
                    <span className="text-emerald-400 font-mono">Amount: {formatPKR(transferNum)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Source Impact */}
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-rose-400 font-bold truncate">From: {sourceAccount.name}</div>
                      <div className="font-mono text-[11px] text-slate-400 mt-1">
                        {formatPKR(sourceAccount.currentBalance || 0)} &rarr;{' '}
                        <strong className="text-white">
                          {formatPKR((sourceAccount.currentBalance || 0) - transferNum)}
                        </strong>
                      </div>
                    </div>

                    {/* Dest Impact */}
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-emerald-400 font-bold truncate">To: {destAccount.name}</div>
                      <div className="font-mono text-[11px] text-slate-400 mt-1">
                        {formatPKR(destAccount.currentBalance || 0)} &rarr;{' '}
                        <strong className="text-white">
                          {formatPKR((destAccount.currentBalance || 0) + transferNum)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-800/60">
                    <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
                    <span>
                      <strong>Transfer Invariance:</strong> Net portfolio liquidity change = <strong>Rs. 0.00</strong>. This transfer does not alter income or expenses.
                    </span>
                  </div>
                </div>
              )}

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
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
                  Execute Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransfersPage;
