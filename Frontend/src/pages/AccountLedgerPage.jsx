import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Landmark,
  Wallet,
  Building2,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  FileSpreadsheet,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { accountsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';

export function AccountLedgerPage({
  accountId,
  onBack,
  onNavigateToTransfers,
  currentUser,
}) {
  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [searchFilter, setSearchFilter] = useState('');

  const fetchLedger = async () => {
    if (!accountId) return;
    try {
      setLoading(true);
      setErrorMsg('');
      const params = {};
      if (selectedMonth && selectedMonth !== 'ALL') {
        params.month = selectedMonth;
      }
      const res = await accountsAPI.getAccountLedger(accountId, params);
      if (res?.success && res.data) {
        setLedgerData(res.data);
      } else {
        throw new Error(res?.message || 'Failed to fetch ledger.');
      }
    } catch (err) {
      console.error('Failed to load account ledger:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Error loading ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [accountId, selectedMonth]);

  const account = ledgerData?.account;
  const summary = ledgerData?.summary;
  const ledgerEntries = ledgerData?.ledgerEntries || [];

  const filteredEntries = ledgerEntries.filter((entry) => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      entry.detail?.toLowerCase().includes(term) ||
      entry.voucherNo?.toLowerCase().includes(term) ||
      entry.categoryName?.toLowerCase().includes(term) ||
      entry.drAccount?.toLowerCase().includes(term) ||
      entry.crAccount?.toLowerCase().includes(term)
    );
  });

  const isBank = account?.type === 'BANK';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg transition"
        >
          <ArrowLeft size={14} />
          Back to Accounts Directory
        </button>

        <div className="flex items-center gap-3">
          {onNavigateToTransfers && (
            <button
              onClick={onNavigateToTransfers}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-white bg-indigo-950/80 border border-indigo-700/60 px-3 py-2 rounded-lg transition shadow-sm"
            >
              <ArrowLeftRight size={14} />
              Transfer In / Out
            </button>
          )}
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg transition"
          >
            <Printer size={14} />
            Print Statement
          </button>
        </div>
      </div>

      {/* Account Info Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  isBank
                    ? 'bg-sky-950/80 text-sky-300 border-sky-800/60'
                    : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                }`}
              >
                {account?.type || 'ACCOUNT'}
              </span>
              <span className="text-xs text-slate-400">
                Pixx Technologies Financial Ledger
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  account?.isActive
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                    : 'bg-rose-950/60 text-rose-400 border-rose-800/40'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    account?.isActive ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                {account?.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              {isBank ? (
                <Building2 size={24} className="text-sky-400 shrink-0" />
              ) : (
                <Wallet size={24} className="text-amber-400 shrink-0" />
              )}
              {account?.accountName || account?.name || 'Account Statement'}
            </h1>

            <div className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
              {isBank ? (
                <span>
                  Bank Name: <strong className="text-slate-200">{account?.bankName || '—'}</strong>
                </span>
              ) : (
                <span>
                  Custodian Holder: <strong className="text-amber-300 font-semibold">{account?.cashHolder || '—'}</strong>
                </span>
              )}
              {account?.accountNumber && (
                <span>
                  A/C No: <strong className="text-slate-200 font-mono">{account.accountNumber}</strong>
                </span>
              )}
              {account?.ownerName && (
                <span>
                  Signatory: <strong className="text-slate-300">{account.ownerName}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Month Selector Filter */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <Calendar size={18} className="text-emerald-400 shrink-0" />
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Statement Month
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="month"
                  value={selectedMonth === 'ALL' ? '' : selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value || 'ALL')}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setSelectedMonth('ALL')}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition ${
                    selectedMonth === 'ALL'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMonth('2026-08')}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition ${
                    selectedMonth === '2026-08'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  Aug 2026
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error notification */}
      {errorMsg && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Statement Financial Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Opening Balance */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Opening Balance
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-200 mt-1">
              {formatPKR(summary.openingBalance ?? 0)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              As of start of period
            </div>
          </div>

          {/* Inflows (Debits) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <ArrowDownLeft size={12} />
              Total Money In
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-400 mt-1">
              +{formatPKR(summary.totalMoneyIn ?? 0)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Total debits / collections</div>
          </div>

          {/* Outflows (Credits) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
              <ArrowUpRight size={12} />
              Total Money Out
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-rose-400 mt-1">
              -{formatPKR(summary.totalMoneyOut ?? 0)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Total credits / disbursements</div>
          </div>

          {/* Net Period Movement */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
              Net Period Change
            </div>
            {(() => {
              const net = (summary.totalMoneyIn || 0) - (summary.totalMoneyOut || 0);
              const isPos = net >= 0;
              return (
                <div
                  className={`text-base sm:text-lg font-black font-mono mt-1 ${
                    isPos ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPos ? '+' : ''}
                  {formatPKR(net)}
                </div>
              );
            })()}
            <div className="text-[10px] text-slate-500 mt-0.5">Inflow minus outflow</div>
          </div>

          {/* Period Closing Balance */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 col-span-2 sm:col-span-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Period Closing Balance
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-400 mt-1">
              {formatPKR(summary.closingBalance ?? 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Live DB: <strong className="text-slate-300 font-mono">{formatPKR(summary.currentBalance ?? 0)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar for Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span className="font-bold text-white">
            {filteredEntries.length}
          </span>{' '}
          voucher ledger lines in {selectedMonth === 'ALL' ? 'all history' : selectedMonth}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by V.N, description or head..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Ledger Table — Matching Pixx Technologies Report Design */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-bold tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3.5">Date</th>
                <th className="py-3 px-3.5">V.N</th>
                <th className="py-3 px-3.5">Detail / Narration</th>
                <th className="py-3 px-3.5">Account Head</th>
                <th className="py-3 px-3.5">Contra Account</th>
                <th className="py-3 px-3.5 text-right">Debit (Inflow)</th>
                <th className="py-3 px-3.5 text-right">Credit (Outflow)</th>
                <th className="py-3 px-3.5 text-right">Running Balance</th>
                <th className="py-3 px-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {/* Opening Balance Line */}
              {summary && (
                <tr className="bg-slate-950/40 font-sans">
                  <td className="py-2.5 px-3.5 font-mono text-slate-400">
                    {account?.openingBalanceDate ? formatDate(account.openingBalanceDate) : '31-Jul-2026'}
                  </td>
                  <td className="py-2.5 px-3.5 font-mono text-slate-500">—</td>
                  <td className="py-2.5 px-3.5 font-bold text-slate-300">
                    OPENING BALANCE B/F
                  </td>
                  <td className="py-2.5 px-3.5 text-slate-500">Opening Equity / Balance</td>
                  <td className="py-2.5 px-3.5 text-slate-500">—</td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-slate-400">—</td>
                  <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-200">
                    {formatPKR(summary.openingBalance ?? 0)}
                  </td>
                  <td className="py-2.5 px-3.5 text-center">
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40">
                      B/F
                    </span>
                  </td>
                </tr>
              )}

              {loading ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-500 font-sans">
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Computing running balance ledger...
                    </div>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-500 font-sans">
                    No transactions recorded for this account during {selectedMonth === 'ALL' ? 'this period' : selectedMonth}.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((row) => {
                  const isReversed = row.status === 'REVERSED';
                  const hasDebit = !isReversed && (row.debit || 0) > 0;
                  const hasCredit = !isReversed && (row.credit || 0) > 0;

                  return (
                    <tr
                      key={row._id}
                      className={`transition ${
                        isReversed
                          ? 'opacity-60 bg-rose-950/20 hover:bg-rose-950/30'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Date */}
                      <td className={`py-2.5 px-3.5 whitespace-nowrap ${isReversed ? 'text-rose-400/60' : 'text-slate-400'}`}>
                        {formatDate(row.date)}
                      </td>

                      {/* Voucher No */}
                      <td className={`py-2.5 px-3.5 font-bold whitespace-nowrap ${isReversed ? 'text-rose-300/60 line-through' : 'text-slate-200'}`}>
                        {row.voucherNo || '—'}
                      </td>

                      {/* Detail */}
                      <td className="py-2.5 px-3.5 font-sans max-w-xs">
                        <div className={`truncate font-medium ${isReversed ? 'text-rose-300/60 line-through' : 'text-white'}`}>
                          {row.detail}
                        </div>
                        {isReversed && (
                          <div className="text-[9px] text-rose-400/70 font-sans font-bold mt-0.5">
                            ✕ Reversed — No balance effect
                          </div>
                        )}
                      </td>

                      {/* Head / Category */}
                      <td className={`py-2.5 px-3.5 font-sans whitespace-nowrap ${isReversed ? 'text-rose-300/50' : 'text-slate-300'}`}>
                        <span className="truncate">{row.categoryName || 'General'}</span>
                      </td>

                      {/* Contra Account */}
                      <td className={`py-2.5 px-3.5 font-sans whitespace-nowrap max-w-xs ${isReversed ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span className="truncate">
                          {isReversed
                            ? 'External Parties / Operations Clearing'
                            : hasDebit ? row.crAccount : row.drAccount}
                        </span>
                      </td>

                      {/* Debit */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold">
                        {isReversed ? (
                          row.originalAmount ? (
                            <span className="text-rose-400/50 line-through text-[10px]">
                              +{formatPKR(row.originalAmount)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )
                        ) : hasDebit ? (
                          <span className="text-emerald-400">+{formatPKR(row.debit)}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Credit */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold">
                        {isReversed ? (
                          row.originalAmount ? (
                            <span className="text-rose-400/50 line-through text-[10px]">
                              -{formatPKR(row.originalAmount)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )
                        ) : hasCredit ? (
                          <span className="text-rose-400">-{formatPKR(row.credit)}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Running Balance */}
                      <td className={`py-2.5 px-3.5 text-right font-mono font-bold ${isReversed ? 'text-slate-500' : 'text-white'}`}>
                        {isReversed ? (
                          <span className="text-slate-500 text-[10px]">* {formatPKR(row.balance)}</span>
                        ) : (
                          formatPKR(row.balance)
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3.5 text-center font-sans">
                        {isReversed ? (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800/40">
                            REVERSED
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                            {row.status || 'VERIFIED'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer with Totals */}
            {summary && (
              <tfoot className="bg-slate-950 text-slate-300 font-bold border-t border-slate-800 text-xs">
                <tr>
                  <td colSpan="5" className="py-3 px-3.5 uppercase tracking-wider text-slate-400 font-sans text-[11px]">
                    Period Totals & Closing Position:
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono text-emerald-400">
                    +{formatPKR(summary.totalMoneyIn ?? 0)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono text-rose-400">
                    -{formatPKR(summary.totalMoneyOut ?? 0)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono font-black text-emerald-400 text-sm">
                    {formatPKR(summary.closingBalance ?? 0)}
                  </td>
                  <td className="py-3 px-3.5 text-center text-[10px] text-slate-500 font-sans">
                    C/F
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

export default AccountLedgerPage;
