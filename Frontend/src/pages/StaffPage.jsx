import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Clock,
  Calendar,
  DollarSign,
  FileSpreadsheet,
  Building2,
  FileText,
} from 'lucide-react';
import { staffAPI } from '../services/api.js';
import StaffDashboardSubTab from './StaffDashboardSubTab.jsx';
import StaffDirectorySubTab from './StaffDirectorySubTab.jsx';
import AttendanceSubTab from './AttendanceSubTab.jsx';
import StaffLeavesSubTab from './StaffLeavesSubTab.jsx';
import StaffLoansSubTab from './StaffLoansSubTab.jsx';
import StaffPayrollSubTab from './StaffPayrollSubTab.jsx';
import StaffLocationsSubTab from './StaffLocationsSubTab.jsx';
import StaffReportsSubTab from './StaffReportsSubTab.jsx';
import { isAdmin } from '../utils/permissions.js';

export function StaffPage({ currentUser }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | employees | attendance | leaves | loans | payroll | locations | reports
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const userIsAdmin = isAdmin(currentUser);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await staffAPI.getEmployees();
      if (res?.success && res.data) {
        setEmployees(res.data.employees || []);
        setSummary(res.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load staff employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-purple-400 bg-purple-950 px-2.5 py-0.5 rounded-md border border-purple-800/60">
                Standalone HR Module
              </span>
              <span className="text-xs text-slate-400 font-semibold">
                Pixx Technologies HR, Daily Attendance & Payroll System
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <Users className="text-purple-400" size={28} />
              Staff HR & Payroll Management
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Manage employee profiles, workplace departments, daily shift arrival times, loan advances,
              automated salary sheet exports (Excel), and printable PDF payslips.
            </p>
          </div>
        </div>

        {/* Sub-Tab Navigation Bar */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-slate-800/80">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'dashboard'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard size={15} /> Dashboard
          </button>

          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'employees'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users size={15} /> Staff Directory ({employees.length})
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'attendance'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Clock size={15} /> Attendance
          </button>

          <button
            onClick={() => setActiveTab('leaves')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'leaves'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Calendar size={15} /> Leaves
          </button>

          <button
            onClick={() => setActiveTab('loans')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'loans'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <DollarSign size={15} /> Advance Loans
          </button>

          <button
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'payroll'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet size={15} /> Payroll & Slips
          </button>

          <button
            onClick={() => setActiveTab('locations')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'locations'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 size={15} /> Workplaces
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'reports'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText size={15} /> Reports & Audit
          </button>
        </div>
      </div>

      {/* Render Active Sub-Tab View */}
      {activeTab === 'dashboard' && (
        <StaffDashboardSubTab
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab === 'employees' && (
        <StaffDirectorySubTab
          employees={employees}
          summary={summary}
          onRefresh={fetchEmployees}
          userIsAdmin={userIsAdmin}
        />
      )}

      {activeTab === 'attendance' && (
        <AttendanceSubTab />
      )}

      {activeTab === 'leaves' && (
        <StaffLeavesSubTab />
      )}

      {activeTab === 'loans' && (
        <StaffLoansSubTab
          employees={employees}
          onRefresh={fetchEmployees}
        />
      )}

      {activeTab === 'payroll' && (
        <StaffPayrollSubTab onRefreshEmployees={fetchEmployees} />
      )}

      {activeTab === 'locations' && (
        <StaffLocationsSubTab />
      )}

      {activeTab === 'reports' && (
        <StaffReportsSubTab />
      )}
    </div>
  );
}

export default StaffPage;
