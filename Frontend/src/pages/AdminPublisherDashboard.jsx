import React, { useState, useEffect } from 'react';
import {
  Building2,
  Calendar,
  Download,
  Shield,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  Edit3,
  Trash2,
  TrendingUp,
  TrendingDown,
  Wallet,
  ChevronDown,
  ChevronRight,
  Eye,
  RefreshCw,
  LogOut,
  Sparkles,
  ArrowRight,
  X,
  FileText,
  DollarSign,
  AlertCircle,
  Home,
  Receipt,
  Layers,
} from 'lucide-react';
import { adminAPI, reportsAPI, accountsAPI } from '../services/api.js';
import { MonthlyReportsHistoryPage } from './MonthlyReportsHistoryPage.jsx';

// Format Pakistani Rupees with standard comma separation
const formatPKR = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  const num = Number(val);
  const isNeg = num < 0;
  const absFormatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));
  return isNeg ? `(${absFormatted})` : absFormatted;
};

export const AdminPublisherDashboard = ({ user, onLogout, onSwitchToDataEntry }) => {
  // Global dashboard state
  const [selectedMonth, setSelectedMonth] = useState('2026-08'); // Default active financial report month
  const [activeTab, setActiveTab] = useState('overview'); // overview | master | rental | reconcile | headwise

  // Tab 1: Financial at a Glance State
  const [glanceData, setGlanceData] = useState(null);
  const [loadingGlance, setLoadingGlance] = useState(false);

  // Tab 2: Master Ledger State
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerPagination, setLedgerPagination] = useState({});
  const [ledgerTotalAmount, setLedgerTotalAmount] = useState(0);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState('');
  const [ledgerCategory, setLedgerCategory] = useState('');
  const [categoriesList, setCategoriesList] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Tab 2: Edit Modal State
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  // Tab 3: Rental Summary State
  const [rentalData, setRentalData] = useState(null);
  const [loadingRental, setLoadingRental] = useState(false);
  const [expandedPlaza, setExpandedPlaza] = useState({});

  // Tab 4: Account Reconcile State
  const [reconcileAccountId, setReconcileAccountId] = useState('');
  const [reconcileData, setReconcileData] = useState(null);
  const [loadingReconcile, setLoadingReconcile] = useState(false);

  // Tab 5: Head-Wise Expenses State
  const [headWiseData, setHeadWiseData] = useState(null);
  const [loadingHeadWise, setLoadingHeadWise] = useState(false);
  const [expandedHeads, setExpandedHeads] = useState({});

  // PDF Download State & Modal
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [signOffChecked, setSignOffChecked] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(null);

  // ----------------------------------------------------
  // Load Categories & Accounts for dropdowns
  // ----------------------------------------------------
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        const [catRes, accRes] = await Promise.all([
          accountsAPI.getCategories(),
          accountsAPI.getActiveSummary(),
        ]);
        const cats = catRes.categories || catRes.data?.categories || [];
        const accs = accRes.accounts || accRes.data?.accounts || [];
        setCategoriesList(cats);
        setAccountsList(accs);
        if (accs.length > 0) {
          setReconcileAccountId((prev) => prev || accs[0]._id);
        }
      } catch (err) {
        console.error('Error loading dropdown lists:', err);
      }
    };
    loadDropdownData();
  }, []);

  // ----------------------------------------------------
  // Tab 1: Load Financial At A Glance
  // ----------------------------------------------------
  const loadFinancialGlance = async () => {
    try {
      setLoadingGlance(true);
      const res = await adminAPI.getFinancialAtAGlance(selectedMonth);
      setGlanceData(res);
    } catch (err) {
      console.error('Failed to load financial overview:', err);
    } finally {
      setLoadingGlance(false);
    }
  };

  // ----------------------------------------------------
  // Tab 2: Load Master Ledger
  // ----------------------------------------------------
  const loadMasterLedger = async () => {
    try {
      setLoadingLedger(true);
      const res = await adminAPI.getMasterLedger({
        month: selectedMonth,
        search: ledgerSearch,
        status: ledgerStatus,
        categoryId: ledgerCategory,
        limit: 100,
      });
      setLedgerEntries(res.transactions || []);
      setLedgerPagination(res.pagination || {});
      setLedgerTotalAmount(res.totalAmount || 0);
    } catch (err) {
      console.error('Failed to load master ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  // ----------------------------------------------------
  // Tab 3: Load Rental Income Summary
  // ----------------------------------------------------
  const loadRentalSummary = async () => {
    try {
      setLoadingRental(true);
      const res = await adminAPI.getRentalIncomeSummary(selectedMonth);
      setRentalData(res);
      // Auto expand all plazas
      if (res.plazas) {
        const expandedMap = {};
        res.plazas.forEach((p) => {
          expandedMap[p.plazaId] = true;
        });
        setExpandedPlaza(expandedMap);
      }
    } catch (err) {
      console.error('Failed to load rental summary:', err);
    } finally {
      setLoadingRental(false);
    }
  };

  // ----------------------------------------------------
  // Tab 4: Load Account Statement
  // ----------------------------------------------------
  const loadReconciliation = async () => {
    if (!reconcileAccountId) return;
    try {
      setLoadingReconcile(true);
      const res = await adminAPI.getAccountReconciliation(reconcileAccountId, selectedMonth);
      setReconcileData(res);
    } catch (err) {
      console.error('Failed to load account reconciliation:', err);
    } finally {
      setLoadingReconcile(false);
    }
  };

  // ----------------------------------------------------
  // Tab 5: Load Head-Wise Expenses
  // ----------------------------------------------------
  const loadHeadWiseExpenses = async () => {
    try {
      setLoadingHeadWise(true);
      const res = await adminAPI.getHeadWiseExpenses(selectedMonth);
      setHeadWiseData(res);
      if (res.heads) {
        const expMap = {};
        res.heads.forEach((h) => {
          expMap[h.categoryId] = true;
        });
        setExpandedHeads(expMap);
      }
    } catch (err) {
      console.error('Failed to load head wise expenses:', err);
    } finally {
      setLoadingHeadWise(false);
    }
  };

  // Re-fetch active tab data when month changes or tab switches
  useEffect(() => {
    if (activeTab === 'overview') loadFinancialGlance();
    if (activeTab === 'master') loadMasterLedger();
    if (activeTab === 'rental') loadRentalSummary();
    if (activeTab === 'reconcile') loadReconciliation();
    if (activeTab === 'headwise') loadHeadWiseExpenses();
  }, [selectedMonth, activeTab, reconcileAccountId]);

  // Verify single transaction
  const handleVerify = async (txId) => {
    try {
      await adminAPI.verifyTransaction(txId);
      loadMasterLedger();
    } catch (err) {
      alert('Verification failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // Delete transaction with confirmation
  const handleDelete = async (txId, voucherNo) => {
    if (
      !window.confirm(
        `Are you sure you want to delete Voucher #${voucherNo}? All debit and credit balances on the affected accounts will be automatically reversed.`
      )
    ) {
      return;
    }

    try {
      await adminAPI.deleteTransaction(txId);
      loadMasterLedger();
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // Save Master Edit
  const handleSaveMasterEdit = async (e) => {
    e.preventDefault();
    if (!editingTransaction) return;

    try {
      setSavingEdit(true);
      setEditError(null);
      await adminAPI.updateTransaction(editingTransaction._id, {
        date: editingTransaction.date,
        voucherNo: editingTransaction.voucherNo,
        detail: editingTransaction.detail,
        categoryId: editingTransaction.categoryId,
        drAccountId: editingTransaction.drAccountId,
        crAccountId: editingTransaction.crAccountId,
        amount: editingTransaction.amount,
        status: editingTransaction.status,
        checkedBy: editingTransaction.checkedBy,
      });

      setEditingTransaction(null);
      loadMasterLedger();
    } catch (err) {
      setEditError(err.response?.data?.message || err.message || 'Failed to update transaction.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Download PDF Report Handler
  const handleDownloadPDF = async () => {
    try {
      setDownloadingPDF(true);
      setShowSignOffModal(false);
      setDownloadSuccess(null);

      await reportsAPI.downloadFundsReportPDF(selectedMonth);

      setDownloadSuccess(`Monthly Report for ${selectedMonth} downloaded successfully.`);
      setTimeout(() => setDownloadSuccess(null), 5000);
    } catch (err) {
      alert('Failed to generate PDF report: ' + (err.response?.data?.message || err.message));
    } finally {
      setDownloadingPDF(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ============================================================ */}
      {/* TOP HEADER: Management Controls & Global Month Filter         */}
      {/* ============================================================ */}
      <header className="h-20 bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-4 sm:px-8 py-0 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-black text-white">Publisher Control Center</div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Active Month Selector */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">Reporting Period:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-white font-mono font-bold focus:outline-none cursor-pointer"
              />
            </div>

            {/* PDF Export Action Button */}
            <button
              onClick={() => setShowSignOffModal(true)}
              disabled={downloadingPDF}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3.5 py-1.5 rounded-lg font-semibold shadow-md transition disabled:opacity-50"
            >
              {downloadingPDF ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Publish & Download PDF
                </>
              )}
            </button>

            {/* Quick Switch to Data Entry view if requested */}
            {onSwitchToDataEntry && (
              <button
                onClick={onSwitchToDataEntry}
                title="Switch to Clerk Data Entry View"
                className="hidden sm:flex items-center gap-1.5 text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                Data Entry View
              </button>
            )}

            {/* User Profile & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <span className="font-semibold text-slate-200 hidden md:inline">
                {user?.name || 'Fahad Sb'}
              </span>
              <button
                onClick={onLogout}
                title="Logout"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Success Notification Banner */}
      {downloadSuccess && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 px-4 py-2 text-xs flex items-center justify-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {downloadSuccess}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full p-2 sm:p-3 lg:p-4">
        {/* ============================================================ */}
        {/* TAB NAVIGATION CONTROLS                                       */}
        {/* ============================================================ */}
        <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Tab 1: Financial Overview & At a Glance
          </button>

          <button
            onClick={() => setActiveTab('master')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'master'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            Tab 2: Master Audit Journal
          </button>

          <button
            onClick={() => setActiveTab('rental')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'rental'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            Tab 3: Rental Income & Tenancy Register
          </button>

          <button
            onClick={() => setActiveTab('reconcile')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'reconcile'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            Tab 4: Bank & Cash Reconciliations
          </button>

          <button
            onClick={() => setActiveTab('headwise')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'headwise'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Tab 5: Head-Wise Expenses Summary
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Tab 6: Monthly Reports Archive & Publishing
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: FINANCIAL OVERVIEW & AT A GLANCE                       */}
        {/* ============================================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {loadingGlance ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                Aggregating monthly financial overview...
              </div>
            ) : glanceData ? (
              <>
                {/* 3 Macro Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-5 shadow-lg relative overflow-hidden">
                    <div className="text-xs uppercase font-bold tracking-wider text-emerald-400 mb-1">
                      Total Inflow & Available Funds
                    </div>
                    <div className="font-mono text-2xl font-black text-white">
                      Rs. {formatPKR(glanceData.macro.totalAmountAvailable)}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
                      <span>Rent: Rs. {formatPKR(glanceData.macro.totalRentalIncomeReceived)}</span>
                      <span>Other: Rs. {formatPKR(glanceData.macro.totalOtherReceipts)}</span>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-5 shadow-lg relative overflow-hidden">
                    <div className="text-xs uppercase font-bold tracking-wider text-amber-400 mb-1">
                      Total Net Monthly Disbursements
                    </div>
                    <div className="font-mono text-2xl font-black text-white">
                      Rs. {formatPKR(glanceData.macro.totalNetExpenses)}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      Operational Expenses + Property Maintenance
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-blue-500/30 rounded-xl p-5 shadow-lg relative overflow-hidden">
                    <div className="text-xs uppercase font-bold tracking-wider text-blue-400 mb-1">
                      Closing Available Position
                    </div>
                    <div
                      className={`font-mono text-2xl font-black ${
                        glanceData.macro.closingAvailableBalance < 0
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      Rs. {formatPKR(glanceData.macro.closingAvailableBalance)}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
                      <span>Net Movement:</span>
                      <span
                        className={`font-mono font-bold ${
                          glanceData.macro.netPosition < 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        Rs. {formatPKR(glanceData.macro.netPosition)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Audit & Verification Banner */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-200 block">
                        Period Audit Progress: {glanceData.audit?.auditPercentage}% Verified
                      </span>
                      <span className="text-slate-400">
                        {glanceData.audit?.verifiedVouchers} of {glanceData.audit?.totalVouchers}{' '}
                        vouchers audited and certified by Fahad Sb
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-semibold">
                      {glanceData.audit?.verifiedVouchers} Verified
                    </span>
                    <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-semibold">
                      {glanceData.audit?.pendingVouchers} Pending Review
                    </span>
                  </div>
                </div>

                {/* Opening & Closing Balance Matrix Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-400" />
                      Opening & Closing Balance Detail (Cash & Bank Matrix)
                    </h3>
                    <span className="text-xs text-slate-500 font-mono">
                      Closing = Opening + Total Input - Total Output
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">Cash & Bank A/C</th>
                          <th className="py-2.5 px-3 text-right">Opening Balance</th>
                          <th className="py-2.5 px-3 text-right">Rental Income (In)</th>
                          <th className="py-2.5 px-3 text-right">Other Input</th>
                          <th className="py-2.5 px-3 text-right bg-slate-900 font-bold text-white">
                            Total Input
                          </th>
                          <th className="py-2.5 px-3 text-right">Rental Exp</th>
                          <th className="py-2.5 px-3 text-right">Other Exp</th>
                          <th className="py-2.5 px-3 text-right bg-slate-900 font-bold text-white">
                            Total Output
                          </th>
                          <th className="py-2.5 px-3 text-right bg-slate-800/80 font-bold text-emerald-400">
                            Closing Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {glanceData.matrix?.rows?.map((r) => (
                          <tr key={r.accountId} className="hover:bg-slate-800/40 text-slate-300">
                            <td className="py-2 px-3 font-sans font-medium text-slate-200">
                              {r.accountName}
                            </td>
                            <td className="py-2 px-3 text-right">{formatPKR(r.openingBalance)}</td>
                            <td className="py-2 px-3 text-right text-emerald-300/80">
                              {formatPKR(r.rentalIncome)}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-400">
                              {formatPKR(r.otherInput)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white bg-slate-950/40">
                              {formatPKR(r.totalInput)}
                            </td>
                            <td className="py-2 px-3 text-right text-rose-300/80">
                              {formatPKR(r.rentalExpenses)}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-400">
                              {formatPKR(r.otherExpenses)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white bg-slate-950/40">
                              {formatPKR(r.totalOutput)}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-bold bg-slate-800/30 ${
                                r.closingBalance < 0 ? 'text-rose-400' : 'text-emerald-300'
                              }`}
                            >
                              {formatPKR(r.closingBalance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-950 text-white font-mono font-black border-t-2 border-slate-700">
                          <td className="py-3 px-3 font-sans">GRAND TOTAL</td>
                          <td className="py-3 px-3 text-right">
                            {formatPKR(glanceData.matrix?.grandTotal?.openingBalance)}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-400">
                            {formatPKR(glanceData.matrix?.grandTotal?.rentalIncome)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {formatPKR(glanceData.matrix?.grandTotal?.otherInput)}
                          </td>
                          <td className="py-3 px-3 text-right bg-slate-900 text-blue-400">
                            {formatPKR(glanceData.matrix?.grandTotal?.totalInput)}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-400">
                            {formatPKR(glanceData.matrix?.grandTotal?.rentalExpenses)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {formatPKR(glanceData.matrix?.grandTotal?.otherExpenses)}
                          </td>
                          <td className="py-3 px-3 text-right bg-slate-900 text-amber-400">
                            {formatPKR(glanceData.matrix?.grandTotal?.totalOutput)}
                          </td>
                          <td className="py-3 px-3 text-right bg-slate-900 text-emerald-400 text-sm">
                            {formatPKR(glanceData.matrix?.grandTotal?.closingBalance)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: MASTER TRANSACTION AUDIT LEDGER                       */}
        {/* ============================================================ */}
        {activeTab === 'master' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search V.N, detail, checked by..."
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 w-56"
                  />
                </div>

                <select
                  value={ledgerStatus}
                  onChange={(e) => setLedgerStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Active Entries (Excludes Reversed)</option>
                  <option value="PENDING">Pending Review</option>
                  <option value="VERIFIED">Verified by Fahad</option>
                  <option value="REVERSED">Reversed / Cancelled</option>
                  <option value="ALL_INCLUDING_REVERSED">All (Including Reversed)</option>
                </select>

                <select
                  value={ledgerCategory}
                  onChange={(e) => setLedgerCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 max-w-xs"
                >
                  <option value="">All Account Heads</option>
                  {categoriesList.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={loadMasterLedger}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
                >
                  Filter
                </button>
              </div>

              <div className="text-right">
                <span className="text-slate-400 mr-2">Total Filtered Amount:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  Rs. {formatPKR(ledgerTotalAmount)}
                </span>
              </div>
            </div>

            {/* Master Ledger Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">V.N</th>
                      <th className="py-2.5 px-3">Detail / Narration</th>
                      <th className="py-2.5 px-3">Head</th>
                      <th className="py-2.5 px-3">Dr Account</th>
                      <th className="py-2.5 px-3">Cr Account</th>
                      <th className="py-2.5 px-3 text-right">Amount (PKR)</th>
                      <th className="py-2.5 px-3 text-center">Audit Status</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {loadingLedger ? (
                      <tr>
                        <td colSpan="9" className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                          Loading master ledger...
                        </td>
                      </tr>
                    ) : ledgerEntries.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="py-8 text-center text-slate-500">
                          No transactions found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      ledgerEntries.map((tx) => {
                        const isVerified = tx.status === 'VERIFIED';
                        const isReversed = tx.status === 'REVERSED';
                        const dateStr = tx.date
                          ? new Date(tx.date).toISOString().split('T')[0]
                          : '-';

                        return (
                          <tr
                            key={tx._id}
                            className={`hover:bg-slate-800/40 transition-colors ${isReversed ? 'text-slate-500 opacity-60' : 'text-slate-300'}`}
                          >
                            <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                              {dateStr}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 whitespace-nowrap">
                              #{tx.voucherNo}
                            </td>
                            <td className="py-2.5 px-3 max-w-sm truncate" title={tx.detail}>
                              {tx.detail}
                              {tx.propertyId?.plazaName && (
                                <span className="block text-[10px] text-blue-400">
                                  {tx.propertyId.plazaName}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 border border-slate-700/60">
                                {tx.categoryId?.name || 'Uncategorized'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-emerald-300 whitespace-nowrap">
                              {tx.drAccountId?.name || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-rose-300 whitespace-nowrap">
                              {tx.crAccountId?.name || '-'}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${isReversed ? 'text-slate-400 line-through' : 'text-white'}`}>
                              {formatPKR(tx.amount)}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              {isVerified ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {tx.checkedBy || 'Checked By Fahad'}
                                </span>
                              ) : isReversed ? (
                                <span className="inline-flex items-center gap-1 bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                  Reversed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                  Pending Review
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                {tx.status === 'PENDING' && (
                                  <button
                                    onClick={() => handleVerify(tx._id)}
                                    title="Verify & Stamp as Fahad Sb"
                                    className="p-1 text-emerald-400 hover:bg-emerald-950/40 rounded transition"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    setEditingTransaction({
                                      ...tx,
                                      categoryId: tx.categoryId?._id || tx.categoryId,
                                      drAccountId: tx.drAccountId?._id || tx.drAccountId,
                                      crAccountId: tx.crAccountId?._id || tx.crAccountId,
                                      date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
                                    })
                                  }
                                  title="Master Edit (Rebalances Accounts)"
                                  className="p-1 text-blue-400 hover:bg-blue-950/40 rounded transition"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(tx._id, tx.voucherNo)}
                                  title="Delete & Reverse Balances"
                                  className="p-1 text-rose-400 hover:bg-rose-950/40 rounded transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: RENTAL INCOME & TENANCY REGISTER                       */}
        {/* ============================================================ */}
        {activeTab === 'rental' && (
          <div className="space-y-4">
            {loadingRental ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                Aggregating 7 Plazas Tenancy Register...
              </div>
            ) : rentalData ? (
              <>
                {/* Grand Total Bar */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="font-bold text-white text-sm block">
                      Portfolio Rental Income Register ({selectedMonth})
                    </span>
                    <span className="text-slate-400">
                      Collection Rate:{' '}
                      <strong className="text-emerald-400">
                        {rentalData.grandTotals.collectionRate}%
                      </strong>{' '}
                      across all 7 Plazas
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">
                        Total Agreed Rent
                      </span>
                      <span className="text-white font-bold">
                        Rs. {formatPKR(rentalData.grandTotals.totalAgreedRent)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">
                        Total Rent Received
                      </span>
                      <span className="text-emerald-400 font-bold">
                        Rs. {formatPKR(rentalData.grandTotals.totalReceivedAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">
                        Outstanding Receivables
                      </span>
                      <span className="text-rose-400 font-bold">
                        Rs. {formatPKR(rentalData.grandTotals.totalOutstandingReceivable)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase">
                        Advance Rent Held
                      </span>
                      <span className="text-teal-300 font-bold">
                        Rs. {formatPKR(rentalData.grandTotals.totalAdvanceRentReceived)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Plaza Accordions */}
                <div className="space-y-3">
                  {rentalData.plazas?.map((plaza) => {
                    const isExpanded = expandedPlaza[plaza.plazaId] ?? true;

                    return (
                      <div
                        key={plaza.plazaId}
                        className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow"
                      >
                        {/* Plaza Header Accordion Toggle */}
                        <button
                          onClick={() =>
                            setExpandedPlaza((prev) => ({
                              ...prev,
                              [plaza.plazaId]: !isExpanded,
                            }))
                          }
                          className="w-full px-4 py-3 bg-slate-950/70 hover:bg-slate-800/60 border-b border-slate-800 flex items-center justify-between text-left transition"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                            <div>
                              <span className="font-bold text-sm text-white block">
                                {plaza.plazaName}
                              </span>
                              <span className="text-xs text-slate-400">
                                {plaza.unitsCount} Units &bull; Collection:{' '}
                                <strong className="text-emerald-400">
                                  {plaza.subtotals.collectionRate}%
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-mono">
                            <div>
                              <span className="text-slate-500 text-[10px] uppercase block">
                                Rent Roll
                              </span>
                              <span className="text-slate-200">
                                Rs. {formatPKR(plaza.subtotals.agreedRent)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[10px] uppercase block">
                                Received
                              </span>
                              <span className="text-emerald-400 font-bold">
                                Rs. {formatPKR(plaza.subtotals.receivedAmount)}
                              </span>
                            </div>
                          </div>
                        </button>

                        {/* Units Table */}
                        {isExpanded && (
                          <div className="overflow-x-auto p-3">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                                <tr>
                                  <th className="py-2 px-3">Unit / Floor</th>
                                  <th className="py-2 px-3">Tenant Name</th>
                                  <th className="py-2 px-3">Due Day</th>
                                  <th className="py-2 px-3 text-right">Agreed Rent</th>
                                  <th className="py-2 px-3 text-right">Rent Received</th>
                                  <th className="py-2 px-3">Receiving Bank</th>
                                  <th className="py-2 px-3 text-right">Outstanding</th>
                                  <th className="py-2 px-3 text-right">Advance</th>
                                  <th className="py-2 px-3 text-center">Audit Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-sans">
                                {plaza.units?.map((u) => (
                                  <tr key={u.unitId} className="hover:bg-slate-800/30 text-slate-300">
                                    <td className="py-2 px-3 font-semibold text-white">
                                      {u.unitName}
                                    </td>
                                    <td className="py-2 px-3 text-slate-400">{u.tenantName}</td>
                                    <td className="py-2 px-3 font-mono">{u.dueDay}</td>
                                    <td className="py-2 px-3 text-right font-mono font-semibold">
                                      {formatPKR(u.agreedRent)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                                      {formatPKR(u.receivedAmount)}
                                    </td>
                                    <td className="py-2 px-3 text-slate-400 text-[11px]">
                                      {u.receivingAccountName}
                                    </td>
                                    <td
                                      className={`py-2 px-3 text-right font-mono ${
                                        u.outstandingReceivable > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'
                                      }`}
                                    >
                                      {formatPKR(u.outstandingReceivable)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono text-teal-300">
                                      {formatPKR(u.advanceRentReceived)}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      {u.isCheckedByFahad ? (
                                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                                          Checked By Fahad
                                        </span>
                                      ) : (
                                        <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]">
                                          Pending
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: BANK & CASH STATEMENTS & RECONCILIATIONS               */}
        {/* ============================================================ */}
        {activeTab === 'reconcile' && (
          <div className="space-y-4">
            {/* Account Selector */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-300">Select Account / Custodian:</span>
                <select
                  value={reconcileAccountId}
                  onChange={(e) => setReconcileAccountId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <optgroup label="Bank Accounts">
                    {accountsList
                      .filter((a) => a.type === 'BANK')
                      .map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} (PKR {formatPKR(a.currentBalance)})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Cash Custodians">
                    {accountsList
                      .filter((a) => a.type === 'CASH')
                      .map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} (PKR {formatPKR(a.currentBalance)})
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              <button
                onClick={loadReconciliation}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Statement
              </button>
            </div>

            {/* Discrepancy / Negative Balance Alert Banner */}
            {reconcileData?.reconciliation?.hasNegativeBalanceDip && (
              <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-4 text-rose-300 text-xs flex items-start gap-3 animate-pulse">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold text-rose-200 text-sm">
                    AUDIT DISCREPANCY DETECTED: NEGATIVE BALANCE EVENT
                  </strong>
                  This account dipped into negative (lowest point: PKR{' '}
                  {formatPKR(reconcileData.reconciliation.minRunningBalance)}) during the period of{' '}
                  {selectedMonth}. Verify cash custodian drawers and trace unauthorized overdrafts.
                </div>
              </div>
            )}

            {/* Reconciliation Statement Table */}
            {reconcileData && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {reconcileData.account?.name}
                    </h3>
                    <span className="text-xs text-slate-400">
                      Type: {reconcileData.account?.type} &bull; Opening: PKR{' '}
                      {formatPKR(reconcileData.reconciliation?.openingBalance)}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase block">Total Dr (+)</span>
                      <span className="text-emerald-400 font-bold">
                        {formatPKR(reconcileData.reconciliation?.totalDebits)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase block">Total Cr (-)</span>
                      <span className="text-rose-400 font-bold">
                        {formatPKR(reconcileData.reconciliation?.totalCredits)}
                      </span>
                    </div>
                    <div className="bg-slate-950 px-3 py-1.5 rounded border border-slate-800">
                      <span className="text-slate-400 text-[10px] uppercase block">Closing Balance</span>
                      <span className="text-white font-bold text-sm">
                        Rs. {formatPKR(reconcileData.reconciliation?.closingBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">V.N</th>
                        <th className="py-2.5 px-3">Transaction Detail</th>
                        <th className="py-2.5 px-3">Counterparty A/C</th>
                        <th className="py-2.5 px-3 text-right">Debit (Dr)</th>
                        <th className="py-2.5 px-3 text-right">Credit (Cr)</th>
                        <th className="py-2.5 px-3 text-right bg-slate-800 font-bold">
                          Running Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {reconcileData.entries?.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="py-8 text-center text-slate-500 font-sans">
                            No movements found for this account in {selectedMonth}.
                          </td>
                        </tr>
                      ) : (
                        reconcileData.entries?.map((tx) => (
                          <tr key={tx._id} className="hover:bg-slate-800/40 text-slate-300">
                            <td className="py-2 px-3 text-slate-400">
                              {tx.date ? new Date(tx.date).toISOString().split('T')[0] : '-'}
                            </td>
                            <td className="py-2 px-3 font-bold text-emerald-400">
                              #{tx.voucherNo}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-200">{tx.detail}</td>
                            <td className="py-2 px-3 font-sans text-slate-400">
                              {tx.counterpartyAccount || '-'}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-400">
                              {tx.drAmount > 0 ? formatPKR(tx.drAmount) : '-'}
                            </td>
                            <td className="py-2 px-3 text-right text-rose-400">
                              {tx.crAmount > 0 ? formatPKR(tx.crAmount) : '-'}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-bold bg-slate-950/40 ${
                                tx.runningBalance < 0 ? 'text-rose-400' : 'text-white'
                              }`}
                            >
                              {formatPKR(tx.runningBalance)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: HEAD-WISE EXPENSES SUMMARY                           */}
        {/* ============================================================ */}
        {activeTab === 'headwise' && (
          <div className="space-y-4">
            {loadingHeadWise ? (
              <div className="py-16 text-center text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                Aggregating Head-Wise expenses...
              </div>
            ) : headWiseData ? (
              <>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-white text-sm block">
                      Disbursements Grouped by Expense Head
                    </span>
                    <span className="text-slate-400">Reporting Period: {selectedMonth}</span>
                  </div>
                  <div className="font-mono text-base font-bold text-amber-400">
                    Net Expenses: Rs. {formatPKR(headWiseData.totalExpensesOverall)}
                  </div>
                </div>

                {headWiseData.totalExpensesOverall === 0 || (!headWiseData.mainHeads?.length && (!headWiseData.heads || headWiseData.heads.every(h => h.transactionCount === 0))) ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
                    No active expense disbursements recorded for {selectedMonth}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(headWiseData.mainHeads?.length
                      ? headWiseData.mainHeads
                      : (headWiseData.heads || []).map((head) => ({
                          mainHeadId: head.categoryId,
                          mainHeadName: head.headName,
                          totalSpent: head.totalSpent,
                          transactionCount: head.transactionCount,
                          expenses: [head],
                        }))).map((h) => {
                    const isExp = expandedHeads[h.mainHeadId] ?? true;
                    const childExpenses = h.expenses || [];
                    const transactions = childExpenses.flatMap((expense) =>
                      (expense.transactions || []).map((transaction) => ({
                        ...transaction,
                        expenseHeadName: expense.headName,
                      }))
                    );

                    return (
                      <div
                        key={h.mainHeadId}
                        className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow"
                      >
                        <button
                          onClick={() =>
                            setExpandedHeads((prev) => ({
                              ...prev,
                              [h.mainHeadId]: !isExp,
                            }))
                          }
                          className="w-full px-4 py-3 bg-slate-950/70 hover:bg-slate-800/60 border-b border-slate-800 flex items-center justify-between text-left transition"
                        >
                          <div className="flex items-center gap-3">
                            {isExp ? (
                              <ChevronDown className="w-4 h-4 text-blue-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                            <div>
                              <span className="font-bold text-sm text-white block">
                                {h.mainHeadName}
                              </span>
                              <span className="text-xs text-slate-400">
                                {h.transactionCount} transaction{h.transactionCount === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>

                          <div className="font-mono text-sm font-bold text-amber-400">
                            Rs. {formatPKR(h.totalSpent)}
                          </div>
                        </button>

                        {isExp && (
                          <div className="p-3 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                                <tr>
                                  <th className="py-2 px-3">Date</th>
                                  <th className="py-2 px-3">V.N</th>
                                  <th className="py-2 px-3">Expense</th>
                                  <th className="py-2 px-3">Transaction Detail / Narration</th>
                                  <th className="py-2 px-3">Paid From (Cr)</th>
                                  <th className="py-2 px-3 text-right">Amount (PKR)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 font-sans">
                                {transactions.map((t) => (
                                  <tr key={t._id} className="hover:bg-slate-800/30 text-slate-300">
                                    <td className="py-2 px-3 font-mono text-slate-400">
                                      {t.date ? new Date(t.date).toISOString().split('T')[0] : '-'}
                                    </td>
                                    <td className="py-2 px-3 font-mono font-bold text-emerald-400">
                                      #{t.voucherNo}
                                    </td>
                                    <td className="py-2 px-3 text-slate-200">{t.detail}</td>
                                    <td className="py-2 px-3 text-purple-300">{t.expenseHeadName}</td>
                                    <td className="py-2 px-3 text-rose-300">{t.paidFromAccount}</td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-white">
                                      {formatPKR(t.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: MONTHLY REPORTS ARCHIVE & PUBLISHING                   */}
        {/* ============================================================ */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <MonthlyReportsHistoryPage currentUser={user} />
          </div>
        )}
      </main>

      {/* ============================================================ */}
      {/* AUDIT SIGN-OFF & PDF DOWNLOAD MODAL                           */}
      {/* ============================================================ */}
      {showSignOffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-blue-400" />
                Executive Audit Certification & PDF Publish
              </h3>
              <button
                onClick={() => setShowSignOffModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              You are about to publish the official{' '}
              <strong className="text-white">
                Monthly Funds Management Report for {selectedMonth}
              </strong>
              . This document will be distributed to partners and directors.
            </p>

            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 space-y-2 text-xs text-slate-400 mb-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All double-entry vouchers reviewed & balanced</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Bank accounts reconciled against statements</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Cash-in-hand custodian balances certified</span>
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer mb-6 p-2 rounded hover:bg-slate-800/40">
              <input
                type="checkbox"
                checked={signOffChecked}
                onChange={(e) => setSignOffChecked(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0"
              />
              <span>
                I confirm this financial statement has been audited and is certified by{' '}
                <strong className="text-white">{user?.name || 'Fahad Sb'}</strong> for executive
                publishing.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSignOffModal(false)}
                className="px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!signOffChecked || downloadingPDF}
                onClick={handleDownloadPDF}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg transition flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloadingPDF ? 'Rendering PDF...' : 'Download Official PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MASTER EDIT TRANSACTION MODAL                                 */}
      {/* ============================================================ */}
      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                Master Edit Voucher #{editingTransaction.voucherNo}
              </h3>
              <button
                onClick={() => setEditingTransaction(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveMasterEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={editingTransaction.date}
                    onChange={(e) =>
                      setEditingTransaction((p) => ({ ...p, date: e.target.value }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Amount (PKR)</label>
                  <input
                    type="number"
                    step="any"
                    value={editingTransaction.amount}
                    onChange={(e) =>
                      setEditingTransaction((p) => ({ ...p, amount: Number(e.target.value) }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 font-mono text-white font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Transaction Detail / Narration</label>
                <textarea
                  rows="2"
                  value={editingTransaction.detail}
                  onChange={(e) =>
                    setEditingTransaction((p) => ({ ...p, detail: e.target.value }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Account Head / Category</label>
                <select
                  value={editingTransaction.categoryId}
                  onChange={(e) =>
                    setEditingTransaction((p) => ({ ...p, categoryId: e.target.value }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                  required
                >
                  {categoriesList.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Dr. Account (Inflow)</label>
                  <select
                    value={editingTransaction.drAccountId}
                    onChange={(e) =>
                      setEditingTransaction((p) => ({ ...p, drAccountId: e.target.value }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                    required
                  >
                    {accountsList.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Cr. Account (Outflow)</label>
                  <select
                    value={editingTransaction.crAccountId}
                    onChange={(e) =>
                      setEditingTransaction((p) => ({ ...p, crAccountId: e.target.value }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200"
                    required
                  >
                    {accountsList.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTransaction(null)}
                  className="px-3 py-1.5 text-slate-400 hover:bg-slate-800 rounded transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition disabled:opacity-50"
                >
                  {savingEdit ? 'Re-calculating Balances...' : 'Save & Rebalance Accounts'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-500">
        Pixx Technologies Financial Systems &bull; Publisher Control Center &bull; Automated Financial Reporting
      </footer>
    </div>
  );
};

export default AdminPublisherDashboard;
