import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Calendar,
  Building,
  Building2,
  Users,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  Filter,
  Play,
  Info,
  CalendarDays,
} from 'lucide-react';
import { rentDueAPI, propertiesAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';

export function RentDuePage({ currentUser, onSelectTenant }) {
  const userIsAdmin = isAdmin(currentUser);

  // Default month to 2026-08 matching current reporting cycle
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [rentDueRecords, setRentDueRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [propertiesList, setPropertiesList] = useState([]);

  // Generate Modal State
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [genTargetMonth, setGenTargetMonth] = useState('2026-08');
  const [genPropertyId, setGenPropertyId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);

  const loadRentDue = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (selectedMonth) params.month = selectedMonth;
      if (propertyFilter) params.propertyId = propertyFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await rentDueAPI.getRentDue(params);
      if (res?.success) {
        setRentDueRecords(res.data.rentDueRecords || []);
        setSummary(res.data.summary || null);
      } else {
        setError(res?.message || 'Failed to load rent due records.');
      }
    } catch (err) {
      console.error('Error fetching rent due:', err);
      setError(err.response?.data?.message || err.message || 'Error loading rent due.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await propertiesAPI.getProperties({ limit: 100 });
        if (res?.success) {
          setPropertiesList(res.data.properties || []);
        }
      } catch (err) {
        console.error('Error loading properties list:', err);
      }
    };
    fetchProperties();
  }, []);

  useEffect(() => {
    loadRentDue();
  }, [selectedMonth, propertyFilter, statusFilter]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setGenResult(null);

    try {
      const payload = {
        month: genTargetMonth,
      };
      if (genPropertyId) {
        payload.propertyId = genPropertyId;
      }

      const res = await rentDueAPI.generateRentDue(payload);
      if (res?.success) {
        setGenResult(res.data);
        loadRentDue();
      } else {
        alert(res?.message || 'Generation failed.');
      }
    } catch (err) {
      console.error('Generate rent due error:', err);
      alert(err.response?.data?.message || err.message || 'Failed to generate rent due.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-wide">Monthly Rent Due</h1>
            <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              Expected Billing Ledger
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Tracks scheduled monthly rental expectations derived from active leases.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userIsAdmin && (
            <button
              onClick={() => {
                setGenTargetMonth(selectedMonth || '2026-08');
                setGenPropertyId('');
                setGenResult(null);
                setGenerateModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <Play size={15} />
              <span>Generate Monthly Rent Due</span>
            </button>
          )}
          <button
            onClick={loadRentDue}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            title="Refresh list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Scope Disclaimer Banner */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-start gap-3 text-xs text-slate-300">
        <Info size={18} className="text-indigo-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-white">Accounting Register:</strong> This register tracks expected rent dues generated from active leases and reconciles against rental collection receipts.
        </div>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Total Expected Rent</span>
              <Receipt size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
              {formatPKR(summary.totalExpectedAmount)}
            </div>
            <div className="text-xs text-slate-500 mt-1">For {summary.filteredMonth}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Billable Units</span>
              <Building size={16} className="text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-1">{summary.totalRecords}</div>
            <div className="text-xs text-slate-500 mt-1">Active agreement units</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Due Status</span>
              <Clock size={16} className="text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-300 mt-1">{summary.dueCount}</div>
            <div className="text-xs text-slate-500 mt-1">Awaiting rent receipt</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Target Month</span>
              <CalendarDays size={16} className="text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {summary.filteredMonth}
            </div>
            <div className="text-xs text-slate-500 mt-1">Active billing period</div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold">Rent Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-emerald-400 font-mono font-semibold focus:outline-none focus:border-emerald-500"
            >
              <option value="2026-07">2026-07 (July)</option>
              <option value="2026-08">2026-08 (August)</option>
              <option value="2026-09">2026-09 (September)</option>
              <option value="2026-10">2026-10 (October)</option>
              <option value="2026-11">2026-11 (November)</option>
              <option value="2026-12">2026-12 (December)</option>
              <option value="">All Months</option>
            </select>
          </div>

          {/* Property Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold">Property:</label>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 max-w-[200px]"
            >
              <option value="">All Properties</option>
              {propertiesList.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.propertyName}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Statuses</option>
              <option value="DUE">DUE</option>
              <option value="OVERDUE">OVERDUE</option>
              <option value="PAID">PAID</option>
            </select>
          </div>
        </div>

        <button
          onClick={loadRentDue}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-1.5 rounded-lg text-xs font-medium transition"
        >
          Apply Filter
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="text-red-400 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Rent Due Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-500" />
            <p className="text-sm">Loading rent due records...</p>
          </div>
        ) : rentDueRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt size={36} className="mx-auto mb-2 text-slate-600" />
            <p className="text-base font-semibold text-slate-300">No Rent Due Records Found</p>
            <p className="text-sm text-slate-500 mt-1">
              Click &quot;Generate Monthly Rent Due&quot; above to create billing expectations for active leases.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-4">Rent Month</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4">Tenant</th>
                  <th className="py-3.5 px-4">Property & Leased Unit</th>
                  <th className="py-3.5 px-4 text-right">Expected Rent</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Agreement #</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rentDueRecords.map((rd) => (
                  <tr key={rd._id} className="hover:bg-slate-800/40 transition">
                    {/* Month */}
                    <td className="py-3.5 px-4 font-mono font-bold text-white text-xs">
                      {rd.rentMonth}
                    </td>

                    {/* Due Date */}
                    <td className="py-3.5 px-4 text-slate-300 text-xs">
                      {formatDate(rd.dueDate)}
                    </td>

                    {/* Tenant */}
                    <td className="py-3.5 px-4">
                      <div
                        onClick={() => onSelectTenant && rd.tenantId?._id && onSelectTenant(rd.tenantId._id)}
                        className="font-medium text-white hover:text-emerald-400 transition cursor-pointer text-xs"
                      >
                        {rd.tenantId?.fullName || 'Tenant'}
                      </div>
                      {rd.tenantId?.companyName && (
                        <div className="text-[11px] text-slate-400">{rd.tenantId.companyName}</div>
                      )}
                    </td>

                    {/* Property & Unit */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200 text-xs flex items-center gap-1">
                        <Building2 size={13} className="text-emerald-400 shrink-0" />
                        <span>{rd.propertyId?.propertyName}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Unit: <span className="text-slate-200 font-medium">{rd.unitDetails?.unitName || 'Unit'}</span>
                      </div>
                    </td>

                    {/* Expected Rent */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-emerald-400 font-mono text-sm">
                        {formatPKR(rd.expectedRentAmount)}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                        {rd.status}
                      </span>
                    </td>

                    {/* Agreement Number */}
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-indigo-300">
                      {rd.agreementId?.agreementNumber || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Monthly Rent Due Modal */}
      {generateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Generate Monthly Rent Due</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Creates expected rent billing records for all qualifying active agreements.
                </p>
              </div>
              <button
                onClick={() => setGenerateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGenerate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Billing Target Month (YYYY-MM) *
                </label>
                <input
                  type="text"
                  required
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  value={genTargetMonth}
                  onChange={(e) => setGenTargetMonth(e.target.value)}
                  placeholder="2026-08"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Due dates will be automatically capped at month-end (e.g. Feb 28).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Filter by Specific Property (Optional)
                </label>
                <select
                  value={genPropertyId}
                  onChange={(e) => setGenPropertyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Portfolio Properties</option>
                  {propertiesList.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.propertyName}
                    </option>
                  ))}
                </select>
              </div>

              {genResult && (
                <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-4 text-xs space-y-1.5">
                  <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Generation Completed for {genResult.month}
                  </div>
                  <div className="text-slate-300">
                    Total Active Agreements Checked: <strong>{genResult.totalEligible}</strong>
                  </div>
                  <div className="text-emerald-400 font-medium">
                    Newly Generated Records: <strong>{genResult.newlyGenerated}</strong>
                  </div>
                  <div className="text-slate-400">
                    Already Existing (Skipped): <strong>{genResult.alreadyExisting}</strong>
                  </div>
                  <div className="text-white font-mono font-bold pt-1">
                    Total Amount Generated: {formatPKR(genResult.totalAmountGenerated)}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setGenerateModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-2"
                >
                  {generating && <RefreshCw size={14} className="animate-spin" />}
                  <span>Run Generation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default RentDuePage;
