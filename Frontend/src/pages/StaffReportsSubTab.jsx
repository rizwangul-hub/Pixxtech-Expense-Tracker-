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
  Printer,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Layers,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { staffAPI, attendanceAPI, payrollAPI } from '../services/api.js';

export function StaffReportsSubTab() {
  const [reportType, setReportType] = useState('boss-pending'); // 'boss-pending' | 'audit' | 'location'
  const [auditLogs, setAuditLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Boss Pending Salary State
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [bossReportData, setBossReportData] = useState(null);
  const [bossLoading, setBossLoading] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [printingPDF, setPrintingPDF] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [notification, setNotification] = useState({ type: '', text: '' });

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

  const fetchBossReport = async (month) => {
    try {
      setBossLoading(true);
      const res = await payrollAPI.getPendingSalaryBossReport({ month });
      if (res?.success && res.data) {
        setBossReportData(res.data);
      }
    } catch (err) {
      console.error('Failed to load boss pending salary report:', err);
      setNotification({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to load pending salary report.',
      });
    } finally {
      setBossLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (reportType === 'boss-pending') {
      fetchBossReport(selectedMonth);
    }
  }, [selectedMonth, reportType]);

  const handleDownloadBossPDF = async () => {
    try {
      setDownloadingPDF(true);
      await payrollAPI.downloadPendingSalaryBossReportPDF(selectedMonth, {
        department: selectedDeptFilter !== 'ALL' ? selectedDeptFilter : undefined,
      });
      setNotification({ type: 'success', text: `Downloaded Boss Pending Salary PDF for ${selectedMonth}.` });
      setTimeout(() => setNotification({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Download Boss PDF error:', err);
      setNotification({
        type: 'error',
        text: err.message || 'Failed to download Boss Pending Salary PDF.',
      });
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handlePrintBossPDF = async () => {
    try {
      setPrintingPDF(true);
      await payrollAPI.printPendingSalaryBossReportPDF(selectedMonth, {
        department: selectedDeptFilter !== 'ALL' ? selectedDeptFilter : undefined,
      });
    } catch (err) {
      console.error('Print Boss PDF error:', err);
      setNotification({
        type: 'error',
        text: err.message || 'Failed to print Boss Pending Salary PDF.',
      });
    } finally {
      setPrintingPDF(false);
    }
  };

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

  // Filter boss pending department list
  const filteredDepartments = (bossReportData?.departments || []).map((deptGroup) => {
    const filteredEmps = deptGroup.employees.filter((e) => {
      const matchSearch =
        !searchQuery ||
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.accountTitle && e.accountTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.bankName && e.bankName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.ibanNumber && e.ibanNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchDept = selectedDeptFilter === 'ALL' || deptGroup.department === selectedDeptFilter;
      return matchSearch && matchDept;
    });

    return {
      ...deptGroup,
      filteredEmployees: filteredEmps,
      filteredTotal: filteredEmps.reduce((sum, e) => sum + e.remainingSalary, 0),
    };
  }).filter((group) => group.filteredEmployees.length > 0);

  const totalFilteredCount = filteredDepartments.reduce((s, g) => s + g.filteredEmployees.length, 0);
  const totalFilteredAmount = filteredDepartments.reduce((s, g) => s + g.filteredTotal, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-400 bg-indigo-950 px-2.5 py-0.5 rounded-md border border-indigo-800/60">
                Staff HR Executive Reports
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <FileText className="text-indigo-400" size={24} /> Staff Reports &amp; Executive Salary Sheets
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Generate executive monthly pending salary payment lists for management (Boss), organized by office location with banking and IBAN transfer details, or inspect audit logs and workforce distribution.
            </p>
          </div>
        </div>

        {/* Report Sub-tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-slate-800">
          <button
            onClick={() => setReportType('boss-pending')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              reportType === 'boss-pending'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <CreditCard size={15} /> Boss Pending Salary Report
          </button>
          <button
            onClick={() => setReportType('location')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              reportType === 'location'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 size={15} /> Location Distribution Report
          </button>
          <button
            onClick={() => setReportType('audit')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              reportType === 'audit'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck size={15} /> System Audit Log
          </button>
        </div>
      </div>

      {notification.text && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-950 border-emerald-800 text-emerald-200'
              : 'bg-rose-950 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{notification.text}</span>
          </div>
          <button onClick={() => setNotification({ type: '', text: '' })} className="hover:opacity-75">
            &times;
          </button>
        </div>
      )}

      {/* RENDER REPORT: BOSS PENDING SALARY REPORT */}
      {reportType === 'boss-pending' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Month Picker */}
                <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                  <Calendar size={15} className="text-emerald-400" />
                  <span className="text-xs text-slate-400 font-semibold">Salary Month:</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none"
                  />
                </div>

                {/* Office / Location Filter */}
                <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
                  <Building2 size={15} className="text-indigo-400" />
                  <span className="text-xs text-slate-400 font-semibold">Location / Office:</span>
                  <select
                    value={selectedDeptFilter}
                    onChange={(e) => setSelectedDeptFilter(e.target.value)}
                    className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-slate-900">All Locations (Consolidated)</option>
                    {(bossReportData?.departments || []).map((d) => (
                      <option key={d.department} value={d.department} className="bg-slate-900">
                        {d.department}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search */}
                <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                  <Search size={14} className="text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search name, IBAN, bank..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-white text-xs placeholder:text-slate-500 focus:outline-none w-44"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleDownloadBossPDF}
                  disabled={downloadingPDF || bossLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                  title="Download official PDF report for Boss"
                >
                  <Download size={15} />
                  {downloadingPDF ? 'Generating PDF...' : 'Download Boss PDF'}
                </button>
                <button
                  onClick={handlePrintBossPDF}
                  disabled={printingPDF || bossLoading}
                  className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800/60 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Open in printable viewer"
                >
                  <Printer size={15} />
                  {printingPDF ? 'Opening...' : 'Print PDF'}
                </button>
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Pending Staff Members</div>
                  <div className="text-lg font-black text-white mt-0.5">{totalFilteredCount} Employees</div>
                </div>
                <div className="p-2.5 bg-indigo-950/70 border border-indigo-800/60 rounded-xl text-indigo-400">
                  <Users size={18} />
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Workplace Locations</div>
                  <div className="text-lg font-black text-white mt-0.5">{filteredDepartments.length} Branches</div>
                </div>
                <div className="p-2.5 bg-amber-950/70 border border-amber-800/60 rounded-xl text-amber-400">
                  <Building2 size={18} />
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-amber-800/40 bg-gradient-to-r from-amber-950/20 to-slate-950 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-amber-300 font-bold uppercase tracking-wider">Total Pending To Pay</div>
                  <div className="text-lg font-black text-amber-400 font-mono mt-0.5">Rs. {formatPKR(totalFilteredAmount)}</div>
                </div>
                <div className="p-2.5 bg-amber-950 border border-amber-700/60 rounded-xl text-amber-400">
                  <DollarSign size={18} />
                </div>
              </div>
            </div>
          </div>

          {/* Department / Workplace Groups */}
          {bossLoading ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 font-semibold animate-pulse">
              Gathering pending salary records for {selectedMonth}...
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-2">
              <CheckCircle2 size={36} className="text-emerald-400 mx-auto" />
              <div className="text-base font-bold text-white">No Pending Salaries for {selectedMonth}</div>
              <div className="text-xs text-slate-400 max-w-md mx-auto">
                All staff members for this month have either been fully paid and verified or no payroll records have been initialized yet.
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredDepartments.map((deptGroup) => (
                <div
                  key={deptGroup.department}
                  className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm"
                >
                  {/* Location Header */}
                  <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-950 border border-indigo-800/70 rounded-xl text-indigo-400">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">
                          {deptGroup.department}
                        </h3>
                        <div className="text-[11px] text-slate-400 font-medium">
                          {deptGroup.filteredEmployees.length} staff member{deptGroup.filteredEmployees.length === 1 ? '' : 's'} pending payment
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-semibold">Subtotal Payout:</span>
                      <span className="text-sm font-black text-amber-400 font-mono bg-amber-950/80 border border-amber-800/80 px-3 py-1 rounded-xl">
                        Rs. {formatPKR(deptGroup.filteredTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Location Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-bold tracking-wider border-b border-slate-800 text-[10.5px]">
                        <tr>
                          <th className="py-3 px-3.5 w-10 text-center">#</th>
                          <th className="py-3 px-4">Employee Name</th>
                          <th className="py-3 px-4">Designation</th>
                          <th className="py-3 px-4 text-right">Final Salary (Net)</th>
                          <th className="py-3 px-4">Account Title</th>
                          <th className="py-3 px-4">IBAN / Account Number</th>
                          <th className="py-3 px-4">Bank Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-semibold text-slate-300">
                        {deptGroup.filteredEmployees.map((emp, index) => (
                          <tr key={emp.employeeId} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-3.5 text-center text-slate-500 font-mono text-[11px]">
                              {index + 1}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-bold text-white block">{emp.name}</span>
                              {emp.employeeCode && (
                                <span className="text-[10px] text-slate-400 font-mono">{emp.employeeCode}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-950 border border-slate-800 text-slate-300">
                                {emp.designation}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-mono font-bold text-amber-400 text-xs">
                                Rs. {formatPKR(emp.remainingSalary)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-white">
                              {emp.accountTitle || emp.name}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/60 block w-fit">
                                {emp.ibanNumber || emp.accountNumber || '—'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              <span className="text-[11px] font-bold text-slate-300">
                                {emp.bankName || 'Cash'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
