import React, { useState, useEffect } from 'react';
import {
  Building2,
  Briefcase,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Tag,
} from 'lucide-react';
import { staffAPI } from '../services/api.js';

export function StaffLocationsSubTab() {
  const [locations, setLocations] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showDesignationModal, setShowDesignationModal] = useState(false);

  // Location Form
  const [locName, setLocName] = useState('');
  const [locOpeningTime, setLocOpeningTime] = useState('12:30');
  const [locGracePeriod, setLocGracePeriod] = useState('15');
  const [locDesc, setLocDesc] = useState('');

  // Designation Form
  const [desigName, setDesigName] = useState('');
  const [desigDept, setDesigDept] = useState('IT Office');
  const [desigDesc, setDesigDesc] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [locRes, desigRes] = await Promise.all([
        staffAPI.getLocations(),
        staffAPI.getDesignations(),
      ]);

      if (locRes?.success && locRes.data) {
        setLocations(locRes.data);
      }
      if (desigRes?.success && desigRes.data) {
        setDesignations(desigRes.data);
      }
    } catch (err) {
      console.error('Failed to load locations/designations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    if (!locName.trim()) return;

    try {
      setSubmitting(true);
      const res = await staffAPI.createLocation({
        name: locName.trim(),
        openingTime: locOpeningTime,
        gracePeriodMinutes: Number(locGracePeriod) || 15,
        description: locDesc.trim(),
      });

      if (res?.success) {
        alert(`Workplace location '${locName}' created.`);
        setLocName('');
        setLocDesc('');
        setShowLocationModal(false);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create workplace location.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDesignation = async (e) => {
    e.preventDefault();
    if (!desigName.trim()) return;

    try {
      setSubmitting(true);
      const res = await staffAPI.createDesignation({
        name: desigName.trim(),
        department: desigDept,
        description: desigDesc.trim(),
      });

      if (res?.success) {
        alert(`Job Designation '${desigName}' created.`);
        setDesigName('');
        setDesigDesc('');
        setShowDesignationModal(false);
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create job designation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION 1: STAFF WORKPLACE LOCATIONS */}
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-950 px-2.5 py-0.5 rounded-md border border-amber-800/60">
                Staff Workplace Categories
              </span>
              <span className="text-xs text-slate-400 font-semibold">
                Separate from Property Finance
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <Building2 className="text-amber-400" size={24} /> Staff Locations & Shift Start Times
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Manage workplace locations (e.g. Bahria Town Office, IT Office, 4-A Home, Security / Guard, Admin Rider) with custom shift opening hours.
            </p>
          </div>

          <button
            onClick={() => setShowLocationModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-md self-start md:self-auto"
          >
            <Plus size={16} /> Add Workplace Location
          </button>
        </div>

        {/* Locations Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => (
            <div key={loc._id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-white text-base">
                  <MapPin className="text-amber-400" size={18} /> {loc.name}
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Active
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800/80 font-mono">
                <Clock size={16} className="text-blue-400 shrink-0" />
                <span>
                  Shift Opening: <strong className="text-white">{loc.openingTime || '12:30 PM'}</strong> ({loc.gracePeriodMinutes || 15}m Grace)
                </span>
              </div>

              {loc.description && (
                <p className="text-xs text-slate-400 font-medium line-clamp-2">{loc.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: JOB DESIGNATIONS */}
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-purple-400 bg-purple-950 px-2.5 py-0.5 rounded-md border border-purple-800/60">
                Job Title Hierarchy
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <Briefcase className="text-purple-400" size={24} /> Employee Designations
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Add and organize dynamic job designations across all departments (Manager Accounts, Accountant, Software Developer, Office Boy, Guard, Maid, Chowkidar, etc.)
            </p>
          </div>

          <button
            onClick={() => setShowDesignationModal(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-md self-start md:self-auto"
          >
            <Plus size={16} /> Add Designation
          </button>
        </div>

        {/* Designations Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {designations.map((d) => (
            <div key={d._id} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex items-center gap-2.5">
              <div className="p-2 bg-purple-950/80 border border-purple-800/50 rounded-lg text-purple-400 shrink-0">
                <Tag size={16} />
              </div>
              <div className="truncate">
                <span className="block text-xs font-bold text-white truncate">{d.name}</span>
                <span className="block text-[10px] text-slate-400 font-semibold truncate">{d.department || 'IT Office'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CREATE LOCATION MODAL */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Building2 className="text-amber-400" size={20} /> Add Staff Workplace Location
            </h3>
            <form onSubmit={handleCreateLocation} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Workplace Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Bahria Town Office, IT Office, Security Guard"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-semibold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Opening Time</label>
                  <input
                    type="text"
                    placeholder="12:30"
                    value={locOpeningTime}
                    onChange={(e) => setLocOpeningTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Grace Period (Mins)</label>
                  <input
                    type="number"
                    placeholder="15"
                    value={locGracePeriod}
                    onChange={(e) => setLocGracePeriod(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Description / Address</label>
                <textarea
                  placeholder="Optional location notes..."
                  value={locDesc}
                  onChange={(e) => setLocDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition"
                >
                  {submitting ? 'Saving...' : 'Create Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE DESIGNATION MODAL */}
      {showDesignationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Briefcase className="text-purple-400" size={20} /> Add Job Designation
            </h3>
            <form onSubmit={handleCreateDesignation} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Designation Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Software Developer, Accountant, Guard, Office Boy"
                  value={desigName}
                  onChange={(e) => setDesigName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-semibold focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Department</label>
                <select
                  value={desigDept}
                  onChange={(e) => setDesigDept(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-semibold focus:outline-none focus:border-purple-500"
                >
                  <option value="IT Office">IT Office</option>
                  <option value="Bahria Town Office">Bahria Town Office</option>
                  <option value="4-A Home">4-A Home</option>
                  <option value="Security / Guard">Security / Guard</option>
                  <option value="Admin Rider">Admin Rider</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDesignationModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-500 transition"
                >
                  {submitting ? 'Saving...' : 'Create Designation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffLocationsSubTab;
