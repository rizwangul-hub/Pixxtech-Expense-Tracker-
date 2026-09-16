import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Building2,
  Banknote,
  Users,
  Receipt,
  Tag,
  CircleDollarSign,
  Search,
  Calendar,
  RefreshCw,
  Eye,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { ledgersAPI } from '../services/api.js';
import { formatPKR } from '../utils/formatters.js';

export function LedgersPage({ currentUser }) {
  // Ledger Type Selector
  const [ledgerType, setLedgerType] = useState('BANK');

  // Selectable entities
  const [entities, setEntities] = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');

  // Date Filtering Controls
  const [datePreset, setDatePreset] = useState('THIS_MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [asOnDate, setAsOnDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Ledger Payload State from Backend
  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Modal for Viewing Source Voucher Details
  const [activeModalTx, setActiveModalTx] = useState(null);

  // Load available entities when ledgerType changes
  const loadEntities = async (type) => {
    try {
      setLoadingEntities(true);
      setErrorMsg('');
      const res = await ledgersAPI.getEntities(type);
      const data = res.data || res;

      let list = [];
      if (type === 'BANK') list = data.accounts || [];
      else if (type === 'CASH') list = data.custodians || [];
      else if (type === 'PROPERTY') list = data.properties || [];
      else if (type === 'TENANT') list = data.tenants || [];
      else if (type === 'ACCOUNT_HEAD' || type === 'CATEGORY' || type === 'EXPENSE') list = data.categories || [];
      else if (type === 'OTHER_INCOME') list = data.otherIncomeHeads || [];

      setEntities(list);
      // Auto select first entity if available
      if (list.length > 0) {
        setSelectedEntityId(list[0].id);
      } else {
        setSelectedEntityId('');
      }
    } catch (err) {
      console.error('Failed to load ledger entities:', err);
      setErrorMsg('Failed to fetch ledger entity list.');
    } finally {
      setLoadingEntities(false);
    }
  };

  useEffect(() => {
    loadEntities(ledgerType);
  }, [ledgerType]);

  // Fetch actual ledger data from backend source of truth
  const fetchLedger = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await ledgersAPI.queryLedger({
        type: ledgerType,
        entityId: selectedEntityId,
        datePreset,
        startDate,
        endDate,
        asOnDate,
        search: searchQuery,
      });

      const payload = res.data || res;
      setLedgerData(payload);
    } catch (err) {
      console.error('Failed to fetch central ledger:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to query central ledger.');
      setLedgerData(null);
    } finally {
      setLoading(false);
    }
  };

  // Trigger query when options change
  useEffect(() => {
    if (selectedEntityId || ledgerType === 'RENT' || ledgerType === 'EXPENSE' || ledgerType === 'OTHER_INCOME') {
      fetchLedger();
    }
  }, [ledgerType, selectedEntityId, datePreset]);

  const handleManualSearchSubmit = (e) => {
    e.preventDefault();
    fetchLedger();
  };

  const summary = ledgerData?.summary || {
    openingBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    closingBalance: 0,
    entryCount: 0,
  };

  const entries = ledgerData?.entries || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 bg-slate-50 min-h-full font-sans text-slate-900">
      {/* Page Title & Context Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-700 text-white rounded-xl shadow-sm">
              <BookOpen size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Central Financial Ledger System</h1>
              <p className="text-xs font-semibold text-slate-600">
                Single Source of Truth &bull; Real Posted Transactions &bull; Bank, Cash, Property, Tenant, Rent &amp; Expenses
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchLedger}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs shadow-sm transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : 'text-slate-600'} />
            Refresh Ledger
          </button>
        </div>
      </div>

      {/* Part 1 & 2: Search & Filter Interface */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-xs uppercase font-extrabold text-slate-700 tracking-wider flex items-center gap-2">
          <Search size={16} className="text-blue-600" /> Select Financial Entity &amp; Search Controls
        </h2>

        <form onSubmit={handleManualSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* 1. Ledger Type Selector */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Ledger Type</label>
            <select
              value={ledgerType}
              onChange={(e) => setLedgerType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            >
              <option value="BANK">Bank Account Ledger</option>
              <option value="CASH">Cash in Hand / Custodian</option>
              <option value="PROPERTY">Property / Plaza Ledger</option>
              <option value="TENANT">Tenant / Rental Ledger</option>
              <option value="RENT">Rent Collection Journal</option>
              <option value="EXPENSE">Individual Expense Ledger</option>
              <option value="ACCOUNT_HEAD">Account Head Ledger</option>
              <option value="CATEGORY">Category Ledger</option>
              <option value="OTHER_INCOME">Other Income Ledger</option>
            </select>
          </div>

          {/* 2. Entity Selector */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Select Specific Entity</label>
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              disabled={loadingEntities || (ledgerType !== 'BANK' && ledgerType !== 'CASH' && ledgerType !== 'PROPERTY' && ledgerType !== 'TENANT' && ledgerType !== 'ACCOUNT_HEAD' && ledgerType !== 'OTHER_INCOME')}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-blue-600 disabled:opacity-50"
            >
              {entities.length === 0 ? (
                <option value="">No entities available</option>
              ) : (
                entities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.subtext ? `(${item.subtext})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* 3. Date Range Preset */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Date Period</label>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            >
              <option value="THIS_MONTH">This Month</option>
              <option value="PREVIOUS_MONTH">Previous Month</option>
              <option value="TODAY">Today</option>
              <option value="THIS_WEEK">This Week</option>
              <option value="CUSTOM">Custom Date Range</option>
              <option value="AS_ON_DATE">As On Date</option>
            </select>
          </div>

          {/* 4. Keyword / Voucher Search */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Voucher / Detail Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Tank Guard, VN-104"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold transition flex items-center justify-center"
              >
                <Search size={14} />
              </button>
            </div>
          </div>
        </form>

        {/* Custom Date Inputs if CUSTOM selected */}
        {datePreset === 'CUSTOM' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-semibold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-semibold text-slate-900"
              />
            </div>
          </div>
        )}

        {/* As On Date input if AS_ON_DATE selected */}
        {datePreset === 'AS_ON_DATE' && (
          <div className="pt-2 border-t border-slate-200 text-xs max-w-xs">
            <label className="block font-bold text-slate-700 mb-1">As On Date</label>
            <input
              type="date"
              value={asOnDate}
              onChange={(e) => setAsOnDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-semibold text-slate-900"
            />
          </div>
        )}
      </div>

      {/* Error Alert Message */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-2">
          <X size={16} className="text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Ledger Active Header & Summary Cards */}
      {ledgerData && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-2">
              <div>
                <h3 className="text-lg font-black text-slate-900">{ledgerData.ledgerTitle}</h3>
                <div
                  className="text-xs font-semibold text-slate-500 mt-0.5"
                  dangerouslySetInnerHTML={{ __html: ledgerData.entitySubtext || '' }}
                />
              </div>
              <div className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
                Period: <span className="text-blue-700">{ledgerData.datePreset}</span>
              </div>
            </div>

            {/* Summary KPI Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-slate-500">Opening Balance</div>
                <div className="text-xl font-black font-mono text-slate-900 mt-1">
                  {formatPKR(summary.openingBalance)}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
                  <ArrowDownLeft size={14} className="text-emerald-600" /> Total Debit / In
                </div>
                <div className="text-xl font-black font-mono text-emerald-700 mt-1">
                  {formatPKR(summary.totalDebit)}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
                  <ArrowUpRight size={14} className="text-rose-600" /> Total Credit / Out
                </div>
                <div className="text-xl font-black font-mono text-rose-700 mt-1">
                  {formatPKR(summary.totalCredit)}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-blue-800">Closing Balance</div>
                <div className="text-xl font-black font-mono text-blue-900 mt-1">
                  {formatPKR(summary.closingBalance)}
                </div>
              </div>
            </div>
          </div>

          {/* Part 3 & 4: Exact Real Data Transaction Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Posted Transactions History ({summary.entryCount} Entries)
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                Official Real Database Records Only
              </span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500 font-bold flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin text-blue-600" />
                Querying database transactions...
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <BookOpen size={28} className="mx-auto text-slate-400 mb-2" />
                <div className="text-sm font-bold text-slate-700">No transactions found for this ledger.</div>
                <div className="text-xs text-slate-500 mt-1">
                  No posted financial transactions exist matching your selected filters.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left custom-table">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Voucher No</th>
                      <th className="p-3">Transaction Detail / Narration</th>
                      <th className="p-3">Head / Category</th>
                      <th className="p-3">Dr Account</th>
                      <th className="p-3">Cr Account</th>
                      <th className="p-3 text-right">Debit (PKR)</th>
                      <th className="p-3 text-right">Credit (PKR)</th>
                      <th className="p-3 text-right">Running Balance</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold text-slate-900">
                    {entries.map((tx) => (
                      <tr key={tx._id} className="hover:bg-slate-50 transition">
                        <td className="p-3 whitespace-nowrap text-slate-600 font-mono">
                          {tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '-'}
                        </td>
                        <td className="p-3 whitespace-nowrap font-mono font-bold text-blue-700">
                          {tx.voucherNo}
                        </td>
                        <td className="p-3 max-w-xs truncate">
                          <div className="font-bold text-slate-900">{tx.detail}</div>
                          {tx.propertyName && (
                            <div className="text-[10px] text-slate-500 font-medium">
                              Property: {tx.propertyName} {tx.tenantName ? `| Tenant: ${tx.tenantName}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                            {tx.categoryName}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap text-slate-600">{tx.drAccount || '-'}</td>
                        <td className="p-3 whitespace-nowrap text-slate-600">{tx.crAccount || '-'}</td>
                        <td className="p-3 whitespace-nowrap text-right font-mono font-bold text-emerald-700">
                          {tx.debit > 0 ? formatPKR(tx.debit) : '-'}
                        </td>
                        <td className="p-3 whitespace-nowrap text-right font-mono font-bold text-rose-700">
                          {tx.credit > 0 ? formatPKR(tx.credit) : '-'}
                        </td>
                        <td className="p-3 whitespace-nowrap text-right font-mono font-black text-slate-900">
                          {formatPKR(tx.balance)}
                        </td>
                        <td className="p-3 whitespace-nowrap text-center">
                          <button
                            onClick={() => setActiveModalTx(tx)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 transition"
                            title="View Voucher Details"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Part 16: Source Voucher Traceability Modal */}
      {activeModalTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="text-blue-700" size={20} />
                <h3 className="text-base font-bold text-slate-900">Voucher Audit Details</h3>
              </div>
              <button
                onClick={() => setActiveModalTx(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Voucher No</span>
                  <div className="font-mono font-bold text-blue-800 text-sm">{activeModalTx.voucherNo}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Date</span>
                  <div className="font-semibold text-slate-900">
                    {activeModalTx.date ? new Date(activeModalTx.date).toLocaleDateString('en-GB') : '-'}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Transaction Narration</span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold mt-0.5">
                  {activeModalTx.detail}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Debit Account</span>
                  <div className="font-bold text-slate-900">{activeModalTx.drAccount}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Credit Account</span>
                  <div className="font-bold text-slate-900">{activeModalTx.crAccount}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Category Head</span>
                  <div className="font-bold text-slate-900">{activeModalTx.categoryName}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Amount (PKR)</span>
                  <div className="font-mono font-black text-slate-900 text-sm">{formatPKR(activeModalTx.amount)}</div>
                </div>
              </div>

              {activeModalTx.propertyName && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Linked Property / Tenant</span>
                  <div className="font-semibold text-slate-900">
                    {activeModalTx.propertyName} {activeModalTx.tenantName ? `(${activeModalTx.tenantName})` : ''}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span>Created By: <strong>{activeModalTx.createdBy}</strong></span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  {activeModalTx.status}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveModalTx(null)}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LedgersPage;
