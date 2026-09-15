import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  Building,
  Phone,
  Mail,
  FileText,
  AlertCircle,
  RefreshCw,
  ArrowUpDown,
  Building2,
} from 'lucide-react';
import { tenantsAPI } from '../services/api.js';
import { formatPKR, formatDate } from '../utils/formatters.js';
import { isAdmin } from '../utils/permissions.js';

export function TenantsPage({ currentUser, onSelectTenant, onNavigateToAgreements }) {
  const userIsAdmin = isAdmin(currentUser);

  const [tenants, setTenants] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    alternatePhone: '',
    email: '',
    identificationNumber: '',
    companyName: '',
    address: '',
    city: 'Lahore',
    notes: '',
    status: 'ACTIVE',
  });

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;

      const res = await tenantsAPI.getTenants(params);
      if (res?.success) {
        setTenants(res.data.tenants || []);
        setSummary(res.data.summary || null);
      } else {
        setError(res?.message || 'Failed to load tenants.');
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setError(err.response?.data?.message || err.message || 'Error loading tenants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadTenants();
  };

  const handleOpenCreateModal = () => {
    setEditingTenant(null);
    setFormData({
      fullName: '',
      phone: '',
      alternatePhone: '',
      email: '',
      identificationNumber: '',
      companyName: '',
      address: '',
      city: 'Lahore',
      notes: '',
      status: 'ACTIVE',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleOpenEditModal = (tenant) => {
    setEditingTenant(tenant);
    setFormData({
      fullName: tenant.fullName || '',
      phone: tenant.phone || '',
      alternatePhone: tenant.alternatePhone || '',
      email: tenant.email || '',
      identificationNumber: tenant.identificationNumber || '',
      companyName: tenant.companyName || '',
      address: tenant.address || '',
      city: tenant.city || 'Lahore',
      notes: tenant.notes || '',
      status: tenant.status || 'ACTIVE',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormErrors({});

    try {
      if (editingTenant) {
        await tenantsAPI.updateTenant(editingTenant._id, formData);
      } else {
        await tenantsAPI.createTenant(formData);
      }
      setModalOpen(false);
      loadTenants();
    } catch (err) {
      console.error('Save tenant error:', err);
      if (err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setFormErrors({ general: err.response?.data?.message || err.message });
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleStatus = async (tenant) => {
    const action = tenant.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} tenant "${tenant.fullName}"?`)) {
      return;
    }

    try {
      await tenantsAPI.toggleTenantStatus(tenant._id);
      loadTenants();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to change tenant status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-wide">Tenants Directory</h1>
            <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              Tenancy Foundation
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Manage individual and corporate leasable tenants, contact profiles, and lease relationships.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userIsAdmin && (
            <button
              onClick={handleOpenCreateModal}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <Plus size={16} />
              <span>Add Tenant</span>
            </button>
          )}
          <button
            onClick={loadTenants}
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
              <span className="text-xs text-slate-400 font-medium">Total Registered</span>
              <Users size={16} className="text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-1">{summary.totalTenants}</div>
            <div className="text-xs text-slate-500 mt-1">All tenants in portfolio</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Active Tenancies</span>
              <Building size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {summary.tenantsWithActiveLease}
            </div>
            <div className="text-xs text-slate-500 mt-1">Currently occupying leasable units</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Active Profiles</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-1">{summary.activeTenants}</div>
            <div className="text-xs text-slate-500 mt-1">Eligible for rental contracts</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Inactive Profiles</span>
              <XCircle size={16} className="text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-400 mt-1">{summary.inactiveTenants}</div>
            <div className="text-xs text-slate-500 mt-1">Preserved for audit history</div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Search by tenant name, phone, CNIC/NTN, company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Profiles</option>
              <option value="INACTIVE">Inactive Profiles</option>
            </select>

            <button
              type="submit"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="text-red-400 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Tenants Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-500" />
            <p className="text-sm">Loading tenants from database...</p>
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users size={36} className="mx-auto mb-2 text-slate-600" />
            <p className="text-base font-semibold text-slate-300">No Tenants Found</p>
            <p className="text-sm text-slate-500 mt-1">
              {search || statusFilter
                ? 'Try adjusting your search filters.'
                : 'Get started by creating your first leasable tenant profile.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-4">Tenant Name</th>
                  <th className="py-3.5 px-4">Contact Details</th>
                  <th className="py-3.5 px-4">Current Leased Unit</th>
                  <th className="py-3.5 px-4 text-right">Agreed Rent</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tenants.map((tenant) => {
                  const tenancy = tenant.currentTenancy;
                  return (
                    <tr
                      key={tenant._id}
                      className="hover:bg-slate-800/40 transition group cursor-pointer"
                      onClick={() => onSelectTenant && onSelectTenant(tenant._id)}
                    >
                      {/* Name & Company */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white group-hover:text-emerald-400 transition">
                          {tenant.fullName}
                        </div>
                        {tenant.companyName && (
                          <div className="text-xs text-slate-400">{tenant.companyName}</div>
                        )}
                        {tenant.identificationNumber && (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            CNIC/NTN: {tenant.identificationNumber}
                          </div>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-200 text-xs">
                          <Phone size={13} className="text-slate-500" />
                          <span>{tenant.phone}</span>
                        </div>
                        {tenant.email && (
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-0.5">
                            <Mail size={13} className="text-slate-500" />
                            <span>{tenant.email}</span>
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-0.5">{tenant.city}</div>
                      </td>

                      {/* Current Tenancy */}
                      <td className="py-3.5 px-4">
                        {tenancy ? (
                          <div>
                            <div className="font-medium text-slate-200 flex items-center gap-1.5 text-xs">
                              <Building2 size={13} className="text-emerald-400" />
                              <span>{tenancy.propertyName}</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Unit: <span className="text-slate-200 font-medium">{tenancy.unitName}</span>
                            </div>
                            <div className="text-[11px] text-indigo-400 font-mono mt-0.5">
                              {tenancy.agreementNumber} (Due: Day {tenancy.dueDay})
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">No Active Lease</span>
                        )}
                      </td>

                      {/* Monthly Rent */}
                      <td className="py-3.5 px-4 text-right">
                        {tenancy ? (
                          <div>
                            <span className="font-bold text-emerald-400 font-mono">
                              {formatPKR(tenancy.monthlyRent)}
                            </span>
                            <div className="text-[10px] text-slate-500">per month</div>
                          </div>
                        ) : (
                          <span className="text-slate-600 font-mono">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            tenant.status === 'ACTIVE'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {tenant.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectTenant && onSelectTenant(tenant._id)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                            title="View Tenant Profile & History"
                          >
                            <Eye size={15} />
                          </button>

                          {userIsAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(tenant)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-emerald-400 hover:bg-slate-700 transition"
                                title="Edit Tenant Details"
                              >
                                <Edit2 size={15} />
                              </button>

                              <button
                                onClick={() => handleToggleStatus(tenant)}
                                className={`p-1.5 rounded-lg transition ${
                                  tenant.isActive
                                    ? 'bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-700'
                                    : 'bg-slate-800 text-slate-400 hover:text-emerald-400 hover:bg-slate-700'
                                }`}
                                title={tenant.isActive ? 'Deactivate Tenant' : 'Activate Tenant'}
                              >
                                {tenant.isActive ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Tenant Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingTenant ? 'Edit Tenant Profile' : 'Add New Tenant'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tenant profile will be leasable across all properties and units.
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
                {/* Full Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. Allied Bank Limited or Muhammad Ali"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.fullName && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.fullName}</p>
                  )}
                </div>

                {/* Company Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Company / Organization (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="e.g. Allied Bank Ltd"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* CNIC / NTN */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    CNIC / NTN / Registration No
                  </label>
                  <input
                    type="text"
                    value={formData.identificationNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, identificationNumber: e.target.value })
                    }
                    placeholder="e.g. 35201-1234567-1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.identificationNumber && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.identificationNumber}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. 0300-1234567"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.phone && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.phone}</p>
                  )}
                </div>

                {/* Alternate Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Alternate Phone
                  </label>
                  <input
                    type="text"
                    value={formData.alternatePhone}
                    onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                    placeholder="e.g. 042-35123456"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="tenant@domain.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.email && (
                    <p className="text-red-400 text-xs mt-1">{formErrors.email}</p>
                  )}
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Lahore"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
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
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>

                {/* Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Official address / correspondence"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Special instructions or tenant remarks..."
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
                  <span>{editingTenant ? 'Update Tenant' : 'Save Tenant'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TenantsPage;
