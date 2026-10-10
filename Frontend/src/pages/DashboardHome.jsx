import React, { useState, useEffect } from 'react';
import {
  Database,
  Coins,
  CheckCircle2,
  Clock,
  Layers,
  Building2,
  ChevronLeft,
  ChevronRight,
  Users,
  Receipt,
  Landmark,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  FileSpreadsheet,
  Calendar,
  Hash,
  RefreshCw,
} from 'lucide-react';
import { formatPKR } from '../utils/formatters.js';
import {
  propertiesAPI,
  tenantsAPI,
  agreementsAPI,
  rentDueAPI,
  accountsAPI,
  rentReceivedAPI,
  vouchersAPI,
  otherIncomeAPI,
} from '../services/api.js';

const getCurrentMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const formatMonthLabel = (monthStr) => {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return monthStr || '';
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export function DashboardHome({
  user,
  onNavigateToProperties,
  onNavigateToTenants,
  onNavigateToAgreements,
  onNavigateToRentDue,
  onNavigateToRentReceived,
  onNavigateToOtherIncome,
  onNavigateToAccounts,
  onNavigateToTransfers,
  onNavigateToTransactions,
}) {
  const normalizedRole = user?.role === 'ADMIN_PUBLISHER' ? 'ADMIN' : user?.role || 'DATA_ENTRY';

  // Month Selection State (defaults to current month YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [totalEntriesCount, setTotalEntriesCount] = useState(0);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  // Live Portfolio Stats from Database (loaded once on mount)
  const [portfolioStats, setPortfolioStats] = useState(null);
  const [tenancyStats, setTenancyStats] = useState(null);
  const [agreementStats, setAgreementStats] = useState(null);
  const [liquidityStats, setLiquidityStats] = useState(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  // Dynamic Monthly Stats from Database (updated whenever selectedMonth changes)
  const [rentDueStats, setRentDueStats] = useState(null);
  const [rentReceivedStats, setRentReceivedStats] = useState(null);
  const [otherIncomeStats, setOtherIncomeStats] = useState(null);
  const [transactionStats, setTransactionStats] = useState(null);

  // Fetch static portfolio metrics once on mount
  useEffect(() => {
    let isMounted = true;
    const fetchPortfolioStats = async () => {
      try {
        const [propsRes, tenantsRes, agreementsRes, accountsRes] = await Promise.all([
          propertiesAPI.getProperties({ limit: 1 }),
          tenantsAPI.getTenants({ limit: 1 }),
          agreementsAPI.getAgreements({ limit: 1 }),
          accountsAPI.getAccounts({ limit: 1 }),
        ]);

        if (!isMounted) return;

        if (propsRes?.success && propsRes.data?.summary) {
          setPortfolioStats(propsRes.data.summary);
        }
        if (tenantsRes?.success && tenantsRes.data?.summary) {
          setTenancyStats(tenantsRes.data.summary);
        }
        if (agreementsRes?.success && agreementsRes.data?.summary) {
          setAgreementStats(agreementsRes.data.summary);
        }
        if (accountsRes?.success && accountsRes.data?.summary) {
          setLiquidityStats(accountsRes.data.summary);
        }
      } catch (err) {
        console.error('Failed to load dashboard portfolio stats:', err);
      } finally {
        if (isMounted) setLoadingPortfolio(false);
      }
    };

    fetchPortfolioStats();
    return () => { isMounted = false; };
  }, []);

  // Fetch monthly activity, transaction entries count, and breakdown for selectedMonth
  useEffect(() => {
    let isMounted = true;
    const fetchMonthlyData = async () => {
      setMonthlyLoading(true);
      try {
        const [rentDueRes, rentReceivedRes, otherIncomeRes, txRes] = await Promise.all([
          rentDueAPI.getRentDueSummary({ month: selectedMonth }),
          rentReceivedAPI.getSummary({ month: selectedMonth }),
          otherIncomeAPI.getMonthlySummary({ month: selectedMonth }),
          vouchersAPI.getAllTransactions({ month: selectedMonth, limit: 1 }),
        ]);

        if (!isMounted) return;

        if (rentDueRes?.success && rentDueRes.data) {
          setRentDueStats(rentDueRes.data);
        }
        if (rentReceivedRes?.success && rentReceivedRes.data) {
          setRentReceivedStats(rentReceivedRes.data);
        }
        if (otherIncomeRes?.success && otherIncomeRes.data) {
          setOtherIncomeStats(otherIncomeRes.data);
        }
        if (txRes?.success && txRes.data) {
          setTotalEntriesCount(txRes.data.pagination?.total ?? 0);
          setTransactionStats(txRes.data.summary ?? null);
        }
      } catch (err) {
        console.error('Failed to load monthly dashboard stats:', err);
      } finally {
        if (isMounted) setMonthlyLoading(false);
      }
    };

    fetchMonthlyData();
    return () => { isMounted = false; };
  }, [selectedMonth]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 2, 1));
    const newMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(Date.UTC(y, m, 1));
    const newMonth = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const handleResetToCurrentMonth = () => {
    setSelectedMonth(getCurrentMonth());
  };

  return (
    <div className="space-y-6">
      {/* Monthly Activity & Total Entries Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Monthly Activity & Total Entries
                  </h2>
                  {selectedMonth === getCurrentMonth() ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Current Month
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      Historical Month
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showing all transactions and ledger activity for{' '}
                  <span className="text-indigo-600 font-semibold">{formatMonthLabel(selectedMonth)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Month Selector Controls */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Previous Month"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="relative flex items-center">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                className="bg-white text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
              />
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              title="Next Month"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition"
            >
              <ChevronRight size={16} />
            </button>

            {selectedMonth !== getCurrentMonth() && (
              <button
                type="button"
                onClick={handleResetToCurrentMonth}
                title="Reset to current month"
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-lg transition ml-1"
              >
                <RefreshCw size={11} />
                <span>Current</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Total Entries (Featured) */}
          <div className="bg-gradient-to-br from-indigo-50/70 to-indigo-100/40 border border-indigo-200 rounded-xl p-3.5 relative overflow-hidden group shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider">
                Total Entries
              </span>
              <div className="p-1 bg-indigo-100 text-indigo-700 rounded">
                <Hash size={14} />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-900 mt-1.5 tracking-tight font-mono">
              {monthlyLoading ? (
                <span className="text-slate-400 text-2xl">...</span>
              ) : (
                totalEntriesCount
              )}
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-slate-600">
              <span>Transactions in {formatMonthLabel(selectedMonth).split(' ')[0]}</span>
              {onNavigateToTransactions && (
                <button
                  type="button"
                  onClick={onNavigateToTransactions}
                  className="text-indigo-600 hover:text-indigo-800 font-bold underline flex items-center gap-0.5"
                >
                  View <ChevronRight size={10} />
                </button>
              )}
            </div>
          </div>

          {/* Card 2: Unique Vouchers */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Unique Vouchers</span>
              <div className="p-1 bg-slate-200/80 text-slate-600 rounded">
                <FileSpreadsheet size={14} />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1.5 tracking-tight font-mono">
              {monthlyLoading ? (
                <span className="text-slate-400 text-xl">...</span>
              ) : (
                transactionStats?.uniqueVouchersCount ?? 0
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Multi-line journal vouchers
            </div>
          </div>

          {/* Card 3: Monthly Financial Volume */}
          <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-800">Turnover Volume</span>
              <div className="p-1 bg-sky-100 text-sky-700 rounded">
                <TrendingUp size={14} />
              </div>
            </div>
            <div className="text-lg font-black text-sky-900 mt-2 font-mono truncate">
              {monthlyLoading ? (
                <span className="text-slate-400 text-sm">...</span>
              ) : (
                formatPKR(transactionStats?.filteredLineTotal ?? 0)
              )}
            </div>
            <div className="text-[11px] text-sky-700/80 mt-1">
              Total monthly line volume
            </div>
          </div>

          {/* Card 4: Monthly Rent & Income vs Expenses */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="text-xs font-bold text-slate-700">Ledger Activity</div>
              <div className="mt-1.5 space-y-0.5 text-[11px] font-mono">
                <div className="flex justify-between text-emerald-700">
                  <span className="text-slate-500 font-sans">Rent Inflow:</span>
                  <span className="font-bold">{formatPKR(transactionStats?.totalRentalIncome ?? 0)}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span className="text-slate-500 font-sans">Expenses:</span>
                  <span className="font-bold">{formatPKR(transactionStats?.totalRentalExpenses ?? 0)}</span>
                </div>
              </div>
            </div>
            {onNavigateToTransactions && (
              <button
                type="button"
                onClick={onNavigateToTransactions}
                className="mt-2 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 py-1.5 px-2 rounded-lg transition text-center flex items-center justify-center gap-1 shadow-xs"
              >
                <span>All {totalEntriesCount} Entries</span>
                <ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Properties Portfolio Metrics */}
      {portfolioStats && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
          <div className="section-bar">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-white" />
              <span className="section-title">Live Properties Portfolio & Occupancy</span>
              <span className="section-count-badge">{portfolioStats.totalProperties} Props</span>
            </div>
            {onNavigateToProperties && (
              <button
                onClick={onNavigateToProperties}
                className="text-xs font-bold text-white hover:underline flex items-center gap-1 transition text-white-keep"
              >
                Open Full Directory <ChevronRight size={14} className="text-white-keep" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <div className="text-xs text-slate-600 font-bold">Properties</div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">{portfolioStats.totalProperties}</div>
              <div className="text-[11px] text-slate-500 font-medium">Commercial & Plazas</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <div className="text-xs text-slate-600 font-bold">Total Units</div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">{portfolioStats.totalUnits}</div>
              <div className="text-[11px] text-slate-500 font-medium">Individual spaces</div>
            </div>
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5">
              <div className="text-xs text-emerald-800 font-bold">Occupied</div>
              <div className="text-2xl font-black text-emerald-700 mt-0.5">{portfolioStats.occupiedUnits}</div>
              <div className="text-[11px] text-emerald-600 font-medium">Let to tenants</div>
            </div>
            <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3.5">
              <div className="text-xs text-amber-800 font-bold">Vacant</div>
              <div className="text-2xl font-black text-amber-700 mt-0.5">{portfolioStats.vacantUnits}</div>
              <div className="text-[11px] text-amber-600 font-medium">Available spaces</div>
            </div>
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3.5 col-span-2 sm:col-span-1">
              <div className="text-xs text-blue-800 font-bold">Occupancy Rate</div>
              <div className="text-2xl font-black text-blue-700 mt-0.5">{portfolioStats.occupancyRate}%</div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-1.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${Math.min(100, portfolioStats.occupancyRate)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

 {/* Live Tenancy, Rental Agreements & Billing Engine () */}
 {(tenancyStats || agreementStats || rentDueStats) && (
 <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
 <div>
 <div className="flex items-center gap-2">
 <Users size={16} className="text-emerald-400" />
 <h2 className="text-sm font-bold text-white uppercase tracking-wider">
 Tenancy, Rental Agreements & Rent Due
 </h2>
 <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950 px-1.5 py-0.2 rounded border border-indigo-800/50">
 Active Foundation
 </span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">
 Real database counts for tenants, legal contracts, agreed monthly rent roll, and expected billing.
 </p>
 </div>

 <div className="flex items-center gap-3">
 {onNavigateToTenants && (
 <button
 onClick={onNavigateToTenants}
 className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
 >
 Tenants <ChevronRight size={14} />
 </button>
 )}
 {onNavigateToAgreements && (
 <button
 onClick={onNavigateToAgreements}
 className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
 >
 Agreements <ChevronRight size={14} />
 </button>
 )}
 {onNavigateToRentDue && (
 <button
 onClick={onNavigateToRentDue}
 className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
 >
 Rent Due <ChevronRight size={14} />
 </button>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-slate-400 font-medium">Active Tenancies</div>
 <div className="text-xl font-black text-emerald-400 mt-0.5">
 {tenancyStats?.tenantsWithActiveLease ?? 0}
 </div>
 <div className="text-[10px] text-slate-500">
 Of {tenancyStats?.totalTenants ?? 0} total registered
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-indigo-400 font-medium">Active Agreements</div>
 <div className="text-xl font-black text-indigo-400 mt-0.5">
 {agreementStats?.activeAgreements ?? 0}
 </div>
 <div className="text-[10px] text-indigo-500/70">
 Of {agreementStats?.totalAgreements ?? 0} contracts
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-emerald-400 font-medium">Agreed Monthly Rent</div>
 <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
 {formatPKR(agreementStats?.totalMonthlyRentRoll ?? 0)}
 </div>
 <div className="text-[10px] text-slate-500">Active monthly rent roll</div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-amber-400 font-medium">{formatMonthLabel(selectedMonth)} Expected</div>
 <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
 {formatPKR(rentDueStats?.totalExpectedRent ?? 0)}
 </div>
 <div className="text-[10px] text-amber-500/70">
 {rentDueStats?.totalRecords ?? 0} records generated
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Live Rent Received & Rental Income () */}
 {rentReceivedStats && (
 <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
 <div>
 <div className="flex items-center gap-2">
 <TrendingUp size={16} className="text-emerald-400" />
 <h2 className="text-sm font-bold text-white uppercase tracking-wider">
 Rent Received & Rental Income
 </h2>
 <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800/50">
 Active Inflow Core
 </span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">
 Real database tenant rental collections, 3-tier allocations, advance surplus, and net outstanding receivables for {formatMonthLabel(selectedMonth)}.
 </p>
 </div>

 <div className="flex items-center gap-3">
 {onNavigateToRentReceived && (
 <button
 onClick={onNavigateToRentReceived}
 className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
 >
 Rent Receipts <ChevronRight size={14} />
 </button>
 )}
 {onNavigateToRentDue && (
 <button
 onClick={onNavigateToRentDue}
 className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
 >
 Rent Due <ChevronRight size={14} />
 </button>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-emerald-400 font-medium">Total Rent Collected</div>
 <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
 {formatPKR(rentReceivedStats?.totalActualReceived ?? 0)}
 </div>
 <div className="text-[10px] text-slate-500">
 {rentReceivedStats?.receiptsCount ?? 0} receipts processed
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-sky-400 font-medium">Current Month Cleared</div>
 <div className="text-lg font-black text-sky-400 font-mono mt-0.5">
 {formatPKR(rentReceivedStats?.currentMonthAllocated ?? 0)}
 </div>
 <div className="text-[10px] text-sky-500/70">
 {rentReceivedStats?.collectionPercentage ?? 0}% collected
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-indigo-400 font-medium">Advance Rent Surplus</div>
 <div className="text-lg font-black text-indigo-300 font-mono mt-0.5">
 {formatPKR(rentReceivedStats?.advanceRentReceived ?? 0)}
 </div>
 <div className="text-[10px] text-indigo-500/70">
 Tenant credit (Non-P&L)
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-amber-400 font-medium">Net Outstanding Receivable</div>
 <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
 {formatPKR(rentReceivedStats?.netOutstandingReceivable ?? 0)}
 </div>
 <div className="text-[10px] text-amber-500/70">
 Due: {formatPKR(rentReceivedStats?.totalRentDue ?? 0)}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Live Other Income & Total Revenue () */}
 {otherIncomeStats && (
 <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
 <div>
 <div className="flex items-center gap-2">
 <Coins size={16} className="text-amber-400" />
 <h2 className="text-sm font-bold text-white uppercase tracking-wider">
 Other Income & Total Revenue
 </h2>
 <span className="text-[10px] font-bold text-amber-400 bg-amber-950 px-1.5 py-0.2 rounded border border-amber-800/50">
 Total Income Core
 </span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">
 Segregated non-rental receipts (recoveries, refunds, sundry receipts) unified into Total Company Income with zero transfer pollution.
 </p>
 </div>

 <div className="flex items-center gap-3">
 {onNavigateToOtherIncome && (
 <button
 type="button"
 onClick={onNavigateToOtherIncome}
 className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
 >
 Other Income <ChevronRight size={14} />
 </button>
 )}
 {onNavigateToRentReceived && (
 <button
 type="button"
 onClick={onNavigateToRentReceived}
 className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
 >
 Rental Income <ChevronRight size={14} />
 </button>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-amber-400 font-medium">Other Receipts</div>
 <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
 {formatPKR(otherIncomeStats?.totalOtherIncome ?? 0)}
 </div>
 <div className="text-[10px] text-slate-500">
 {otherIncomeStats?.receiptsCount ?? 0} receipts posted
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-emerald-400 font-medium">Rental Income</div>
 <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
 {formatPKR(otherIncomeStats?.totalRentalIncome ?? 0)}
 </div>
 <div className="text-[10px] text-slate-500">
 Tenancy register collections
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-sky-400 font-medium">TOTAL COMPANY INCOME</div>
 <div className="text-lg font-black text-sky-400 font-mono mt-0.5">
 {formatPKR(otherIncomeStats?.totalIncome ?? 0)}
 </div>
 <div className="text-[10px] text-sky-500/70">
 Rental + Other Receipts
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-indigo-400 font-medium">Property vs General</div>
 <div className="text-[11px] text-white font-mono mt-0.5">
 Prop: {formatPKR(otherIncomeStats?.propertyLinkedTotal ?? 0)}
 </div>
 <div className="text-[10px] text-slate-500 font-mono">
 Gen: {formatPKR(otherIncomeStats?.generalIncomeTotal ?? 0)}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Live Bank Accounts, Cash Custodians & Liquidity () */}
 {liquidityStats && (
 <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
 <div>
 <div className="flex items-center gap-2">
 <Landmark size={16} className="text-emerald-400" />
 <h2 className="text-sm font-bold text-white uppercase tracking-wider">
 Bank Accounts, Cash Custodians & Liquidity
 </h2>
 <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800/50">
 Active Foundation
 </span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">
 Real database liquidity totals across all active bank accounts and cash custodians with Transfer Invariance.
 </p>
 </div>

 <div className="flex items-center gap-3">
 {onNavigateToAccounts && (
 <button
 onClick={onNavigateToAccounts}
 className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
 >
 Accounts <ChevronRight size={14} />
 </button>
 )}
 {onNavigateToTransfers && (
 <button
 onClick={onNavigateToTransfers}
 className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
 >
 Transfers <ChevronRight size={14} />
 </button>
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-emerald-400 font-medium">Total Company Liquidity</div>
 <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
 {formatPKR(liquidityStats?.totalCompanyLiquidity ?? 0)}
 </div>
 <div className="text-[10px] text-slate-500">
 {liquidityStats?.activeAccountsCount ?? 0} active accounts
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-sky-400 font-medium">Bank Balances Total</div>
 <div className="text-lg font-black text-sky-400 font-mono mt-0.5">
 {formatPKR(liquidityStats?.bankBalancesTotal ?? 0)}
 </div>
 <div className="text-[10px] text-sky-500/70">
 {liquidityStats?.bankAccountsCount ?? 0} bank accounts
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-amber-400 font-medium">Cash in Hand Custodians</div>
 <div className="text-lg font-black text-amber-400 font-mono mt-0.5">
 {formatPKR(liquidityStats?.cashBalancesTotal ?? 0)}
 </div>
 <div className="text-[10px] text-amber-500/70">
 {liquidityStats?.cashAccountsCount ?? 0} cash custodians
 </div>
 </div>

 <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
 <div className="text-[11px] text-indigo-400 font-medium">August 2026 Grand Total</div>
 <div className="text-lg font-black text-indigo-300 font-mono mt-0.5">
 Rs. 12,367,044.28
 </div>
 <div className="text-[10px] text-emerald-400/80 font-semibold flex items-center gap-1">
 <CheckCircle2 size={11} />
 Reconciled with August PDF
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Central Transaction Ledger Banner Card */}
 <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-800/40 rounded-xl p-5">
 <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
 <div className="flex items-start gap-3">
 <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
 <FileSpreadsheet className="w-6 h-6" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <span className="text-sm font-bold text-white tracking-tight">
 Central Transaction Ledger & Voucher System
 </span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">
 Unified double-entry master journal with multi-line vouchers, August 2026 report reconciliation, and non-destructive audit tracking.
 </p>
 </div>
 </div>

 <div className="flex flex-wrap items-center gap-4">
 <div className="text-right">
 <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
 {formatMonthLabel(selectedMonth)} Activity
 </div>
 <div className="text-base font-black text-white font-mono">
 {formatPKR(transactionStats?.filteredLineTotal ?? 0)}
 </div>
 <div className="text-[10px] text-blue-400/80 font-mono">
 {transactionStats?.uniqueVouchersCount ?? 0} unique vouchers
 </div>
 </div>

 {onNavigateToTransactions && (
 <button
 type="button"
 onClick={onNavigateToTransactions}
 className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition whitespace-nowrap"
 >
 <span>View All Transactions</span>
 <ChevronRight size={14} />
 </button>
 )}
 </div>
 </div>
 </div>

 </div>
 );
}

export default DashboardHome;
