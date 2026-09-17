import React, { useState, useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  Building2,
  Calendar,
  DollarSign,
  Users,
  Search,
  Download,
} from 'lucide-react';
import { staffAPI, attendanceAPI, payrollAPI } from '../services/api.js';

export function StaffReportsSubTab() {
  const [reportType, setReportType] = useState('audit'); // audit | attendance | location | salary
  const [auditLogs, setAuditLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [logRes, empRes] = await Promise.all([
        staffAPI.getAuditLogs(),
        staffAPI.getEmployees({ status: 'ACTIVE' }),
      ]);

      if (logRes?.success && logRes.data) {
        setAuditLogs(logRes.data);
      }
      if (empRes?.success && empRes.data) {
        setEmployees(empRes.data.employees || []);
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatPKR = (val) => {
    return new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Number(val) || 0);
  };

  // Compute Location-wise distribution
  const locationGroups = {};
  employees.forEach((emp) => {
    const loc = emp.department || 'IT Office';
    if (!locationGroups[loc]) locationGroups[loc] = [];
    locationGroups[loc].push(emp);
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-400 bg-indigo-950 px-2.5 py-0.5 rounded-md border border-indigo-800/60">
                Staff & Payroll Analytics
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <FileText className="text-indigo-400" size={24} /> Staff Reports & HR Audit Logs
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Inspect comprehensive location-wise workforce distributions, outstanding employee loan statements, and full system security audit logs.
            </p>
          </div>
        </div>

        {/* Report Sub-tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={() => setReportType('audit')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              reportType === 'audit'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck size={15} /> System Audit Log
          </button>
          <button
            onClick={() => setReportType('location')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              reportType === 'location'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 size={15} /> Location Distribution Report
          </button>
        </div>
      </div>

      {/* RENDER REPORT: SYSTEM AUDIT LOG */}
      {reportType === 'audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ShieldCheck className="text-indigo-400" size={16} /> Recent HR Audit Activity ({auditLogs.length})
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">Immutable audit history</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500 font-semibold animate-pulse">
              Loading audit logs...
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-semibold">
              No audit records logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-black tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-semibold text-slate-300">
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white">
                        {log.userName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950 border border-indigo-800 text-indigo-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 max-w-lg truncate">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RENDER REPORT: LOCATION DISTRIBUTION */}
      {reportType === 'location' && (
        <div className="space-y-6">
          {Object.entries(locationGroups).map(([locName, locEmps]) => (
            <div key={locName} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="text-amber-400" size={20} />
                  <h3 className="text-base font-black text-white">{locName}</h3>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-950 text-amber-400 border border-amber-800">
                  {locEmps.length} Employees
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {locEmps.map((emp) => {
                  const gross = (emp.basicSalary || 0) + (emp.fuelAllowance || 0) + (emp.foodAllowance || 0) + (emp.mobileAllowance || 0) + (emp.performanceAllowance || 0) + (emp.otherAllowances || 0);
                  return (
                    <div key={emp._id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                      <span className="block text-xs font-bold text-white">{emp.name}</span>
                      <span className="block text-[11px] text-slate-400">{emp.designation}</span>
                      <div className="flex justify-between items-center pt-2 text-[11px] border-t border-slate-800 font-mono">
                        <span className="text-slate-500">Gross Salary:</span>
                        <span className="font-bold text-emerald-400">Rs. {formatPKR(gross)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StaffReportsSubTab;
