import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  ShieldCheck,
  Calendar,
  Layers,
  FileText,
  Clock,
  HardDrive,
  Info,
  Check,
  X,
  FileArchive,
} from 'lucide-react';
import { adminAPI } from '../services/api.js';
import { isAdmin } from '../utils/permissions.js';

export function DatabaseBackupSection({ currentUser }) {
  const adminAuthorized = isAdmin(currentUser);

  // Backup Creation State
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonthName, setSelectedMonthName] = useState('08'); // '08' = August
  const [backupDescription, setBackupDescription] = useState('August 2026 Monthly Master & Financial Ledger Backup');
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(null);
  const [createError, setCreateError] = useState(null);

  // Backup History State
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  // Import / Restore State
  const [selectedFile, setSelectedFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validationError, setValidationError] = useState(null);

  // Restore Execution State
  const [restoreMode, setRestoreMode] = useState('merge'); // 'merge' | 'clean_month'
  const [updateExisting, setUpdateExisting] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(null);
  const [restoreError, setRestoreError] = useState(null);

  const monthsList = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
    { value: 'ALL', label: 'All History (Entire Database)' },
  ];

  const targetBackupMonth = selectedMonthName === 'ALL' ? 'ALL' : `${selectedYear}-${selectedMonthName}`;

  // Fetch Backup History
  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await adminAPI.getBackupHistory();
      const list = res.data?.backups || res.backups || [];
      setHistory(list);
    } catch (err) {
      console.error('Failed to load backup history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (adminAuthorized) {
      loadHistory();
    }
  }, [adminAuthorized]);

  // Handle Create Backup
  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      setCreateSuccess(null);
      setCreateError(null);

      const res = await adminAPI.createBackup({
        month: targetBackupMonth,
        description: backupDescription,
      });

      const data = res.data || res;
      setCreateSuccess(data);
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to create backup.';
      setCreateError(msg);
    } finally {
      setCreatingBackup(false);
    }
  };

  // Handle Direct Download of Just-Created Backup
  const handleDownloadCreated = async () => {
    if (!createSuccess?.backupId) return;
    try {
      setDownloadingId(createSuccess.backupId);
      await adminAPI.downloadBackup(createSuccess.backupId, createSuccess.filename);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Download from History Table
  const handleDownloadHistory = async (backup) => {
    try {
      setDownloadingId(backup._id);
      await adminAPI.downloadBackup(backup._id, backup.filename);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle File Selection for Validation / Restore
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setValidationResult(null);
      setValidationError(null);
      setRestoreSuccess(null);
      setRestoreError(null);
    }
  };

  // Handle Validate Backup File
  const handleValidateBackup = async () => {
    if (!selectedFile) return;
    try {
      setValidating(true);
      setValidationResult(null);
      setValidationError(null);

      const res = await adminAPI.validateBackup(selectedFile);
      const data = res.data || res;
      setValidationResult(data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to validate backup archive.';
      setValidationError(msg);
    } finally {
      setValidating(false);
    }
  };

  // Handle Execute Safe Restore
  const handleExecuteRestore = async () => {
    if (!selectedFile) return;
    if (confirmationInput !== 'CONFIRM_RESTORE') {
      alert("Please type 'CONFIRM_RESTORE' in the confirmation box before proceeding.");
      return;
    }

    try {
      setRestoring(true);
      setRestoreSuccess(null);
      setRestoreError(null);

      const res = await adminAPI.restoreBackup(selectedFile, {
        mode: restoreMode,
        updateExisting,
        confirmation: confirmationInput,
      });

      const data = res.data || res;
      setRestoreSuccess(data);
      setConfirmationInput('');
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Restore operation failed.';
      setRestoreError(msg);
    } finally {
      setRestoring(false);
    }
  };

  if (!adminAuthorized) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
        <ShieldCheck className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-white">Access Restricted</h3>
        <p className="text-xs text-slate-400 mt-1">
          Database Backup and Restore features are restricted to authorized System Administrators only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ============================================================ */}
      {/* SECTION 1: CREATE DATABASE BACKUP                            */}
      {/* ============================================================ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                Monthly Database Backup
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/50">
                  Admin Exclusive
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate an immutable, relational BSON-EJSON ZIP archive preserving all master collections, documents, ObjectIds, and dates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
              title="Refresh backup records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Form Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* Select Year */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Select Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2025">2025</option>
            </select>
          </div>

          {/* Select Month */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Select Month
            </label>
            <select
              value={selectedMonthName}
              onChange={(e) => setSelectedMonthName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {monthsList.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} {m.value !== 'ALL' ? `(${selectedYear}-${m.value})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Backup Month Label */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Target Period Identifier
            </label>
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400 flex items-center justify-between">
              <span>{targetBackupMonth}</span>
              <span className="text-[10px] text-slate-500 font-sans font-normal">
                {targetBackupMonth === 'ALL' ? 'Full DB Export' : 'Monthly Financial Slice'}
              </span>
            </div>
          </div>
        </div>

        {/* Backup Description */}
        <div className="mt-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Backup Description / Notes
          </label>
          <input
            type="text"
            value={backupDescription}
            onChange={(e) => setBackupDescription(e.target.value)}
            placeholder="e.g. August 2026 Monthly Master & Historical Ledger Backup"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Notice Card on Accounting & Master Data */}
        <div className="mt-5 p-3.5 rounded-xl bg-blue-950/30 border border-blue-800/40 text-blue-200 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-white">Full Relational Integrity Guarantee:</span>
            <p className="text-[11px] text-blue-200/90 leading-relaxed">
              This backup exports all master entities (Users, Properties, Units, Tenants, Bank Accounts, Cash Custodians, Chart of Accounts, Employees) alongside all transactions up to the end of {targetBackupMonth}. This guarantees that running balances, opening balances, and entity foreign keys reconstruct deterministically on any MongoDB target.
            </p>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-900/30 transition disabled:opacity-50 cursor-pointer"
          >
            {creatingBackup ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating Database Backup ZIP...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Create Monthly Backup
              </>
            )}
          </button>

          {createSuccess && (
            <button
              onClick={handleDownloadCreated}
              disabled={downloadingId === createSuccess.backupId}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Backup ({createSuccess.filename})
            </button>
          )}
        </div>

        {/* Creation Error */}
        {createError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{createError}</span>
          </div>
        )}

        {/* Creation Success Summary Card */}
        {createSuccess && (
          <div className="mt-5 p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-200 text-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              Backup Created & Verified Successfully!
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono">
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block font-sans">Month:</span>
                <span className="text-white font-bold">{createSuccess.manifest?.backupMonth}</span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block font-sans">Total Documents:</span>
                <span className="text-emerald-400 font-bold">{createSuccess.manifest?.totalDocuments?.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block font-sans">Collections:</span>
                <span className="text-blue-400 font-bold">{createSuccess.manifest?.collections?.length}</span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 block font-sans">Archive Size:</span>
                <span className="text-amber-400 font-bold">{((createSuccess.sizeBytes || 0) / 1024).toFixed(1)} KB</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-mono pt-1">
              SHA-256: {createSuccess.checksum}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION 2: BACKUP HISTORY                                    */}
      {/* ============================================================ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-black text-white tracking-tight">
              Backup History & Archive Register
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {history.length} backup records found
          </span>
        </div>

        {loadingHistory ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
            Loading backup history...
          </div>
        ) : history.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs font-medium">
            No backup records registered yet. Create your first backup above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-bold text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Backup Month</th>
                  <th className="py-3 px-3">Created By</th>
                  <th className="py-3 px-3">Collections</th>
                  <th className="py-3 px-3">Documents</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {history.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {new Date(b.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap font-sans">
                      {b.backupMonth}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">
                      {b.createdByName || 'Administrator'}
                    </td>
                    <td className="py-2.5 px-3 text-blue-400">
                      {b.collectionsCount || b.collectionsList?.length || 0}
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">
                      {(b.totalDocuments || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {b.sizeBytes ? `${(b.sizeBytes / 1024).toFixed(1)} KB` : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          b.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800/50'
                            : b.status === 'RESTORED'
                            ? 'bg-blue-950 text-blue-400 border-blue-800/50'
                            : 'bg-amber-950 text-amber-400 border-amber-800/50'
                        }`}
                      >
                        {b.status || 'COMPLETED'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <button
                        onClick={() => handleDownloadHistory(b)}
                        disabled={downloadingId === b._id}
                        className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-[11px] font-bold transition inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION 3: IMPORT / RESTORE BACKUP                           */}
      {/* ============================================================ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
          <div className="h-10 w-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
              Import & Safe Restore Backup
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 border border-purple-700/50">
                Safe Multi-Stage Verification
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload a previously generated backup ZIP archive. The system strictly validates the archive, document counts, and relations before executing safe MongoDB bulk upserts.
            </p>
          </div>
        </div>

        {/* Step 1: Upload & Validate */}
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Select Backup Archive (.zip)
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={handleFileChange}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl p-1.5 focus:outline-none flex-1"
              />
              <button
                onClick={handleValidateBackup}
                disabled={!selectedFile || validating}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 transition disabled:opacity-50 cursor-pointer"
              >
                {validating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Validating Archive Structure...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    Validate Backup
                  </>
                )}
              </button>
            </div>
          </div>

          {validationError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Validation Result Preview Card */}
          {validationResult && (
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  Backup Validation Passed — Ready for Safe Restore
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  Version {validationResult.manifest?.backupVersion || '1.0.0'}
                </span>
              </div>

              {/* Preview KPI Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block font-sans text-[10px]">Target Month:</span>
                  <span className="text-white font-black text-sm">{validationResult.manifest?.backupMonth}</span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block font-sans text-[10px]">Collections Found:</span>
                  <span className="text-blue-400 font-black text-sm">{validationResult.summary?.collectionsCount}</span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block font-sans text-[10px]">Total Documents:</span>
                  <span className="text-emerald-400 font-black text-sm">
                    {validationResult.summary?.totalDocuments?.toLocaleString()}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block font-sans text-[10px]">Created By:</span>
                  <span className="text-purple-400 font-bold truncate block">{validationResult.manifest?.createdBy}</span>
                </div>
              </div>

              {/* Warnings if any */}
              {validationResult.warnings?.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Archive Warnings:
                  </div>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-200/90">
                    {validationResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Step 2: Safe Restore Options & Confirmation */}
              <div className="pt-3 border-t border-slate-800 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Restore Mode */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Import Strategy
                    </label>
                    <select
                      value={restoreMode}
                      onChange={(e) => setRestoreMode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="merge">
                        Safe Merge (Insert missing, avoid duplicates)
                      </option>
                      <option value="clean_month">
                        Clean Month & Replace (Remove month transactions first, then restore)
                      </option>
                    </select>
                  </div>

                  {/* Update Existing Checkbox */}
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="updateExistingCheckbox"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-0"
                    />
                    <label
                      htmlFor="updateExistingCheckbox"
                      className="text-xs text-slate-300 cursor-pointer select-none"
                    >
                      Overwrite existing matching documents with backup versions
                    </label>
                  </div>
                </div>

                {/* Explicit Confirmation Input */}
                <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/50 space-y-2">
                  <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Caution: Database Modification Confirmation Required
                  </div>
                  <p className="text-[11px] text-slate-400">
                    To prevent accidental restore operations, please type{' '}
                    <strong className="text-rose-300 font-mono">CONFIRM_RESTORE</strong> into the box below before clicking Execute Restore.
                  </p>
                  <input
                    type="text"
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    placeholder="Type CONFIRM_RESTORE here"
                    className="w-full bg-slate-950 border border-rose-900/80 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Execute Button */}
                <button
                  onClick={handleExecuteRestore}
                  disabled={restoring || confirmationInput !== 'CONFIRM_RESTORE'}
                  className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-900/30 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {restoring ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Executing Safe Restore into MongoDB...
                    </>
                  ) : (
                    <>
                      <HardDrive className="w-4 h-4" />
                      Execute Safe Restore into Database
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Restore Success Summary */}
          {restoreSuccess && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-200 text-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Data Restore Completed Successfully!
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] font-mono">
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block font-sans">Inserted:</span>
                  <span className="text-emerald-400 font-bold">{restoreSuccess.stats?.inserted}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block font-sans">Updated:</span>
                  <span className="text-blue-400 font-bold">{restoreSuccess.stats?.updated}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block font-sans">Skipped:</span>
                  <span className="text-slate-400 font-bold">{restoreSuccess.stats?.skipped}</span>
                </div>
              </div>
            </div>
          )}

          {/* Restore Error */}
          {restoreError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{restoreError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DatabaseBackupSection;
