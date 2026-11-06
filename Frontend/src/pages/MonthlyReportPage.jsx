import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Building2,
  Landmark,
  Banknote,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileDown,
  RotateCcw,
  Paperclip,
  Upload,
  Trash2,
  Eye,
  X,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { financialReportsAPI, monthlyReportsAPI, verificationAPI, bankStatementsAPI } from '../services/api.js';
import { isAdmin } from '../utils/permissions.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  typeof n === 'number'
    ? `Rs. ${Math.abs(n).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : 'Rs. —';

const fmtShort = (n) => {
  if (typeof n !== 'number') return '—';
  if (Math.abs(n) >= 1_000_000) return `Rs. ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `Rs. ${(n / 1_000).toFixed(1)}K`;
  return `Rs. ${n.toLocaleString()}`;
};

const colorNum = (n) =>
  n >= 0 ? 'text-emerald-400' : 'text-rose-400';

// Generate the last 12 "YYYY-MM" options for month picker
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

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color = 'emerald', sub }) {
  const colorMap = {
    emerald: 'border-emerald-700/40 bg-emerald-950/30',
    rose: 'border-rose-700/40 bg-rose-950/30',
    blue: 'border-blue-700/40 bg-blue-950/30',
    amber: 'border-amber-700/40 bg-amber-950/30',
    indigo: 'border-indigo-700/40 bg-indigo-950/30',
    slate: 'border-slate-700/40 bg-slate-800/30',
  };
  const iconMap = {
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    indigo: 'text-indigo-400',
    slate: 'text-slate-400',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.slate}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={15} className={iconMap[color]} />
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          {label}
        </span>
      </div>
      <div className={`text-xl font-bold ${iconMap[color]}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    FULLY_PAID: 'bg-emerald-950 text-emerald-300 border-emerald-700/60',
    PARTIALLY_PAID: 'bg-amber-950 text-amber-300 border-amber-700/60',
    OUTSTANDING: 'bg-rose-950 text-rose-300 border-rose-700/60',
  };
  const labels = {
    FULLY_PAID: '✓ Paid',
    PARTIALLY_PAID: '~ Partial',
    OUTSTANDING: '✗ Due',
  };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${map[status] || map.OUTSTANDING}`}>
      {labels[status] || status}
    </span>
  );
}

