import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Power,
  ChevronRight,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  MapPin,
} from 'lucide-react';
import { propertiesAPI } from '../services/api.js';
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LIST,
  PROPERTY_STATUS_LIST,
  PROPERTY_TYPE_CONFIG,
} from '../constants/propertyTypes.js';
import { isAdmin } from '../utils/permissions.js';

export function PropertiesPage({ currentUser, onSelectProperty }) {
  const [properties, setProperties] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Add / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formData, setFormData] = useState({
    propertyName: '',
    propertyCode: '',
    propertyType: 'PLAZA',
    city: 'Lahore',
    area: '',
    address: '',
    description: '',
    status: 'ACTIVE',
  });

  const userIsAdmin = isAdmin(currentUser);

  const fetchProperties = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (typeFilter) params.propertyType = typeFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await propertiesAPI.getProperties(params);
      if (res?.success) {
        setProperties(res.data?.properties || []);
        setSummary(res.data?.summary || null);
      } else {
        setError(res?.message || 'Failed to load properties.');
      }
    } catch (err) {
      console.error('Fetch properties error:', err);
      setError(err.response?.data?.message || 'Could not fetch properties list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [typeFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchProperties();
  };

  const handleOpenAddModal = () => {
    setEditingProperty(null);
    setFormData({
      propertyName: '',
      propertyCode: '',
      propertyType: 'PLAZA',
      city: 'Lahore',
      area: '',
      address: '',
      description: '',
      status: 'ACTIVE',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleOpenEditModal = (prop) => {
    setEditingProperty(prop);
    setFormData({
      propertyName: prop.propertyName || prop.plazaName || '',
      propertyCode: prop.propertyCode || '',
      propertyType: prop.propertyType || 'PLAZA',
      city: prop.city || 'Lahore',
      area: prop.area || '',
      address: prop.address || '',
      description: prop.description || '',
      status: prop.status || 'ACTIVE',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleToggleStatus = async (prop) => {
    const action = prop.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} '${prop.propertyName}'? Units and historical ledgers will remain preserved.`)) {
      return;
    }

    try {
      const res = await propertiesAPI.togglePropertyStatus(prop._id);
      if (res?.success) {
        setNotification(res.message);
        fetchProperties();
        setTimeout(() => setNotification(''), 4000);
      }
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} property.`);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.propertyName.trim()) {
      errors.propertyName = 'Property name is required.';
    } else if (formData.propertyName.trim().length < 2) {
      errors.propertyName = 'Property name must be at least 2 characters.';
    }
    if (!PROPERTY_TYPE_LIST.includes(formData.propertyType)) {
      errors.propertyType = 'Invalid property type selected.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProperty = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setFormErrors({});
    try {
      let res;
      if (editingProperty) {
        res = await propertiesAPI.updateProperty(editingProperty._id, formData);
      } else {
        res = await propertiesAPI.createProperty(formData);
      }

      if (res?.success) {
        setNotification(res.message);
        setModalOpen(false);
        fetchProperties();
        setTimeout(() => setNotification(''), 4000);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || 'Failed to save property.';
      if (err.response?.data?.errors) {
        setFormErrors(err.response.data.errors);
      } else {
        setFormErrors({ general: serverMsg });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
              Property Portfolio
            </span>
            <span className="text-xs text-slate-400">Portfolio & Units Management</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 size={22} className="text-emerald-400" />
            Properties & Plazas Directory
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage all commercial plazas, office buildings, and residential properties with real-time unit occupancy tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchProperties}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh properties list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {userIsAdmin && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
            >
              <Plus size={16} />
              Add Property
            </button>
          )}
        </div>
      </div>

      {/* Live Portfolio Occupancy KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Properties</div>
            <div className="text-xl font-black text-white mt-1">{summary.totalProperties}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{summary.activeProperties} Active in Portfolio</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Units</div>
            <div className="text-xl font-black text-white mt-1">{summary.totalUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Leasable spaces</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Occupied</div>
            <div className="text-xl font-black text-emerald-400 mt-1">{summary.occupiedUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Generating rent</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Vacant</div>
            <div className="text-xl font-black text-amber-400 mt-1">{summary.vacantUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Available to let</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Maintenance</div>
            <div className="text-xl font-black text-rose-400 mt-1">{summary.maintenanceUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Renovation / repair</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">Occupancy Rate</div>
            <div className="text-xl font-black text-sky-400 mt-1">{summary.occupancyRate}%</div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-sky-400 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, summary.occupancyRate)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {notification && (
        <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/80 border border-rose-600/60 text-rose-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by property name, code, address, city, or area..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Property Types</option>
            {PROPERTY_TYPE_LIST.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_CONFIG[t]?.label || t}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            {PROPERTY_STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {(searchTerm || typeFilter || statusFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setTypeFilter('');
                setStatusFilter('');
                fetchProperties();
              }}
              className="px-2.5 py-2 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Properties Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Property / Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-center">Total Units</th>
                <th className="px-4 py-3">Occupancy Breakdown</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && properties.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-400">
                    Loading properties directory...
                  </td>
                </tr>
              ) : properties.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-400">
                    No properties match your filter criteria.
                  </td>
                </tr>
              ) : (
                properties.map((prop) => {
                  const typeConf = PROPERTY_TYPE_CONFIG[prop.propertyType] || PROPERTY_TYPE_CONFIG[PROPERTY_TYPES.PLAZA];
                  const total = prop.totalUnits || (prop.units ? prop.units.length : 0);
                  const occupied = prop.occupiedUnits || 0;
                  const vacant = prop.vacantUnits || 0;
                  const maintenance = prop.maintenanceUnits || 0;
                  const rate = prop.occupancyRate || 0;

                  return (
                    <tr key={prop._id} className="hover:bg-slate-800/40 transition">
                      {/* Property Name & Code */}
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => onSelectProperty(prop._id)}
                          className="font-bold text-white hover:text-emerald-400 transition text-left flex items-center gap-1.5"
                        >
                          {prop.propertyName || prop.plazaName}
                          <ChevronRight size={13} className="text-slate-500" />
                        </button>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {prop.propertyCode || 'PX-PROP'}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${typeConf.color}`}>
                          {typeConf.label}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3.5">
                        <div className="text-slate-300 font-medium flex items-center gap-1">
                          <MapPin size={12} className="text-slate-500" />
                          {prop.city || 'Lahore'}
                          {prop.area ? `, ${prop.area}` : ''}
                        </div>
                        {prop.address && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">{prop.address}</div>
                        )}
                      </td>

                      {/* Total Units */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-bold font-mono text-white text-sm bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                          {total}
                        </span>
                      </td>

                      {/* Occupancy Breakdown */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <span className="text-emerald-400 font-semibold" title="Occupied">
                            {occupied} Occ
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className="text-amber-400 font-semibold" title="Vacant">
                            {vacant} Vac
                          </span>
                          {maintenance > 0 && (
                            <>
                              <span className="text-slate-600">•</span>
                              <span className="text-rose-400 font-semibold" title="Maintenance">
                                {maintenance} Maint
                              </span>
                            </>
                          )}
                          <span className="text-slate-400 text-[10px]">({rate}%)</span>
                        </div>
                        <div className="w-28 bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1 rounded-full"
                            style={{ width: `${Math.min(100, rate)}%` }}
                          />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 w-fit ${
                            prop.isActive !== false && prop.status === 'ACTIVE'
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                              : 'bg-rose-950/60 text-rose-300 border-rose-700/50'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              prop.isActive !== false && prop.status === 'ACTIVE'
                                ? 'bg-emerald-400'
                                : 'bg-rose-400'
                            }`}
                          />
                          {prop.isActive !== false && prop.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectProperty(prop._id)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 transition flex items-center gap-1"
                            title="Manage individual units & occupancy"
                          >
                            <Layers size={12} />
                            Units ({total})
                          </button>

                          {userIsAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(prop)}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                                title="Edit property metadata"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleToggleStatus(prop)}
                                className={`p-1 rounded transition ${
                                  prop.isActive !== false
                                    ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
                                    : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/40'
                                }`}
                                title={prop.isActive !== false ? 'Deactivate property' : 'Activate property'}
                              >
                                <Power size={14} />
                              </button>
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

      {/* Add / Edit Property Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Building2 size={18} className="text-emerald-400" />
                {editingProperty ? `Edit Property: ${editingProperty.propertyName}` : 'Create New Property / Plaza'}
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {formErrors.general && (
              <div className="p-3 bg-rose-950/80 border border-rose-700/60 rounded text-rose-300 text-xs">
                {formErrors.general}
              </div>
            )}

            <form onSubmit={handleSaveProperty} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Property Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.propertyName}
                  onChange={(e) => setFormData({ ...formData, propertyName: e.target.value })}
                  placeholder="e.g. 289-Q Plaza DHA or Gulberg Commercial Complex"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
                {formErrors.propertyName && (
                  <p className="text-rose-400 text-[11px] mt-1">{formErrors.propertyName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Property Code (Optional)</label>
                  <input
                    type="text"
                    value={formData.propertyCode}
                    onChange={(e) => setFormData({ ...formData, propertyCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. PX-DHA-289"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  {formErrors.propertyCode && (
                    <p className="text-rose-400 text-[11px] mt-1">{formErrors.propertyCode}</p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Property Type</label>
                  <select
                    value={formData.propertyType}
                    onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    {PROPERTY_TYPE_LIST.map((t) => (
                      <option key={t} value={t}>
                        {PROPERTY_TYPE_CONFIG[t]?.label || t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Lahore"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Area / Locality</label>
                  <input
                    type="text"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    placeholder="e.g. DHA Phase 5, Bahria Town"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Street Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Plot 289, Commercial Zone Sector Q..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description & Notes</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Additional notes about structure, floors, amenities..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
                >
                  {saving ? 'Saving...' : editingProperty ? 'Update Property' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PropertiesPage;
