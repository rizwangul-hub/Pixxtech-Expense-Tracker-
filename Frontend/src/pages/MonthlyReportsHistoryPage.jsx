import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  RefreshCw,
  Eye,
  Lock,
  Unlock,
  ShieldCheck,
  Clock,
  Send,
  Plus,
  ArrowRight,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { monthlyReportsAPI, financialReportsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';

export function MonthlyReportsHistoryPage({ currentUser, onNavigateToReportDetail }) {
  const userIsAdmin = isAdmin(currentUser);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Generation Modal State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateMonth, setGenerateMonth] = useState('2026-08');
  const [generateNotes, setGenerateNotes] = useState('');
  const [generating, setGenerating] = useState(false);

  // Status Update State
  const [statusUpdating, setStatusUpdating] = useState(null);

  // Detail Modal
  const [selectedReport, setSelectedReport] = useState(null);

  // Download PDF Loading
  const [downloadingMonth, setDownloadingMonth] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await monthlyReportsAPI.getReports();
      if (res?.success && res.data?.reports) {
        setReports(res.data.reports);
      }
    } catch (err) {
      console.error('Error loading monthly reports:', err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to load report history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Handle Generate / Re-generate
  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await monthlyReportsAPI.generateReport({
        month: generateMonth,
        notes: generateNotes,
      });
      if (res.success) {
        setSuccessMsg(`Report for ${generateMonth} successfully generated.`);
        setShowGenerateModal(false);
        setGenerateNotes('');
        await fetchReports();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  // Handle Status Transition (DRAFT -> REVIEWED -> PUBLISHED)
  const handleStatusChange = async (report, newStatus) => {
    if (!userIsAdmin) return;
    setStatusUpdating(report._id);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await monthlyReportsAPI.updateStatus(report.month, {
        status: newStatus,
      });
      if (res.success) {
        setSuccessMsg(`Report for ${report.month} marked as ${newStatus}.`);
        await fetchReports();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to update report status.');
    } finally {
      setStatusUpdating(null);
    }
  };

  // Handle PDF Download
  const handleDownloadPDF = async (month) => {
    setDownloadingMonth(month);
    try {
      await financialReportsAPI.downloadPDF(month);
    } catch (err) {
      alert('Failed to download PDF: ' + (err.response?.data?.message || err.message));
    } finally {
      setDownloadingMonth(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
              Audit & Compliance
            </span>
            <span className="text-xs text-slate-400">Pixx Technologies Management</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <FileText size={24} className="text-emerald-400" />
            Monthly Financial Reports Archive
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit trail, publishing workflow (Draft &rarr; Reviewed &rarr; Published) and tamper-proof locked reports
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchReports}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          {userIsAdmin && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
            >
              <Plus size={14} />
              Generate Monthly Report
            </button>
          )}
        </div>
      </div>

      {/* ── Notification Banners ── */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          <AlertTriangle size={15} className="shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── Reports History Table ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Archived <strong className="text-white">{reports.length}</strong> monthly financial records
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Workflow: DRAFT &rarr; REVIEWED &rarr; PUBLISHED</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[9px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3.5">Month / Period</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5 text-center">Reconciliation</th>
                <th className="py-3 px-3.5 text-right">Rental Income</th>
                <th className="py-3 px-3.5 text-right">Net Expenses</th>
                <th className="py-3 px-3.5 text-right">Closing Balance</th>
                <th className="py-3 px-3.5">Prepared By</th>
                <th className="py-3 px-3.5">Checked By</th>
                <th className="py-3 px-3.5">Published By</th>
                <th className="py-3 px-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-slate-500 font-sans">
                    <RefreshCw size={16} className="animate-spin inline mr-2 text-emerald-400" />
                    Loading monthly report archive...
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-12 text-center text-slate-500 font-sans">
                    No monthly reports archived yet. Click "Generate Monthly Report" to create your first official report.
                  </td>
                </tr>
              ) : (
                reports.map((r) => {
                  const isLocked = r.status === 'PUBLISHED';
                  const isReviewed = r.status === 'REVIEWED';
                  const isReconciled = r.reconciliationStatus === 'RECONCILED';

                  return (
                    <tr key={r._id || r.month} className="hover:bg-slate-800/40 transition">
                      {/* Period */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-bold text-white text-xs">{r.month}</div>
                        <div className="text-[10px] text-slate-500 font-sans">
                          {formatDate(r.generatedAt)}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3.5 text-center font-sans">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                            r.status === 'PUBLISHED'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                              : r.status === 'REVIEWED'
                              ? 'bg-sky-950 text-sky-300 border-sky-700/60'
                              : 'bg-amber-950 text-amber-300 border-amber-700/60'
                          }`}
                        >
                          {r.status === 'PUBLISHED' && <Lock size={10} />}
                          {r.status === 'REVIEWED' && <CheckCircle2 size={10} />}
                          {r.status === 'DRAFT' && <Clock size={10} />}
                          {r.status}
                        </span>
                      </td>

                      {/* Reconciliation Status */}
                      <td className="py-3 px-3.5 text-center font-sans">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isReconciled
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                              : 'bg-rose-950/60 text-rose-400 border-rose-800/40'
                          }`}
                          title={r.reconciliationNotes || ''}
                        >
                          {isReconciled ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                          {r.reconciliationStatus}
                        </span>
                      </td>

                      {/* Income */}
                      <td className="py-3 px-3.5 text-right font-bold text-emerald-400">
                        {formatPKR(r.summarySnapshot?.totalRentalIncome)}
                      </td>

                      {/* Expenses */}
                      <td className="py-3 px-3.5 text-right font-bold text-rose-400">
                        {formatPKR(r.summarySnapshot?.totalExpenses)}
                      </td>

                      {/* Closing Balance */}
                      <td className="py-3 px-3.5 text-right font-bold text-indigo-300">
                        {formatPKR(r.summarySnapshot?.closingBalance)}
                      </td>

                      {/* Signatures */}
                      <td className="py-3 px-3.5 font-sans text-slate-300 text-xs">
                        {r.preparedByName || 'Operator'}
                      </td>
                      <td className="py-3 px-3.5 font-sans text-slate-400 text-xs">
                        {r.reviewedByName || '—'}
                      </td>
                      <td className="py-3 px-3.5 font-sans text-emerald-400 text-xs font-semibold">
                        {r.publishedByName || '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-center font-sans">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View Snapshot */}
                          <button
                            onClick={() => setSelectedReport(r)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Snapshot"
                          >
                            <Eye size={13} />
                          </button>

                          {/* Download PDF */}
                          <button
                            onClick={() => handleDownloadPDF(r.month)}
                            disabled={downloadingMonth === r.month}
                            className="p-1.5 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 hover:text-white transition disabled:opacity-50"
                            title="Download Official PDF"
                          >
                            <FileDown size={13} className={downloadingMonth === r.month ? 'animate-spin' : ''} />
                          </button>

                          {/* Admin Review / Publish Actions */}
                          {userIsAdmin && (
                            <>
                              {r.status === 'DRAFT' && (
                                <button
                                  onClick={() => handleStatusChange(r, 'REVIEWED')}
                                  disabled={statusUpdating === r._id}
                                  className="px-2 py-1 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-700/60 text-sky-300 text-[10px] font-bold transition disabled:opacity-50"
                                  title="Mark Reviewed by Auditor"
                                >
                                  Mark Reviewed
                                </button>
                              )}

                              {r.status === 'REVIEWED' && (
                                <button
                                  onClick={() => handleStatusChange(r, 'PUBLISHED')}
                                  disabled={statusUpdating === r._id}
                                  className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold transition disabled:opacity-50 flex items-center gap-1"
                                  title="Publish and Lock Period"
                                >
                                  <Lock size={10} />
                                  Publish & Lock
                                </button>
                              )}

                              {r.status === 'PUBLISHED' && (
                                <button
                                  onClick={() => handleStatusChange(r, 'DRAFT')}
                                  disabled={statusUpdating === r._id}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-300 text-[10px] font-semibold transition disabled:opacity-50"
                                  title="Revert to Draft (Unlocks Period)"
                                >
                                  Unlock
                                </button>
                              )}
                            </>
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

      {/* ── Generate Monthly Report Modal ── */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Generate Monthly Financial Report</h3>
              </div>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">
                  Reporting Month (YYYY-MM)
                </label>
                <input
                  type="month"
                  value={generateMonth}
                  onChange={(e) => setGenerateMonth(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">
                  Auditor / Management Notes
                </label>
                <textarea
                  rows="3"
                  value={generateNotes}
                  onChange={(e) => setGenerateNotes(e.target.value)}
                  placeholder="Optional audit notes or reconciliation memo..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-bold text-slate-300">Automated Pre-flight Checks:</div>
                <div>&bull; Mathematically aggregates double-entry ledger lines</div>
                <div>&bull; Verifies bank and cash custodian running balances</div>
                <div>&bull; Verifies rental hierarchy agreed vs received</div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {generating ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Computing...
                    </>
                  ) : (
                    'Generate Snapshot'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Snapshot Modal ── */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-indigo-400" />
                <h3 className="text-sm font-bold text-white">
                  Monthly Snapshot &bull; {selectedReport.month}
                </h3>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Rental Income</div>
                  <div className="text-emerald-400 font-bold font-mono text-sm mt-0.5">
                    {formatPKR(selectedReport.summarySnapshot?.totalRentalIncome)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Other Receipts</div>
                  <div className="text-amber-400 font-bold font-mono text-sm mt-0.5">
                    {formatPKR(selectedReport.summarySnapshot?.totalOtherIncome)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Net Expenses</div>
                  <div className="text-rose-400 font-bold font-mono text-sm mt-0.5">
                    {formatPKR(selectedReport.summarySnapshot?.totalExpenses)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Net Position</div>
                  <div className="text-white font-bold font-mono text-sm mt-0.5">
                    {formatPKR(selectedReport.summarySnapshot?.netPosition)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Opening Balance</div>
                  <div className="text-slate-300 font-mono text-sm mt-0.5">
                    {formatPKR(selectedReport.summarySnapshot?.openingBalance)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Closing Balance</div>
                  <div className="text-indigo-300 font-bold font-mono text-sm mt-0.5">
                    {formatPKR(selectedReport.summarySnapshot?.closingBalance)}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Reconciliation Status
                </div>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-slate-300">
                  {selectedReport.reconciliationNotes || 'Reconciled.'}
                </div>
              </div>

              {selectedReport.notes && (
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Management Notes
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-800 text-slate-300">
                    {selectedReport.notes}
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  onClick={() => handleDownloadPDF(selectedReport.month)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold transition flex items-center gap-1.5"
                >
                  <FileDown size={13} />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MonthlyReportsHistoryPage;
