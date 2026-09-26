import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Receipt,
  Building2,
  Users,
  Calendar,
  Plus,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  RotateCcw,
  ShieldCheck,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { rentReceivedAPI, accountsAPI, propertiesAPI, tenantsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin, isVerifier, isDataEntry, isOperationalEntryBlocked } from '../utils/permissions.js';
import SingleVoucherPrintModal from '../components/SingleVoucherPrintModal.jsx';

export function RentReceivedPage({
  currentUser,
  onNavigateToRentDue,
  onNavigateToAccounts,
  onSelectTenant,
}) {
  const userIsAdmin = isAdmin(currentUser);

  const [receipts, setReceipts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown reference data
  const [propertiesList, setPropertiesList] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [tenantsList, setTenantsList] = useState([]);

  // Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTenantLease, setSelectedTenantLease] = useState(null);
  const [loadingLease, setLoadingLease] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form Data
  const [formData, setFormData] = useState({
    tenantId: '',
    rentMonth: '2026-08',
    amount: '',
    paymentMethod: 'CASH',
    receivingAccountId: '',
    receiptDate: '2026-08-05',
    referenceNumber: '',
    checkedBy: 'Fahad',
    description: '',
    allocatePriorReceivable: true,
  });

  // Receipt Details Modal
  const [detailsReceipt, setDetailsReceipt] = useState(null);
  const [printVoucherId, setPrintVoucherId] = useState(null);

  // Fetch receipts and summary
  const fetchReceiptsAndSummary = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedMonth && selectedMonth !== 'ALL') params.month = selectedMonth;
      if (propertyFilter) params.propertyId = propertyFilter;
      if (accountFilter) params.receivingAccountId = accountFilter;
      if (methodFilter) params.paymentMethod = methodFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const [receiptsRes, summaryRes] = await Promise.all([
        rentReceivedAPI.getRentReceipts(params),
        rentReceivedAPI.getSummary({ month: selectedMonth === 'ALL' ? '2026-08' : selectedMonth }),
      ]);

      if (receiptsRes?.success && receiptsRes.data) {
        setReceipts(receiptsRes.data.receipts || []);
      }
      if (summaryRes?.success && summaryRes.data) {
        setSummary(summaryRes.data);
      }
    } catch (err) {
      console.error('Failed to load rent received data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load dropdown resources once
  useEffect(() => {
    const loadResources = async () => {
      try {
        const [propsRes, accsRes, tenantsRes] = await Promise.all([
          propertiesAPI.getProperties({ limit: 100 }),
          accountsAPI.getAccounts({ status: 'ACTIVE', limit: 100 }),
          tenantsAPI.getTenants({ status: 'ACTIVE', limit: 100 }),
        ]);
        if (propsRes?.success && propsRes.data?.properties) {
          setPropertiesList(propsRes.data.properties);
        }
        if (accsRes?.success && accsRes.data?.accounts) {
          setAccountsList(accsRes.data.accounts);
        }
        if (tenantsRes?.success && tenantsRes.data?.tenants) {
          setTenantsList(tenantsRes.data.tenants);
        }
      } catch (err) {
        console.error('Failed to load resources:', err);
      }
    };
    loadResources();
  }, []);

  useEffect(() => {
    fetchReceiptsAndSummary();
  }, [selectedMonth, propertyFilter, accountFilter, methodFilter, searchQuery]);

  // Handle Tenant selection in Payment Modal
  const handleTenantChange = async (tId) => {
    setFormData((prev) => ({ ...prev, tenantId: tId }));
    setSelectedTenantLease(null);
    setModalError('');

    if (!tId) return;

    try {
      setLoadingLease(true);
      const res = await rentReceivedAPI.getTenantActiveLease(tId, {
        month: formData.rentMonth,
      });
      if (res?.success && res.data) {
        setSelectedTenantLease(res.data);
        if (res.data.hasActiveAgreement) {
          // Pre-fill amount with remaining current due if > 0, else monthly rent
          const defaultAmt =
            res.data.remainingCurrentDue > 0
              ? res.data.remainingCurrentDue
              : res.data.agreement.monthlyRent;
          setFormData((prev) => ({ ...prev, amount: String(defaultAmt) }));
        } else {
          setModalError('Selected tenant does not have an active rental agreement.');
        }
      }
    } catch (err) {
      setModalError('Failed to load tenant agreement information.');
    } finally {
      setLoadingLease(false);
    }
  };

  const handleOpenPaymentModal = () => {
    setModalError('');
    setSelectedTenantLease(null);
    // Find a default cash account
    const defaultCash = accountsList.find((a) => a.type === 'CASH')?._id || '';

    setFormData({
      tenantId: '',
      rentMonth: selectedMonth === 'ALL' ? '2026-08' : selectedMonth,
      amount: '',
      paymentMethod: 'CASH',
      receivingAccountId: defaultCash,
      receiptDate: '2026-08-05',
      referenceNumber: '',
      checkedBy: 'Fahad',
      description: '',
      allocatePriorReceivable: true,
    });
    setIsModalOpen(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setModalError('');
    setSubmitting(true);

    try {
      if (!formData.tenantId) throw new Error('Please select a tenant.');
      if (!selectedTenantLease || !selectedTenantLease.hasActiveAgreement) {
        throw new Error('Tenant has no active rental agreement.');
      }
      if (!formData.receivingAccountId) {
        throw new Error('Please select a receiving bank or cash account.');
      }
      const numAmount = Number(formData.amount);
      if (!numAmount || numAmount <= 0) {
        throw new Error('Amount received must be greater than zero.');
      }

      const payload = {
        tenantId: formData.tenantId,
        agreementId: selectedTenantLease.agreement._id,
        propertyId: selectedTenantLease.property._id,
        unitId: selectedTenantLease.unit?._id || selectedTenantLease.agreement.unitId,
        rentDueId: selectedTenantLease.currentRentDue?._id || undefined,
        rentMonth: formData.rentMonth,
        amount: numAmount,
        receiptDate: formData.receiptDate,
        receivingAccountId: formData.receivingAccountId,
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber.trim(),
        checkedBy: formData.checkedBy.trim(),
        description: formData.description.trim(),
        allocatePriorReceivable: formData.allocatePriorReceivable,
      };

      const res = await rentReceivedAPI.recordRentReceived(payload);
      if (res?.success) {
        setSuccessMsg(
          `Rent receipt ${res.data.receipt?.receiptNumber} for ${formatPKR(numAmount)} recorded successfully!`
        );
        setIsModalOpen(false);
        fetchReceiptsAndSummary();
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        throw new Error(res?.message || 'Failed to record rent payment.');
      }
    } catch (err) {
      setModalError(err.response?.data?.message || err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverseReceipt = async (receipt) => {
    if (!userIsAdmin) return;
    const reason = window.prompt(
      `Are you sure you want to reverse Receipt ${receipt.receiptNumber} (${formatPKR(receipt.amount)})?\n\nPlease enter reason for reversal:`
    );
    if (!reason || !reason.trim()) return;

    try {
      const res = await rentReceivedAPI.reverseReceipt(receipt._id, { reason: reason.trim() });
      if (res?.success) {
        setSuccessMsg(`Receipt ${receipt.receiptNumber} successfully reversed.`);
        fetchReceiptsAndSummary();
        setTimeout(() => setSuccessMsg(''), 5000);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reverse receipt.');
    }
  };

  // Filter accounts according to payment method
  const filteredReceivingAccounts = accountsList.filter((a) => {
    if (formData.paymentMethod === 'BANK_TRANSFER') return a.type === 'BANK';
    if (formData.paymentMethod === 'CASH') return a.type === 'CASH';
    return true; // CHEQUE or OTHER can deposit into either
  });

  // Calculate dynamic live allocation preview in modal
  const inputAmt = Number(formData.amount) || 0;
  let previewAllocatedCurrent = 0;
  let previewAllocatedPrior = 0;
  let previewAllocatedAdvance = 0;
  let previewRemainingCurrent = 0;

  if (selectedTenantLease && inputAmt > 0) {
    let unalloc = inputAmt;
    const priorDue = selectedTenantLease.priorOutstandingAmount || 0;
    const currentDue = selectedTenantLease.remainingCurrentDue || 0;

    if (formData.allocatePriorReceivable && priorDue > 0) {
      previewAllocatedPrior = Math.min(unalloc, priorDue);
      unalloc -= previewAllocatedPrior;
    }

    if (unalloc > 0 && currentDue > 0) {
      previewAllocatedCurrent = Math.min(unalloc, currentDue);
      unalloc -= previewAllocatedCurrent;
    } else if (unalloc > 0 && !selectedTenantLease.currentRentDue) {
      const agreedRent = selectedTenantLease.agreement?.monthlyRent || 0;
      previewAllocatedCurrent = Math.min(unalloc, agreedRent);
      unalloc -= previewAllocatedCurrent;
    }

    previewAllocatedAdvance = Math.max(0, unalloc);
    previewRemainingCurrent = Math.max(0, currentDue - previewAllocatedCurrent);
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                Rental Income Core
              </span>
              <span className="text-xs text-slate-400">
                Tenant Collections, 3-Tier Allocation & General Ledger
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="text-emerald-400" size={26} />
              Rent Received & Rental Income
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Record actual tenant rental collections with strict separation between <strong>Rent Due</strong>,
              <strong> Rent Received</strong>, <strong>Receivable</strong>, and <strong>Advance Rent</strong>.
              Every receipt automatically updates receiving bank or cash custodian accounts and posts atomic
              journal vouchers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {onNavigateToRentDue && (
              <button
                onClick={onNavigateToRentDue}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3.5 py-2.5 rounded-lg text-xs transition flex items-center gap-1.5 border border-slate-700 shadow-sm"
              >
                <Receipt size={15} className="text-amber-400" />
                Rent Due Schedule
              </button>
            )}
            {onNavigateToAccounts && (
              <button
                onClick={onNavigateToAccounts}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3.5 py-2.5 rounded-lg text-xs transition flex items-center gap-1.5 border border-slate-700 shadow-sm"
              >
                <Landmark size={15} className="text-sky-400" />
                Accounts
              </button>
            )}
            <button
              onClick={handleOpenPaymentModal}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition flex items-center gap-2 shadow-sm shrink-0"
            >
              <Plus size={16} />
              Record Rent Payment
            </button>
          </div>
        </div>
      </div>

      {/* Flash Success Notification */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Rent Collected */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Total Rent Collected</span>
              <TrendingUp size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-2">
              {formatPKR(summary.totalActualReceived ?? 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>{summary.receiptsCount ?? 0} receipts processed</span>
              <span className="text-emerald-400/90 font-semibold">{summary.collectionPercentage ?? 0}% collected</span>
            </div>
          </div>

          {/* Card 2: Current Month Due & Cleared */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Current Month Cleared</span>
              <CheckCircle2 size={16} className="text-sky-400" />
            </div>
            <div className="text-2xl font-black text-sky-400 font-mono mt-2">
              {formatPKR(summary.currentMonthAllocated ?? 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Of {formatPKR(summary.totalRentDue ?? 0)} total rent due
            </div>
          </div>

          {/* Card 3: Advance Rent Surplus */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Advance Rent Collected</span>
              <Clock size={16} className="text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-indigo-300 font-mono mt-2">
              {formatPKR(summary.advanceRentReceived ?? 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Held as tenant credit (Non-P&L)
            </div>
          </div>

          {/* Card 4: Outstanding Receivable */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Outstanding Receivable</span>
              <AlertCircle size={16} className="text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400 font-mono mt-2">
              {formatPKR(summary.netOutstandingReceivable ?? 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>{summary.statusCounts?.dueOrOverdue ?? 0} units overdue/due</span>
              <span className="text-slate-400">Target: {summary.month}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-400" />
            <span className="text-xs text-slate-400 font-semibold">Month:</span>
            <input
              type="month"
              value={selectedMonth === 'ALL' ? '' : selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || 'ALL')}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              onClick={() => setSelectedMonth('ALL')}
              className={`text-xs px-2.5 py-1 rounded font-semibold transition ${
                selectedMonth === 'ALL'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedMonth('2026-09')}
              className={`text-xs px-2.5 py-1 rounded font-semibold transition ${
                selectedMonth === '2026-09'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Sep 2026
            </button>
            <button
              onClick={() => setSelectedMonth('2026-08')}
              className={`text-xs px-2.5 py-1 rounded font-semibold transition ${
                selectedMonth === '2026-08'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Aug 2026
            </button>
          </div>

          {/* Property Filter */}
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-slate-400" />
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Properties</option>
              {propertiesList.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.plazaName}
                </option>
              ))}
            </select>
          </div>

          {/* Receiving Account Filter */}
          <div className="flex items-center gap-2">
            <Landmark size={15} className="text-slate-400" />
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Accounts</option>
              {accountsList.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Payment Methods</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CASH">Cash in Hand</option>
            <option value="CHEQUE">Cheque</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search receipt no, tenant, ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Receipts Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-bold tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3.5">Receipt No</th>
                <th className="py-3 px-3.5">Date</th>
                <th className="py-3 px-3.5">Tenant</th>
                <th className="py-3 px-3.5">Property / Unit</th>
                <th className="py-3 px-3.5">Month</th>
                <th className="py-3 px-3.5 text-right">Amount (PKR)</th>
                <th className="py-3 px-3.5">Allocation Breakdown</th>
                <th className="py-3 px-3.5">Receiving Account</th>
                <th className="py-3 px-3.5 text-center">Method</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="11" className="py-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Loading rental receipts...
                    </div>
                  </td>
                </tr>
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-8 text-center text-slate-500">
                    No rent receipts found matching current filter criteria.
                  </td>
                </tr>
              ) : (
                receipts.map((rcpt) => {
                  const isReversed = rcpt.status === 'REVERSED';
                  const isBank = rcpt.receivingAccountId?.type === 'BANK';

                  return (
                    <tr
                      key={rcpt._id}
                      className={`hover:bg-slate-800/40 transition ${
                        isReversed ? 'opacity-60 bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Receipt No */}
                      <td className="py-3 px-3.5 font-mono font-bold text-white whitespace-nowrap">
                        {rcpt.receiptNumber}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3.5 font-mono text-slate-400 whitespace-nowrap">
                        {formatDate(rcpt.receiptDate)}
                      </td>

                      {/* Tenant */}
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-200 truncate">
                          {rcpt.tenantId?.fullName || '—'}
                        </div>
                        {rcpt.tenantId?.phone && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            {rcpt.tenantId.phone}
                          </div>
                        )}
                      </td>

                      {/* Property / Unit */}
                      <td className="py-3 px-3.5">
                        <div className="text-white font-medium truncate">
                          {rcpt.propertyId?.plazaName || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {rcpt.propertyId?.city}
                        </div>
                      </td>

                      {/* Month */}
                      <td className="py-3 px-3.5 font-mono text-xs text-indigo-300 font-semibold whitespace-nowrap">
                        {rcpt.rentMonth}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3.5 text-right font-mono font-black text-white text-sm whitespace-nowrap">
                        {formatPKR(rcpt.amount)}
                      </td>

                      {/* Allocation Breakdown */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {rcpt.allocatedCurrentMonth > 0 && (
                            <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
                              Curr: {formatPKR(rcpt.allocatedCurrentMonth)}
                            </span>
                          )}
                          {rcpt.allocatedPreviousReceivable > 0 && (
                            <span className="text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 px-1.5 py-0.5 rounded font-mono">
                              Prior: {formatPKR(rcpt.allocatedPreviousReceivable)}
                            </span>
                          )}
                          {rcpt.allocatedAdvance > 0 && (
                            <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono">
                              Adv: {formatPKR(rcpt.allocatedAdvance)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Receiving Account */}
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-200 flex items-center gap-1.5 truncate">
                          {isBank ? (
                            <Building2 size={13} className="text-sky-400 shrink-0" />
                          ) : (
                            <Wallet size={13} className="text-amber-400 shrink-0" />
                          )}
                          <span className="truncate">{rcpt.receivingAccountId?.name || '—'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {isBank ? rcpt.receivingAccountId?.bankName : rcpt.receivingAccountId?.cashHolder}
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-3.5 text-center">
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {rcpt.paymentMethod}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isReversed
                              ? 'bg-rose-950/80 text-rose-300 border-rose-800/60'
                              : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                          }`}
                        >
                          {rcpt.status || 'VERIFIED'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setPrintVoucherId(rcpt.transactionId?._id || rcpt.transactionId || rcpt._id)}
                            className="bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 px-2 py-1 rounded text-[11px] transition flex items-center gap-1"
                            title="Print A4 Receipt Voucher"
                          >
                            <Printer size={12} />
                            Print
                          </button>
                          <button
                            onClick={() => setDetailsReceipt(rcpt)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-[11px] transition flex items-center gap-1"
                            title="View Full Breakdown"
                          >
                            <Eye size={12} />
                            Details
                          </button>
                          {userIsAdmin && !isReversed && (
                            <button
                              onClick={() => handleReverseReceipt(rcpt)}
                              className="bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/40 px-2 py-1 rounded text-[11px] transition flex items-center gap-1"
                              title="Reverse Receipt"
                            >
                              <RotateCcw size={11} />
                              Reverse
                            </button>
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

      {/* Record Rent Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-emerald-400" />
                <h3 className="font-bold text-white text-base">
                  Record Rent Received
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs">
              {/* Tenant & Rent Month */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Select Tenant <span className="text-rose-400">*</span>
                  </label>
                  <select
                    required
                    value={formData.tenantId}
                    onChange={(e) => handleTenantChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Select Tenant</option>
                    {tenantsList.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.fullName} {t.companyName ? `(${t.companyName})` : ''} - {t.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Billing Cycle Month <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="month"
                    required
                    value={formData.rentMonth}
                    onChange={(e) => {
                      const newM = e.target.value;
                      setFormData((prev) => ({ ...prev, rentMonth: newM }));
                      if (formData.tenantId) {
                        handleTenantChange(formData.tenantId);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Dynamic Lease & Due Snapshot Card */}
              {loadingLease ? (
                <div className="p-3 bg-slate-950 rounded-lg text-slate-400 text-center flex items-center justify-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Loading tenant lease and rent due status...
                </div>
              ) : selectedTenantLease && selectedTenantLease.hasActiveAgreement ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    <span>Lease & Due Information</span>
                    <span className="text-emerald-400 font-mono">
                      Agreement: {selectedTenantLease.agreement.agreementNumber}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <div className="text-slate-400">Property / Unit:</div>
                      <div className="font-bold text-white truncate">
                        {selectedTenantLease.property.plazaName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {selectedTenantLease.unit?.unitName || 'Unit'}
                      </div>
                    </div>

                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <div className="text-slate-400">Agreed Rent:</div>
                      <div className="font-mono font-black text-white mt-0.5">
                        {formatPKR(selectedTenantLease.agreement.monthlyRent)}
                      </div>
                      <div className="text-[10px] text-slate-500">Due day: {selectedTenantLease.agreement.dueDay}</div>
                    </div>

                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <div className="text-slate-400">Remaining Current Due:</div>
                      <div className="font-mono font-black text-amber-400 mt-0.5">
                        {formatPKR(selectedTenantLease.remainingCurrentDue)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Paid so far: {formatPKR(selectedTenantLease.alreadyPaidCurrent)}
                      </div>
                    </div>

                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <div className="text-slate-400">Prior Overdue Dues:</div>
                      <div
                        className={`font-mono font-black mt-0.5 ${
                          selectedTenantLease.priorOutstandingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatPKR(selectedTenantLease.priorOutstandingAmount)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {selectedTenantLease.priorDuesCount} prior overdue periods
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Amount & Payment Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Amount Received (PKR) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="e.g. 50000"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Payment Receipt Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.receiptDate}
                    onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Payment Method & Receiving Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Payment Method <span className="text-rose-400">*</span>
                  </label>
                  <select
                    required
                    value={formData.paymentMethod}
                    onChange={(e) => {
                      const newMeth = e.target.value;
                      // Update default account matching new method
                      const matchingAcc = accountsList.find((a) =>
                        newMeth === 'BANK_TRANSFER' ? a.type === 'BANK' : a.type === 'CASH'
                      );
                      setFormData({
                        ...formData,
                        paymentMethod: newMeth,
                        receivingAccountId: matchingAcc?._id || '',
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Receiving Account <span className="text-rose-400">*</span>
                  </label>
                  <select
                    required
                    value={formData.receivingAccountId}
                    onChange={(e) => setFormData({ ...formData, receivingAccountId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Select Receiving Account</option>
                    {filteredReceivingAccounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.name} ({acc.type}) — Bal: {formatPKR(acc.currentBalance || 0)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Allocation Preview Box */}
              {selectedTenantLease && inputAmt > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>3-Tier Payment Allocation Preview</span>
                    <span className="text-emerald-400 font-mono">Amount: {formatPKR(inputAmt)}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-indigo-400 font-bold">1. Prior Cleared:</div>
                      <div className="font-mono text-white mt-1">
                        {formatPKR(previewAllocatedPrior)}
                      </div>
                      <div className="text-[10px] text-slate-500">Overdue dues cleared</div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-emerald-400 font-bold">2. Current Cleared:</div>
                      <div className="font-mono text-white mt-1">
                        {formatPKR(previewAllocatedCurrent)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Remaining due: {formatPKR(previewRemainingCurrent)}
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-amber-400 font-bold">3. Advance Surplus:</div>
                      <div className="font-mono text-white mt-1">
                        {formatPKR(previewAllocatedAdvance)}
                      </div>
                      <div className="text-[10px] text-slate-500">Held as advance credit</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reference & Checked By */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Reference / Cheque # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CHQ-481902 / Online Ref"
                    value={formData.referenceNumber}
                    onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Checked / Verified By
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Fahad"
                    value={formData.checkedBy}
                    onChange={(e) => setFormData({ ...formData, checkedBy: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Narration / Notes
                </label>
                <input
                  type="text"
                  placeholder="Optional custom narration..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
                  Save Rent Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Details Modal */}
      {detailsReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt size={20} className="text-emerald-400" />
                <h3 className="font-bold text-white text-base">
                  Rent Receipt {detailsReceipt.receiptNumber}
                </h3>
              </div>
              <button
                onClick={() => setDetailsReceipt(null)}
                className="text-slate-400 hover:text-white transition"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-slate-400">Total Amount Received:</div>
                  <div className="text-lg font-black font-mono text-emerald-400 mt-0.5">
                    {formatPKR(detailsReceipt.amount)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Date Received:</div>
                  <div className="font-mono text-white mt-0.5">
                    {formatDate(detailsReceipt.receiptDate)}
                  </div>
                </div>
              </div>

              {/* 3-Tier Allocation Breakdown */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                  Payment Allocation Breakdown
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Allocated to Current Month:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatPKR(detailsReceipt.allocatedCurrentMonth || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Allocated to Prior Overdue:</span>
                  <span className="font-mono font-bold text-indigo-400">
                    {formatPKR(detailsReceipt.allocatedPreviousReceivable || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">Advance Rent Surplus:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {formatPKR(detailsReceipt.allocatedAdvance || 0)}
                  </span>
                </div>
              </div>

              {/* Receiving Account & Method */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Receiving Account:</span>
                  <span className="font-bold text-white">
                    {detailsReceipt.receivingAccountId?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Payment Method:</span>
                  <span className="font-mono text-slate-200">{detailsReceipt.paymentMethod}</span>
                </div>
                {detailsReceipt.referenceNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Reference / Cheque:</span>
                    <span className="font-mono text-slate-200">{detailsReceipt.referenceNumber}</span>
                  </div>
                )}
                {detailsReceipt.checkedBy && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Checked By:</span>
                    <span className="font-semibold text-emerald-400">{detailsReceipt.checkedBy}</span>
                  </div>
                )}
              </div>

              {/* Narration */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400">Narration / Detail:</div>
                <div className="text-white mt-1">{detailsReceipt.description}</div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => setPrintVoucherId(detailsReceipt.transactionId?._id || detailsReceipt.transactionId || detailsReceipt._id)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5 text-xs"
              >
                <Printer size={14} />
                Print A4 Voucher
              </button>
              <button
                onClick={() => setDetailsReceipt(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Single A4 Voucher Modal */}
      {printVoucherId && (
        <SingleVoucherPrintModal
          voucherId={printVoucherId}
          onClose={() => setPrintVoucherId(null)}
        />
      )}
    </div>
  );
}

export default RentReceivedPage;
