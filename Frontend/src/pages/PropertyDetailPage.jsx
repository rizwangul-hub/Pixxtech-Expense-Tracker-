import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Building2,
  Layers,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Power,
  CheckCircle2,
  X,
  MapPin,
  Check,
} from 'lucide-react';
import { propertiesAPI, unitsAPI } from '../services/api.js';
import {
  UNIT_TYPES,
  UNIT_TYPE_LIST,
  UNIT_STATUSES,
  UNIT_STATUS_LIST,
  AREA_UNIT_LIST,
  PROPERTY_TYPE_CONFIG,
  UNIT_STATUS_CONFIG,
  UNIT_TYPE_CONFIG,
} from '../constants/propertyTypes.js';
import { isAdmin } from '../utils/permissions.js';

export function PropertyDetailPage({ propertyId, currentUser, onBack }) {
  const [property, setProperty] = useState(null);
  const [unitSummary, setUnitSummary] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  // Unit Search & Filters
  const [unitSearch, setUnitSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');

  // Add / Edit Unit Modal State
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [unitFormErrors, setUnitFormErrors] = useState({});
  const [unitFormData, setUnitFormData] = useState({
    unitName: '',
    unitNumber: '',
    unitType: 'SHOP',
    floor: 'Ground Floor',
    area: '',
    areaUnit: 'SQ_FT',
    status: 'VACANT',
    description: '',
    notes: '',
    tenantName: '',
  });

  // Quick Status Change State
  const [statusModalUnit, setStatusModalUnit] = useState(null);
  const [statusChanging, setStatusChanging] = useState(false);

  const userIsAdmin = isAdmin(currentUser);

  const fetchPropertyAndUnits = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await propertiesAPI.getPropertyById(propertyId);
      if (res?.success) {
        setProperty(res.data?.property);
        setUnitSummary(res.data?.unitSummary);
        setUnits(res.data?.property?.units || []);
      } else {
        setError(res?.message || 'Failed to load property details.');
      }
    } catch (err) {
      console.error('Fetch property detail error:', err);
      setError(err.response?.data?.message || 'Could not fetch property.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (propertyId) {
      fetchPropertyAndUnits();
    }
  }, [propertyId]);

  // Open Add Unit Modal
  const handleOpenAddUnit = () => {
    setEditingUnit(null);
    setUnitFormData({
      unitName: '',
      unitNumber: '',
      unitType: 'SHOP',
      floor: 'Ground Floor',
      area: '',
      areaUnit: 'SQ_FT',
      status: 'VACANT',
      description: '',
      notes: '',
      tenantName: '',
    });
    setUnitFormErrors({});
    setUnitModalOpen(true);
  };

  // Open Edit Unit Modal
  const handleOpenEditUnit = (unit) => {
    setEditingUnit(unit);
    setUnitFormData({
      unitName: unit.unitName || '',
      unitNumber: unit.unitNumber || unit.unitName || '',
      unitType: unit.unitType || 'SHOP',
      floor: unit.floor || 'Ground Floor',
      area: unit.area || '',
      areaUnit: unit.areaUnit || 'SQ_FT',
      status: unit.status || 'VACANT',
      description: unit.description || '',
      notes: unit.notes || '',
      tenantName: unit.tenantName || '',
    });
    setUnitFormErrors({});
    setUnitModalOpen(true);
  };

  // Validate Unit Form
  const validateUnitForm = () => {
    const errors = {};
    if (!unitFormData.unitName.trim()) {
      errors.unitName = 'Unit name is required.';
    }
    if (!UNIT_TYPE_LIST.includes(unitFormData.unitType)) {
      errors.unitType = 'Invalid unit type.';
    }
    if (!UNIT_STATUS_LIST.includes(unitFormData.status)) {
      errors.status = 'Invalid unit status.';
    }
    setUnitFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Unit (Create or Update)
  const handleSaveUnit = async (e) => {
    e.preventDefault();
    if (!validateUnitForm()) return;

    setSavingUnit(true);
    setUnitFormErrors({});
    try {
      let res;
      if (editingUnit) {
        res = await unitsAPI.updateUnit(editingUnit._id, unitFormData);
      } else {
        res = await propertiesAPI.addUnit(propertyId, unitFormData);
      }

      if (res?.success) {
        setNotification(res.message);
        setUnitModalOpen(false);
        fetchPropertyAndUnits();
        setTimeout(() => setNotification(''), 4000);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || 'Failed to save unit.';
      if (err.response?.data?.errors) {
        setUnitFormErrors(err.response.data.errors);
      } else {
        setUnitFormErrors({ general: serverMsg });
      }
    } finally {
      setSavingUnit(false);
    }
  };

  // Quick Change Unit Status
  const handleQuickStatusChange = async (unitId, newStatus) => {
    setStatusChanging(true);
    try {
      const res = await unitsAPI.toggleUnitStatus(unitId, { status: newStatus });
      if (res?.success) {
        setNotification(res.message);
        setStatusModalUnit(null);
        fetchPropertyAndUnits();
        setTimeout(() => setNotification(''), 4000);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update unit status.');
    } finally {
      setStatusChanging(false);
    }
  };

  // Soft toggle Unit active status
  const handleToggleUnitActive = async (unit) => {
    const nextActive = unit.isActive === false;
    const action = nextActive ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} unit '${unit.unitName}'?`)) {
      return;
    }

    try {
      const res = await unitsAPI.toggleUnitStatus(unit._id, {
        isActive: nextActive,
        status: nextActive ? 'VACANT' : 'INACTIVE',
      });
      if (res?.success) {
        setNotification(res.message);
        fetchPropertyAndUnits();
        setTimeout(() => setNotification(''), 4000);
      }
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} unit.`);
    }
  };

  // Extract unique floor options from current units for filter dropdown
  const floorOptions = Array.from(new Set(units.map((u) => u.floor).filter(Boolean)));

  // Filter units
  const filteredUnits = units.filter((u) => {
    if (statusFilter && u.status !== statusFilter) return false;
    if (typeFilter && u.unitType !== typeFilter) return false;
    if (floorFilter && u.floor?.toLowerCase() !== floorFilter.toLowerCase()) return false;
    if (unitSearch.trim()) {
      const q = unitSearch.trim().toLowerCase();
      const matchName = u.unitName?.toLowerCase().includes(q);
      const matchNumber = u.unitNumber?.toLowerCase().includes(q);
      const matchTenant = u.tenantName?.toLowerCase().includes(q);
      if (!matchName && !matchNumber && !matchTenant) return false;
    }
    return true;
  });

  if (loading && !property) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
        Loading property and leasable units...
      </div>
    );
  }

  if (error && !property) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
        <div className="text-rose-400 text-sm font-semibold">{error}</div>
        <button
          onClick={onBack}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
        >
          &larr; Return to Properties Directory
        </button>
      </div>
    );
  }

  const typeConfig = PROPERTY_TYPE_CONFIG[property?.propertyType] || PROPERTY_TYPE_CONFIG[property?.propertyType || 'PLAZA'];

  return (
    <div className="space-y-6">
      {/* Back Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition"
        >
          <ArrowLeft size={14} />
          Back to Properties Directory
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchPropertyAndUnits}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh units"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Property Overview Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${typeConfig.color}`}>
                {typeConfig.label}
              </span>
              <span className="font-mono text-xs font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {property.propertyCode || 'PX-PROP'}
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1 ${
                  property.isActive !== false && property.status === 'ACTIVE'
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                    : 'bg-rose-950/60 text-rose-300 border-rose-700/50'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    property.isActive !== false && property.status === 'ACTIVE'
                      ? 'bg-emerald-400'
                      : 'bg-rose-400'
                  }`}
                />
                {property.isActive !== false && property.status === 'ACTIVE' ? 'Active Property' : 'Inactive'}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Building2 size={24} className="text-emerald-400" />
              {property.propertyName || property.plazaName}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1.5">
              <span className="flex items-center gap-1">
                <MapPin size={13} className="text-slate-500" />
                {property.city || 'Lahore'}{property.area ? `, ${property.area}` : ''}
              </span>
              {property.address && (
                <>
                  <span className="text-slate-600">•</span>
                  <span>{property.address}</span>
                </>
              )}
            </div>
            {property.description && (
              <p className="text-xs text-slate-400 mt-2 max-w-3xl">{property.description}</p>
            )}
          </div>

          {userIsAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleOpenAddUnit}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
              >
                <Plus size={15} />
                Add Leasable Unit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Derived Unit Summary Stat Cards */}
      {unitSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Units</div>
            <div className="text-2xl font-black text-white mt-1">{unitSummary.totalUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Commercial & Residential</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Occupied</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{unitSummary.occupiedUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Units currently let</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Vacant</div>
            <div className="text-2xl font-black text-amber-400 mt-1">{unitSummary.vacantUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Available for lease</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Maintenance</div>
            <div className="text-2xl font-black text-rose-400 mt-1">{unitSummary.maintenanceUnits}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Under renovation</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 col-span-2 sm:col-span-4 lg:col-span-1">
            <div className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">Occupancy Rate</div>
            <div className="text-2xl font-black text-sky-400 mt-1">{unitSummary.occupancyRate}%</div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-sky-400 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, unitSummary.occupancyRate)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Unit Search & Filters Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={unitSearch}
            onChange={(e) => setUnitSearch(e.target.value)}
            placeholder="Search unit by name, number, or tenant..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            {UNIT_STATUS_LIST.map((s) => (
              <option key={s} value={s}>
                {UNIT_STATUS_CONFIG[s]?.label || s}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Unit Types</option>
            {UNIT_TYPE_LIST.map((t) => (
              <option key={t} value={t}>
                {UNIT_TYPE_CONFIG[t]?.label || t}
              </option>
            ))}
          </select>

          {floorOptions.length > 0 && (
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Floors</option>
              {floorOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}

          {(unitSearch || statusFilter || typeFilter || floorFilter) && (
            <button
              onClick={() => {
                setUnitSearch('');
                setStatusFilter('');
                setTypeFilter('');
                setFloorFilter('');
              }}
              className="px-2.5 py-2 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Units Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Layers size={15} className="text-emerald-400" />
            Leasable Units Directory ({filteredUnits.length} of {units.length})
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-4 py-3">Unit / Space</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Floor</th>
                <th className="px-4 py-3">Area Size</th>
                <th className="px-4 py-3">Occupancy Status</th>
                <th className="px-4 py-3">Tenant Info</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-400">
                    No units found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredUnits.map((u) => {
                  const statusConf = UNIT_STATUS_CONFIG[u.status] || UNIT_STATUS_CONFIG[UNIT_STATUSES.VACANT];
                  const typeConf = UNIT_TYPE_CONFIG[u.unitType] || UNIT_TYPE_CONFIG[UNIT_TYPES.SHOP];

                  return (
                    <tr key={u._id} className="hover:bg-slate-800/40 transition">
                      {/* Unit Name & Number */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-white flex items-center gap-2">
                          {u.unitName}
                          {u.unitNumber && u.unitNumber !== u.unitName && (
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                              #{u.unitNumber}
                            </span>
                          )}
                        </div>
                        {u.description && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">{u.description}</div>
                        )}
                      </td>

                      {/* Unit Type */}
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${typeConf.color}`}>
                          {typeConf.label}
                        </span>
                      </td>

                      {/* Floor */}
                      <td className="px-4 py-3.5 text-slate-300 font-medium">
                        {u.floor || 'Ground'}
                      </td>

                      {/* Area */}
                      <td className="px-4 py-3.5 font-mono text-slate-300">
                        {u.area ? `${u.area.toLocaleString()} ${u.areaUnit || 'SQ_FT'}` : '—'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <button
                          disabled={!userIsAdmin}
                          onClick={() => setStatusModalUnit(u)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1.5 ${statusConf.badgeColor} ${
                            userIsAdmin ? 'hover:brightness-125 cursor-pointer' : ''
                          }`}
                          title={userIsAdmin ? 'Click to change status' : ''}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusConf.dotColor}`} />
                          <span>{statusConf.label}</span>
                        </button>
                      </td>

                      {/* Tenant */}
                      <td className="px-4 py-3.5">
                        {u.tenantName ? (
                          <div className="font-semibold text-slate-200">{u.tenantName}</div>
                        ) : (
                          <span className="text-slate-500 italic">No Active Tenant</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        {userIsAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditUnit(u)}
                              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                              title="Edit unit details"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleToggleUnitActive(u)}
                              className={`p-1 rounded transition ${
                                u.isActive !== false
                                  ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
                                  : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/40'
                              }`}
                              title={u.isActive !== false ? 'Deactivate unit' : 'Activate unit'}
                            >
                              <Power size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[11px]">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Status Change Popover/Modal */}
      {statusModalUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <div className="text-xs font-bold text-white">Change Unit Status</div>
                <div className="text-[11px] text-slate-400 truncate">{statusModalUnit.unitName}</div>
              </div>
              <button
                onClick={() => setStatusModalUnit(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {UNIT_STATUS_LIST.map((s) => {
                const conf = UNIT_STATUS_CONFIG[s];
                const isSelected = statusModalUnit.status === s;
                return (
                  <button
                    key={s}
                    disabled={statusChanging}
                    onClick={() => handleQuickStatusChange(statusModalUnit._id, s)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-slate-800 text-white border-emerald-500 shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${conf.dotColor}`} />
                      <span>{conf.label}</span>
                    </div>
                    {isSelected && <Check size={14} className="text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Unit Modal */}
      {unitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Layers size={18} className="text-emerald-400" />
                {editingUnit ? `Edit Unit: ${editingUnit.unitName}` : `Add Unit to ${property.propertyName}`}
              </div>
              <button
                onClick={() => setUnitModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            {unitFormErrors.general && (
              <div className="p-3 bg-rose-950/80 border border-rose-700/60 rounded text-rose-300 text-xs">
                {unitFormErrors.general}
              </div>
            )}

            <form onSubmit={handleSaveUnit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Unit Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={unitFormData.unitName}
                    onChange={(e) => setUnitFormData({ ...unitFormData, unitName: e.target.value })}
                    placeholder="e.g. Shop 1, Office 201, Basement"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                  {unitFormErrors.unitName && (
                    <p className="text-rose-400 text-[11px] mt-1">{unitFormErrors.unitName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Unit Number / Code</label>
                  <input
                    type="text"
                    value={unitFormData.unitNumber}
                    onChange={(e) => setUnitFormData({ ...unitFormData, unitNumber: e.target.value })}
                    placeholder="e.g. GF-01, B-01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Unit Type</label>
                  <select
                    value={unitFormData.unitType}
                    onChange={(e) => setUnitFormData({ ...unitFormData, unitType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    {UNIT_TYPE_LIST.map((t) => (
                      <option key={t} value={t}>
                        {UNIT_TYPE_CONFIG[t]?.label || t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Floor</label>
                  <input
                    type="text"
                    value={unitFormData.floor}
                    onChange={(e) => setUnitFormData({ ...unitFormData, floor: e.target.value })}
                    placeholder="e.g. Ground Floor, 1st Floor, Mezzanine"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Area Measurement</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={unitFormData.area}
                      onChange={(e) => setUnitFormData({ ...unitFormData, area: e.target.value })}
                      placeholder="e.g. 1200"
                      className="w-2/3 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <select
                      value={unitFormData.areaUnit}
                      onChange={(e) => setUnitFormData({ ...unitFormData, areaUnit: e.target.value })}
                      className="w-1/3 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                    >
                      {AREA_UNIT_LIST.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Occupancy Status</label>
                  <select
                    value={unitFormData.status}
                    onChange={(e) => setUnitFormData({ ...unitFormData, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    {UNIT_STATUS_LIST.map((s) => (
                      <option key={s} value={s}>
                        {UNIT_STATUS_CONFIG[s]?.label || s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tenant Name (Optional)</label>
                <input
                  type="text"
                  value={unitFormData.tenantName}
                  onChange={(e) => setUnitFormData({ ...unitFormData, tenantName: e.target.value })}
                  placeholder="e.g. Bank Al Falah or IT Solutions Corp"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description & Notes</label>
                <textarea
                  rows={2}
                  value={unitFormData.description}
                  onChange={(e) => setUnitFormData({ ...unitFormData, description: e.target.value })}
                  placeholder="Additional unit specifications, meter numbers, or key notes..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setUnitModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUnit}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
                >
                  {savingUnit ? 'Saving...' : editingUnit ? 'Update Unit' : 'Add Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PropertyDetailPage;
