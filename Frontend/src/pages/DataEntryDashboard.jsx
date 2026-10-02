import React, { useState, useEffect } from 'react';
import {
  Building2,
  Calendar,
  Receipt,
  Layers,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Plus,
  BookOpen,
  BarChart3,
  Search,
  Download,
  FileCheck,
  TrendingUp,
  FileText,
  DollarSign,
  Wallet,
  Home,
  Eye,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  X,
} from 'lucide-react';
import { CashCustodianBar } from '../components/CashCustodianBar.jsx';
import { RentCollectionModal } from '../components/RentCollectionModal.jsx';
import { VoucherEntryForm } from '../components/VoucherEntryForm.jsx';
import { RecentEntriesTable } from '../components/RecentEntriesTable.jsx';
import { accountsAPI, transactionsAPI, otherIncomeAPI, transfersAPI, uploadAPI, verificationAPI, adminAPI, reportsAPI } from '../services/api.js';
import { EvidenceImageUpload } from '../components/EvidenceImageUpload.jsx';
import { ReceiptViewerModal } from '../components/ReceiptViewerModal.jsx';
import { formatPKR, resolveTransactionAccounts } from '../utils/formatters.js';
import { isAdmin, isVerifier } from '../utils/permissions.js';

// Persistent in-memory cache for instant DataEntryDashboard rendering
let dataEntryCache = {
  accounts: [],
  custodians: [],
  categories: [],
  properties: [],
  recentEntries: [],
  pendingEntries: [],
  otherHeads: [],
  isLoaded: false,
};