// ── Collapsible Property Section ──────────────────────────────────────────────
function PropertySection({ plaza }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      {/* Property Header Row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800 text-left transition"
      >
        <div className="flex items-center gap-2.5">
          {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          <Building2 size={14} className="text-indigo-400" />
          <span className="text-sm font-semibold text-slate-100">{plaza.plazaName}</span>
          {plaza.location && (
            <span className="text-[10px] text-slate-500">— {plaza.location}</span>
          )}
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="text-right hidden sm:block">
            <div className="text-[9px] text-slate-500 uppercase">Agreed</div>
            <div className="text-slate-300 font-medium">{fmt(plaza.agreedRent)}</div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[9px] text-slate-500 uppercase">Received</div>
            <div className="text-emerald-400 font-semibold">{fmt(plaza.receivedAmount)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-slate-500 uppercase">Collection</div>
            <div
              className={`text-sm font-bold ${
                plaza.collectionRate >= 90
                  ? 'text-emerald-400'
                  : plaza.collectionRate >= 60
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {plaza.collectionRate}%
            </div>
          </div>
        </div>
      </button>

      {/* Units Table (expanded) */}
      {open && plaza.units.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900/60 text-slate-500 uppercase text-[9px]">
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-right">Agreed Rent</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2 text-left hidden md:table-cell">Received Date</th>
                <th className="px-3 py-2 text-left hidden lg:table-cell">Account</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {plaza.units.map((unit) => (
                <tr
                  key={unit.unitId}
                  className="border-t border-slate-800/60 hover:bg-slate-800/30 transition"
                >
                  <td className="px-3 py-2 text-slate-200 font-medium">{unit.unitName}</td>
                  <td className="px-3 py-2 text-slate-400">{unit.tenantName}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{fmt(unit.agreedRent)}</td>
                  <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{fmt(unit.receivedAmount)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={unit.outstanding > 0 ? 'text-rose-400' : 'text-slate-500'}>
                      {unit.outstanding > 0 ? fmt(unit.outstanding) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 hidden md:table-cell">
                    {unit.receivedDate !== '-' ? unit.receivedDate : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-400 hidden lg:table-cell text-[10px]">
                    {unit.receivingAccount !== '-' ? unit.receivingAccount : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={unit.statusBadge} />
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Plaza subtotal */}
            <tfoot>
              <tr className="bg-slate-800/50 border-t border-slate-700 font-semibold text-xs">
                <td colSpan={2} className="px-3 py-2 text-slate-400">
                  {plaza.plazaName} Total ({plaza.unitsCount} units)
                </td>
                <td className="px-3 py-2 text-right text-slate-300">{fmt(plaza.agreedRent)}</td>
                <td className="px-3 py-2 text-right text-emerald-400">{fmt(plaza.receivedAmount)}</td>
                <td className="px-3 py-2 text-right text-rose-400">
                  {plaza.outstanding > 0 ? fmt(plaza.outstanding) : '—'}
                </td>
                <td colSpan={3} className="hidden md:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {open && plaza.units.length === 0 && (
        <div className="px-4 py-3 text-xs text-slate-500 bg-slate-900/30">
          No units registered under this property.
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function MonthlyReportPage({ currentUser }) {
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.val || '2026-08');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [evidencePdfLoading, setEvidencePdfLoading] = useState(false);
  const [evidenceZipLoading, setEvidenceZipLoading] = useState(false);

  // ── Bank Statements Attachments State ─────────────────────────────────────────
  const [statementData, setStatementData] = useState({ accounts: [], totalStatementsAttached: 0 });
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementAccount, setStatementAccount] = useState('');
  const [statementFiles, setStatementFiles] = useState([]);
  const [statementNotes, setStatementNotes] = useState('');
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [statementSuccess, setStatementSuccess] = useState('');
  const [statementError, setStatementError] = useState('');

  const fetchBankStatements = useCallback(async () => {
    try {
      const res = await bankStatementsAPI.getStatements(selectedMonth);
      if (res?.success) {
        setStatementData(res);
      }
    } catch (e) {
      console.warn('Could not fetch bank statements:', e.message);
    }
  }, [selectedMonth]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financialReportsAPI.getMonthlySummary(selectedMonth);
      if (res.success) {
        setData(res);
      } else {
        setError(res.message || 'Failed to load summary.');
      }
    } catch (e) {
      const responseError = e?.response?.data?.error;
      const responseMessage = e?.response?.data?.message;
      setError(
        [responseMessage, responseError && responseError !== responseMessage ? responseError : null]
          .filter(Boolean)
          .join(' ')
        || e.message
        || 'Network error'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchSummary();
    fetchBankStatements();
  }, [fetchSummary, fetchBankStatements]);

  const handleUploadStatement = async (e) => {
    e?.preventDefault();
    if (!statementAccount) {
      setStatementError('Please select a bank or cash account.');
      return;
    }
    if (!statementFiles || statementFiles.length === 0) {
      setStatementError('Please choose at least one PDF or image file to upload.');
      return;
    }

    setUploadingStatement(true);
    setStatementError('');
    setStatementSuccess('');
    try {
      const formData = new FormData();
      formData.append('accountId', statementAccount);
      if (statementNotes) formData.append('notes', statementNotes);
      for (const file of statementFiles) {
        formData.append('statementFiles', file);
      }
      const res = await bankStatementsAPI.uploadStatements(selectedMonth, formData);
      if (res.success) {
        setStatementSuccess(res.message || 'Statement uploaded successfully.');
        setStatementFiles([]);
        setStatementNotes('');
        await fetchBankStatements();
      }
    } catch (err) {
      setStatementError(err?.response?.data?.message || err.message || 'Upload failed.');
    } finally {
      setUploadingStatement(false);
    }
  };

  const handleDeleteStatementFile = async (attachmentId, fileId) => {
    if (!window.confirm('Delete this uploaded bank statement document?')) return;
    try {
      await bankStatementsAPI.deleteStatement(attachmentId, fileId);
      await fetchBankStatements();
    } catch (err) {
      alert('Delete failed: ' + (err?.response?.data?.message || err.message));
    }
  };

  const handleReset = async () => {
    if (!window.confirm(`Reset and refresh monthly ledger calculations for ${selectedMonth}? This will sync live bank balances and exclude any reversed transactions.`)) {
      return;
    }
    setResetLoading(true);
    try {
      await monthlyReportsAPI.resetReport(selectedMonth);
      await fetchSummary();
    } catch (e) {
      alert('Report reset failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setResetLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    setPdfLoading(true);
    try {
      await financialReportsAPI.downloadPDF(selectedMonth);
    } catch (e) {
      alert('PDF generation failed: ' + (e?.response?.data?.message || e.message));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadEvidencePDF = async () => {
    setEvidencePdfLoading(true);
    try {
      await verificationAPI.downloadAllReceiptEvidencePDF({ month: selectedMonth });
    } catch (e) {
      alert('Failed to generate vouchers evidence PDF: ' + (e?.response?.data?.message || e.message));
    } finally {
      setEvidencePdfLoading(false);
    }
  };

  const handleDownloadEvidenceZIP = async () => {
    setEvidenceZipLoading(true);
    try {
      await verificationAPI.downloadAllReceiptEvidenceZIP({ month: selectedMonth });
    } catch (e) {
      alert('Failed to generate vouchers evidence ZIP: ' + (e?.response?.data?.message || e.message));
    } finally {
      setEvidenceZipLoading(false);
    }
  };

  const fp = data?.financialPosition;
  const am = data?.accountMatrix;
  const ri = data?.rentalIncomeSummary;
  const oi = data?.otherIncomeSummary;
  const ex = data?.expenseSummary;

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 size={20} className="text-emerald-400" />
            Monthly Financial Summary
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete financial position — opening/closing balances, rental income,
            other income, and expenses
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month Picker */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {monthOptions.map((opt) => (
              <option key={opt.val} value={opt.val}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={fetchSummary}
            disabled={loading || resetLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {/* Reset & Sync with Live Ledger — Admin only */}
          {isAdmin(currentUser) && (
            <button
              onClick={handleReset}
              disabled={resetLoading || loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-300 hover:text-white transition disabled:opacity-50"
              title="Reset report snapshot and sync live calculations excluding reversed transactions"
            >
              <RotateCcw size={13} className={resetLoading ? 'animate-spin' : ''} />
              {resetLoading ? 'Resetting…' : 'Reset & Sync'}
            </button>
          )}

          {/* PDF Download — Admin only */}
          {isAdmin(currentUser) && (
            <>
              <button
                onClick={handleDownloadPDF}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white border border-indigo-600 transition disabled:opacity-50"
                title="Download standard monthly financial position report PDF"
              >
                <FileDown size={13} />
                {pdfLoading ? 'Generating…' : 'Download PDF'}
              </button>

              <button
                onClick={handleDownloadEvidencePDF}
                disabled={evidencePdfLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition disabled:opacity-50"
                title="Download all transaction vouchers with receipt slips as a single multi-page PDF"
              >
                <FileDown size={13} />
                {evidencePdfLoading ? 'Generating Slips…' : 'Evidence Slips (PDF)'}
              </button>

              <button
                onClick={handleDownloadEvidenceZIP}
                disabled={evidenceZipLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-cyan-800 hover:bg-cyan-700 text-cyan-100 border border-cyan-600/70 transition disabled:opacity-50"
                title="Download all voucher evidence PDFs organized inside a ZIP archive"
              >
                <FileDown size={13} />
                {evidenceZipLoading ? 'Packaging ZIP…' : 'Evidence ZIP'}
              </button>

              {/* Bank Statement Attachments Button */}
              <button
                onClick={() => {
                  setShowStatementModal(true);
                  setStatementError('');
                  setStatementSuccess('');
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-indigo-700/50 transition"
                title="Upload and manage bank statements attached to each bank ledger in the monthly report"
              >
                <Paperclip size={13} className="text-indigo-400" />
                Bank Statements
                {statementData?.totalStatementsAttached > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-900 border border-indigo-600 text-[10px] text-indigo-200 font-bold">
                    {statementData.totalStatementsAttached}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-rose-950/30 border border-rose-700/40 text-rose-300 text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-500 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" />
          Loading financial summary for {selectedMonth}…
        </div>
      )}

      {/* ── Main Content ── */}
      {!loading && !error && data && (
        <>
          {/* ══ Section A: Grand KPI Bar ══════════════════════════════════════ */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              label="Rental Income"
              value={fmtShort(fp?.totalRentalIncome)}
              icon={TrendingUp}
              color="emerald"
              sub={`${ri?.collectionRate ?? 0}% collected`}
            />
            <KpiCard
              label="Other Income"
              value={fmtShort(fp?.totalOtherIncome)}
              icon={Banknote}
              color="amber"
              sub={`${oi?.transactionCount ?? 0} receipts`}
            />
            <KpiCard
              label="Total Income"
              value={fmtShort(fp?.totalIncome)}
              icon={BarChart3}
              color="blue"
              sub="Rental + Other"
            />
            <KpiCard
              label="Total Expenses"
              value={fmtShort(fp?.totalExpenses)}
              icon={TrendingDown}
              color="rose"
              sub={`${ex?.heads?.length ?? 0} expense heads`}
            />
            <KpiCard
              label={fp?.netSurplusDeficit >= 0 ? 'Net Surplus' : 'Net Deficit'}
              value={fmtShort(fp?.netSurplusDeficit)}
              icon={fp?.netSurplusDeficit >= 0 ? CheckCircle2 : AlertTriangle}
              color={fp?.netSurplusDeficit >= 0 ? 'emerald' : 'rose'}
              sub="Income - Expenses"
            />
            <KpiCard
              label="Closing Balance"
              value={fmtShort(fp?.grandClosingBalance)}
              icon={Landmark}
              color="indigo"
              sub={`Bank + Cash`}
            />
          </div>

          {/* ══ Section B: Account Opening/Closing Matrix ══════════════════════ */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
              <Landmark size={15} className="text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Account Opening / Closing Balance Matrix
              </h2>
              <span className="ml-auto text-[10px] text-slate-500">{data.period}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800/60 text-slate-500 uppercase text-[9px]">
                    <th className="px-3 py-2 text-left">Account</th>
                    <th className="px-3 py-2 text-center">Type</th>
                    <th className="px-3 py-2 text-right">Opening Balance</th>
                    <th className="px-3 py-2 text-right">Total Input</th>
                    <th className="px-3 py-2 text-right">Total Output</th>
                    <th className="px-3 py-2 text-right">Closing Balance</th>
                    <th className="px-3 py-2 text-center">Bank Statement</th>
                  </tr>
                </thead>
                <tbody>
                  {am?.accounts?.map((acc) => {
                    const stmtInfo = statementData?.accounts?.find(
                      (a) => a._id?.toString() === acc.accountId?.toString() || a.name === acc.accountName
                    );
                    const fileCount = stmtInfo?.fileCount || 0;

                    return (
                      <tr
                        key={acc.accountId}
                        className="border-t border-slate-800/60 hover:bg-slate-800/30 transition"
                      >
                        <td className="px-3 py-2 text-slate-200 font-medium">
                          {acc.accountName}
                          {acc.accountNumber && (
                            <span className="text-[9px] text-slate-500 ml-1">
                              ({acc.accountNumber})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              acc.accountType === 'BANK'
                                ? 'bg-blue-950 text-blue-300 border-blue-700/60'
                                : 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                            }`}
                          >
                            {acc.accountType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">
                          {fmt(acc.openingBalance)}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-400">
                          {acc.totalInput > 0 ? fmt(acc.totalInput) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-400">
                          {acc.totalOutput > 0 ? fmt(acc.totalOutput) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${colorNum(acc.closingBalance)}`}>
                          {fmt(acc.closingBalance)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {fileCount > 0 ? (
                            <button
                              onClick={() => {
                                setStatementAccount(acc.accountId);
                                setShowStatementModal(true);
                                setStatementError('');
                                setStatementSuccess('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900 transition"
                              title="Click to view or upload additional statement documents"
                            >
                              <Paperclip size={10} />
                              {fileCount} {fileCount === 1 ? 'Doc' : 'Docs'}
                              {stmtInfo?.pdfCount > 0 ? ` (${stmtInfo.pdfCount} PDF)` : ''}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setStatementAccount(acc.accountId);
                                setShowStatementModal(true);
                                setStatementError('');
                                setStatementSuccess('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-indigo-300 hover:bg-slate-800/80 border border-dashed border-slate-700 transition"
                              title="Attach bank statement (PDF or pictures)"
                            >
                              <Upload size={10} />
                              Attach
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800/70 border-t border-slate-600 font-bold text-xs">
                    <td className="px-3 py-2 text-slate-300" colSpan={2}>
                      Grand Total
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {fmt(am?.grandTotal?.openingBalance)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400">
                      {fmt(am?.grandTotal?.totalInput)}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-400">
                      {fmt(am?.grandTotal?.totalOutput)}
                    </td>
                    <td className="px-3 py-2 text-right text-indigo-300">
                      {fmt(am?.grandTotal?.closingBalance)}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="bg-slate-900/50 text-[10px]">
                    <td colSpan={5} className="px-3 py-1.5 text-slate-400">
                      Total Bank Balance
                    </td>
                    <td colSpan={2} className="px-3 py-1.5 text-right font-semibold text-blue-300">
                      {fmt(am?.totalBankBalance)}
                    </td>
                  </tr>
                  <tr className="bg-slate-900/50 text-[10px]">
                    <td colSpan={5} className="px-3 py-1.5 text-slate-400">
                      Total Cash Balance
                    </td>
                    <td colSpan={2} className="px-3 py-1.5 text-right font-semibold text-emerald-300">
                      {fmt(am?.totalCashBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ══ Section C: Rental Income Summary by Property ═══════════════════ */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 size={15} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-200">
                  Rental Income Summary — Property Hierarchy
                </h2>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <div className="text-[9px] text-slate-500 uppercase">Agreed</div>
                  <div className="text-slate-300 font-semibold">{fmt(ri?.grandTotalAgreed)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-slate-500 uppercase">Received</div>
                  <div className="text-emerald-400 font-bold">{fmt(ri?.grandTotalReceived)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-slate-500 uppercase">Outstanding</div>
                  <div className="text-rose-400 font-semibold">
                    {ri?.grandTotalOutstanding > 0 ? fmt(ri.grandTotalOutstanding) : '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-slate-500 uppercase">Collection</div>
                  <div
                    className={`text-sm font-bold ${
                      ri?.collectionRate >= 90
                        ? 'text-emerald-400'
                        : ri?.collectionRate >= 60
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {ri?.collectionRate ?? 0}%
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {(ri?.properties || []).length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No property data available for this period.
                </div>
              ) : (
                (ri?.properties || []).map((plaza) => (
                  <PropertySection key={plaza.plazaId} plaza={plaza} />
                ))
              )}
            </div>
          </div>

          {/* ══ Section D: Other Income & Expenses ═══════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Other Income */}
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Banknote size={15} className="text-amber-400" />
                  <h2 className="text-sm font-semibold text-slate-200">Other Income</h2>
                </div>
                <span className="text-amber-400 font-bold text-sm">{fmt(oi?.totalOtherIncome)}</span>
              </div>

              {(oi?.breakdown || []).length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-500 text-xs">
                  No other income recorded for this period.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/40 text-slate-500 uppercase text-[9px]">
                      <th className="px-3 py-2 text-left">Income Head</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(oi?.breakdown || []).map((item) => (
                      <tr
                        key={item.head}
                        className="border-t border-slate-800/60 hover:bg-slate-800/30"
                      >
                        <td className="px-3 py-2 text-slate-300">{item.head}</td>
                        <td className="px-3 py-2 text-right text-amber-400 font-semibold">
                          {fmt(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800/50 border-t border-slate-700 font-bold">
                      <td className="px-3 py-2 text-slate-400">Total Other Income</td>
                      <td className="px-3 py-2 text-right text-amber-400">
                        {fmt(oi?.totalOtherIncome)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Expenses by Head */}
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown size={15} className="text-rose-400" />
                  <h2 className="text-sm font-semibold text-slate-200">Expenses by Head</h2>
                </div>
                <span className="text-rose-400 font-bold text-sm">{fmt(ex?.totalExpenses)}</span>
              </div>

              {(ex?.heads || []).length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-500 text-xs">
                  No expenses recorded for this period.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/40 text-slate-500 uppercase text-[9px]">
                      <th className="px-3 py-2 text-left">Expense Head</th>
                      <th className="px-3 py-2 text-right">Vouchers</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ex?.mainHeads?.length ? ex.mainHeads : (ex?.heads || [])).map((h) => (
                      <React.Fragment key={h.mainHeadId || h.headName || h.mainHeadName}>
                        <tr className="border-t border-slate-800/60 hover:bg-slate-800/30">
                          <td className="px-3 py-2 text-slate-200 font-semibold">{h.mainHeadName || h.headName}</td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {h.transactionCount}
                          </td>
                          <td className="px-3 py-2 text-right text-rose-400 font-semibold">
                            {fmt(h.totalSpent)}
                          </td>
                        </tr>
                        {(h.expenses || [])
                          .filter((expense) => expense.headName && expense.headName !== (h.mainHeadName || h.headName))
                          .map((expense) => (
                            <tr key={`${h.mainHeadId || h.mainHeadName}-${expense.headName}`} className="border-t border-slate-800/40">
                              <td className="px-3 py-1.5 pl-8 text-slate-400">{expense.headName}</td>
                              <td className="px-3 py-1.5 text-right text-slate-600">{expense.transactionCount}</td>
                              <td className="px-3 py-1.5 text-right text-rose-300">{fmt(expense.totalSpent)}</td>
                            </tr>
                          ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800/50 border-t border-slate-700 font-bold">
                      <td className="px-3 py-2 text-slate-400">Total Expenses</td>
                      <td className="px-3 py-2 text-right text-slate-500">
                        {(ex?.heads || []).reduce((s, h) => s + h.transactionCount, 0)}
                      </td>
                      <td className="px-3 py-2 text-right text-rose-400">
                        {fmt(ex?.totalExpenses)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          {/* ══ Section E: Grand Financial Position Summary Card ══════════════════ */}
          <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-200">
                Grand Financial Position — {data.period}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Income Column */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mb-2">
                  Total Income
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-700/40">
                  <span className="text-slate-400">Rental Income Received</span>
                  <span className="text-emerald-400 font-semibold">{fmt(fp?.totalRentalIncome)}</span>
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-700/40">
                  <span className="text-slate-400">Other Income</span>
                  <span className="text-amber-400 font-semibold">{fmt(fp?.totalOtherIncome)}</span>
                </div>
                <div className="flex justify-between text-sm py-2 bg-emerald-950/30 rounded px-2 border border-emerald-700/30">
                  <span className="text-emerald-300 font-bold">Total Income</span>
                  <span className="text-emerald-300 font-bold">{fmt(fp?.totalIncome)}</span>
                </div>
              </div>

              {/* Expenses Column */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-rose-400 font-bold mb-2">
                  Total Expenses
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-700/40">
                  <span className="text-slate-400">Payments Made</span>
                  <span className="text-rose-400 font-semibold">{fmt(fp?.totalExpenses)}</span>
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-700/40">
                  <span className="text-slate-400">Transfers (informational)</span>
                  <span className="text-slate-500">{fmt(fp?.totalTransfers)}</span>
                </div>
                <div className="flex justify-between text-sm py-2 bg-rose-950/30 rounded px-2 border border-rose-700/30">
                  <span className="text-rose-300 font-bold">Total Expenses</span>
                  <span className="text-rose-300 font-bold">{fmt(fp?.totalExpenses)}</span>
                </div>
              </div>

              {/* Net Position Column */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold mb-2">
                  Net Position
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-700/40">
                  <span className="text-slate-400">Net Surplus / (Deficit)</span>
                  <span className={`font-bold ${colorNum(fp?.netSurplusDeficit)}`}>
                    {fp?.netSurplusDeficit >= 0 ? '+' : ''}{fmt(fp?.netSurplusDeficit)}
                  </span>
                </div>
                <div className="flex justify-between text-xs py-1.5 border-b border-slate-700/40">
                  <span className="text-slate-400">Grand Closing Balance</span>
                  <span className="text-indigo-300 font-semibold">
                    {fmt(fp?.grandClosingBalance)}
                  </span>
                </div>
                <div
                  className={`flex justify-between text-sm py-2 rounded px-2 border ${
                    fp?.netSurplusDeficit >= 0
                      ? 'bg-emerald-950/30 border-emerald-700/30'
                      : 'bg-rose-950/30 border-rose-700/30'
                  }`}
                >
                  <span className={`font-bold ${colorNum(fp?.netSurplusDeficit)}`}>
                    {fp?.netSurplusDeficit >= 0 ? '✓ Surplus' : '⚠ Deficit'}
                  </span>
                  <span className={`font-bold ${colorNum(fp?.netSurplusDeficit)}`}>
                    {fp?.netSurplusDeficit >= 0 ? '+' : ''}{fmt(fp?.netSurplusDeficit)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Bank Statements Attachments Modal ── */}
      {showStatementModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <Paperclip size={18} className="text-indigo-400" />
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    Bank Statements Attachments
                  </h2>
                  <p className="text-xs text-slate-400">
                    Monthly Report Period: <strong className="text-indigo-300">{selectedMonth}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowStatementModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Informational Banner */}
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-700/40 text-xs text-indigo-200 leading-relaxed">
                <strong className="text-indigo-300 font-semibold block mb-0.5">Automated Report Attachment:</strong>
                Upload official bank statements (multi-page PDF documents or pictures/scans) for each bank account.
                When you generate or download the Monthly Report PDF, the system will automatically attach these statements
                right under each corresponding bank ledger in the final document.
              </div>

              {/* Status Alerts */}
              {statementSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-700/60 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  {statementSuccess}
                </div>
              )}
              {statementError && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-700/60 text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle size={15} />
                  {statementError}
                </div>
              )}

              {/* Upload Form */}
              <form onSubmit={handleUploadStatement} className="space-y-4 bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                <div className="font-semibold text-xs text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Upload size={14} className="text-indigo-400" />
                  Upload Statement Document(s)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Account Selector */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                      Select Bank / Cash Account <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={statementAccount}
                      onChange={(e) => setStatementAccount(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      required
                    >
                      <option value="">— Choose Bank Account —</option>
                      {(statementData?.accounts || []).map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.name} {acc.accountNumber ? `(${acc.accountNumber})` : ''} [{acc.type}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes / Tag */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                      Description / Label (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. October 2026 E-Statement / Stamped Scan"
                      value={statementNotes}
                      onChange={(e) => setStatementNotes(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* File Dropzone */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                    Statement Files (PDF or Pictures) <span className="text-rose-400">*</span>
                  </label>
                  <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 rounded-xl p-4 text-center cursor-pointer transition bg-slate-900/60 relative">
                    <input
                      type="file"
                      multiple
                      accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setStatementFiles((prev) => [...prev, ...files]);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload size={24} className="mx-auto text-indigo-400 mb-2 opacity-80" />
                    <p className="text-xs text-slate-300 font-medium">
                      Click or drag & drop bank statements here
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Accepts multi-page PDF documents & image scans (PNG, JPG, WEBP). Multiple files supported.
                    </p>
                  </div>
                </div>

                {/* Selected files preview */}
                {statementFiles.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Selected Files to Upload ({statementFiles.length}):
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {statementFiles.map((f, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            {f.type === 'application/pdf' ? (
                              <FileText size={14} className="text-rose-400 shrink-0" />
                            ) : (
                              <ImageIcon size={14} className="text-blue-400 shrink-0" />
                            )}
                            <span className="truncate text-slate-200 font-medium">{f.name}</span>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              ({(f.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setStatementFiles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-rose-400 transition"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={uploadingStatement || statementFiles.length === 0 || !statementAccount}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
                  >
                    <Upload size={14} className={uploadingStatement ? 'animate-spin' : ''} />
                    {uploadingStatement ? 'Uploading Statement…' : `Upload & Attach to Account`}
                  </button>
                </div>
              </form>

              {/* Existing Attached Statements List */}
              <div className="space-y-3">
                <div className="font-semibold text-xs text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Attached Statements for {selectedMonth}</span>
                  <span className="text-slate-500 text-[11px] font-normal">
                    {statementData?.totalStatementsAttached || 0} document(s) total
                  </span>
                </div>

                {(statementData?.accounts || []).filter((a) => a.fileCount > 0).length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500 bg-slate-950/20 border border-dashed border-slate-800 rounded-xl">
                    No bank statements uploaded for {selectedMonth} yet. Use the form above to upload.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(statementData?.accounts || [])
                      .filter((a) => a.fileCount > 0)
                      .map((acc) => (
                        <div
                          key={acc._id}
                          className="bg-slate-950/40 border border-slate-800 rounded-xl p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Landmark size={14} className="text-indigo-400" />
                              <span className="text-xs font-bold text-slate-200">
                                {acc.name}
                              </span>
                              {acc.accountNumber && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  ({acc.accountNumber})
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                              {acc.fileCount} {acc.fileCount === 1 ? 'file' : 'files'} attached
                            </span>
                          </div>

                          <div className="divide-y divide-slate-800/60">
                            {(acc.files || []).map((file) => (
                              <div
                                key={file._id}
                                className="flex items-center justify-between py-2 text-xs"
                              >
                                <div className="flex items-center gap-2.5 overflow-hidden">
                                  {file.fileType === 'PDF' ? (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 text-[9px] font-bold shrink-0">
                                      PDF
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 text-[9px] font-bold shrink-0">
                                      IMG
                                    </span>
                                  )}
                                  <span className="text-slate-200 font-medium truncate max-w-xs">
                                    {file.fileName || file.originalName}
                                  </span>
                                  {file.size > 0 && (
                                    <span className="text-[10px] text-slate-500 shrink-0">
                                      {(file.size / 1024).toFixed(0)} KB
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {acc.attachmentId && (
                                    <a
                                      href={bankStatementsAPI.getPreviewUrl(acc.attachmentId, file._id)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                      title="Open / Preview document"
                                    >
                                      <Eye size={11} />
                                      View
                                    </a>
                                  )}
                                  <button
                                    onClick={() =>
                                      handleDeleteStatementFile(acc.attachmentId, file._id)
                                    }
                                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition"
                                    title="Delete document"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MonthlyReportPage;
