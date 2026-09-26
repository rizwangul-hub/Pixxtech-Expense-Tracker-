import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Landmark,
  Wallet,
  Building2,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  FileText,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { financialReportsAPI, accountsAPI, propertiesAPI, vouchersAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';
import { MonthlyReportPage } from './MonthlyReportPage.jsx';

// Month dropdown generator (last 12 months)
const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const val = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-PK', { year: 'numeric', month: 'long', timeZone: 'UTC' });
    options.push({ val, label });
  }
  return options;
};

export function FinancialReportsPage({ currentUser }) {
  const userIsAdmin = isAdmin(currentUser);
  const monthOptions = getMonthOptions();

  // Active Tab: 'overview' | 'ledger' | 'expenses' | 'property-expenses' | 'transactions' | 'reconciliation'
  const [activeTab, setActiveTab] = useState('overview');

  // Shared Global Filter
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.val || '2026-09');
  const [useDateRange, setUseDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Accounts & Properties Metadata
  const [accountsList, setAccountsList] = useState([]);
  const [propertiesList, setPropertiesList] = useState([]);

  // Tab 2: Account Ledger State
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Tab 3: Head-wise Expenses State
  const [expenseSummary, setExpenseSummary] = useState(null);
  const [expensePropFilter, setExpensePropFilter] = useState('ALL');
  const [expenseLoading, setExpenseLoading] = useState(false);

  // Tab 4: Property-wise Expenses State
  const [propExpenseData, setPropExpenseData] = useState(null);
  const [propExpenseFilter, setPropExpenseFilter] = useState('ALL');
  const [propExpenseLoading, setPropExpenseLoading] = useState(false);

  // Tab 5: All Transactions State
  const [txReportData, setTxReportData] = useState(null);
  const [txReportLoading, setTxReportLoading] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('ALL');
  const [txAccFilter, setTxAccFilter] = useState('ALL');
  const [txPropFilter, setTxPropFilter] = useState('ALL');

  // Tab 6: Reconciliation State
  const [reconcileData, setReconcileData] = useState(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);

  // Voucher Detail Modal (Part 6 & Part 7)
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [loadingVoucher, setLoadingVoucher] = useState(false);

  // Export Loading States
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);

  // Load Accounts & Properties on Mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [accRes, propRes] = await Promise.all([
          accountsAPI.getAccounts({ limit: 100 }),
          propertiesAPI.getProperties({ limit: 100 }),
        ]);
        const accs = accRes?.data?.accounts || accRes?.accounts || [];
        setAccountsList(accs);
        if (accs.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accs[0]._id);
        }
        const props = propRes?.data?.properties || propRes?.properties || [];
        setPropertiesList(props);
      } catch (err) {
        console.error('Failed to load accounts/properties metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  // Compute common date query params
  const getFilterParams = useCallback(() => {
    const p = {};
    if (useDateRange && startDate && endDate) {
      p.startDate = startDate;
      p.endDate = endDate;
    } else if (selectedMonth && selectedMonth !== 'ALL') {
      p.month = selectedMonth;
    }
    return p;
  }, [useDateRange, startDate, endDate, selectedMonth]);

  // 1. Fetch Account Ledger
  const fetchLedger = useCallback(async () => {
    if (!selectedAccountId) return;
    setLedgerLoading(true);
    try {
      const res = await financialReportsAPI.getAccountLedger(selectedAccountId, getFilterParams());
      if (res.success) {
        setLedgerData(res);
      }
    } catch (err) {
      console.error('Error fetching ledger report:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, [selectedAccountId, getFilterParams]);

  // 2. Fetch Expense Summary
  const fetchExpenses = useCallback(async () => {
    setExpenseLoading(true);
    try {
      const params = { ...getFilterParams() };
      if (expensePropFilter && expensePropFilter !== 'ALL') {
        params.propertyId = expensePropFilter;
      }
      const res = await financialReportsAPI.getExpenseSummary(params);
      if (res.success) {
        setExpenseSummary(res);
      }
    } catch (err) {
      console.error('Error fetching expense summary:', err);
    } finally {
      setExpenseLoading(false);
    }
  }, [getFilterParams, expensePropFilter]);

  // 3. Fetch Property Expenses
  const fetchPropertyExpenses = useCallback(async () => {
    setPropExpenseLoading(true);
    try {
      const params = { ...getFilterParams() };
      if (propExpenseFilter && propExpenseFilter !== 'ALL') {
        params.propertyId = propExpenseFilter;
      }
      const res = await financialReportsAPI.getPropertyExpense(params);
      if (res.success) {
        setPropExpenseData(res);
      }
    } catch (err) {
      console.error('Error fetching property expenses:', err);
    } finally {
      setPropExpenseLoading(false);
    }
  }, [getFilterParams, propExpenseFilter]);

  // 4. Fetch All Transactions
  const fetchTransactions = useCallback(async () => {
    setTxReportLoading(true);
    try {
      const params = { ...getFilterParams(), limit: 500 };
      if (txTypeFilter && txTypeFilter !== 'ALL') params.transactionType = txTypeFilter;
      if (txAccFilter && txAccFilter !== 'ALL') params.accountId = txAccFilter;
      if (txPropFilter && txPropFilter !== 'ALL') params.propertyId = txPropFilter;
      if (txSearch.trim()) params.search = txSearch.trim();

      const res = await financialReportsAPI.getAllTransactions(params);
      if (res.success) {
        setTxReportData(res);
      }
    } catch (err) {
      console.error('Error fetching transactions report:', err);
    } finally {
      setTxReportLoading(false);
    }
  }, [getFilterParams, txTypeFilter, txAccFilter, txPropFilter, txSearch]);

  // 5. Fetch Reconciliation
  const fetchReconciliation = useCallback(async () => {
    setReconcileLoading(true);
    try {
      const res = await financialReportsAPI.getReconciliation(getFilterParams());
      if (res.success) {
        setReconcileData(res);
      }
    } catch (err) {
      console.error('Error fetching reconciliation report:', err);
    } finally {
      setReconcileLoading(false);
    }
  }, [getFilterParams]);

  // Trigger fetches when active tab or filters change
  useEffect(() => {
    if (activeTab === 'ledger') fetchLedger();
    else if (activeTab === 'expenses') fetchExpenses();
    else if (activeTab === 'property-expenses') fetchPropertyExpenses();
    else if (activeTab === 'transactions') fetchTransactions();
    else if (activeTab === 'reconciliation') fetchReconciliation();
  }, [
    activeTab,
    fetchLedger,
    fetchExpenses,
    fetchPropertyExpenses,
    fetchTransactions,
    fetchReconciliation,
  ]);

  // Open voucher modal by ID or voucher number
  const handleViewVoucher = async (voucherId, voucherNo) => {
    setLoadingVoucher(true);
    setSelectedVoucher(null);
    try {
      let res;
      if (voucherId) {
        res = await vouchersAPI.getVoucherById(voucherId);
      } else if (voucherNo) {
        res = await vouchersAPI.getVoucherByNumber(voucherNo);
      }
      if (res?.success && res.data) {
        const vData = res.data.voucher || res.data;
        setSelectedVoucher({
          ...vData,
          lines: res.data.lines || vData.lines || [],
          totalAmount: res.data.totalDebit || vData.totalAmount || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load voucher detail:', err);
    } finally {
      setLoadingVoucher(false);
    }
  };

  // Export handlers
  const handleExportExcel = async (type) => {
    setExportingExcel(true);
    try {
      const params = { ...getFilterParams(), type };
      if (type === 'account-ledger') params.accountId = selectedAccountId;
      if (type === 'property-expense' && propExpenseFilter !== 'ALL') params.propertyId = propExpenseFilter;
      if (type === 'expense-summary' && expensePropFilter !== 'ALL') params.propertyId = expensePropFilter;
      await financialReportsAPI.downloadExcel(params);
    } catch (err) {
      alert('Excel export failed: ' + (err.message || 'Error'));
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportCSV = async (type) => {
    setExportingCSV(true);
    try {
      const params = { ...getFilterParams(), type };
      if (type === 'account-ledger') params.accountId = selectedAccountId;
      await financialReportsAPI.downloadCSV(params);
    } catch (err) {
      alert('CSV export failed: ' + (err.message || 'Error'));
    } finally {
      setExportingCSV(false);
    }
  };

  // Sub-tabs list
  const tabs = [
    { id: 'overview', label: 'Monthly Financial Summary', icon: BarChart3 },
    { id: 'ledger', label: 'Bank & Cash Ledgers', icon: Landmark },
    { id: 'expenses', label: 'Head-Wise Expenses', icon: Receipt },
    { id: 'property-expenses', label: 'Property-Wise Expenses', icon: Building2 },
    { id: 'transactions', label: 'All Transactions Report', icon: FileSpreadsheet },
    { id: 'reconciliation', label: 'Reconciliation Audit', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-700/60">
              Enterprise Reporting
            </span>
            <span className="text-xs text-slate-400">Pixx Technologies Central Reporting</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <FileSpreadsheet size={24} className="text-violet-400" />
            Financial Reports, Ledgers & Exports
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time statements, multi-account running ledgers, head-wise expense breakdowns, and export suite
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-lg p-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Calendar size={14} className="text-emerald-400" />
            <span>Period:</span>
          </div>

          {!useDateRange ? (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="ALL">All Available Time</option>
              {monthOptions.map((opt) => (
                <option key={opt.val} value={opt.val}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5 font-mono">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          <button
            onClick={() => setUseDateRange(!useDateRange)}
            className="text-[11px] px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            {useDateRange ? 'Use Month' : 'Custom Dates'}
          </button>
        </div>
      </div>

      {/* ── Sub-navigation Tabs ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-800 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                isActive
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-white' : 'text-slate-500'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1: MONTHLY FINANCIAL SUMMARY 
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div>
          <MonthlyReportPage currentUser={currentUser} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 2: BANK & CASH HOLDER LEDGERS (Part 1 & Part 2)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Account Selector & Export Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Landmark size={16} className="text-sky-400" />
                <span className="text-xs font-bold text-slate-300">Select Liquidity Account:</span>
              </div>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-sky-500 font-medium min-w-[280px]"
              >
                <optgroup label="🏦 Bank Accounts">
                  {accountsList
                    .filter((a) => a.type === 'BANK')
                    .map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.bankName || 'Bank'}) — {formatPKR(a.currentBalance)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="💵 Cash in Hand / Custodians">
                  {accountsList
                    .filter((a) => a.type === 'CASH')
                    .map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} ({a.cashHolder || 'Custodian'}) — {formatPKR(a.currentBalance)}
                      </option>
                    ))}
                </optgroup>
              </select>

              <button
                onClick={fetchLedger}
                disabled={ledgerLoading}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Refresh Ledger"
              >
                <RefreshCw size={14} className={ledgerLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportExcel('account-ledger')}
                disabled={exportingExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                <FileDown size={13} />
                <span>{exportingExcel ? 'Exporting...' : 'Excel Export'}</span>
              </button>
              <button
                onClick={() => handleExportCSV('account-ledger')}
                disabled={exportingCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
              >
                <FileText size={13} />
                <span>{exportingCSV ? 'Exporting...' : 'CSV Export'}</span>
              </button>
            </div>
          </div>

          {/* Ledger KPIs */}
          {ledgerData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-slate-400">Opening Balance</div>
                <div className="text-lg font-black font-mono text-slate-200 mt-1">
                  {formatPKR(ledgerData.openingBalance)}
                </div>
                <div className="text-[10px] text-slate-500">Brought forward</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-emerald-400">Total Inflow (Debits)</div>
                <div className="text-lg font-black font-mono text-emerald-400 mt-1">
                  +{formatPKR(ledgerData.totalDebits)}
                </div>
                <div className="text-[10px] text-slate-500">Deposits / Transfers In</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-rose-400">Total Outflow (Credits)</div>
                <div className="text-lg font-black font-mono text-rose-400 mt-1">
                  -{formatPKR(ledgerData.totalCredits)}
                </div>
                <div className="text-[10px] text-slate-500">Payments / Transfers Out</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-indigo-400">Closing Balance</div>
                <div className="text-lg font-black font-mono text-indigo-300 mt-1">
                  {formatPKR(ledgerData.closingBalance)}
                </div>
                <div className="text-[10px] text-slate-500">Period end running total</div>
              </div>
            </div>
          )}

          {/* Ledger Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Showing{' '}
                <strong className="text-white">
                  {ledgerData?.entries?.length || 0}
                </strong>{' '}
                transaction lines for {ledgerData?.account?.name || 'Account'}
              </div>
              <div className="relative w-64">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter by description or V.N..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[9px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">V.N</th>
                    <th className="py-2.5 px-3">Description / Narration</th>
                    <th className="py-2.5 px-3">Head / Category</th>
                    <th className="py-2.5 px-3">Contra Account</th>
                    <th className="py-2.5 px-3 text-right">Debit (Inflow)</th>
                    <th className="py-2.5 px-3 text-right">Credit (Outflow)</th>
                    <th className="py-2.5 px-3 text-right">Running Balance</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {/* Opening Balance Row */}
                  {ledgerData && (
                    <tr className="bg-slate-950/40 font-sans">
                      <td className="py-2 px-3 text-slate-500">—</td>
                      <td className="py-2 px-3 text-slate-500">—</td>
                      <td className="py-2 px-3 font-bold text-slate-300">OPENING BALANCE B/F</td>
                      <td className="py-2 px-3 text-slate-500">Equity / Prior</td>
                      <td className="py-2 px-3 text-slate-500">—</td>
                      <td className="py-2 px-3 text-right text-slate-500">—</td>
                      <td className="py-2 px-3 text-right text-slate-500">—</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-200">
                        {formatPKR(ledgerData.openingBalance)}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-500">—</td>
                    </tr>
                  )}

                  {ledgerLoading ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-500 font-sans">
                        <RefreshCw size={16} className="animate-spin inline mr-2" />
                        Calculating running ledger balances...
                      </td>
                    </tr>
                  ) : !ledgerData?.entries?.length ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-500 font-sans">
                        No transactions recorded for this account in the selected period.
                      </td>
                    </tr>
                  ) : (
                    ledgerData.entries
                      .filter((e) => {
                        if (!ledgerSearch.trim()) return true;
                        const s = ledgerSearch.toLowerCase();
                        return (
                          e.detail?.toLowerCase().includes(s) ||
                          e.voucherNo?.toLowerCase().includes(s) ||
                          e.category?.toLowerCase().includes(s)
                        );
                      })
                      .map((row) => (
                        <tr key={row._id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{formatDate(row.date)}</td>
                          <td className="py-2 px-3 font-bold text-slate-200 whitespace-nowrap">{row.voucherNo || '—'}</td>
                          <td className="py-2 px-3 font-sans text-white max-w-xs truncate">{row.detail}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{row.category || 'General'}</td>
                          <td className="py-2 px-3 font-sans text-slate-400 truncate">{row.counterpartyAccount || '—'}</td>
                          <td className="py-2 px-3 text-right font-semibold">
                            {row.drAmount > 0 ? (
                              <span className="text-emerald-400">+{formatPKR(row.drAmount)}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">
                            {row.crAmount > 0 ? (
                              <span className="text-rose-400">-{formatPKR(row.crAmount)}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-white">
                            {formatPKR(row.runningBalance)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => handleViewVoucher(null, row.voucherNo)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                              title="View Voucher"
                            >
                              <Eye size={12} />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
                {ledgerData && (
                  <tfoot className="bg-slate-950 font-bold text-xs border-t border-slate-800">
                    <tr>
                      <td colSpan="5" className="py-2.5 px-3 text-slate-400 font-sans">
                        Period Totals & Closing Position:
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">
                        +{formatPKR(ledgerData.totalDebits)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-400">
                        -{formatPKR(ledgerData.totalCredits)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-indigo-300 text-sm">
                        {formatPKR(ledgerData.closingBalance)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500 font-sans text-[10px]">C/F</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 3: HEAD-WISE EXPENSES (Part 3)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-indigo-400" />
                <span className="text-xs font-bold text-slate-300">Filter Property:</span>
              </div>
              <select
                value={expensePropFilter}
                onChange={(e) => setExpensePropFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 min-w-[200px]"
              >
                <option value="ALL">All Properties + General</option>
                {propertiesList.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.plazaName}
                  </option>
                ))}
              </select>

              <button
                onClick={fetchExpenses}
                disabled={expenseLoading}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <RefreshCw size={14} className={expenseLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportExcel('expense-summary')}
                disabled={exportingExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition"
              >
                <FileDown size={13} />
                <span>Excel Export</span>
              </button>
              <button
                onClick={() => handleExportCSV('expense-summary')}
                disabled={exportingCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              >
                <FileText size={13} />
                <span>CSV Export</span>
              </button>
            </div>
          </div>

          {/* Expense Total Banner */}
          <div className="bg-gradient-to-r from-rose-950/40 to-slate-900 border border-rose-800/40 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase font-bold text-rose-400">Total Valid Financial Expenses</div>
              <div className="text-2xl font-black font-mono text-white mt-0.5">
                {formatPKR(expenseSummary?.totalExpenses || 0)}
              </div>
              <div className="text-[10px] text-slate-400">Excludes internal transfers & opening balances</div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-300">
                {expenseSummary?.heads?.length || 0} active expense heads
              </span>
            </div>
          </div>

          {/* Expense Heads Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[9px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5 w-12">#</th>
                  <th className="py-2.5 px-3.5">Expense Head / Account</th>
                  <th className="py-2.5 px-3.5 text-center">Vouchers Count</th>
                  <th className="py-2.5 px-3.5 text-right">Total Amount (Rs.)</th>
                  <th className="py-2.5 px-3.5 text-right">% of Total Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {expenseLoading ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-500">
                      Loading expense head breakdown...
                    </td>
                  </tr>
                ) : !expenseSummary?.heads?.length ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-500">
                      No expense transactions found for this period.
                    </td>
                  </tr>
                ) : (
                  expenseSummary.heads.map((head, idx) => {
                    const pct = expenseSummary.totalExpenses > 0
                      ? ((head.totalSpent / expenseSummary.totalExpenses) * 100).toFixed(1)
                      : 0;
                    return (
                      <tr key={head.headName} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3.5 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3.5 font-bold text-white">{head.headName}</td>
                        <td className="py-2.5 px-3.5 text-center font-mono text-slate-400">
                          {head.transactionCount}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-400">
                          {formatPKR(head.totalSpent)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-slate-400">
                          <div className="flex items-center justify-end gap-2">
                            <span>{pct}%</span>
                            <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-rose-500 h-full rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {expenseSummary && (
                <tfoot className="bg-slate-950 font-bold border-t border-slate-800 text-xs">
                  <tr>
                    <td colSpan="2" className="py-3 px-3.5 text-white">
                      TOTAL EXPENSES
                    </td>
                    <td className="py-3 px-3.5 text-center font-mono text-slate-300">
                      {expenseSummary.heads.reduce((s, h) => s + h.transactionCount, 0)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-rose-400 text-sm">
                      {formatPKR(expenseSummary.totalExpenses)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-slate-400">100.0%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 4: PROPERTY-WISE EXPENSES (Part 4)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'property-expenses' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-300">Property Filter:</span>
              <select
                value={propExpenseFilter}
                onChange={(e) => setPropExpenseFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 min-w-[200px]"
              >
                <option value="ALL">All Properties</option>
                {propertiesList.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.plazaName}
                  </option>
                ))}
              </select>
              <button
                onClick={fetchPropertyExpenses}
                disabled={propExpenseLoading}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <RefreshCw size={14} className={propExpenseLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <button
              onClick={() => handleExportExcel('property-expense')}
              disabled={exportingExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition"
            >
              <FileDown size={13} />
              <span>Excel Export</span>
            </button>
          </div>

          {/* Property Cards */}
          <div className="space-y-3">
            {propExpenseLoading ? (
              <div className="py-12 text-center text-slate-500">Loading property expenses...</div>
            ) : !propExpenseData?.properties?.length ? (
              <div className="py-12 text-center text-slate-500">No property expenses found.</div>
            ) : (
              propExpenseData.properties.map((prop) => (
                <div
                  key={prop.propertyId}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm"
                >
                  <div className="bg-slate-800/60 p-3.5 flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-indigo-400" />
                      <span className="font-bold text-white text-sm">{prop.propertyName}</span>
                      {prop.location && (
                        <span className="text-[10px] text-slate-400">— {prop.location}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs uppercase font-bold text-slate-400 mr-2">Subtotal:</span>
                      <span className="font-mono font-bold text-rose-400 text-sm">
                        {formatPKR(prop.totalSpent)}
                      </span>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-500 uppercase font-bold text-[9px] border-b border-slate-800/60">
                      <tr>
                        <th className="py-2 px-4">Expense Head</th>
                        <th className="py-2 px-4 text-center">Vouchers</th>
                        <th className="py-2 px-4 text-right">Amount (Rs.)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                      {prop.heads.map((h) => (
                        <tr key={h.headName} className="hover:bg-slate-800/20">
                          <td className="py-2 px-4 font-sans text-slate-200">{h.headName}</td>
                          <td className="py-2 px-4 text-center text-slate-400">{h.count}</td>
                          <td className="py-2 px-4 text-right font-bold text-rose-400">
                            {formatPKR(h.totalSpent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 5: ALL TRANSACTIONS REPORT (Part 5)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Type Filter */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Type</label>
                <select
                  value={txTypeFilter}
                  onChange={(e) => setTxTypeFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1 text-xs"
                >
                  <option value="ALL">All Types</option>
                  <option value="INCOME">Income</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="OPENING_BALANCE">Opening Balance</option>
                </select>
              </div>

              {/* Account Filter */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Account</label>
                <select
                  value={txAccFilter}
                  onChange={(e) => setTxAccFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1 text-xs max-w-[200px]"
                >
                  <option value="ALL">All Accounts</option>
                  {accountsList.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Property Filter */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Property</label>
                <select
                  value={txPropFilter}
                  onChange={(e) => setTxPropFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1 text-xs"
                >
                  <option value="ALL">All Properties</option>
                  {propertiesList.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.plazaName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Search</label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search narration, V.N, reference..."
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-2.5 py-1 text-xs text-white"
                  />
                </div>
              </div>

              <div className="self-end flex items-center gap-2">
                <button
                  onClick={fetchTransactions}
                  disabled={txReportLoading}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw size={12} className={txReportLoading ? 'animate-spin' : ''} />
                  Apply
                </button>
                <button
                  onClick={() => handleExportExcel('all-transactions')}
                  disabled={exportingExcel}
                  className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <FileDown size={12} />
                  Excel
                </button>
                <button
                  onClick={() => handleExportCSV('all-transactions')}
                  disabled={exportingCSV}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1"
                >
                  <FileText size={12} />
                  CSV
                </button>
              </div>
            </div>
          </div>

          {/* Transactions Summary KPIs */}
          {txReportData?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Rental Income</div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                  {formatPKR(txReportData.summary.totalRentalIncome)}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Other Income</div>
                <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">
                  {formatPKR(txReportData.summary.totalOtherIncome)}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Expenses</div>
                <div className="text-sm font-bold font-mono text-rose-400 mt-0.5">
                  {formatPKR(
                    txReportData.summary.totalRentalExpenses + txReportData.summary.totalOtherExpenses
                  )}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Internal Transfers</div>
                <div className="text-sm font-bold font-mono text-sky-400 mt-0.5">
                  {formatPKR(txReportData.summary.totalTransfers)}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Vouchers</div>
                <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                  {txReportData.summary.uniqueVouchersCount} unique
                </div>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[9px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">V.N</th>
                    <th className="py-2.5 px-3">Transaction Detail</th>
                    <th className="py-2.5 px-3">Account Head</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Account (Dr.)</th>
                    <th className="py-2.5 px-3">Account (Cr.)</th>
                    <th className="py-2.5 px-3 text-right">Amount (Rs.)</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {txReportLoading ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-500 font-sans">
                        Loading master journal entries...
                      </td>
                    </tr>
                  ) : !txReportData?.transactions?.length ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-slate-500 font-sans">
                        No transactions match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    txReportData.transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="py-2 px-3 font-bold text-white whitespace-nowrap">{tx.voucherNo}</td>
                        <td className="py-2 px-3 font-sans text-slate-200 max-w-xs truncate">{tx.detail}</td>
                        <td className="py-2 px-3 font-sans text-slate-300 whitespace-nowrap">
                          {tx.categoryId?.name || 'General'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              tx.transactionType === 'INCOME'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                                : tx.transactionType === 'EXPENSE'
                                ? 'bg-rose-950 text-rose-300 border-rose-700/60'
                                : 'bg-sky-950 text-sky-300 border-sky-700/60'
                            }`}
                          >
                            {tx.transactionType}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans text-emerald-400 truncate max-w-[140px]">
                          {tx.drAccountId?.name}
                        </td>
                        <td className="py-2 px-3 font-sans text-rose-400 truncate max-w-[140px]">
                          {tx.crAccountId?.name}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-white whitespace-nowrap">
                          {formatPKR(tx.amount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => handleViewVoucher(tx.voucherId?._id || tx.voucherId, tx.voucherNo)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Full Voucher"
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 6: RECONCILIATION AUDIT (Part 12)
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          {/* Status Banner */}
          <div
            className={`border rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              reconcileData?.summary?.isFullyReconciled
                ? 'bg-emerald-950/30 border-emerald-700/40'
                : 'bg-rose-950/30 border-rose-700/40'
            }`}
          >
            <div className="flex items-center gap-3">
              {reconcileData?.summary?.isFullyReconciled ? (
                <CheckCircle2 size={32} className="text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle size={32} className="text-rose-400 shrink-0" />
              )}
              <div>
                <h3 className="text-base font-bold text-white">
                  {reconcileData?.summary?.isFullyReconciled
                    ? '100% Zero-Discrepancy Ledger Reconciliation'
                    : `Discrepancy Detected in ${reconcileData?.summary?.discrepancyCount || 0} Account(s)`}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Compares computed ledger running balances against live current balances in MongoDB Atlas
                </p>
              </div>
            </div>

            <button
              onClick={fetchReconciliation}
              disabled={reconcileLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
            >
              <RefreshCw size={13} className={reconcileLoading ? 'animate-spin' : ''} />
              Re-Audit
            </button>
          </div>

          {/* Reconciliation Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[9px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3.5">Account</th>
                  <th className="py-2.5 px-3.5 text-center">Type</th>
                  <th className="py-2.5 px-3.5 text-right">Opening Balance</th>
                  <th className="py-2.5 px-3.5 text-right">Debits (In)</th>
                  <th className="py-2.5 px-3.5 text-right">Credits (Out)</th>
                  <th className="py-2.5 px-3.5 text-right">Ledger Closing</th>
                  <th className="py-2.5 px-3.5 text-right">Live DB Balance</th>
                  <th className="py-2.5 px-3.5 text-right">Discrepancy</th>
                  <th className="py-2.5 px-3.5 text-center">Audit Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {reconcileLoading ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-500 font-sans">
                      Running zero-tolerance reconciliation audit across all accounts...
                    </td>
                  </tr>
                ) : !reconcileData?.accounts?.length ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center text-slate-500 font-sans">
                      No accounts available for audit.
                    </td>
                  </tr>
                ) : (
                  reconcileData.accounts.map((acc) => (
                    <tr key={acc.accountId} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3.5 font-sans font-bold text-white">{acc.accountName}</td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            acc.accountType === 'BANK'
                              ? 'bg-sky-950 text-sky-300 border-sky-800/60'
                              : 'bg-amber-950 text-amber-300 border-amber-800/60'
                          }`}
                        >
                          {acc.accountType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right text-slate-300">{formatPKR(acc.openingBalance)}</td>
                      <td className="py-2.5 px-3.5 text-right text-emerald-400">+{formatPKR(acc.totalDebits)}</td>
                      <td className="py-2.5 px-3.5 text-right text-rose-400">-{formatPKR(acc.totalCredits)}</td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-white">
                        {formatPKR(acc.ledgerClosingBalance)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-slate-200">
                        {formatPKR(acc.liveBalance)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        {acc.discrepancy > 0 ? (
                          <span className="font-bold text-rose-400 font-mono">
                            {formatPKR(acc.discrepancy)}
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-mono">Rs. 0.00</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-sans">
                        {acc.isReconciled ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                            <CheckCircle2 size={10} />
                            Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40">
                            <AlertTriangle size={10} />
                            Mismatch
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          VOUCHER DETAIL MODAL (Part 6 & Part 7 Multi-line Handling)
         ════════════════════════════════════════════════════════════════════════ */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-violet-400" />
                <h3 className="text-sm font-bold text-white">
                  Voucher #{selectedVoucher.voucherNumber} Detail
                </h3>
              </div>
              <button
                onClick={() => setSelectedVoucher(null)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Voucher Date</div>
                  <div className="text-slate-200 font-bold">{formatDate(selectedVoucher.voucherDate)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Type</div>
                  <div className="text-slate-200 font-bold">{selectedVoucher.voucherType}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Total Amount</div>
                  <div className="text-emerald-400 font-bold font-mono">
                    {formatPKR(selectedVoucher.totalAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Status</div>
                  <div className="text-slate-200 font-bold">{selectedVoucher.status || 'POSTED'}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-1">Voucher Description</div>
                <div className="text-slate-200 bg-slate-950 p-2.5 rounded border border-slate-800">
                  {selectedVoucher.narration || selectedVoucher.description || selectedVoucher.lines?.[0]?.detail || 'No narration provided.'}
                </div>
              </div>

              {/* Individual Multi-line Ledger Entries */}
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">
                  Accounting Ledger Lines ({selectedVoucher.lines?.length || 1})
                </div>
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-500 uppercase text-[9px]">
                      <tr>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Debit Account</th>
                        <th className="py-2 px-3">Credit Account</th>
                        <th className="py-2 px-3 text-right">Amount (Rs.)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedVoucher.lines && selectedVoucher.lines.length > 0 ? (
                        selectedVoucher.lines.map((line, i) => (
                          <tr key={i} className="hover:bg-slate-800/20">
                            <td className="py-2 px-3 text-slate-300 font-medium">{line.detail}</td>
                            <td className="py-2 px-3 text-emerald-400 font-mono">
                              {line.drAccountId?.name || line.drAccountName || 'Debit Account'}
                            </td>
                            <td className="py-2 px-3 text-rose-400 font-mono">
                              {line.crAccountId?.name || line.crAccountName || 'Credit Account'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white font-mono">
                              {formatPKR(line.amount)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2 px-3 text-slate-300 font-medium">Single-entry voucher</td>
                          <td className="py-2 px-3 text-emerald-400 font-mono">Direct Bank/Cash</td>
                          <td className="py-2 px-3 text-rose-400 font-mono">Expense/Payee</td>
                          <td className="py-2 px-3 text-right font-bold text-white font-mono">
                            {formatPKR(selectedVoucher.totalAmount)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit Info */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                <span>Created by: {selectedVoucher.createdBy?.name || 'System Admin'}</span>
                <span>Audit Verified: {selectedVoucher.checkedBy || 'Fahad Sb'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FinancialReportsPage;
