import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  DollarSign,
  FileSpreadsheet,
  PlusCircle,
  Building2,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { staffAPI } from '../services/api.js';

export function StaffDashboardSubTab({ onNavigateTab, onOpenAddEmployeeModal }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await staffAPI.getDashboardStats();
      if (res?.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatPKR = (val) => {
    return new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Number(val) || 0);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 font-semibold animate-pulse">
        Loading Staff HR Dashboard metrics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Row 1 - Employee Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Total Employees</span>
            <div className="p-2.5 bg-purple-950/80 border border-purple-800/50 rounded-xl text-purple-400">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-white tracking-tight">{stats?.totalEmployees || 0}</span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-800/50">
              {stats?.activeEmployees || 0} Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">Pixx Technologies workforce</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Present Today</span>
            <div className="p-2.5 bg-emerald-950/80 border border-emerald-800/50 rounded-xl text-emerald-400">
              <UserCheck size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-white tracking-tight">{stats?.presentToday || 0}</span>
            <span className="text-xs font-bold text-slate-400">On-Site / Shift</span>
          </div>
          <p className="text-xs text-emerald-400/80 mt-2 font-medium">Recorded for today</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">On Leave Today</span>
            <div className="p-2.5 bg-amber-950/80 border border-amber-800/50 rounded-xl text-amber-400">
              <Clock size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-white tracking-tight">{stats?.leaveToday || 0}</span>
            <span className="text-xs font-bold text-amber-400">Approved Leaves</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">Casual / Sick / Annual</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Absent Today</span>
            <div className="p-2.5 bg-rose-950/80 border border-rose-800/50 rounded-xl text-rose-400">
              <UserX size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-white tracking-tight">{stats?.absentToday || 0}</span>
            <span className="text-xs font-bold text-rose-400">LOP Impact</span>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">Loss of Pay auto-applies</p>
        </div>
      </div>

      {/* Metrics Row 2 - Financial & Loan Totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/60">
                Monthly Payroll Liability
              </span>
              <FileSpreadsheet className="text-emerald-400" size={22} />
            </div>
            <h3 className="text-2xl font-black text-white mt-4">
              Rs. {formatPKR(stats?.totalGrossMonthly || 0)}
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Combined Monthly Gross Salaries (Base Salary + Fuel + Food + Transport + Performance Allowances)
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Requires monthly finalization & payslip generation</span>
            <button
              onClick={() => onNavigateTab('payroll')}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition"
            >
              Go to Payroll <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-rose-400 bg-rose-950/80 px-2.5 py-1 rounded-md border border-rose-800/60">
                Outstanding Employee Loans
              </span>
              <DollarSign className="text-rose-400" size={22} />
            </div>
            <h3 className="text-2xl font-black text-white mt-4">
              Rs. {formatPKR(stats?.totalOutstandingLoans || 0)}
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Total active advance salary loans issued to staff across all workplace locations
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Deducted automatically during payroll processing</span>
            <button
              onClick={() => onNavigateTab('loans')}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 transition"
            >
              View Loan Ledger <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Action Hub */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-extrabold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="text-purple-400" size={20} /> Quick Action Controls
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => {
              onNavigateTab('employees');
              if (onOpenAddEmployeeModal) onOpenAddEmployeeModal();
            }}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-800/60 transition group text-center"
          >
            <PlusCircle className="text-purple-400 group-hover:scale-110 transition mb-2" size={24} />
            <span className="text-xs font-bold text-slate-200">Add Employee</span>
          </button>

          <button
            onClick={() => onNavigateTab('attendance')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 transition group text-center"
          >
            <Clock className="text-blue-400 group-hover:scale-110 transition mb-2" size={24} />
            <span className="text-xs font-bold text-slate-200">Mark Attendance</span>
          </button>

          <button
            onClick={() => onNavigateTab('payroll')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/60 transition group text-center"
          >
            <FileSpreadsheet className="text-emerald-400 group-hover:scale-110 transition mb-2" size={24} />
            <span className="text-xs font-bold text-slate-200">Process Payroll</span>
          </button>

          <button
            onClick={() => onNavigateTab('loans')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-800/60 transition group text-center"
          >
            <DollarSign className="text-rose-400 group-hover:scale-110 transition mb-2" size={24} />
            <span className="text-xs font-bold text-slate-200">Manage Loans</span>
          </button>

          <button
            onClick={() => onNavigateTab('locations')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/60 transition group text-center"
          >
            <Building2 className="text-amber-400 group-hover:scale-110 transition mb-2" size={24} />
            <span className="text-xs font-bold text-slate-200">Workplaces</span>
          </button>

          <button
            onClick={() => onNavigateTab('reports')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/60 transition group text-center"
          >
            <ShieldAlert className="text-indigo-400 group-hover:scale-110 transition mb-2" size={24} />
            <span className="text-xs font-bold text-slate-200">Staff Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default StaffDashboardSubTab;
