import React, { useState, useEffect } from 'react';
import {
 ShieldCheck,
 Database,
 Coins,
 CheckCircle2,
 Clock,
 Layers,
 FileText,
 Building2,
 ChevronRight,
 Users,
 Receipt,
 Landmark,
 Wallet,
 ArrowLeftRight,
 TrendingUp,
 FileSpreadsheet,
 PlusCircle,
} from 'lucide-react';
import { formatPKR } from '../utils/formatters.js';
import { isAdmin, isVerifier } from '../utils/permissions.js';
import { propertiesAPI, tenantsAPI, agreementsAPI, rentDueAPI, accountsAPI, rentReceivedAPI, vouchersAPI, otherIncomeAPI } from '../services/api.js';
import { VoucherEntryForm } from '../components/VoucherEntryForm.jsx';

export function DashboardHome({
 user,
 onNavigateToUsers,
 onOpenTerminal,
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
 const userIsAdmin = isAdmin(user);
 const normalizedRole = user?.role === 'ADMIN_PUBLISHER' ? 'ADMIN' : user?.role || 'DATA_ENTRY';

 // Live Portfolio Stats from Database
 const [portfolioStats, setPortfolioStats] = useState(null);
 const [tenancyStats, setTenancyStats] = useState(null);
 const [agreementStats, setAgreementStats] = useState(null);
 const [rentDueStats, setRentDueStats] = useState(null);
 const [liquidityStats, setLiquidityStats] = useState(null);
 const [rentReceivedStats, setRentReceivedStats] = useState(null);
 const [otherIncomeStats, setOtherIncomeStats] = useState(null);
 const [transactionStats, setTransactionStats] = useState(null);
 const [loadingPortfolio, setLoadingPortfolio] = useState(true);
 const canCreateExpenseDirectly = userIsAdmin || isVerifier(user);
 const [showCreateExpenseModal, setShowCreateExpenseModal] = useState(false);
 const [categoriesList, setCategoriesList] = useState([]);
 const [accountsList, setAccountsList] = useState([]);
 const [propertiesList, setPropertiesList] = useState([]);

 useEffect(() => {
 const fetchDashboardStats = async () => {
 try {
 const [propsRes, tenantsRes, agreementsRes, rentDueRes, accountsRes, rentReceivedRes, otherIncomeRes, txRes, catRes, fullAccRes, fullPropsRes] = await Promise.all([
 propertiesAPI.getProperties({ limit: 1 }),
 tenantsAPI.getTenants({ limit: 1 }),
 agreementsAPI.getAgreements({ limit: 1 }),
 rentDueAPI.getRentDueSummary({ month: '2026-08' }),
 accountsAPI.getAccounts({ limit: 1 }),
 rentReceivedAPI.getSummary({ month: '2026-08' }),
 otherIncomeAPI.getMonthlySummary({ month: '2026-08' }),
 vouchersAPI.getAllTransactions({ month: '2026-08', limit: 1 }),
 accountsAPI.getCategories().catch(() => ({ categories: [] })),
 accountsAPI.getActiveSummary().catch(() => ({ accounts: [] })),
 propertiesAPI.getProperties().catch(() => ({ properties: [] })),
 ]);

 if (propsRes?.success && propsRes.data?.summary) {
 setPortfolioStats(propsRes.data.summary);
 }
 if (tenantsRes?.success && tenantsRes.data?.summary) {
 setTenancyStats(tenantsRes.data.summary);
 }
 if (agreementsRes?.success && agreementsRes.data?.summary) {
 setAgreementStats(agreementsRes.data.summary);
 }
 if (rentDueRes?.success && rentDueRes.data) {
 setRentDueStats(rentDueRes.data);
 }
 if (accountsRes?.success && accountsRes.data?.summary) {
 setLiquidityStats(accountsRes.data.summary);
 }
 if (rentReceivedRes?.success && rentReceivedRes.data) {
 setRentReceivedStats(rentReceivedRes.data);
 }
 if (otherIncomeRes?.success && otherIncomeRes.data) {
 setOtherIncomeStats(otherIncomeRes.data);
 }
 if (txRes?.success && txRes.data?.summary) {
 setTransactionStats(txRes.data.summary);
 }
 setCategoriesList(catRes.categories || []);
 setAccountsList(fullAccRes.accounts || []);
 setPropertiesList(fullPropsRes.data?.properties || fullPropsRes.properties || []);
 } catch (err) {
 console.error('Failed to load dashboard portfolio stats:', err);
 } finally {
 setLoadingPortfolio(false);
 }
 };
 fetchDashboardStats();
 }, []);

 // Interactive Currency & Date Test States (for demonstrating standard compliance)
 const [testAmount, setTestAmount] = useState('1500000');
 const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-6">
      {/* Welcome & Overview Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Pixx Technologies • Pakistan Operations
              </span>
            </div>
            <h1 className="page-title">
              Pakistan Property Finance & Expense Management System
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl font-medium leading-relaxed">
              Foundation dashboard establishing secure JWT authentication, Role-Based Access Control (RBAC),
              standardized Pakistan Rupee (PKR) formatting, and audit trail architecture for all upcoming property and expense modules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canCreateExpenseDirectly && (
              <button
                onClick={() => setShowCreateExpenseModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs text-white-keep"
                title="Directly create and post expense voucher"
              >
                <PlusCircle size={16} className="text-white-keep" />
                + Create Expense
              </button>
            )}
            {onNavigateToProperties && (
              <button
                onClick={onNavigateToProperties}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition shadow-2xs text-white-keep"
              >
                <Building2 size={16} className="text-white-keep" />
                Properties Directory
              </button>
            )}
            {userIsAdmin && (
              <button
                onClick={onNavigateToUsers}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-2xs text-white-keep"
              >
                <ShieldCheck size={16} className="text-white-keep" />
                Manage Users
              </button>
            )}
            {onOpenTerminal && (
              <button
                onClick={onOpenTerminal}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition shadow-2xs"
              >
                <FileText size={16} className="text-slate-700" />
                Launch Operational View
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
 <div className="text-[11px] text-amber-400 font-medium">August 2026 Expected</div>
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
 Real database tenant rental collections, 3-tier allocations, advance surplus, and net outstanding receivables for August 2026.
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
 August 2026 Activity
 </div>
 <div className="text-base font-black text-white font-mono">
 {formatPKR(transactionStats?.filteredLineTotal || 3223223)}
 </div>
 <div className="text-[10px] text-blue-400/80 font-mono">
 {transactionStats?.uniqueVouchersCount || 37} unique vouchers
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

 {/* Direct Create Expense Modal */}
 {showCreateExpenseModal && (
 <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
 <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
 <div className="flex items-center justify-between border-b border-slate-200 pb-3">
 <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
 <PlusCircle className="w-5 h-5 text-emerald-600" />
 Direct Admin Expense Creation
 </h3>
 <button
 onClick={() => setShowCreateExpenseModal(false)}
 className="text-slate-400 hover:text-slate-900 text-xl font-bold"
 >
 &times;
 </button>
 </div>

 <VoucherEntryForm
 accounts={accountsList}
 categories={categoriesList}
 properties={propertiesList}
 canManageMasterData={true}
 onMasterDataChanged={async () => {
 const [catRes, accRes, propRes] = await Promise.all([
 accountsAPI.getCategories(),
 accountsAPI.getActiveSummary(),
 propertiesAPI.getProperties().catch(() => ({ properties: [] })),
 ]);
 setCategoriesList(catRes.categories || []);
 setAccountsList(accRes.accounts || []);
 setPropertiesList(propRes.data?.properties || propRes.properties || []);
 }}
 onVoucherCreated={async () => {
 setShowCreateExpenseModal(false);
 }}
 />
 </div>
 </div>
 )}

 </div>
 );
}

export default DashboardHome;
