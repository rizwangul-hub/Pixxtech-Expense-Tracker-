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
          <div className="flex items-center gap-3">
            <h1 className="page-title">Monthly Rent Due</h1>
            <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-300">
              Expected Billing Ledger
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1 font-medium">
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
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition flex items-center gap-2 shadow-sm text-white-keep"
            >
              <Play size={16} className="text-white-keep" />
              <span>Generate Monthly Rent Due</span>
            </button>
          )}
          <button
            onClick={loadRentDue}
            className="p-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition shadow-2xs"
            title="Refresh list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Scope Disclaimer Banner */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-start gap-3 text-xs text-slate-700 shadow-2xs">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed font-medium">
          <strong className="text-slate-900 font-bold">Accounting Register:</strong> This register tracks expected rent dues generated from active leases and reconciles against rental collection receipts.
        </div>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">Total Expected Rent</span>
              <Receipt size={18} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
              {formatPKR(summary.totalExpectedAmount)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">For {summary.filteredMonth}</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">Billable Units</span>
              <Building size={18} className="text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{summary.totalRecords}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Active agreement units</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">Due Status</span>
              <Clock size={18} className="text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{summary.dueCount}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Awaiting rent receipt</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">Target Month</span>
              <CalendarDays size={18} className="text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
              {summary.filteredMonth}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Active billing period</div>
          </div>
        </div>
      )}

      {/* Medium Grey Section Bar Header */}
      <div className="section-bar shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="section-title">Rents and Charges</span>
          <span className="section-count-badge">{rentDueRecords.length}</span>
        </div>
        <span className="text-xs text-white/90 font-medium">Active Ledger Records</span>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-700 font-bold">Rent Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-600"
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
            <label className="text-xs text-slate-700 font-bold">Property:</label>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600 max-w-[200px]"
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
            <label className="text-xs text-slate-700 font-bold">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 font-semibold focus:outline-none focus:border-blue-600"
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
          className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs"
        >
          Apply Filter
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="text-rose-600 shrink-0" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {/* Rent Due Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-600">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-600" />
            <p className="text-sm font-semibold">Loading rent due records...</p>
          </div>
        ) : rentDueRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-600">
            <Receipt size={36} className="mx-auto mb-2 text-slate-400" />
            <p className="text-base font-bold text-slate-900">No Rent Due Records Found</p>
            <p className="text-sm text-slate-600 mt-1">
              Click &quot;Generate Monthly Rent Due&quot; above to create billing expectations for active leases.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="custom-table">
              <thead>
                <tr>
                  <th className="text-left">Rent Month</th>
                  <th className="text-left">Due Date</th>
                  <th className="text-left">Tenant / Payer</th>
                  <th className="text-left">Property & Leased Unit</th>
                  <th className="text-right">Expected Rent</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Agreement #</th>
                </tr>
              </thead>
              <tbody>
                {rentDueRecords.map((rd) => (
                  <tr key={rd._id} className="hover:bg-slate-50 transition">
                    {/* Month */}
                    <td className="font-mono font-bold text-slate-900">
                      {rd.rentMonth}
                    </td>

                    {/* Due Date */}
                    <td className="text-slate-800 font-semibold">
                      {formatDate(rd.dueDate)}
                    </td>

                    {/* Tenant / Payer */}
                    <td>
                      <div
                        onClick={() => onSelectTenant && rd.tenantId?._id && onSelectTenant(rd.tenantId._id)}
                        className="font-bold text-slate-900 hover:text-blue-700 transition cursor-pointer"
                      >
                        {rd.tenantId?.fullName || 'Tenant'}
                      </div>
                      {rd.tenantId?.companyName && (
                        <div className="text-xs text-slate-600 font-normal">{rd.tenantId.companyName}</div>
                      )}
                    </td>

                    {/* Property & Unit */}
                    <td>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Building2 size={15} className="text-blue-600 shrink-0" />
                        <span>{rd.propertyId?.propertyName}</span>
                      </div>
                      <div className="text-xs text-slate-600 font-medium mt-0.5">
                        Unit: <span className="text-slate-900 font-bold">{rd.unitDetails?.unitName || 'Unit'}</span>
                      </div>
                    </td>

                    {/* Expected Rent */}
                    <td className="text-right">
                      <div className="currency-amount text-slate-900 font-mono">
                        {formatPKR(rd.expectedRentAmount)}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        {rd.status}
                      </span>
                    </td>

                    {/* Agreement Number */}
                    <td className="text-right font-mono text-xs font-bold text-slate-700">
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
