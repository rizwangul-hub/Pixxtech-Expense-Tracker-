import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Plus,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Building,
  Building2,
  Users,
  AlertCircle,
  RefreshCw,
  Calendar,
  Layers,
} from 'lucide-react';
import { agreementsAPI, propertiesAPI, tenantsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';

export function AgreementsPage({ currentUser, onSelectTenant }) {
  const userIsAdmin = isAdmin(currentUser);

  const [agreements, setAgreements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');

  // Dropdown options
  const [propertiesList, setPropertiesList] = useState([]);
  const [tenantsList, setTenantsList] = useState([]);

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState(null);
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const [formData, setFormData] = useState({
    agreementNumber: '',
    propertyId: '',
    unitId: '',
    tenantId: '',
    startDate: '',
    endDate: '',
    renewalDate: '',
    monthlyRent: '',
    dueDay: 5,
    securityDeposit: '',
    paymentFrequency: 'MONTHLY',
    status: 'ACTIVE',
    notes: '',
  });

  const loadAgreements = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (propertyFilter) params.propertyId = propertyFilter;

      const res = await agreementsAPI.getAgreements(params);
      if (res?.success) {
        setAgreements(res.data.agreements || []);
        setSummary(res.data.summary || null);
      } else {
        setError(res?.message || 'Failed to load agreements.');
      }
    } catch (err) {
      console.error('Error fetching agreements:', err);
      setError(err.response?.data?.message || err.message || 'Error loading agreements.');
    } finally {
      setLoading(false);
    }
  };

  // Load dropdown lists (Properties & Tenants)
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [propsRes, tenantsRes] = await Promise.all([
          propertiesAPI.getProperties({ limit: 100 }),
          tenantsAPI.getTenants({ limit: 100, status: 'ACTIVE' }),
        ]);
        if (propsRes?.success) {
          setPropertiesList(propsRes.data.properties || []);
        }
        if (tenantsRes?.success) {
          setTenantsList(tenantsRes.data.tenants || []);
        }
      } catch (err) {
        console.error('Error loading dropdown lists:', err);
      }
    };
    fetchDropdowns();
  }, []);

  useEffect(() => {
    loadAgreements();
  }, [statusFilter, propertyFilter]);

  // Load units whenever property selection changes in modal
  const handlePropertyChangeInModal = async (propId) => {
    setFormData((prev) => ({ ...prev, propertyId: propId, unitId: '' }));
    if (!propId) {
      setPropertyUnits([]);
      return;
    }

    try {
      setLoadingUnits(true);
      const res = await propertiesAPI.getPropertyUnits(propId);
      if (res?.success) {
        setPropertyUnits(res.data.units || []);
      }
    } catch (err) {
      console.error('Error loading units for property:', err);
    } finally {
      setLoadingUnits(false);
    }
  };

  const handleOpenCreateModal = async () => {
    setEditingAgreement(null);
    let nextNumber = '';
    try {
      const numRes = await agreementsAPI.getNextNumber();
      if (numRes?.success) {
        nextNumber = numRes.data.nextNumber;
      }
    } catch (err) {
      console.warn('Could not pre-fetch next agreement number:', err);
    }

    setFormData({
      agreementNumber: nextNumber,
      propertyId: '',
      unitId: '',
      tenantId: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      renewalDate: '',
      monthlyRent: '',
      dueDay: 5,
      securityDeposit: '',
      paymentFrequency: 'MONTHLY',
      status: 'ACTIVE',
      notes: '',
    });
    setPropertyUnits([]);
    setFormErrors({});
    setModalOpen(true);
  };

  const handleOpenEditModal = async (agr) => {
    setEditingAgreement(agr);
    const propId = agr.propertyId?._id || agr.propertyId;

    // Load units for this property
    try {
      setLoadingUnits(true);
      const res = await propertiesAPI.getPropertyUnits(propId);
      if (res?.success) {
        setPropertyUnits(res.data.units || []);
      }
    } catch (err) {
      console.error('Error loading units:', err);
    } finally {
      setLoadingUnits(false);
    }

    setFormData({
      agreementNumber: agr.agreementNumber || '',
      propertyId: propId,
      unitId: agr.unitId || '',
      tenantId: agr.tenantId?._id || agr.tenantId || '',
      startDate: agr.startDate ? new Date(agr.startDate).toISOString().split('T')[0] : '',
      endDate: agr.endDate ? new Date(agr.endDate).toISOString().split('T')[0] : '',
      renewalDate: agr.renewalDate ? new Date(agr.renewalDate).toISOString().split('T')[0] : '',
      monthlyRent: agr.monthlyRent || '',
      dueDay: agr.dueDay || 5,
      securityDeposit: agr.securityDeposit || '',
      paymentFrequency: agr.paymentFrequency || 'MONTHLY',
      status: agr.status || 'ACTIVE',
      notes: agr.notes || '',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormErrors({});

    try {
      if (editingAgreement) {
        await agreementsAPI.updateAgreement(editingAgreement._id, formData);
      } else {
        await agreementsAPI.createAgreement(formData);
      }
      setModalOpen(false);
      loadAgreements();
    } catch (err) {
      console.error('Save agreement error:', err);
      if (err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setFormErrors({ general: err.response?.data?.message || err.message });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleStatus = async (agr, targetStatus) => {
    if (!window.confirm(`Are you sure you want to mark agreement "${agr.agreementNumber}" as ${targetStatus}?`)) {
      return;
    }

    try {
      await agreementsAPI.toggleAgreementStatus(agr._id, { status: targetStatus });
      loadAgreements();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update agreement status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-wide">Rental Agreements</h1>
            <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
              Contract Engine
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Binding legal contracts between leasable units and tenants. Source of truth for occupancy and rent due.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userIsAdmin && (
            <button
              onClick={handleOpenCreateModal}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <Plus size={16} />
              <span>New Agreement</span>
            </button>
          )}
          <button
            onClick={loadAgreements}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            title="Refresh list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Total Agreements</span>
              <FileText size={16} className="text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-1">{summary.totalAgreements}</div>
            <div className="text-xs text-slate-500 mt-1">All contract records</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Active Leases</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {summary.activeAgreements}
            </div>
            <div className="text-xs text-slate-500 mt-1">Currently binding & billable</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Agreed Monthly Rent</span>
              <Building size={16} className="text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
              {formatPKR(summary.totalMonthlyRentRoll)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Sum of active monthly rent</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Terminated / Expired</span>
              <Clock size={16} className="text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-slate-300 mt-1">
              {summary.expiredAgreements + summary.terminatedAgreements}
            </div>
            <div className="text-xs text-slate-500 mt-1">Historical leases preserved</div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Search by agreement #, tenant name, or property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 transition max-w-[200px]"
            >
              <option value="">All Properties</option>
              {propertiesList.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.propertyName}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="TERMINATED">Terminated</option>
              <option value="DRAFT">Draft</option>
            </select>

            <button
              onClick={loadAgreements}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="text-red-400 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Agreements Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-500" />
            <p className="text-sm">Loading agreements...</p>
          </div>
        ) : agreements.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText size={36} className="mx-auto mb-2 text-slate-600" />
            <p className="text-base font-semibold text-slate-300">No Rental Agreements Found</p>
            <p className="text-sm text-slate-500 mt-1">
              {search || statusFilter || propertyFilter
                ? 'Try adjusting your search filters.'
                : 'Get started by creating your first rental agreement.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-4">Agreement #</th>
                  <th className="py-3.5 px-4">Tenant</th>
                  <th className="py-3.5 px-4">Property & Unit</th>
                  <th className="py-3.5 px-4">Lease Period</th>
                  <th className="py-3.5 px-4 text-right">Monthly Rent</th>
                  <th className="py-3.5 px-4 text-center">Due Day</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {agreements.map((agr) => (
                  <tr key={agr._id} className="hover:bg-slate-800/40 transition group">
                    {/* Agreement Number */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-indigo-300 text-xs">
                        {agr.agreementNumber}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {agr.paymentFrequency || 'MONTHLY'}
                      </div>
                    </td>

                    {/* Tenant */}
                    <td className="py-3.5 px-4">
                      <div
                        onClick={() => onSelectTenant && agr.tenantId?._id && onSelectTenant(agr.tenantId._id)}
                        className="font-medium text-white hover:text-emerald-400 transition cursor-pointer text-xs"
                      >
                        {agr.tenantId?.fullName || 'Tenant'}
                      </div>
                      {agr.tenantId?.companyName && (
                        <div className="text-[11px] text-slate-400">{agr.tenantId.companyName}</div>
                      )}
                      <div className="text-[11px] text-slate-500">{agr.tenantId?.phone}</div>
                    </td>

                    {/* Property & Unit */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200 text-xs flex items-center gap-1">
                        <Building2 size={13} className="text-emerald-400 shrink-0" />
                        <span className="truncate">{agr.propertyId?.propertyName}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Unit: <span className="text-slate-200 font-medium">{agr.unitDetails?.unitName || 'Unit'}</span>
                      </div>
                      {agr.unitDetails?.floor && (
                        <div className="text-[11px] text-slate-500">{agr.unitDetails.floor}</div>
                      )}
                    </td>

                    {/* Dates */}
                    <td className="py-3.5 px-4 text-xs">
                      <div className="text-slate-300">
                        {formatDate(agr.startDate)} &rarr; {formatDate(agr.endDate)}
                      </div>
                      {agr.renewalDate && (
                        <div className="text-[11px] text-amber-400 mt-0.5">
                          Renew: {formatDate(agr.renewalDate)}
                        </div>
                      )}
                    </td>

                    {/* Monthly Rent */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-emerald-400 font-mono text-sm">
                        {formatPKR(agr.monthlyRent)}
                      </div>
                      {agr.previousRent > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Prev: {formatPKR(agr.previousRent)}
                        </div>
                      )}
                    </td>

                    {/* Due Day */}
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-300">
                      Day {agr.dueDay}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          agr.status === 'ACTIVE'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : agr.status === 'EXPIRED'
                            ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                            : agr.status === 'TERMINATED'
                            ? 'bg-red-950/80 text-red-300 border border-red-800/60'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {agr.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      {userIsAdmin && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(agr)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-emerald-400 hover:bg-slate-700 transition"
                            title="Edit Agreement Terms"
                          >
                            <Edit2 size={14} />
                          </button>

                          {agr.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleToggleStatus(agr, 'TERMINATED')}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700 transition"
                              title="Terminate Agreement (Soft Deactivation)"
                            >
                              <XCircle size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleStatus(agr, 'ACTIVE')}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition"
                              title="Re-activate Agreement"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New / Edit Agreement Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingAgreement ? 'Edit Rental Agreement' : 'Create Rental Agreement'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select Property, then Unit, then Tenant to bind leasable occupancy.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formErrors.general && (
                <div className="bg-red-950/60 border border-red-800 text-red-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{formErrors.general}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Agreement Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Agreement Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.agreementNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, agreementNumber: e.target.value.toUpperCase() })
                    }
                    placeholder="AGR-2026-0001"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.agreementNumber && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.agreementNumber}</p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="EXPIRED">EXPIRED</option>
                    <option value="TERMINATED">TERMINATED</option>
                  </select>
                </div>

                {/* Step 1: Select Property */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    1. Select Property / Plaza *
                  </label>
                  <select
                    required
                    disabled={Boolean(editingAgreement)}
                    value={formData.propertyId}
                    onChange={(e) => handlePropertyChangeInModal(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value="">-- Choose Property --</option>
                    {propertiesList.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.propertyName} ({p.city})
                      </option>
                    ))}
                  </select>
                  {formErrors.propertyId && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.propertyId}</p>
                  )}
                </div>

                {/* Step 2: Select Unit */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    2. Select Leasable Unit * {loadingUnits && '(Loading...)'}
                  </label>
                  <select
                    required
                    disabled={Boolean(editingAgreement) || !formData.propertyId || loadingUnits}
                    value={formData.unitId}
                    onChange={(e) => {
                      const selectedU = propertyUnits.find((u) => u._id === e.target.value);
                      setFormData({
                        ...formData,
                        unitId: e.target.value,
                        monthlyRent: selectedU?.agreedRent || formData.monthlyRent,
                        dueDay: selectedU?.dueDay || formData.dueDay,
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value="">
                      {!formData.propertyId ? '-- Select Property First --' : '-- Choose Unit --'}
                    </option>
                    {propertyUnits.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.unitName} ({u.unitType}, {u.floor}) — Status: {u.status}
                      </option>
                    ))}
                  </select>
                  {formErrors.unitId && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.unitId}</p>
                  )}
                </div>

                {/* Step 3: Select Tenant */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    3. Select Tenant *
                  </label>
                  <select
                    required
                    disabled={Boolean(editingAgreement)}
                    value={formData.tenantId}
                    onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    <option value="">-- Choose Tenant --</option>
                    {tenantsList.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.fullName} {t.companyName ? `(${t.companyName})` : ''} — {t.phone}
                      </option>
                    ))}
                  </select>
                  {formErrors.tenantId && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.tenantId}</p>
                  )}
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.startDate && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.startDate}</p>
                  )}
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.endDate && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.endDate}</p>
                  )}
                </div>

                {/* Monthly Rent (PKR) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Monthly Rent (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={formData.monthlyRent}
                    onChange={(e) => setFormData({ ...formData, monthlyRent: e.target.value })}
                    placeholder="e.g. 75000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.monthlyRent && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.monthlyRent}</p>
                  )}
                </div>

                {/* Due Day of Month */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Due Day of Month (1-31) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="31"
                    value={formData.dueDay}
                    onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.dueDay && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.dueDay}</p>
                  )}
                </div>

                {/* Security Deposit */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Security Deposit (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.securityDeposit}
                    onChange={(e) => setFormData({ ...formData, securityDeposit: e.target.value })}
                    placeholder="e.g. 150000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Scheduled Renewal Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Scheduled Renewal Date
                  </label>
                  <input
                    type="date"
                    value={formData.renewalDate}
                    onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Agreement Terms & Special Notes
                  </label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Specific lease stipulations or remarks..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-2"
                >
                  {formSubmitting && <RefreshCw size={14} className="animate-spin" />}
                  <span>{editingAgreement ? 'Update Agreement' : 'Activate Agreement'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgreementsPage;
