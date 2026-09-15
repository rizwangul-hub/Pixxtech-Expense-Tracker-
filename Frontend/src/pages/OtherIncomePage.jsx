import React, { useState, useEffect } from 'react';
import {
  Coins,
  TrendingUp,
  Receipt,
  Building2,
  Calendar,
  Plus,
  Search,
  Filter,
  ArrowDownLeft,
  Landmark,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  RotateCcw,
  ShieldCheck,
  Settings,
  ChevronRight,
  Layers,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { otherIncomeAPI, accountsAPI, propertiesAPI, vouchersAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';

export function OtherIncomePage({ currentUser, onNavigateToAccounts, onNavigateToTransactions }) {
  const userIsAdmin = isAdmin(currentUser);

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [incomeHeadFilter, setIncomeHeadFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown reference lists
  const [incomeHeads, setIncomeHeads] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [propertiesList, setPropertiesList] = useState([]);

  // Record Other Income Modal
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [recordForm, setRecordForm] = useState({
    receiptDate: '2026-08-15',
    voucherNumber: '',
    incomeHeadId: '',
    amount: '',
    receivingAccountId: '',
    propertyId: '',
    unitId: '',
    receivedFrom: '',
    referenceNumber: '',
    transactionDetail: '',
    description: '',
    status: 'POSTED',
    checkedBy: currentUser?.name || 'Authorized Auditor',
  });

  // Manage Heads Modal
  const [isHeadsModalOpen, setIsHeadsModalOpen] = useState(false);
  const [newHeadForm, setNewHeadForm] = useState({ name: '', code: '', description: '' });
  const [headSubmitting, setHeadSubmitting] = useState(false);
  const [headError, setHeadError] = useState('');

  // View Detail Modal
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [showReversalPrompt, setShowReversalPrompt] = useState(false);

  // Load Reference Data (Heads, Accounts, Properties)
  const loadReferenceData = async () => {
    try {
      const [headsRes, accsRes, propsRes] = await Promise.all([
        otherIncomeAPI.getHeads({ includeInactive: true }),
        accountsAPI.getAccounts({ limit: 100 }),
        propertiesAPI.getProperties({ limit: 100 }),
      ]);

      if (headsRes?.success) setIncomeHeads(headsRes.data || []);
      if (accsRes?.success) {
        // Only active non-clearing accounts can receive funds
        const activeLiquidity = (accsRes.data?.accounts || accsRes.data || []).filter(
          (a) => a.isActive && !a.isClearing
        );
        setAccountsList(activeLiquidity);
      }
      if (propsRes?.success) setPropertiesList(propsRes.data?.properties || propsRes.data || []);
    } catch (err) {
      console.error('Failed to load reference lists:', err);
    }
  };

  // Load Records and Monthly Summary
  const loadData = async () => {
    setLoading(true);
    try {
      const params = {
        limit: 100,
        month: selectedMonth || undefined,
        incomeHeadId: incomeHeadFilter || undefined,
        propertyId: propertyFilter || undefined,
        receivingAccountId: accountFilter || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchQuery || undefined,
      };

      const [recordsRes, summaryRes] = await Promise.all([
        otherIncomeAPI.getAll(params),
        otherIncomeAPI.getMonthlySummary({ month: selectedMonth }),
      ]);

      if (recordsRes?.success) {
        setRecords(recordsRes.data || []);
      }
      if (summaryRes?.success) {
        setSummary(summaryRes.data || null);
      }
    } catch (err) {
      console.error('Failed to load other income data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedMonth, incomeHeadFilter, propertyFilter, accountFilter, statusFilter, searchQuery]);

  // Handle Opening Record Modal (suggest VN)
  const handleOpenRecordModal = async () => {
    setModalError('');
    setSuccessMsg('');
    try {
      const vnRes = await vouchersAPI.suggestNextVoucherNo();
      const suggestedVn = vnRes?.data?.suggestedVoucherNo || '';
      setRecordForm((prev) => ({
        ...prev,
        voucherNumber: suggestedVn,
        incomeHeadId: incomeHeads[0]?._id || '',
        receivingAccountId: accountsList[0]?._id || '',
      }));
    } catch {
      // Fallback
    }
    setIsRecordModalOpen(true);
  };

  // Handle Record Submission
  const handleRecordSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setSubmitting(true);

    try {
      if (!recordForm.amount || parseFloat(recordForm.amount) <= 0) {
        throw new Error('Please enter a valid amount greater than zero.');
      }
      if (!recordForm.incomeHeadId) {
        throw new Error('Please select an Income Head.');
      }
      if (!recordForm.receivingAccountId) {
        throw new Error('Please select a receiving Bank or Cash account.');
      }
      if (!recordForm.transactionDetail || !recordForm.transactionDetail.trim()) {
        throw new Error('Please provide transaction detail / narration.');
      }

      const payload = {
        ...recordForm,
        amount: parseFloat(recordForm.amount),
        propertyId: recordForm.propertyId || null,
        unitId: recordForm.unitId || null,
      };

      const res = await otherIncomeAPI.record(payload);
      if (res?.success) {
        setSuccessMsg('Other income receipt successfully posted with central double-entry voucher!');
        setTimeout(() => {
          setIsRecordModalOpen(false);
          setSuccessMsg('');
          loadData();
        }, 1200);
      } else {
        throw new Error(res?.message || 'Failed to record other income.');
      }
    } catch (err) {
      setModalError(err.response?.data?.message || err.message || 'Error recording receipt');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Add Income Head
  const handleCreateHead = async (e) => {
    e.preventDefault();
    setHeadError('');
    setHeadSubmitting(true);
    try {
      if (!newHeadForm.name.trim()) throw new Error('Head name is required.');
      const res = await otherIncomeAPI.createHead(newHeadForm);
      if (res?.success) {
        setNewHeadForm({ name: '', code: '', description: '' });
        await loadReferenceData();
      } else {
        throw new Error(res?.message || 'Failed to create head.');
      }
    } catch (err) {
      setHeadError(err.response?.data?.message || err.message || 'Failed to create income head.');
    } finally {
      setHeadSubmitting(false);
    }
  };

  // Handle Reversal
  const handleReverse = async (id) => {
    setReversing(true);
    try {
      const res = await otherIncomeAPI.reverse(id, { reason: reversalReason });
      if (res?.success) {
        setSelectedRecord(null);
        setShowReversalPrompt(false);
        setReversalReason('');
        await loadData();
      } else {
        alert(res?.message || 'Failed to reverse record.');
      }
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Error reversing record');
    } finally {
      setReversing(false);
    }
  };

  // Selected property's units list
  const selectedPropertyObj = propertiesList.find((p) => p._id === recordForm.propertyId);
  const availableUnits = selectedPropertyObj?.units || [];

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                Non-Rental Inflow
              </span>
              <span className="text-xs text-slate-400">Pixx Technologies Finance Management</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Coins className="text-amber-400" size={26} />
              Other Income & Other Receipts
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Manage non-rental revenue including recoveries, refunds, bank profits, and miscellaneous receipts.
              Maintains strict separation between Rental Income and Other Income while unifying into Total Company Income.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Month Filter Selector */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300">
              <Calendar size={14} className="text-slate-400 mr-2" />
              <span className="text-slate-500 mr-2">Period:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="2026-08" className="bg-slate-900 text-white">August 2026</option>
                <option value="2026-07" className="bg-slate-900 text-white">July 2026</option>
                <option value="2026-09" className="bg-slate-900 text-white">September 2026</option>
              </select>
            </div>

            {/* Manage Heads Button (Admin Only) */}
            {userIsAdmin && (
              <button
                type="button"
                onClick={() => setIsHeadsModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <Settings size={14} />
                Income Heads
              </button>
            )}

            {/* Record Other Income Button */}
            <button
              type="button"
              onClick={handleOpenRecordModal}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm"
            >
              <Plus size={16} />
              Record Other Income
            </button>
          </div>
        </div>
      </div>

      {/* Macro Financial Summary KPI Cards (Section 12: Total Income = Rental + Other) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Other Income */}
        <div className="bg-slate-900 border border-amber-900/40 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-amber-400 font-bold mb-1">
            <span className="flex items-center gap-1.5">
              <Coins size={15} />
              Total Other Income
            </span>
            <span className="text-[10px] bg-amber-950 px-1.5 py-0.2 rounded border border-amber-800/60">
              {summary?.receiptsCount ?? 0} Receipts
            </span>
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono tracking-tight mt-1">
            {formatPKR(summary?.totalOtherIncome ?? 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Non-rental collections</span>
            <span className="text-amber-400/80 font-medium">Page 3 Report</span>
          </div>
        </div>

        {/* Card 2: Rental Income */}
        <div className="bg-slate-900 border border-emerald-900/40 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-bold mb-1">
            <span className="flex items-center gap-1.5">
              <TrendingUp size={15} />
              Rental Income (Leases)
            </span>
            <span className="text-[10px] bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800/60">
              Tenancy Register
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight mt-1">
            {formatPKR(summary?.totalRentalIncome ?? 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Property leases inflow</span>
            <span className="text-emerald-400/80 font-medium">100% Segregated</span>
          </div>
        </div>

        {/* Card 3: Total Company Income */}
        <div className="bg-slate-900 border border-sky-900/40 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-sky-400 font-bold mb-1">
            <span className="flex items-center gap-1.5">
              <Layers size={15} />
              TOTAL COMPANY INCOME
            </span>
            <span className="text-[10px] bg-sky-950 px-1.5 py-0.2 rounded border border-sky-800/60">
              Rent + Other
            </span>
          </div>
          <div className="text-2xl font-black text-sky-400 font-mono tracking-tight mt-1">
            {formatPKR(summary?.totalIncome ?? 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Combined Total Revenue</span>
            <span className="text-sky-300 font-mono text-[10px]">Zero Transfers</span>
          </div>
        </div>

        {/* Card 4: Property vs General Split */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-300 font-bold mb-1">
            <span className="flex items-center gap-1.5">
              <Building2 size={15} className="text-indigo-400" />
              Inflow Allocation
            </span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-400">
              Source
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800 text-xs">
            <span className="text-slate-400">Property-linked:</span>
            <span className="font-mono text-white font-bold">{formatPKR(summary?.propertyLinkedTotal ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-xs">
            <span className="text-slate-400">General Company:</span>
            <span className="font-mono text-white font-bold">{formatPKR(summary?.generalIncomeTotal ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search receipt, voucher, payer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Income Head Filter */}
          <div>
            <select
              value={incomeHeadFilter}
              onChange={(e) => setIncomeHeadFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="">All Income Heads</option>
              {incomeHeads.map((h) => (
                <option key={h._id} value={h._id}>
                  {h.name} {h.code ? `(${h.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Property Filter */}
          <div>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="">All Properties / General</option>
              <option value="none">General Company Only (No Property)</option>
              {propertiesList.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.plazaName}
                </option>
              ))}
            </select>
          </div>

          {/* Receiving Account Filter */}
          <div>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="">All Receiving Accounts</option>
              {accountsList.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">Status: Active (Posted & Draft)</option>
              <option value="POSTED">POSTED Only</option>
              <option value="DRAFT">DRAFT Only</option>
              <option value="REVERSED">REVERSED Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Other Income Table (Section 9: Exact 10 Columns) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Other Income & Receipts Register
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Showing <strong className="text-white">{records.length}</strong> records
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            Loading Other Income records...
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <Coins size={36} className="mx-auto mb-2 text-slate-600" />
            No Other Income records found for the selected filters.
            <div className="mt-2">
              <button
                type="button"
                onClick={handleOpenRecordModal}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline"
              >
                Record first Other Income transaction
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[11px] tracking-wider">
                  <th className="py-3 px-3.5">Date</th>
                  <th className="py-3 px-3.5">Voucher No.</th>
                  <th className="py-3 px-3.5">Income Head</th>
                  <th className="py-3 px-3.5">Category</th>
                  <th className="py-3 px-3.5">Received From</th>
                  <th className="py-3 px-3.5">Property</th>
                  <th className="py-3 px-3.5">Receiving Account</th>
                  <th className="py-3 px-3.5 text-right">Amount (PKR)</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {records.map((r) => {
                  const isReversed = r.status === 'REVERSED';
                  return (
                    <tr
                      key={r._id}
                      className={`hover:bg-slate-800/40 transition ${
                        isReversed ? 'opacity-60 bg-red-950/10' : ''
                      }`}
                    >
                      {/* 1. Date */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-300">
                        {formatDate(r.receiptDate)}
                      </td>

                      {/* 2. Voucher No. */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-amber-300">
                        {r.voucherNo || r.receiptNumber}
                      </td>

                      {/* 3. Income Head */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-semibold text-white">
                        {r.headName || r.incomeHeadId?.name || 'Other Receipts'}
                      </td>

                      {/* 4. Category */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                          {r.category || 'Other Income'}
                        </span>
                      </td>

                      {/* 5. Received From */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-slate-300">
                        {r.receivedFrom || '—'}
                      </td>

                      {/* 6. Property */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-slate-300">
                        {r.propertyId ? (
                          <span className="flex items-center gap-1 text-white font-medium">
                            <Building2 size={12} className="text-emerald-400 shrink-0" />
                            {r.propertyId.plazaName}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">General Company</span>
                        )}
                      </td>

                      {/* 7. Receiving Account */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-medium text-white flex items-center gap-1.5">
                          {r.receivingAccountId?.type === 'BANK' ? (
                            <Landmark size={13} className="text-sky-400 shrink-0" />
                          ) : (
                            <Wallet size={13} className="text-emerald-400 shrink-0" />
                          )}
                          {r.receivingAccountId?.name || 'Direct Bank/Cash'}
                        </div>
                      </td>

                      {/* 8. Amount */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-right font-mono font-black text-amber-400">
                        {formatPKR(r.amount)}
                      </td>

                      {/* 9. Status */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            r.status === 'POSTED'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                              : r.status === 'DRAFT'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-red-950 text-red-400 border-red-800/60'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>

                      {/* 10. Actions */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRecord(r);
                            setShowReversalPrompt(false);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition inline-flex items-center gap-1"
                        >
                          <Eye size={12} />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Record Other Income Form (Section 3 & 16) */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsRecordModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Coins className="text-amber-400" size={20} />
              <h2 className="text-lg font-bold text-white">Record Other Income & Receipt</h2>
            </div>

            {modalError && (
              <div className="mb-4 p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                {modalError}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs rounded-lg flex items-center gap-2">
                <CheckCircle2 size={15} className="shrink-0" />
                {successMsg}
              </div>
            )}

            <form onSubmit={handleRecordSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Receipt Date */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Receipt Date <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recordForm.receiptDate}
                    onChange={(e) => setRecordForm({ ...recordForm, receiptDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Voucher Number (Auto-Suggested or Manual) */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Voucher Number (V.N)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-suggested (e.g. 28917)"
                    value={recordForm.voucherNumber}
                    onChange={(e) => setRecordForm({ ...recordForm, voucherNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Income Head */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Income Head <span className="text-amber-400">*</span>
                  </label>
                  <select
                    required
                    value={recordForm.incomeHeadId}
                    onChange={(e) => setRecordForm({ ...recordForm, incomeHeadId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select Income Head</option>
                    {incomeHeads.filter((h) => h.isActive).map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} {h.code ? `(${h.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category (Locked to Other Income) */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Category (Report Classification)
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Other Income"
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-amber-400 font-bold cursor-not-allowed"
                  />
                </div>

                {/* Amount (PKR) */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Amount (PKR) <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 50000"
                    value={recordForm.amount}
                    onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono font-bold focus:outline-none focus:border-amber-500 text-sm"
                  />
                </div>

                {/* Receiving Bank / Cash Account */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Receiving Account (Debit) <span className="text-amber-400">*</span>
                  </label>
                  <select
                    required
                    value={recordForm.receivingAccountId}
                    onChange={(e) =>
                      setRecordForm({ ...recordForm, receivingAccountId: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select Receiving Account</option>
                    {accountsList.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.type}) — Bal: {formatPKR(a.currentBalance)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Property (Optional) */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Property (Optional)
                  </label>
                  <select
                    value={recordForm.propertyId}
                    onChange={(e) =>
                      setRecordForm({ ...recordForm, propertyId: e.target.value, unitId: '' })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">General Company (No Property)</option>
                    {propertiesList.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.plazaName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unit (Optional, appears if property selected) */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Unit (Optional)
                  </label>
                  <select
                    disabled={!recordForm.propertyId || availableUnits.length === 0}
                    value={recordForm.unitId}
                    onChange={(e) => setRecordForm({ ...recordForm, unitId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  >
                    <option value="">Select Unit if applicable</option>
                    {availableUnits.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.unitName} ({u.unitType})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Received From */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Received From</label>
                  <input
                    type="text"
                    placeholder="Payer name, company, or party"
                    value={recordForm.receivedFrom}
                    onChange={(e) => setRecordForm({ ...recordForm, receivedFrom: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Reference Number */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    placeholder="Cheque #, deposit slip, online ref"
                    value={recordForm.referenceNumber}
                    onChange={(e) => setRecordForm({ ...recordForm, referenceNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Transaction Detail (Required Narration) */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Transaction Detail / Narration <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Recovery from contractor for 289-Q Plaza repair surplus"
                  value={recordForm.transactionDetail}
                  onChange={(e) =>
                    setRecordForm({ ...recordForm, transactionDetail: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Additional Description */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Additional Notes / Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Internal audit notes or supporting memo"
                  value={recordForm.description}
                  onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Status and Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Status:</span>
                  <select
                    value={recordForm.status}
                    onChange={(e) => setRecordForm({ ...recordForm, status: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="POSTED">POSTED (Immediate Ledger Effect)</option>
                    <option value="DRAFT">DRAFT (Save for review)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRecordModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                  >
                    {submitting ? 'Posting Voucher...' : 'Save & Post Other Income'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Manage Other Income Heads (Section 2) */}
      {isHeadsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsHeadsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Settings className="text-amber-400" size={20} />
              <h2 className="text-lg font-bold text-white">Configurable Other Income Heads</h2>
            </div>

            {headError && (
              <div className="mb-4 p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-lg">
                {headError}
              </div>
            )}

            {/* Add Head Form */}
            <form onSubmit={handleCreateHead} className="bg-slate-950 border border-slate-800 rounded-lg p-4 mb-5 text-xs space-y-3">
              <div className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                Add New Income Head
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Head Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Scrap Sale"
                    value={newHeadForm.name}
                    onChange={(e) => setNewHeadForm({ ...newHeadForm, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. OIR-SCRP"
                    value={newHeadForm.code}
                    onChange={(e) => setNewHeadForm({ ...newHeadForm, code: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono uppercase focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Classification details"
                  value={newHeadForm.description}
                  onChange={(e) => setNewHeadForm({ ...newHeadForm, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="text-right">
                <button
                  type="submit"
                  disabled={headSubmitting}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold transition disabled:opacity-50"
                >
                  {headSubmitting ? 'Creating...' : 'Create Income Head'}
                </button>
              </div>
            </form>

            {/* List Configured Heads */}
            <div className="text-xs">
              <div className="font-bold text-slate-300 mb-2">Active Income Heads in System:</div>
              <div className="space-y-2">
                {incomeHeads.map((h) => (
                  <div
                    key={h._id}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        {h.name}
                        {h.code && (
                          <span className="text-[10px] font-mono bg-slate-800 text-amber-400 px-1.5 py-0.2 rounded border border-slate-700">
                            {h.code}
                          </span>
                        )}
                      </div>
                      {h.description && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{h.description}</div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        h.isActive
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {h.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Other Income Details & Reversal (Section 10 & 18) */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedRecord(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <FileSpreadsheet className="text-amber-400" size={20} />
              <h2 className="text-lg font-bold text-white">Other Income Receipt Details</h2>
            </div>

            <div className="space-y-4 text-xs">
              {/* Receipt & Voucher Meta */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div>
                  <div className="text-slate-400">Receipt Number</div>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {selectedRecord.receiptNumber}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Voucher Number (V.N)</div>
                  <div className="font-mono font-bold text-amber-300 mt-0.5">
                    {selectedRecord.voucherNo || selectedRecord.receiptNumber}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Receipt Date</div>
                  <div className="font-mono text-white mt-0.5">
                    {formatDate(selectedRecord.receiptDate)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Status</div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${
                      selectedRecord.status === 'POSTED'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                        : selectedRecord.status === 'DRAFT'
                        ? 'bg-slate-800 text-slate-400 border-slate-700'
                        : 'bg-red-950 text-red-400 border-red-800/60'
                    }`}
                  >
                    {selectedRecord.status}
                  </span>
                </div>
              </div>

              {/* Accounting Entry Breakdown (Debit vs Credit) */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-slate-400 font-bold uppercase text-[11px] mb-2 flex items-center gap-1.5">
                  <Landmark size={14} className="text-sky-400" />
                  Double-Entry Ledger Effect
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-sky-400 font-bold block">DEBIT (Account Dr.)</span>
                    <span className="text-white font-medium">
                      {selectedRecord.receivingAccountId?.name || 'Receiving Account'}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Asset Balance Increased (+)
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-bold block">CREDIT (Account Cr.)</span>
                    <span className="text-white font-medium">
                      {selectedRecord.headName || selectedRecord.incomeHeadId?.name || 'Other Income Head'}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Revenue Head / Clearing
                    </span>
                  </div>
                </div>
              </div>

              {/* Inflow Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-slate-400">Income Head</div>
                  <div className="font-bold text-white mt-0.5">
                    {selectedRecord.headName || selectedRecord.incomeHeadId?.name}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Amount</div>
                  <div className="font-mono font-black text-amber-400 text-base mt-0.5">
                    {formatPKR(selectedRecord.amount)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Received From</div>
                  <div className="text-slate-200 mt-0.5">{selectedRecord.receivedFrom || '—'}</div>
                </div>
                <div>
                  <div className="text-slate-400">Reference Number</div>
                  <div className="font-mono text-slate-200 mt-0.5">
                    {selectedRecord.referenceNumber || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Linked Property</div>
                  <div className="text-slate-200 mt-0.5">
                    {selectedRecord.propertyId?.plazaName || 'General Company (No Property)'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Recorded By</div>
                  <div className="text-slate-200 mt-0.5">
                    {selectedRecord.createdBy?.name || selectedRecord.checkedBy || 'Auditor'}
                  </div>
                </div>
              </div>

              {/* Transaction Detail */}
              <div>
                <div className="text-slate-400 font-medium">Transaction Detail / Narration:</div>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-slate-200 mt-1">
                  {selectedRecord.transactionDetail}
                </div>
              </div>

              {/* Description */}
              {selectedRecord.description && (
                <div>
                  <div className="text-slate-400 font-medium">Additional Description:</div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-slate-300 mt-1">
                    {selectedRecord.description}
                  </div>
                </div>
              )}

              {/* Reversal Information if Reversed */}
              {selectedRecord.status === 'REVERSED' && (
                <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-lg text-xs text-red-200">
                  <div className="font-bold flex items-center gap-1.5 text-red-300">
                    <RotateCcw size={14} />
                    This transaction has been reversed
                  </div>
                  <div className="mt-1 text-slate-300">
                    Reason: {selectedRecord.reversalReason || 'Reversed by admin'}
                  </div>
                </div>
              )}

              {/* Admin Reversal Action (Section 18 & 20) */}
              {userIsAdmin && selectedRecord.status === 'POSTED' && (
                <div className="pt-3 border-t border-slate-800">
                  {!showReversalPrompt ? (
                    <button
                      type="button"
                      onClick={() => setShowReversalPrompt(true)}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-950 hover:bg-red-900 text-red-300 border border-red-800/80 transition flex items-center gap-1.5"
                    >
                      <RotateCcw size={14} />
                      Reverse Other Income Receipt
                    </button>
                  ) : (
                    <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg space-y-2">
                      <div className="font-bold text-red-200 text-xs">
                        Confirm Non-Destructive Reversal:
                      </div>
                      <p className="text-[11px] text-slate-300">
                        This will mark the receipt and central voucher as REVERSED and restore the
                        receiving account balance by deducting {formatPKR(selectedRecord.amount)}.
                      </p>
                      <input
                        type="text"
                        placeholder="State reason for reversal (required)"
                        value={reversalReason}
                        onChange={(e) => setReversalReason(e.target.value)}
                        className="w-full bg-slate-950 border border-red-900 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                      />
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowReversalPrompt(false)}
                          className="px-3 py-1 rounded text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={reversing || !reversalReason.trim()}
                          onClick={() => handleReverse(selectedRecord._id)}
                          className="px-3 py-1 rounded text-xs bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50"
                        >
                          {reversing ? 'Reversing...' : 'Confirm Reversal'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OtherIncomePage;
