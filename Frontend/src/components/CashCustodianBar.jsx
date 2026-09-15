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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
            <Wallet className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Live Cash-in-Hand Custodians
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-slate-800/70 px-3 py-1 rounded-md border border-slate-700/60">
            <span className="text-slate-400">Total Custodian Pool:</span>
            <span
              className={`font-mono font-bold ${
                totalCash < 0
                  ? 'text-rose-400'
                  : totalCash < 10000
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              Rs. {formatPKR(totalCash)}
            </span>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh Balances"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {custodians.map((c) => {
          const balance = c.currentBalance || 0;
          const isNegative = balance < 0;
          const isLow = balance >= 0 && balance < 2000;
          const isHealthy = balance >= 2000;

          let badgeColor = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
          let indicatorIcon = <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
          let statusText = 'Healthy';

          if (isNegative) {
            badgeColor = 'bg-rose-500/10 border-rose-500/50 text-rose-300 ring-1 ring-rose-500/30 animate-pulse';
            indicatorIcon = <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
            statusText = 'Deficit / Negative!';
          } else if (isLow) {
            badgeColor = 'bg-amber-500/10 border-amber-500/40 text-amber-300';
            indicatorIcon = <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
            statusText = 'Low (< Rs. 2,000)';
          }

          // Format clean handler display name
          const handlerName = c.name
            .replace(/Cash in Hand\s*\(/i, '')
            .replace(/\)/g, '')
            .trim();

          return (
            <div
              key={c._id || c.name}
              className={`border rounded-lg p-3 transition-all ${badgeColor}`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-slate-200 truncate pr-2" title={c.name}>
                  {handlerName}
                </span>
                <div className="flex items-center gap-1 shrink-0">{indicatorIcon}</div>
              </div>

              <div className="flex items-baseline justify-between mt-1">
                <div className="font-mono text-base font-bold tracking-tight">
                  Rs. {formatPKR(balance)}
                </div>
                <span className="text-[10px] uppercase font-semibold opacity-75">
                  {statusText}
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