export const DataEntryDashboard = ({ user }) => {
  const [activeTab, setActiveTab] = useState('expense'); // 'expense' | 'rent' | 'other' | 'transfer'

  // Master data state initialized from cache if available
  const [accounts, setAccounts] = useState(dataEntryCache.accounts);
  const [custodians, setCustodians] = useState(dataEntryCache.custodians);
  const [categories, setCategories] = useState(dataEntryCache.categories);
  const [properties, setProperties] = useState(dataEntryCache.properties);
  const [recentEntries, setRecentEntries] = useState(dataEntryCache.recentEntries);
  const [pendingEntries, setPendingEntries] = useState(dataEntryCache.pendingEntries);
  const [otherHeads, setOtherHeads] = useState(dataEntryCache.otherHeads);

  const [loadingData, setLoadingData] = useState(!dataEntryCache.isLoaded);
  const [refreshingEntries, setRefreshingEntries] = useState(false);
  const [actionMessage, setActionMessage] = useState({ text: '', type: '' });

  // Other Income Form State
  const [otherForm, setOtherForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    headId: '',
    propertyId: '',
    unitId: '',
    accountId: '',
    receivedFrom: '',
    detail: '',
    reference: '',
  });
  const [submittingOther, setSubmittingOther] = useState(false);
  const [otherEvidenceFiles, setOtherEvidenceFiles] = useState([]);

  // Transfer Form State
  const [transferForm, setTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    transferDate: new Date().toISOString().split('T')[0],
    reference: '',
    description: '',
  });
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [transferEvidenceFiles, setTransferEvidenceFiles] = useState([]);

  // ============================================================
  // Tab E: Master Ledger State & Handlers
  // ============================================================
  const [ledgerMonth, setLedgerMonth] = useState('2026-08');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState('');
  const [ledgerCategory, setLedgerCategory] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerPagination, setLedgerPagination] = useState({});
  const [ledgerTotalAmount, setLedgerTotalAmount] = useState(0);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [viewingEvidenceTx, setViewingEvidenceTx] = useState(null);

  const loadMasterLedger = async (overrides = {}) => {
    try {
      setLoadingLedger(true);
      const m = overrides.month !== undefined ? overrides.month : ledgerMonth;
      const s = overrides.search !== undefined ? overrides.search : ledgerSearch;
      const st = overrides.status !== undefined ? overrides.status : ledgerStatus;
      const c = overrides.category !== undefined ? overrides.category : ledgerCategory;

      const res = await adminAPI.getMasterLedger({
        month: m,
        search: s,
        status: st,
        categoryId: c,
        limit: 150,
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

  // ============================================================
  // Tab F: Reports & Financials State & Handlers
  // ============================================================
  const [reportMonth, setReportMonth] = useState('2026-08');
  const [reportSubTab, setReportSubTab] = useState('overview'); // 'overview' | 'headwise' | 'rental' | 'reconcile'
  const [glanceData, setGlanceData] = useState(null);
  const [loadingGlance, setLoadingGlance] = useState(false);
  const [rentalSummaryData, setRentalSummaryData] = useState(null);
  const [loadingRentalSummary, setLoadingRentalSummary] = useState(false);
  const [headWiseData, setHeadWiseData] = useState(null);
  const [loadingHeadWise, setLoadingHeadWise] = useState(false);
  const [expandedHeads, setExpandedHeads] = useState({});
  const [expandedPlazas, setExpandedPlazas] = useState({});
  const [reconcileAccountId, setReconcileAccountId] = useState('');
  const [reconcileData, setReconcileData] = useState(null);
  const [loadingReconcile, setLoadingReconcile] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(null);

  const loadReportData = async (subTab = reportSubTab, targetMonth = reportMonth, targetAccountId = reconcileAccountId) => {
    if (subTab === 'overview') {
      try {
        setLoadingGlance(true);
        const res = await adminAPI.getFinancialAtAGlance(targetMonth);
        setGlanceData(res);
      } catch (err) {
        console.error('Failed to load financial overview:', err);
      } finally {
        setLoadingGlance(false);
      }
    } else if (subTab === 'headwise') {
      try {
        setLoadingHeadWise(true);
        const res = await adminAPI.getHeadWiseExpenses(targetMonth);
        setHeadWiseData(res);
        if (res?.heads) {
          const expMap = {};
          res.heads.forEach((h) => { expMap[h.categoryId] = true; });
          setExpandedHeads(expMap);
        }
      } catch (err) {
        console.error('Failed to load head-wise summary:', err);
      } finally {
        setLoadingHeadWise(false);
      }
    } else if (subTab === 'rental') {
      try {
        setLoadingRentalSummary(true);
        const res = await adminAPI.getRentalIncomeSummary(targetMonth);
        setRentalSummaryData(res);
        if (res?.plazas) {
          const expMap = {};
          res.plazas.forEach((p) => { expMap[p.plazaId] = true; });
          setExpandedPlazas(expMap);
        }
      } catch (err) {
        console.error('Failed to load rental summary:', err);
      } finally {
        setLoadingRentalSummary(false);
      }
    } else if (subTab === 'reconcile') {
      const accId = targetAccountId || reconcileAccountId || (accounts.length > 0 ? accounts[0]._id : '');
      if (!accId) return;
      try {
        setLoadingReconcile(true);
        const res = await adminAPI.getAccountReconciliation(accId, targetMonth);
        setReconcileData(res);
      } catch (err) {
        console.error('Failed to load reconciliation:', err);
      } finally {
        setLoadingReconcile(false);
      }
    }
  };

  const handleDownloadReportPDF = async () => {
    try {
      setDownloadingPDF(true);
      setPdfSuccess(null);
      await reportsAPI.downloadFundsReportPDF(reportMonth);
      setPdfSuccess(`Monthly Funds Report for ${reportMonth} downloaded successfully.`);
      setTimeout(() => setPdfSuccess(null), 5000);
    } catch (err) {
      alert('Failed to generate PDF report: ' + (err.response?.data?.message || err.message));
    } finally {
      setDownloadingPDF(false);
    }
  };

  // Load active accounts and metadata
  const loadMasterData = async (showLoading = false) => {
    try {
      if (showLoading || !dataEntryCache.isLoaded) {
        setLoadingData(true);
      }
      const [accRes, catRes, propRes, entriesRes, headsRes, pendingRes] = await Promise.all([
        accountsAPI.getActiveSummary(),
        accountsAPI.getCategories(),
        accountsAPI.getProperties().catch(() => ({ properties: [] })),
        transactionsAPI.getMyEntries(),
        otherIncomeAPI.getHeads().catch(() => ({ data: [] })),
        verificationAPI.getMySubmissions().catch(() => ({ data: [] })),
      ]);

      const accs = accRes.accounts || accRes.data?.accounts || [];
      const custs = accRes.grouped?.custodians || [];
      const cats = catRes.categories || catRes.data?.categories || [];
      const props = propRes?.properties || propRes?.data?.properties || [];
      const rawRecents = entriesRes.transactions || entriesRes.data?.transactions || [];
      const recents = rawRecents.filter((tx) => tx.status !== 'PENDING');
      const pendingFromTx = rawRecents.filter((tx) => tx.status === 'PENDING');
      const rawHeads = headsRes?.data || headsRes?.heads || headsRes || [];
      const heads = Array.isArray(rawHeads)
        ? rawHeads
        : Array.isArray(rawHeads?.heads)
        ? rawHeads.heads
        : [];
      // pending entries: unverified submissions by this user
      const rawPendings = (pendingRes?.data || []).filter(e => e.status !== 'VERIFIED');
      const pendings = [
        ...rawPendings,
        ...pendingFromTx.filter((pt) => !rawPendings.some((rp) => rp._id?.toString() === pt._id?.toString())),
      ];

      setAccounts(accs);
      setCustodians(custs);
      setCategories(cats);
      setProperties(props);
      setRecentEntries(recents);
      setPendingEntries(pendings);
      setOtherHeads(heads);

      dataEntryCache = {
        accounts: accs,
        custodians: custs,
        categories: cats,
        properties: props,
        recentEntries: recents,
        pendingEntries: pendings,
        otherHeads: heads,
        isLoaded: true,
      };
    } catch (err) {
      console.error('Failed to load master dashboard data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  // Quick refresh for recent entries, pending submissions, and account balances
  const refreshEntries = async () => {
    try {
      setRefreshingEntries(true);
      const [entriesRes, accRes, pendingRes] = await Promise.all([
        transactionsAPI.getMyEntries(),
        accountsAPI.getActiveSummary(),
        verificationAPI.getMySubmissions().catch(() => ({ data: [] })),
      ]);
      const rawRecents = entriesRes.transactions || [];
      const recents = rawRecents.filter((tx) => tx.status !== 'PENDING');
      const pendingFromTx = rawRecents.filter((tx) => tx.status === 'PENDING');
      const rawPendings = (pendingRes?.data || []).filter(e => e.status !== 'VERIFIED');
      const pendings = [
        ...rawPendings,
        ...pendingFromTx.filter((pt) => !rawPendings.some((rp) => rp._id?.toString() === pt._id?.toString())),
      ];
      setRecentEntries(recents);
      setPendingEntries(pendings);
      setAccounts(accRes.accounts || accRes.data?.accounts || []);
      setCustodians(accRes.grouped?.custodians || []);
      dataEntryCache = { ...dataEntryCache, recentEntries: recents, pendingEntries: pendings, accounts: accRes.accounts || accRes.data?.accounts || [], custodians: accRes.grouped?.custodians || [] };
    } catch (err) {
      console.error('Failed to refresh entries:', err);
    } finally {
      setRefreshingEntries(false);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    if (activeTab === 'master-ledger') {
      loadMasterLedger();
    } else if (activeTab === 'reports') {
      loadReportData(reportSubTab, reportMonth);
    }
  }, [activeTab]);

  // Compute KPI card statistics
  const todayStr = new Date().toISOString().split('T')[0];
  const thisMonthStr = todayStr.slice(0, 7);

  const todayEntries = recentEntries.filter((e) => e.date && e.date.startsWith(todayStr));
  const monthEntries = recentEntries.filter((e) => e.date && e.date.startsWith(thisMonthStr));
  const pendingLocalTx = recentEntries.filter((e) => e.status === 'PENDING');
  const reversedEntries = recentEntries.filter((e) => e.status === 'REVERSED');

  // Submit Other Income
  const handleOtherIncomeSubmit = async (e) => {
    e.preventDefault();
    setSubmittingOther(true);
    setActionMessage({ text: '', type: '' });
    try {
      const uploadedImages = otherEvidenceFiles.length
        ? (await uploadAPI.images(otherEvidenceFiles)).images
        : [];
      const res = await otherIncomeAPI.record({
        ...otherForm,
        incomeHeadId: otherForm.headId,
        receivingAccountId: otherForm.accountId,
        transactionDetail: otherForm.detail,
        receiptDate: otherForm.date,
        propertyId: otherForm.propertyId || null,
        unitId: otherForm.unitId || null,
        amount: Number(otherForm.amount),
        attachments: uploadedImages,
      });
      setOtherEvidenceFiles([]);
      if (res.success) {
        setActionMessage({ text: 'Other income submitted and is waiting for admin verification.', type: 'success' });
        setOtherForm({
          date: new Date().toISOString().split('T')[0],
          amount: '',
          headId: '',
          propertyId: '',
          unitId: '',
          accountId: '',
          receivedFrom: '',
          detail: '',
          reference: '',
        });
        await refreshEntries();
      }
    } catch (err) {
      setActionMessage({
        text: err.response?.data?.message || err.message || 'Failed to record other income.',
        type: 'error',
      });
    } finally {
      setSubmittingOther(false);
    }
  };

  // Submit Transfer
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setSubmittingTransfer(true);
    setActionMessage({ text: '', type: '' });
    try {
      if (transferForm.fromAccountId === transferForm.toAccountId) {
        throw new Error('Source and destination accounts must be different.');
      }
      const uploadedImages = transferEvidenceFiles.length
        ? (await uploadAPI.images(transferEvidenceFiles)).images
        : [];
      const res = await transfersAPI.executeTransfer({
        ...transferForm,
        date: transferForm.transferDate,
        amount: Number(transferForm.amount),
        attachments: uploadedImages,
      });
      if (res.success) {
        setActionMessage({
          text: res.message || (res.data?.isPending ? 'Internal transfer submitted to Admin Verification Queue.' : 'Internal transfer completed successfully.'),
          type: 'success',
        });
        setTransferForm({
          fromAccountId: '',
          toAccountId: '',
          amount: '',
          transferDate: new Date().toISOString().split('T')[0],
          reference: '',
          description: '',
        });
        setTransferEvidenceFiles([]);
        await refreshEntries();
      }
    } catch (err) {
      setActionMessage({
        text: err.response?.data?.message || err.message || 'Failed to execute transfer.',
        type: 'error',
      });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Main Content Area */}
      <main className="flex-1 w-full p-2 sm:p-3 lg:p-4 space-y-6">
        {/* Persistent Live Cash Custodian Bar */}
        <CashCustodianBar
          custodians={custodians}
          onRefresh={refreshEntries}
          loading={refreshingEntries}
        />

        {/* Part 23: Operator KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-slate-500">Today's Entries</span>
              <Clock size={16} className="text-blue-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">
              {todayEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
              {formatPKR(todayEntries.reduce((s, e) => s + (e.amount || 0), 0))} recorded
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-slate-500">This Month</span>
              <Calendar size={16} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 mt-1">
              {monthEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
              {formatPKR(monthEntries.reduce((s, e) => s + (e.amount || 0), 0))} posted
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-amber-700">Pending Review</span>
              <AlertTriangle size={16} className="text-amber-600" />
            </div>
            <div className="text-2xl font-black font-mono text-amber-600 mt-1">
              {pendingEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Awaiting Khurshid's signoff</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold text-rose-700">Corrections / Reversals</span>
              <CheckCircle2 size={16} className="text-rose-600" />
            </div>
            <div className="text-2xl font-black font-mono text-rose-600 mt-1">
              {reversedEntries.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Reversed journal vouchers</div>
          </div>
        </div>

        {/* Action Message Alert */}
        {actionMessage.text && (
          <div
            className={`p-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            {actionMessage.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-rose-600" />}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Part 23: Tab Navigation Controls */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 pb-2">
          <button
            onClick={() => { setActiveTab('expense'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black transition whitespace-nowrap ${
              activeTab === 'expense'
                ? 'tab-expense-sky shadow-md font-black text-white-keep'
                : 'tab-expense-sky-inactive font-bold'
            }`}
          >
            <Layers className="w-4 h-4 text-white-keep" />
            Tab A: Expense Voucher Entry
          </button>

          <button
            onClick={() => { setActiveTab('rent'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'rent'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Tab B: Rent Received
          </button>

          <button
            onClick={() => { setActiveTab('other'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'other'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <Banknote className="w-4 h-4" />
            Tab C: Other Income
          </button>

          <button
            onClick={() => { setActiveTab('transfer'); setActionMessage({ text: '', type: '' }); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'transfer'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Tab D: Internal Transfer
          </button>

          <button
            onClick={() => {
              setActiveTab('master-ledger');
              setActionMessage({ text: '', type: '' });
              loadMasterLedger();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'master-ledger'
                ? 'bg-indigo-600 text-white shadow-md font-black'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Tab E: Master Ledger
          </button>

          <button
            onClick={() => {
              setActiveTab('reports');
              setActionMessage({ text: '', type: '' });
              loadReportData('overview', reportMonth);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'reports'
                ? 'bg-emerald-600 text-white shadow-md font-black'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Tab F: Reports & Financials
          </button>
        </div>

        {/* Active Work Tab Content */}
        <div className="mb-8">
          {activeTab === 'expense' && (
            <VoucherEntryForm
              accounts={accounts}
              categories={categories}
              properties={properties}
              onVoucherCreated={refreshEntries}
              canManageMasterData={user?.role === 'ADMIN' || user?.role === 'ADMIN_PUBLISHER' || user?.role === 'DATA_ENTRY'}
              onMasterDataChanged={loadMasterData}
            />
          )}

          {activeTab === 'rent' && (
            <RentCollectionModal
              properties={properties}
              accounts={accounts}
              onRentCollected={refreshEntries}
            />
          )}

          {/* Tab C: Other Income Direct Entry */}
          {activeTab === 'other' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Banknote size={16} className="text-amber-600" />
                Record Other Income / Other Receipts
              </h2>
              <form onSubmit={handleOtherIncomeSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Entry Date (Receipt Date) <span className="text-red-500">*</span></span>
                      <span className="text-[10px] font-mono text-amber-600 font-bold">Month: {otherForm.date ? otherForm.date.slice(0, 7) : ''}</span>
                    </label>
                    <input
                      type="date"
                      value={otherForm.date}
                      onChange={(e) => setOtherForm({ ...otherForm, date: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5 font-normal">
                      Saved & reported in this entry date&apos;s month.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Amount (PKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="e.g. 50000"
                      value={otherForm.amount}
                      onChange={(e) => setOtherForm({ ...otherForm, amount: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Receiving Account (Dr.)</label>
                    <select
                      value={otherForm.accountId}
                      onChange={(e) => setOtherForm({ ...otherForm, accountId: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">Select Receiving Account...</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({a.type})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-2">
                  <EvidenceImageUpload files={otherEvidenceFiles} onChange={setOtherEvidenceFiles} disabled={submittingOther} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">
                      Received From / Income Head (Select Source)
                    </label>
                    <select
                      value={otherForm.headId}
                      onChange={(e) => {
                        const selId = e.target.value;
                        const foundHead = otherHeads.find((h) => (h._id || h.id) === selId);
                        setOtherForm({
                          ...otherForm,
                          headId: selId,
                          receivedFrom: foundHead ? foundHead.name : '',
                        });
                      }}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold"
                    >
                      <option value="">Select Income Head / Payer (Boss Kamran Ijaz, 48-A Plaza, etc.)...</option>
                      {otherHeads.map((h) => (
                        <option key={h._id || h.id} value={h._id || h.id}>
                          {h.name} {h.code ? `(${h.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">
                      Received From (Payee / Party Name)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Boss Kamran Ijaz, 48-A Plaza, Scrap Buyer..."
                      value={otherForm.receivedFrom}
                      onChange={(e) => setOtherForm({ ...otherForm, receivedFrom: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">
                      Property Allocation (Optional)
                    </label>
                    <select
                      value={otherForm.propertyId}
                      onChange={(e) => {
                        const newPropId = e.target.value;
                        setOtherForm({ ...otherForm, propertyId: newPropId, unitId: '' });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">-- General Company (No Property) --</option>
                      {properties.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.plazaName || p.propertyName || p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">
                      Shop / Unit Allocation (Optional)
                    </label>
                    <select
                      value={otherForm.unitId}
                      onChange={(e) => setOtherForm({ ...otherForm, unitId: e.target.value })}
                      disabled={!otherForm.propertyId}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold disabled:opacity-50"
                    >
                      <option value="">-- Entire Property (No Specific Shop) --</option>
                      {(properties.find((p) => String(p._id) === String(otherForm.propertyId))?.units || []).map((u) => (
                        <option key={u._id || u.unitName} value={u._id}>
                          {u.unitName || u.unitNumber || u.name || 'Unit'} {u.tenantName ? `(${u.tenantName})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Narration / Detail</label>
                  <textarea
                    rows="2"
                    placeholder="Description of the receipt..."
                    value={otherForm.detail}
                    onChange={(e) => setOtherForm({ ...otherForm, detail: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingOther}
                    className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submittingOther ? 'Recording...' : 'Post Other Income'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab D: Internal Transfer Direct Entry */}
          {activeTab === 'transfer' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-sky-600" />
                Record Internal Funds Transfer (Bank &harr; Cash)
              </h2>
              <form onSubmit={handleTransferSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">From Account (Credit)</label>
                    <select
                      value={transferForm.fromAccountId}
                      onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">Select Source Account...</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({formatPKR(a.currentBalance)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">To Account (Debit)</label>
                    <select
                      value={transferForm.toAccountId}
                      onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    >
                      <option value="">Select Destination Account...</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>{a.name} ({formatPKR(a.currentBalance)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Transfer Amount (PKR)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="e.g. 100000"
                      value={transferForm.amount}
                      onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Entry Date (Transfer Date) <span className="text-red-500">*</span></span>
                      <span className="text-[10px] font-mono text-sky-600 font-bold">Month: {transferForm.transferDate ? transferForm.transferDate.slice(0, 7) : ''}</span>
                    </label>
                    <input
                      type="date"
                      value={transferForm.transferDate}
                      onChange={(e) => setTransferForm({ ...transferForm, transferDate: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5 font-normal">
                      Saved & reported in this entry date&apos;s month.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Reference / Cheque No.</label>
                    <input
                      type="text"
                      placeholder="e.g. Cheque #49202"
                      value={transferForm.reference}
                      onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1">Transfer Description / Reason</label>
                  <textarea
                    rows="2"
                    placeholder="e.g. Cash withdrawal from bank for operational expenses"
                    value={transferForm.description}
                    onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
                  />
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] uppercase font-bold text-slate-700">
                      Transfer Evidence / Supporting Document (Optional)
                    </label>
                    <span className="text-[10px] text-slate-500">{transferEvidenceFiles.length}/3 files</span>
                  </div>
                  <EvidenceImageUpload
                    files={transferEvidenceFiles}
                    onChange={setTransferEvidenceFiles}
                    disabled={submittingTransfer}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Upload bank slips, deposit slips, cheque images, or other proof for Admin verification.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingTransfer}
                    className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submittingTransfer ? 'Transferring...' : 'Execute Internal Transfer'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB E: MASTER TRANSACTION AUDIT LEDGER                       */}
          {/* ============================================================ */}
          {activeTab === 'master-ledger' && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Month Picker */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-[11px] font-bold text-slate-700">Month:</span>
                    <input
                      type="month"
                      value={ledgerMonth}
                      onChange={(e) => {
                        setLedgerMonth(e.target.value);
                        loadMasterLedger({ month: e.target.value });
                      }}
                      className="bg-transparent text-slate-900 font-mono font-bold focus:outline-none cursor-pointer text-xs"
                    />
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search V.N, detail, payee..."
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadMasterLedger()}
                      className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-slate-900 focus:outline-none focus:border-indigo-500 w-56 font-medium text-xs"
                    />
                  </div>

                  {/* Status Filter */}
                  <select
                    value={ledgerStatus}
                    onChange={(e) => {
                      setLedgerStatus(e.target.value);
                      loadMasterLedger({ status: e.target.value });
                    }}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus:border-indigo-500 font-medium text-xs"
                  >
                    <option value="">Active Entries (Excludes Reversed)</option>
                    <option value="PENDING">Pending Review</option>
                    <option value="VERIFIED">Verified by Fahad</option>
                    <option value="REVERSED">Reversed / Cancelled</option>
                    <option value="ALL_INCLUDING_REVERSED">All (Including Reversed)</option>
                  </select>

                  {/* Category Filter */}
                  <select
                    value={ledgerCategory}
                    onChange={(e) => {
                      setLedgerCategory(e.target.value);
                      loadMasterLedger({ category: e.target.value });
                    }}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus:border-indigo-500 max-w-xs font-medium text-xs"
                  >
                    <option value="">All Account Heads</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => loadMasterLedger()}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Filter
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg text-right">
                    <span className="text-[10px] uppercase font-bold text-indigo-700 block">Total Filtered</span>
                    <span className="font-mono font-black text-indigo-900 text-sm">
                      {formatPKR(ledgerTotalAmount)}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    ({ledgerEntries.length} entries)
                  </span>
                </div>
              </div>

              {/* Master Ledger Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">V.N</th>
                        <th className="py-3 px-3">Detail / Narration</th>
                        <th className="py-3 px-3">Head</th>
                        <th className="py-3 px-3">Dr Account</th>
                        <th className="py-3 px-3">Cr Account</th>
                        <th className="py-3 px-3 text-right">Amount (PKR)</th>
                        <th className="py-3 px-3 text-center">Audit Status</th>
                        <th className="py-3 px-3 text-center">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {loadingLedger ? (
                        <tr>
                          <td colSpan="9" className="py-16 text-center text-slate-500">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                            Loading full master ledger...
                          </td>
                        </tr>
                      ) : ledgerEntries.length === 0 ? (
                        <tr>
                          <td colSpan="9" className="py-12 text-center text-slate-500">
                            No ledger entries found matching criteria for {ledgerMonth}.
                          </td>
                        </tr>
                      ) : (
                        ledgerEntries.map((tx) => {
                          const isVerified = tx.status === 'VERIFIED';
                          const isReversed = tx.status === 'REVERSED';
                          const dateStr = tx.date
                            ? new Date(tx.date).toISOString().split('T')[0]
                            : '-';
                          const accountsInfo = resolveTransactionAccounts(tx);
                          const hasAttachments = tx.attachments && tx.attachments.length > 0;

                          return (
                            <tr
                              key={tx._id}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isReversed ? 'text-slate-400 opacity-60 bg-slate-50/30' : 'text-slate-800'
                              }`}
                            >
                              <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                {dateStr}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                                #{tx.voucherNo}
                              </td>
                              <td className="py-2.5 px-3 max-w-sm truncate" title={tx.detail}>
                                <span className="font-semibold text-slate-900">{tx.detail}</span>
                                {tx.propertyId?.plazaName && (
                                  <span className="block text-[10px] text-blue-600 font-medium">
                                    🏢 {tx.propertyId.plazaName}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 border border-slate-200 font-medium text-[11px]">
                                  {tx.categoryId?.name || accountsInfo.head || 'Uncategorized'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-emerald-700 font-semibold whitespace-nowrap">
                                {accountsInfo.dr}
                              </td>
                              <td className="py-2.5 px-3 text-rose-700 font-semibold whitespace-nowrap">
                                {accountsInfo.cr}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${isReversed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                {formatPKR(tx.amount)}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {isVerified ? (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    {tx.checkedBy || 'Checked By Fahad'}
                                  </span>
                                ) : isReversed ? (
                                  <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                    Reversed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    Pending Review
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {hasAttachments ? (
                                  <button
                                    onClick={() => setViewingEvidenceTx(tx)}
                                    title={`View ${tx.attachments.length} attachment(s)`}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded font-semibold text-[10px] transition"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>{tx.attachments.length} file{tx.attachments.length > 1 ? 's' : ''}</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-mono">-</span>
                                )}
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
          {/* TAB F: REPORTS & FINANCIAL DASHBOARD                         */}
          {/* ============================================================ */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              {/* Top Controls Bar */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Reporting Month */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] font-bold text-slate-700">Period:</span>
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => {
                        setReportMonth(e.target.value);
                        loadReportData(reportSubTab, e.target.value);
                      }}
                      className="bg-transparent text-slate-900 font-mono font-bold focus:outline-none cursor-pointer text-xs"
                    />
                  </div>

                  {/* Subtabs Controls */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      onClick={() => {
                        setReportSubTab('overview');
                        loadReportData('overview', reportMonth);
                      }}
                      className={`px-3 py-1.5 rounded-md font-bold text-xs transition flex items-center gap-1.5 ${
                        reportSubTab === 'overview'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      Financial Overview
                    </button>

                    <button
                      onClick={() => {
                        setReportSubTab('headwise');
                        loadReportData('headwise', reportMonth);
                      }}
                      className={`px-3 py-1.5 rounded-md font-bold text-xs transition flex items-center gap-1.5 ${
                        reportSubTab === 'headwise'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Head-Wise Expenses
                    </button>

                    <button
                      onClick={() => {
                        setReportSubTab('rental');
                        loadReportData('rental', reportMonth);
                      }}
                      className={`px-3 py-1.5 rounded-md font-bold text-xs transition flex items-center gap-1.5 ${
                        reportSubTab === 'rental'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Home className="w-3.5 h-3.5" />
                      Rental Income Summary
                    </button>

                    <button
                      onClick={() => {
                        setReportSubTab('reconcile');
                        loadReportData('reconcile', reportMonth);
                      }}
                      className={`px-3 py-1.5 rounded-md font-bold text-xs transition flex items-center gap-1.5 ${
                        reportSubTab === 'reconcile'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Bank & Cash Statements
                    </button>
                  </div>
                </div>

                {/* PDF Download Button */}
                <button
                  onClick={handleDownloadReportPDF}
                  disabled={downloadingPDF}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition disabled:opacity-50 text-xs"
                >
                  {downloadingPDF ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Generating Report PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Download Funds Report PDF
                    </>
                  )}
                </button>
              </div>

              {/* PDF Download Success Banner */}
              {pdfSuccess && (
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{pdfSuccess}</span>
                </div>
              )}

              {/* Subtab 1: Financial Overview */}
              {reportSubTab === 'overview' && (
                <div className="space-y-4">
                  {loadingGlance ? (
                    <div className="bg-white border border-slate-200 rounded-xl py-16 text-center text-slate-500 text-sm">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      Aggregating monthly financial overview...
                    </div>
                  ) : glanceData ? (
                    <>
                      {/* 3 Macro Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5 shadow-sm">
                          <div className="text-[11px] uppercase font-bold tracking-wider text-emerald-800 mb-1 flex items-center justify-between">
                            <span>Total Inflow & Available</span>
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div className="font-mono text-2xl font-black text-emerald-950">
                            {formatPKR(glanceData.macro?.totalAmountAvailable)}
                          </div>
                          <div className="text-[11px] text-emerald-700 mt-2 flex justify-between font-medium">
                            <span>Rent: {formatPKR(glanceData.macro?.totalRentalIncomeReceived)}</span>
                            <span>Other: {formatPKR(glanceData.macro?.totalOtherReceipts)}</span>
                          </div>
                        </div>

                        <div className="bg-gradient-to-br from-amber-50 to-rose-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                          <div className="text-[11px] uppercase font-bold tracking-wider text-amber-800 mb-1 flex items-center justify-between">
                            <span>Total Net Disbursements</span>
                            <DollarSign className="w-4 h-4 text-amber-600" />
                          </div>
                          <div className="font-mono text-2xl font-black text-amber-950">
                            {formatPKR(glanceData.macro?.totalDisbursements)}
                          </div>
                          <div className="text-[11px] text-amber-700 mt-2 flex justify-between font-medium">
                            <span>Rental Exp: {formatPKR(glanceData.macro?.totalRentalDisbursements)}</span>
                            <span>Other Exp: {formatPKR(glanceData.macro?.totalOtherDisbursements)}</span>
                          </div>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 shadow-sm">
                          <div className="text-[11px] uppercase font-bold tracking-wider text-blue-800 mb-1 flex items-center justify-between">
                            <span>Closing Net Cash Balance</span>
                            <Wallet className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="font-mono text-2xl font-black text-blue-950">
                            {formatPKR(glanceData.macro?.closingCashBalance)}
                          </div>
                          <div className="text-[11px] text-blue-700 mt-2 font-medium">
                            Opening: {formatPKR(glanceData.macro?.openingBalanceTotal)} &bull; Reconciliation Verified
                          </div>
                        </div>
                      </div>

                      {/* Financial Matrix Table */}
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                          <h3 className="font-bold text-slate-900 text-xs">
                            Financial Matrix by Property & Fund Source ({reportMonth})
                          </h3>
                          <span className="text-[11px] font-semibold text-slate-500">Amounts in PKR</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200 text-[10px]">
                              <tr>
                                <th className="py-2.5 px-3">Plaza / Source</th>
                                <th className="py-2.5 px-3 text-right">Opening Bal</th>
                                <th className="py-2.5 px-3 text-right text-emerald-700">Rent Inflow</th>
                                <th className="py-2.5 px-3 text-right">Other Inflow</th>
                                <th className="py-2.5 px-3 text-right bg-slate-50 font-black text-blue-800">Total Input</th>
                                <th className="py-2.5 px-3 text-right text-rose-700">Rental Exp</th>
                                <th className="py-2.5 px-3 text-right">Other Exp</th>
                                <th className="py-2.5 px-3 text-right bg-slate-50 font-black text-amber-800">Total Output</th>
                                <th className="py-2.5 px-3 text-right bg-emerald-50 font-black text-emerald-900">Closing Bal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {glanceData.matrix?.plazas?.map((p) => (
                                <tr key={p.plazaId} className="hover:bg-slate-50 text-slate-700">
                                  <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                                    {p.plazaName}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-600">
                                    {formatPKR(p.openingBalance)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-emerald-700 font-medium">
                                    {formatPKR(p.rentalIncomeReceived)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-600">
                                    {formatPKR(p.otherReceipts)}
                                  </td>
                                  <td className="py-2 px-3 text-right bg-slate-50 font-bold text-blue-800">
                                    {formatPKR(p.totalInput)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-rose-600">
                                    {formatPKR(p.rentalExpenses)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-600">
                                    {formatPKR(p.otherExpenses)}
                                  </td>
                                  <td className="py-2 px-3 text-right bg-slate-50 font-bold text-amber-700">
                                    {formatPKR(p.totalOutput)}
                                  </td>
                                  <td className="py-2 px-3 text-right bg-emerald-50/60 font-bold text-emerald-900">
                                    {formatPKR(p.closingBalance)}
                                  </td>
                                </tr>
                              ))}
                              {glanceData.matrix?.nonPropertyPool && (
                                <tr className="hover:bg-slate-50 text-slate-700 border-t border-slate-200">
                                  <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                                    General Fund & Non-Property
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-600">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.openingBalance)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-emerald-700">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.rentalIncomeReceived)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-600">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.otherReceipts)}
                                  </td>
                                  <td className="py-2 px-3 text-right bg-slate-50 font-bold text-blue-800">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.totalInput)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-rose-600">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.rentalExpenses)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-600">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.otherExpenses)}
                                  </td>
                                  <td className="py-2 px-3 text-right bg-slate-50 font-bold text-amber-700">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.totalOutput)}
                                  </td>
                                  <td className="py-2 px-3 text-right bg-emerald-50/60 font-bold text-emerald-900">
                                    {formatPKR(glanceData.matrix.nonPropertyPool.closingBalance)}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            <tfoot className="bg-slate-100 font-mono font-black border-t-2 border-slate-300 text-slate-900">
                              <tr>
                                <td className="py-3 px-3 font-sans uppercase">Grand Total</td>
                                <td className="py-3 px-3 text-right">
                                  {formatPKR(glanceData.matrix?.grandTotal?.openingBalance)}
                                </td>
                                <td className="py-3 px-3 text-right text-emerald-700">
                                  {formatPKR(glanceData.matrix?.grandTotal?.rentalIncomeReceived)}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {formatPKR(glanceData.matrix?.grandTotal?.otherReceipts)}
                                </td>
                                <td className="py-3 px-3 text-right bg-slate-200/60 text-blue-900">
                                  {formatPKR(glanceData.matrix?.grandTotal?.totalInput)}
                                </td>
                                <td className="py-3 px-3 text-right text-rose-700">
                                  {formatPKR(glanceData.matrix?.grandTotal?.rentalExpenses)}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {formatPKR(glanceData.matrix?.grandTotal?.otherExpenses)}
                                </td>
                                <td className="py-3 px-3 text-right bg-slate-200/60 text-amber-900">
                                  {formatPKR(glanceData.matrix?.grandTotal?.totalOutput)}
                                </td>
                                <td className="py-3 px-3 text-right bg-emerald-100 text-emerald-950 text-sm">
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

              {/* Subtab 2: Head-Wise Expenses */}
              {reportSubTab === 'headwise' && (
                <div className="space-y-4">
                  {loadingHeadWise ? (
                    <div className="bg-white border border-slate-200 rounded-xl py-16 text-center text-slate-500 text-sm">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      Aggregating Head-Wise expenses...
                    </div>
                  ) : headWiseData ? (
                    <>
                      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between text-xs shadow-sm">
                        <div>
                          <span className="font-bold text-slate-900 text-sm block">
                            Disbursements Grouped by Expense Head
                          </span>
                          <span className="text-slate-500 font-medium">Reporting Period: {reportMonth}</span>
                        </div>
                        <div className="font-mono text-base font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                          Net Expenses: {formatPKR(headWiseData.totalExpensesOverall)}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(headWiseData.mainHeads?.length
                          ? headWiseData.mainHeads
                          : (headWiseData.heads || []).map((h) => ({
                              mainHeadId: h.categoryId,
                              mainHeadName: h.headName,
                              totalSpent: h.totalSpent,
                              transactionCount: h.transactionCount,
                              expenses: [h],
                            }))
                        ).map((head) => {
                          const isExpanded = expandedHeads[head.mainHeadId] ?? true;
                          return (
                            <div
                              key={head.mainHeadId || head.mainHeadName}
                              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                            >
                              <button
                                onClick={() =>
                                  setExpandedHeads((prev) => ({
                                    ...prev,
                                    [head.mainHeadId]: !isExpanded,
                                  }))
                                }
                                className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left transition border-b border-slate-200"
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                  )}
                                  <span className="font-bold text-slate-900 text-sm">{head.mainHeadName}</span>
                                  <span className="text-xs text-slate-500 font-medium">
                                    ({head.transactionCount || head.expenses?.length || 0} entries)
                                  </span>
                                </div>
                                <div className="font-mono font-bold text-slate-900 text-sm">
                                  {formatPKR(head.totalSpent)}
                                </div>
                              </button>

                              {isExpanded && head.expenses && (
                                <div className="p-3 overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-3">Sub-Head / Voucher</th>
                                        <th className="py-2 px-3">Detail</th>
                                        <th className="py-2 px-3">Location / Property</th>
                                        <th className="py-2 px-3 text-right">Disbursed (PKR)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {head.expenses.map((sub, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 text-slate-700">
                                          <td className="py-2 px-3 font-semibold text-slate-900">
                                            {sub.headName || sub.detail || 'Expense'}
                                          </td>
                                          <td className="py-2 px-3 text-slate-600">{sub.detail || '-'}</td>
                                          <td className="py-2 px-3 text-slate-500 font-medium">
                                            {sub.propertyId?.plazaName || sub.location || '-'}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                            {formatPKR(sub.totalSpent || sub.amount)}
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

              {/* Subtab 3: Rental Income Summary */}
              {reportSubTab === 'rental' && (
                <div className="space-y-4">
                  {loadingRentalSummary ? (
                    <div className="bg-white border border-slate-200 rounded-xl py-16 text-center text-slate-500 text-sm">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      Aggregating Portfolio Rental Register...
                    </div>
                  ) : rentalSummaryData ? (
                    <>
                      {/* Grand Total Stats Bar */}
                      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs shadow-sm">
                        <div>
                          <span className="font-bold text-slate-900 text-sm block">
                            Portfolio Tenancy Register ({reportMonth})
                          </span>
                          <span className="text-slate-500 font-medium">
                            Collection Rate:{' '}
                            <strong className="text-emerald-700">
                              {rentalSummaryData.grandTotals?.collectionRate}%
                            </strong>{' '}
                            across properties
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">
                              Agreed Rent
                            </span>
                            <span className="text-slate-900 font-bold">
                              {formatPKR(rentalSummaryData.grandTotals?.totalAgreedRent)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">
                              Received
                            </span>
                            <span className="text-emerald-700 font-black">
                              {formatPKR(rentalSummaryData.grandTotals?.totalReceivedAmount)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">
                              Outstanding
                            </span>
                            <span className="text-rose-700 font-bold">
                              {formatPKR(rentalSummaryData.grandTotals?.totalOutstandingReceivable)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">
                              Advance Held
                            </span>
                            <span className="text-teal-700 font-bold">
                              {formatPKR(rentalSummaryData.grandTotals?.totalAdvanceRentReceived)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Plaza Accordions */}
                      <div className="space-y-3">
                        {rentalSummaryData.plazas?.map((plaza) => {
                          const isExpanded = expandedPlazas[plaza.plazaId] ?? true;
                          return (
                            <div
                              key={plaza.plazaId}
                              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                            >
                              <button
                                onClick={() =>
                                  setExpandedPlazas((prev) => ({
                                    ...prev,
                                    [plaza.plazaId]: !isExpanded,
                                  }))
                                }
                                className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 border-b border-slate-200 flex items-center justify-between text-left transition"
                              >
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                  )}
                                  <div>
                                    <span className="font-bold text-sm text-slate-900 block">
                                      {plaza.plazaName}
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">
                                      {plaza.unitsCount} Units &bull; Collection Rate:{' '}
                                      <strong className="text-emerald-700">
                                        {plaza.subtotals?.collectionRate}%
                                      </strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 text-xs font-mono">
                                  <div>
                                    <span className="text-slate-400 text-[10px] uppercase block font-bold">
                                      Rent Roll
                                    </span>
                                    <span className="text-slate-700 font-semibold">
                                      {formatPKR(plaza.subtotals?.agreedRent)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 text-[10px] uppercase block font-bold">
                                      Received
                                    </span>
                                    <span className="text-emerald-700 font-black">
                                      {formatPKR(plaza.subtotals?.receivedAmount)}
                                    </span>
                                  </div>
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="overflow-x-auto p-3">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200 text-[10px]">
                                      <tr>
                                        <th className="py-2 px-3">Unit / Floor</th>
                                        <th className="py-2 px-3">Tenant Name</th>
                                        <th className="py-2 px-3">Due Day</th>
                                        <th className="py-2 px-3 text-right">Agreed Rent</th>
                                        <th className="py-2 px-3 text-right">Received</th>
                                        <th className="py-2 px-3">Receiving Bank</th>
                                        <th className="py-2 px-3 text-right">Outstanding</th>
                                        <th className="py-2 px-3 text-right">Advance</th>
                                        <th className="py-2 px-3 text-center">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {plaza.units?.map((u) => (
                                        <tr key={u.unitId} className="hover:bg-slate-50 text-slate-700">
                                          <td className="py-2 px-3 font-semibold text-slate-900">
                                            {u.unitName}
                                          </td>
                                          <td className="py-2 px-3 text-slate-600">{u.tenantName}</td>
                                          <td className="py-2 px-3 font-mono">{u.dueDay}</td>
                                          <td className="py-2 px-3 text-right font-mono font-semibold">
                                            {formatPKR(u.agreedRent)}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono font-black text-emerald-700">
                                            {formatPKR(u.receivedAmount)}
                                          </td>
                                          <td className="py-2 px-3 text-slate-500 text-[11px]">
                                            {u.receivingAccountName}
                                          </td>
                                          <td
                                            className={`py-2 px-3 text-right font-mono ${
                                              u.outstandingReceivable > 0
                                                ? 'text-rose-700 font-bold'
                                                : 'text-slate-400'
                                            }`}
                                          >
                                            {formatPKR(u.outstandingReceivable)}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono text-teal-700">
                                            {formatPKR(u.advanceRentReceived)}
                                          </td>
                                          <td className="py-2 px-3 text-center">
                                            {u.isCheckedByFahad ? (
                                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold">
                                                Verified
                                              </span>
                                            ) : (
                                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium">
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

              {/* Subtab 4: Bank & Cash Reconciliations */}
              {reportSubTab === 'reconcile' && (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-700">Select Account / Custodian:</span>
                      <select
                        value={reconcileAccountId}
                        onChange={(e) => {
                          setReconcileAccountId(e.target.value);
                          loadReportData('reconcile', reportMonth, e.target.value);
                        }}
                        className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-emerald-500"
                      >
                        <optgroup label="Bank Accounts">
                          {accounts
                            .filter((a) => a.type === 'BANK')
                            .map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.name} ({formatPKR(a.currentBalance)})
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Cash Custodians">
                          {accounts
                            .filter((a) => a.type === 'CASH')
                            .map((a) => (
                              <option key={a._id} value={a._id}>
                                {a.name} ({formatPKR(a.currentBalance)})
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>

                    <button
                      onClick={() => loadReportData('reconcile', reportMonth)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition flex items-center gap-1.5 font-bold"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh Statement
                    </button>
                  </div>

                  {loadingReconcile ? (
                    <div className="bg-white border border-slate-200 rounded-xl py-16 text-center text-slate-500 text-sm">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      Loading statement movements...
                    </div>
                  ) : reconcileData ? (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {reconcileData.accountName || 'Account Statement'} &bull; Period: {reportMonth}
                        </span>
                        <div className="flex items-center gap-4 font-mono text-xs">
                          <span>Opening: <strong>{formatPKR(reconcileData.openingBalance)}</strong></span>
                          <span className="text-emerald-700">Closing: <strong>{formatPKR(reconcileData.closingBalance)}</strong></span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[10px] border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">V.N</th>
                              <th className="py-2.5 px-3">Detail</th>
                              <th className="py-2.5 px-3">Counterparty</th>
                              <th className="py-2.5 px-3 text-right text-emerald-700">Debit (Dr)</th>
                              <th className="py-2.5 px-3 text-right text-rose-700">Credit (Cr)</th>
                              <th className="py-2.5 px-3 text-right font-black">Running Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {(!reconcileData.entries || reconcileData.entries.length === 0) ? (
                              <tr>
                                <td colSpan="7" className="py-8 text-center text-slate-500 font-sans">
                                  No movements found for this account in {reportMonth}.
                                </td>
                              </tr>
                            ) : (
                              reconcileData.entries.map((tx) => (
                                <tr key={tx._id} className="hover:bg-slate-50 text-slate-800">
                                  <td className="py-2 px-3 text-slate-500">
                                    {tx.date ? new Date(tx.date).toISOString().split('T')[0] : '-'}
                                  </td>
                                  <td className="py-2 px-3 font-bold text-indigo-700">
                                    #{tx.voucherNo}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-slate-900">{tx.detail}</td>
                                  <td className="py-2 px-3 font-sans text-slate-500">
                                    {tx.counterpartyAccount || '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right text-emerald-700 font-bold">
                                    {tx.drAmount > 0 ? formatPKR(tx.drAmount) : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right text-rose-700 font-bold">
                                    {tx.crAmount > 0 ? formatPKR(tx.crAmount) : '-'}
                                  </td>
                                  <td
                                    className={`py-2 px-3 text-right font-black ${
                                      tx.runningBalance < 0 ? 'text-rose-700' : 'text-slate-900'
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
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Entries Journal Table (Only on voucher entry tabs) */}
        {(activeTab === 'expense' || activeTab === 'rent' || activeTab === 'other' || activeTab === 'transfer') && (
          <RecentEntriesTable
            entries={recentEntries}
            pendingEntries={pendingEntries}
            properties={properties}
            categories={categories}
            accounts={accounts}
            otherHeads={otherHeads}
            loading={refreshingEntries || loadingData}
            onRefresh={refreshEntries}
            onEntryUpdated={refreshEntries}
          />
        )}

        {/* Evidence Viewer Modal */}
        {viewingEvidenceTx && (
          <ReceiptViewerModal
            entry={viewingEvidenceTx}
            onClose={() => setViewingEvidenceTx(null)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 font-medium">
        Pixx Technologies Financial Systems &bull; Operational Workspace &bull; Double-Entry General Ledger
      </footer>
    </div>
  );
};

export default DataEntryDashboard;
