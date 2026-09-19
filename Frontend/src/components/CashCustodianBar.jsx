import React from 'react';
import { Wallet, AlertTriangle, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Format currency in Pakistani Rupees (PKR)
 */
const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(val);
};

export const CashCustodianBar = ({ custodians = [], onRefresh, loading = false }) => {
  const totalCash = custodians.reduce((acc, c) => acc + (c.currentBalance || 0), 0);

  return (
    <div className="custodian-black-bar rounded-xl p-4 shadow-lg mb-6 text-white-keep">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-slate-700/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-400/40">
            <Wallet className="w-4 h-4 text-sky-400 text-white-keep" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-white-keep">
            Live Cash-in-Hand Custodians (Sabir, Naveed, etc.)
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-black px-3 py-1 rounded-md border border-slate-700 text-white-keep">
            <span className="text-slate-300">Total Custodian Pool:</span>
            <span className="font-mono font-black text-sky-400 text-sm">
              Rs. {formatPKR(totalCash)}
            </span>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh Balances"
            className="p-1.5 text-white hover:bg-slate-800 rounded transition border border-slate-700 disabled:opacity-50 text-white-keep"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-white-keep ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {custodians.map((c) => {
          const balance = c.currentBalance || 0;
          const isNegative = balance < 0;

          // Format clean handler display name
          const handlerName = c.name
            .replace(/Cash in Hand\s*\(/i, '')
            .replace(/\)/g, '')
            .trim();

          return (
            <div
              key={c._id || c.name}
              className="custodian-card-black border rounded-lg p-3 transition-all"
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-white custodian-name text-sm truncate pr-2" title={c.name}>
                  {handlerName}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {isNegative ? (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div className="font-mono text-base font-black text-sky-400 custodian-amount">
                  Rs. {formatPKR(balance)}
                </div>
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                  isNegative ? 'bg-rose-900/80 text-rose-200 border border-rose-700' : 'bg-slate-800 text-slate-200 border border-slate-700'
                }`}>
                  {isNegative ? 'Deficit' : 'Cash Hand'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CashCustodianBar;
