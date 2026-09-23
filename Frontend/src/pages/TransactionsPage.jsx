import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Receipt,
  Eye,
  RotateCcw,
  Building,
  User,
  Hash,
  X,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Printer,
  Download,
  Paperclip,
  Image as ImageIcon,
} from 'lucide-react';
import { vouchersAPI, accountsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';
import { SingleVoucherPrintModal } from '../components/SingleVoucherPrintModal.jsx';
import { ReceiptViewerModal } from '../components/ReceiptViewerModal.jsx';
import { downloadAllReceipts } from '../utils/downloadReceipt.js';

export function TransactionsPage({ user }) {
  const userIsAdmin = isAdmin(user);

  // Filter State
  const [month, setMonth] = useState('2026-08');
  const [useDateRange, setUseDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [reportCategory, setReportCategory] = useState('ALL');
  const [drAccountId, setDrAccountId] = useState('');
  const [crAccountId, setCrAccountId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [expenseClassification, setExpenseClassification] = useState('ALL');
  const [transactionType, setTransactionType] = useState('ALL');
  const [status, setStatus] = useState('ALL');

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Data State
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Metadata for dropdowns
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [properties, setProperties] = useState([]);

  // Modal States
  const [showNewVoucherModal, setShowNewVoucherModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [printingTx, setPrintingTx] = useState(null);
  const [loadingVoucherDetail, setLoadingVoucherDetail] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState(null);

  // New Voucher Form State
  const [voucherForm, setVoucherForm] = useState({
    voucherNumber: '',
    voucherDate: new Date().toISOString().split('T')[0],
    voucherType: 'EXPENSE',
    reference: '',
    description: '',
    checkedBy: user?.name || '',
    lines: [
      {
        detail: '',
        categoryId: '',
        drAccountId: '',
        crAccountId: '',
        amount: '',
        propertyId: '',
      },
    ],
  });
  const [suggestingVn, setSuggestingVn] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Load Metadata
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [accRes, catRes, propRes] = await Promise.all([
          accountsAPI.getAccounts({ limit: 100 }),
          accountsAPI.getCategories(),
          accountsAPI.getProperties(),
        ]);
        setAccounts(accRes.data?.accounts || accRes.accounts || []);
        setCategories(catRes.data?.categories || catRes.categories || []);
        setProperties(propRes.data?.properties || propRes.properties || []);
      } catch (err) {
        console.warn('Failed to load transaction metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  // Fetch Transactions from API
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        page,
        limit,
      };

      if (useDateRange) {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      } else if (month) {
        params.month = month;
      }

      if (search.trim()) params.search = search.trim();
      if (voucherNo.trim()) params.voucherNo = voucherNo.trim();
      if (categoryId) params.categoryId = categoryId;
      if (reportCategory && reportCategory !== 'ALL') params.reportCategory = reportCategory;
      if (drAccountId) params.drAccountId = drAccountId;
      if (crAccountId) params.crAccountId = crAccountId;
      if (propertyId) params.propertyId = propertyId;
      if (expenseClassification !== 'ALL') params.expenseClassification = expenseClassification;
      if (transactionType && transactionType !== 'ALL') params.transactionType = transactionType;
      if (status && status !== 'ALL') params.status = status;

      const res = await vouchersAPI.getAllTransactions(params);
      if (res.success) {
        setTransactions(res.data?.transactions || []);
        setSummary(res.data?.summary || null);
        setPagination(res.data?.pagination || { total: 0, pages: 1, page: 1, limit });
      } else {
        setError(res.message || 'Failed to fetch transactions');
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err.response?.data?.message || err.message || 'Error fetching transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [
    page,
    limit,
    month,
    useDateRange,
    startDate,
    endDate,
    categoryId,
    reportCategory,
    drAccountId,
    crAccountId,
    propertyId,
    expenseClassification,
    transactionType,
    status,
  ]);

  // Handle Search Submission
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchTransactions();
  };

  // Reset all filters
  const resetFilters = () => {
    setSearch('');
    setVoucherNo('');
    setCategoryId('');
    setReportCategory('ALL');
    setDrAccountId('');
    setCrAccountId('');
    setPropertyId('');
    setExpenseClassification('ALL');
    setTransactionType('ALL');
    setStatus('ALL');
    setUseDateRange(false);
    setStartDate('');
    setEndDate('');
    setMonth('2026-08');
    setPage(1);
  };

  // Fetch Voucher Detail by V.N
  const openVoucherDetail = async (vNo) => {
    try {
      setLoadingVoucherDetail(true);
      const res = await vouchersAPI.getVoucherByNumber(vNo);
      if (res.success) {
        setSelectedVoucher(res.data);
      }
    } catch (err) {
      console.error('Error loading voucher detail:', err);
    } finally {
      setLoadingVoucherDetail(false);
    }
  };

  // Open New Voucher Modal and suggest next VN
  const handleOpenNewVoucher = async () => {
    setFormError(null);
    setShowNewVoucherModal(true);
    try {
      setSuggestingVn(true);
      const res = await vouchersAPI.suggestNextVoucherNo();
      if (res.success && res.data?.suggestedVoucherNo) {
        setVoucherForm((prev) => ({
          ...prev,
          voucherNumber: res.data.suggestedVoucherNo,
          voucherDate: new Date().toISOString().split('T')[0],
          lines: [
            {
              detail: '',
              categoryId: '',
              drAccountId: '',
              crAccountId: '',
              amount: '',
              propertyId: '',
            },
          ],
        }));
      }
    } catch (err) {
      console.warn('Could not auto-suggest VN:', err);
    } finally {
      setSuggestingVn(false);
    }
  };

  // Add line to new voucher
  const addLine = () => {
    setVoucherForm((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          detail: prev.description || '',
          categoryId: '',
          drAccountId: '',
          crAccountId: '',
          amount: '',
          propertyId: '',
        },
      ],
    }));
  };

  // Remove line from new voucher
  const removeLine = (idx) => {
    if (voucherForm.lines.length <= 1) return;
    setVoucherForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx),
    }));
  };

  // Update line field
  const updateLineField = (idx, field, val) => {
    setVoucherForm((prev) => {
      const newLines = [...prev.lines];
      newLines[idx] = { ...newLines[idx], [field]: val };
      return { ...prev, lines: newLines };
    });
  };

  // Calculate live double-entry totals for new voucher
  const liveTotals = useMemo(() => {
    let drSum = 0;
    let crSum = 0;
    for (const l of voucherForm.lines) {
      const amt = Number(l.amount);
      if (!isNaN(amt) && amt > 0) {
        drSum += amt;
        crSum += amt;
      }
    }
    return {
      totalDebit: drSum,
      totalCredit: crSum,
      isBalanced: drSum > 0 && Math.abs(drSum - crSum) < 0.001,
    };
  }, [voucherForm.lines]);

  // Submit New Voucher
  const handleCreateVoucherSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!voucherForm.voucherNumber.trim()) {
      setFormError('Voucher Number is required.');
      return;
    }

    if (voucherForm.lines.length === 0) {
      setFormError('At least one transaction line is required.');
      return;
    }

    for (let i = 0; i < voucherForm.lines.length; i++) {
      const line = voucherForm.lines[i];
      if (!line.detail.trim()) {
        setFormError(`Line ${i + 1}: Transaction description is required.`);
        return;
      }
      if (!line.categoryId) {
        setFormError(`Line ${i + 1}: Please select an Account Head / Category.`);
        return;
      }
      if (!line.drAccountId || !line.crAccountId) {
        setFormError(`Line ${i + 1}: Both Debit and Credit accounts are required.`);
        return;
      }
      if (line.drAccountId === line.crAccountId) {
        setFormError(`Line ${i + 1}: Debit and Credit accounts cannot be identical.`);
        return;
      }
      const amt = Number(line.amount);
      if (isNaN(amt) || amt <= 0) {
        setFormError(`Line ${i + 1}: Amount must be strictly greater than zero.`);
        return;
      }
    }

    try {
      setFormSubmitting(true);
      const res = await vouchersAPI.createVoucher(voucherForm);
      if (res.success) {
        setShowNewVoucherModal(false);
        fetchTransactions();
      } else {
        setFormError(res.message || 'Failed to post voucher.');
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to post voucher.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Reversal Action
  const handleReverseVoucher = async () => {
    if (!selectedVoucher?.voucher?._id) return;
    try {
      setReversing(true);
      const res = await vouchersAPI.reverseVoucher(selectedVoucher.voucher._id, {
        reason: reverseReason.trim() || 'Auditor manual reversal',
      });
      if (res.success) {
        setShowReverseModal(false);
        setSelectedVoucher(null);
        setReverseReason('');
        fetchTransactions();
      }
    } catch (err) {
      console.error('Error reversing voucher:', err);
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                All Transactions — Central Financial Ledger
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Double-Entry Master Journal & Central Voucher Repository
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month / Range Selector */}
          {!useDateRange ? (
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setUseDateRange(!useDateRange)}
            className="text-xs font-mono text-slate-400 hover:text-blue-400 bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-xl transition"
          >
            {useDateRange ? 'Use Month' : 'Custom Range'}
          </button>

          <button
            type="button"
            onClick={fetchTransactions}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenNewVoucher}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-blue-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Voucher</span>
          </button>
        </div>
      </div>

      {/* 2. Macro KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Filtered Line Total */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Filtered Line Total
          </span>
          <div className="text-xl font-bold text-white font-mono">
            {formatPKR(summary?.filteredLineTotal || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            <span>{pagination.total} transaction lines</span>
          </div>
        </div>

        {/* Card 2: Filtered Voucher Total (Deduplicated) */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
            Unique Vouchers Total
          </span>
          <div className="text-xl font-bold text-blue-400 font-mono">
            {formatPKR(summary?.filteredVoucherTotal || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="text-blue-400/80 font-mono font-bold">
              {summary?.uniqueVouchersCount || 0}
            </span>
            <span>distinct vouchers</span>
          </div>
        </div>

        {/* Card 3: Rental Income */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider block mb-1">
            Rental Income Total
          </span>
          <div className="text-xl font-bold text-emerald-400 font-mono">
            {formatPKR(summary?.totalRentalIncome || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Tenant rental collections</div>
        </div>

        {/* Card 4: Payments / Expenses */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-medium text-rose-400 uppercase tracking-wider block mb-1">
            Payments / Expenses
          </span>
          <div className="text-xl font-bold text-rose-400 font-mono">
            {formatPKR((summary?.totalOtherExpenses || 0) + (summary?.totalRentalExpenses || 0))}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Operational & property outflow</div>
        </div>

        {/* Card 5: Internal Transfers (Isolated) */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-medium text-purple-400 uppercase tracking-wider block mb-1">
            Internal Transfers
          </span>
          <div className="text-xl font-bold text-purple-400 font-mono">
            {formatPKR(summary?.totalTransfers || 0)}
          </div>
          <div className="text-[11px] text-purple-400/80 mt-1 font-mono">
            Zero P&L Impact (Movement)
          </div>
        </div>
      </div>

      {/* 3. Comprehensive Multi-Filter Bar */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by narration, voucher #, reference, auditor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Account Head Filter */}
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950/70 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Account Heads</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>

          {/* Report Category Filter */}
          <select
            value={reportCategory}
            onChange={(e) => {
              setReportCategory(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950/70 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Categories</option>
            <option value="Payments">Payments</option>
            <option value="Rent">Rent</option>
            <option value="Transfer">Transfer</option>
            <option value="Other Income">Other Income</option>
            <option value="Opening Balance">Opening Balance</option>
          </select>

          {/* Debit Account Filter */}
          <select
            value={drAccountId}
            onChange={(e) => {
              setDrAccountId(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950/70 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Debit (Dr.) A/C</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                Dr: {a.name} ({a.type})
              </option>
            ))}
          </select>

          {/* Credit Account Filter */}
          <select
            value={crAccountId}
            onChange={(e) => {
              setCrAccountId(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950/70 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Credit (Cr.) A/C</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                Cr: {a.name} ({a.type})
              </option>
            ))}
          </select>

          {/* Property Filter */}
          <select
            value={propertyId}
            onChange={(e) => {
              setPropertyId(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950/70 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Properties / Plazas</option>
            {properties.map((p) => (
              <option key={p._id} value={p._id}>
                {p.plazaName}
              </option>
            ))}
          </select>

          <select
            value={expenseClassification}
            onChange={(e) => {
              setExpenseClassification(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950/70 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Expense Types</option>
            <option value="GENERAL_EXPENSE">General Expense</option>
            <option value="PROPERTY_OWN_EXPENSE">Property Own Expense</option>
            <option value="UNIT_EXPENSE">Unit Expense</option>
          </select>

          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950/70 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="POSTED">POSTED</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="PENDING">PENDING</option>
            <option value="REVERSED">REVERSED</option>
          </select>

          <button
            type="submit"
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition"
          >
            Search
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-slate-400 hover:text-white px-2 py-2 transition"
          >
            Reset
          </button>
        </form>
      </div>

      {/* 4. Central Ledger Table (Exact Pixx 8 Columns) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5">Date</th>
                <th className="py-3 px-3.5">V.N</th>
                <th className="py-3 px-4 min-w-[240px]">Transaction Detail</th>
                <th className="py-3 px-3.5">Account Head</th>
                <th className="py-3 px-3.5">Category</th>
                <th className="py-3 px-3.5">Expense Type</th>
                <th className="py-3 px-3.5">Account (Dr.)</th>
                <th className="py-3 px-3.5">Account (Cr.)</th>
                <th className="py-3 px-3.5 text-right">Amount (PKR)</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>Loading central ledger transactions...</span>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-slate-500">
                    No transactions found for the selected criteria.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={tx._id}
                    className={`hover:bg-slate-800/30 transition-colors ${
                      tx.status === 'REVERSED' ? 'opacity-40 line-through' : ''
                    }`}
                  >
                    {/* 1. Date */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-400">
                      {formatDate(tx.date)}
                    </td>

                    {/* 2. V.N (Voucher Number) */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openVoucherDetail(tx.voucherNo)}
                        className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 transition"
                        title="View Full Voucher"
                      >
                        {tx.voucherNo}
                      </button>
                    </td>

                    {/* 3. Transaction Detail */}
                    <td className="py-2.5 px-4 font-medium text-slate-200">
                      <div>{tx.detail}</div>
                      {tx.propertyId?.plazaName && (
                        <div className="text-[10px] text-blue-400/80 font-mono mt-0.5 flex items-center gap-1">
                          <Building className="w-3 h-3" />
                          <span>{tx.propertyId.plazaName}</span>
                        </div>
                      )}
                      {tx.attachments && tx.attachments.length > 0 && (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSelectedReceiptTx(tx)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/60 text-[10px] font-bold transition cursor-pointer"
                            title="View attached purchase / receipt evidence image(s)"
                          >
                            <Paperclip size={10} className="text-blue-400" />
                            <span>{tx.attachments.length} {tx.attachments.length === 1 ? 'Receipt' : 'Receipts'}</span>
                            <Eye size={10} className="opacity-75" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadAllReceipts(tx.attachments, `Voucher_${tx.voucherNo}_Receipt`);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold transition cursor-pointer"
                            title="Download purchase / receipt image(s)"
                          >
                            <Download size={10} className="text-emerald-400" />
                            <span>Download</span>
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 4. Account Head */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="text-[11px] font-mono text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
                        {tx.categoryId?.name || 'Uncategorized'}
                      </span>
                    </td>

                    {/* 5. Category */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          tx.reportCategory === 'Payments'
                            ? 'bg-rose-950/40 text-rose-300 border-rose-800/40'
                            : tx.reportCategory === 'Rent'
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                            : tx.reportCategory === 'Transfer'
                            ? 'bg-purple-950/40 text-purple-300 border-purple-800/40'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {tx.reportCategory || 'Payments'}
                      </span>
                    </td>

                    {/* 6. Expense Type */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-[10px]">
                      {tx.expenseClassification === 'UNIT_EXPENSE'
                        ? 'Unit Expense'
                        : tx.expenseClassification === 'PROPERTY_OWN_EXPENSE'
                        ? 'Property Own Expense'
                        : tx.expenseClassification === 'GENERAL_EXPENSE'
                        ? 'General Expense'
                        : tx.transactionType === 'EXPENSE'
                        ? (tx.unitId ? 'Unit Expense' : tx.propertyId ? 'Property Own Expense' : 'General Expense')
                        : '—'}
                    </td>

                    {/* 6. Account (Dr.) */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                      {tx.drAccountId?.name || '—'}
                    </td>

                    {/* 7. Account (Cr.) */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                      {tx.crAccountId?.name || '—'}
                    </td>

                    {/* 8. Amount */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-right font-mono font-bold text-white">
                      {formatPKR(tx.amount)}
                    </td>

                    {/* 9. Status Pill */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-block text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          tx.status === 'VERIFIED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : tx.status === 'POSTED'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : tx.status === 'REVERSED'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span className="text-slate-500 ml-2">
              Showing {transactions.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
              {Math.min(page * limit, pagination.total)} of {pagination.total} entries
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-300 px-2">
              Page {page} of {pagination.pages || 1}
            </span>
            <button
              type="button"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Modal: Multi-Line Voucher Entry */}
      {showNewVoucherModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-400" />
                  <span>Create Central Voucher Entry</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Double-entry balanced voucher posting to the master ledger
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewVoucherModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateVoucherSubmit} className="space-y-4">
              {/* Voucher Header Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Voucher Number (V.N) *
                  </label>
                  <input
                    type="text"
                    required
                    value={voucherForm.voucherNumber}
                    onChange={(e) =>
                      setVoucherForm({ ...voucherForm, voucherNumber: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. 3067"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                  />
                  {suggestingVn && (
                    <span className="text-[10px] text-blue-400 font-mono">Suggesting...</span>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Voucher Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={voucherForm.voucherDate}
                    onChange={(e) => setVoucherForm({ ...voucherForm, voucherDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Voucher Type
                  </label>
                  <select
                    value={voucherForm.voucherType}
                    onChange={(e) => setVoucherForm({ ...voucherForm, voucherType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  >
                    <option value="EXPENSE">EXPENSE (Payments)</option>
                    <option value="RENT_RECEIPT">RENT_RECEIPT (Rental Income)</option>
                    <option value="TRANSFER">TRANSFER (Internal Funds)</option>
                    <option value="OTHER_INCOME">OTHER_INCOME</option>
                    <option value="ADJUSTMENT">ADJUSTMENT</option>
                    <option value="OPENING_BALANCE">OPENING_BALANCE</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Master Narration / Description
                  </label>
                  <input
                    type="text"
                    value={voucherForm.description}
                    onChange={(e) => setVoucherForm({ ...voucherForm, description: e.target.value })}
                    placeholder="General description for this voucher..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400 block mb-1">
                    Reference / Cheque #
                  </label>
                  <input
                    type="text"
                    value={voucherForm.reference}
                    onChange={(e) => setVoucherForm({ ...voucherForm, reference: e.target.value })}
                    placeholder="Ref or memo..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Transaction Lines Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider">
                    Voucher Transaction Lines ({voucherForm.lines.length})
                  </h4>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {voucherForm.lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>Line #{idx + 1}</span>
                        {voucherForm.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-rose-400 hover:text-rose-300 p-1"
                            title="Remove Line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            required
                            placeholder="Transaction Detail (e.g. Paid for fuel by Majid)..."
                            value={line.detail}
                            onChange={(e) => updateLineField(idx, 'detail', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            placeholder="Amount (PKR)..."
                            value={line.amount}
                            onChange={(e) => updateLineField(idx, 'amount', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-blue-500 text-right"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div>
                          <select
                            required
                            value={line.categoryId}
                            onChange={(e) => updateLineField(idx, 'categoryId', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
                          >
                            <option value="">Account Head *</option>
                            {categories.map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <select
                            required
                            value={line.drAccountId}
                            onChange={(e) => updateLineField(idx, 'drAccountId', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-emerald-300 focus:outline-none font-mono"
                          >
                            <option value="">Debit (Dr.) A/C *</option>
                            {accounts.map((a) => (
                              <option key={a._id} value={a._id}>
                                Dr: {a.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <select
                            required
                            value={line.crAccountId}
                            onChange={(e) => updateLineField(idx, 'crAccountId', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-rose-300 focus:outline-none font-mono"
                          >
                            <option value="">Credit (Cr.) A/C *</option>
                            {accounts.map((a) => (
                              <option key={a._id} value={a._id}>
                                Cr: {a.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <select
                            value={line.propertyId}
                            onChange={(e) => updateLineField(idx, 'propertyId', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 focus:outline-none"
                          >
                            <option value="">Property (Optional)</option>
                            {properties.map((p) => (
                              <option key={p._id} value={p._id}>
                                {p.plazaName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Double-Entry Balancing Summary */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 block">TOTAL DEBIT</span>
                    <span className="text-sm font-bold text-emerald-400">
                      {formatPKR(liveTotals.totalDebit)}
                    </span>
                  </div>
                  <div className="text-slate-600">=</div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">TOTAL CREDIT</span>
                    <span className="text-sm font-bold text-rose-400">
                      {formatPKR(liveTotals.totalCredit)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      liveTotals.isBalanced
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {liveTotals.isBalanced ? '✓ Double-Entry Balanced' : '✗ Unbalanced (Dr ≠ Cr)'}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewVoucherModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || !liveTotals.isBalanced}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition flex items-center gap-2"
                >
                  {formSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Posting Voucher...</span>
                    </>
                  ) : (
                    <span>Post Voucher</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Voucher Details View */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Voucher #{selectedVoucher.voucher?.voucherNumber}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        selectedVoucher.voucher?.status === 'REVERSED'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {selectedVoucher.voucher?.status}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {formatDate(selectedVoucher.voucher?.voucherDate)} •{' '}
                    {selectedVoucher.voucher?.voucherType}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Voucher Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block">TOTAL VOUCHER AMOUNT</span>
                <span className="text-sm font-bold text-white">
                  {formatPKR(selectedVoucher.totalDebit || selectedVoucher.voucher?.totalAmount)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">SOURCE MODULE</span>
                <span className="text-slate-300">
                  {selectedVoucher.voucher?.sourceModule || 'MANUAL'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">AUDITED BY</span>
                <span className="text-slate-300">{selectedVoucher.voucher?.checkedBy || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">TOTAL LINES</span>
                <span className="text-slate-300">{selectedVoucher.lines?.length || 1}</span>
              </div>
            </div>

            {/* Itemized Lines */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 font-mono uppercase tracking-wider">
                Voucher Transaction Lines
              </h4>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[10px] font-mono text-slate-400 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Narration / Detail</th>
                      <th className="py-2.5 px-3">Head</th>
                      <th className="py-2.5 px-3">Dr Account</th>
                      <th className="py-2.5 px-3">Cr Account</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {selectedVoucher.lines?.map((line, idx) => (
                      <tr key={line._id || idx}>
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                          {line.detail}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {line.categoryId?.name || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-300">
                          {line.drAccountId?.name || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-rose-300">
                          {line.crAccountId?.name || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {formatPKR(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                {selectedVoucher.isBalanced && (
                  <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Balanced Double-Entry Verified</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPrintingTx(selectedVoucher?.voucher?._id || selectedVoucher?.lines?.[0]?._id)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-md"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print A4 Voucher</span>
                </button>
                {userIsAdmin && selectedVoucher.voucher?.status !== 'REVERSED' && (
                  <button
                    type="button"
                    onClick={() => setShowReverseModal(true)}
                    className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reverse Voucher</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedVoucher(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Single Voucher Modal */}
      {printingTx && (
        <SingleVoucherPrintModal
          transactionId={printingTx._id || printingTx}
          initialData={typeof printingTx === 'object' ? printingTx : null}
          onClose={() => setPrintingTx(null)}
        />
      )}

      {/* 7. Modal: Reversal Confirmation */}
      {showReverseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">
                Reverse Voucher #{selectedVoucher?.voucher?.voucherNumber}?
              </h3>
            </div>

            <p className="text-xs text-slate-400">
              This action soft-reverses all {selectedVoucher?.lines?.length || 1} transaction lines
              and restores the original balances of both the Debit and Credit accounts.
            </p>

            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                Auditor Reversal Justification *
              </label>
              <textarea
                rows="3"
                required
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Reason for audit reversal..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReverseModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reversing || !reverseReason.trim()}
                onClick={handleReverseVoucher}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition flex items-center gap-2"
              >
                {reversing ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attached Receipt Evidence Viewer Modal */}
      {selectedReceiptTx && (
        <ReceiptViewerModal
          entry={selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
        />
      )}
    </div>
  );
}

export default TransactionsPage;
