import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Save,
  CheckCircle,
  Building2,
  Calendar,
  AlertCircle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { payrollAPI } from '../services/api.js';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
  }).format(val || 0);
};

export const StaffPayrollSubTab = () => {
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [payrollRows, setPayrollRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const fetchPayroll = async () => {
    try {
      setLoading(true);
      const res = await payrollAPI.getMonthlyPayroll({ month: selectedMonth });
      if (res?.success && res.data) {
        setPayrollRows(res.data.payroll || []);
        setSummary(res.data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load payroll:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, [selectedMonth]);

  const handleLoanDeductionChange = (empId, val) => {
    const numDed = isNaN(Number(val)) ? 0 : Number(val);
    setPayrollRows((prev) =>
      prev.map((r) => {
        if (r.employeeId === empId) {
          const newTotDed = numDed + (r.lopDeduction || 0) + (r.otherDeduction || 0);
          const newNet = Math.max(0, r.grossSalary - newTotDed);
          return {
            ...r,
            loanDeduction: val,
            totalDeduction: newTotDed,
            netPayable: newNet,
          };
        }
        return r;
      })
    );
  };

  const handleExtraAllowanceChange = (empId, val) => {
    const numAllow = isNaN(Number(val)) ? 0 : Number(val);
    setPayrollRows((prev) =>
      prev.map((r) => {
        if (r.employeeId === empId) {
          const regAllow =
            (r.fuelAllowance || 0) +
            (r.foodAllowance || 0) +
            (r.mobileAllowance || 0) +
            (r.performanceAllowance || 0) +
            (r.otherAllowances || 0);
          const newGross = (r.basicSalary || 0) + regAllow + numAllow;
          const newNet = Math.max(0, newGross - (r.totalDeduction || 0));
          return {
            ...r,
            extraAllowance: val,
            grossSalary: newGross,
            netPayable: newNet,
          };
        }
        return r;
      })
    );
  };

  const handleAllowanceReasonChange = (empId, val) => {
    setPayrollRows((prev) =>
      prev.map((r) => {
        if (r.employeeId === empId) {
          return { ...r, allowanceReason: val };
        }
        return r;
      })
    );
  };

  const handleSavePayroll = async () => {
    try {
      setSaving(true);
      setMsg({ type: '', text: '' });

      await payrollAPI.savePayroll({
        month: selectedMonth,
        payrollRecords: payrollRows,
      });

      setMsg({ type: 'success', text: `Monthly payroll for ${selectedMonth} saved and finalized successfully.` });
      fetchPayroll();
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to save payroll.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    const url = payrollAPI.downloadSalarySheetExcelUrl(selectedMonth);
    window.open(url, '_blank');
  };

  const handleDownloadPDFSheet = () => {
    const url = payrollAPI.downloadSalarySheetPDFUrl(selectedMonth);
    window.open(url, '_blank');
  };

  const handleOpenSalarySlip = (employeeId) => {
    const url = payrollAPI.downloadSalarySlipPDFUrl(employeeId, selectedMonth);
    window.open(url, '_blank');
  };

  // Re-calculate totals dynamically
  const dynamicGrandGross = payrollRows.reduce((sum, r) => sum + (r.grossSalary || 0), 0);
  const dynamicGrandLoanDed = payrollRows.reduce((sum, r) => sum + (Number(r.loanDeduction) || 0), 0);
  const dynamicGrandNetPay = payrollRows.reduce((sum, r) => sum + (r.netPayable || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileSpreadsheet size={14} /> Automated Monthly Payroll Engine
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Monthly Salary Sheet & Payslip Generator
            </h2>
          </div>

          {/* Month Selector & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
              <Calendar size={15} className="text-emerald-400" />
              <span className="text-xs text-slate-400 font-semibold">Payroll Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none"
              />
            </div>

            <button
              onClick={handleDownloadPDFSheet}
              className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800/60 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Download Printable PDF Monthly Salary Sheet"
            >
              <FileText size={14} /> Download PDF Sheet
            </button>

            <button
              onClick={handleDownloadExcel}
              className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Download Excel Salary Sheet matching official layout"
            >
              <Download size={14} /> Download Excel Sheet
            </button>

            <button
              onClick={handleSavePayroll}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Finalize & Save Payroll'}
            </button>
          </div>
        </div>

        {msg.text && (
          <div
            className={`p-3 rounded-xl border text-xs font-bold ${
              msg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/80 border-rose-800/60 text-rose-300'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Dynamic Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold">Total Monthly Gross Salary</span>
            <div className="text-xl font-black text-white font-mono mt-0.5">Rs. {formatPKR(dynamicGrandGross)}</div>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold">Total Loan / Advance Deducted</span>
            <div className="text-xl font-black text-rose-400 font-mono mt-0.5">Rs. {formatPKR(dynamicGrandLoanDed)}</div>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold">Net Total Payable Salary</span>
            <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">Rs. {formatPKR(dynamicGrandNetPay)}</div>
          </div>
        </div>
      </div>

      {/* Interactive Payroll Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Building2 size={16} className="text-purple-400" />
            Itemized Employee Salary Sheet ({selectedMonth})
          </h3>
          <span className="text-xs text-slate-400 font-semibold">
            {payrollRows.length} Employee Records
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Sr.</th>
                <th className="py-3 px-4">Employee Name</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-3 text-right">Basic (PKR)</th>
                <th className="py-3 px-3 text-right">Allowances</th>
                <th className="py-3 px-3 text-right">Extra Allow (PKR)</th>
                <th className="py-3 px-4">Allowance Reason</th>
                <th className="py-3 px-3 text-right">Gross (PKR)</th>
                <th className="py-3 px-3 text-center">Attendance</th>
                <th className="py-3 px-3 text-right">Loan Bal</th>
                <th className="py-3 px-3 text-right">Loan Ded (PKR)</th>
                <th className="py-3 px-4 text-right">Net Payable</th>
                <th className="py-3 px-4">Bank & IBAN</th>
                <th className="py-3 px-4 text-center">Payslip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan="14" className="py-8 text-center text-slate-500 font-semibold">
                    Calculating monthly payroll sheet...
                  </td>
                </tr>
              ) : payrollRows.length === 0 ? (
                <tr>
                  <td colSpan="14" className="py-8 text-center text-slate-500 font-semibold">
                    No active staff found.
                  </td>
                </tr>
              ) : (
                payrollRows.map((row, idx) => {
                  const regAllowances =
                    (row.fuelAllowance || 0) +
                    (row.foodAllowance || 0) +
                    (row.mobileAllowance || 0) +
                    (row.performanceAllowance || 0) +
                    (row.otherAllowances || 0);

                  return (
                    <tr key={row.employeeId} className="hover:bg-slate-900/60 transition">
                      <td className="py-3 px-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{row.name}</div>
                        <div className="text-[10px] text-slate-400">{row.designation}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-purple-400">{row.department}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">
                        {formatPKR(row.basicSalary)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-400 font-bold">
                        +{formatPKR(regAllowances)}
                      </td>
                      {/* Extra Allowance Field */}
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          placeholder="0"
                          value={row.extraAllowance || ''}
                          onChange={(e) => handleExtraAllowanceChange(row.employeeId, e.target.value)}
                          className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-emerald-300 font-mono font-bold text-right focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                      {/* Allowance Reason Field */}
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          placeholder="e.g. Fuel / Performance"
                          value={row.allowanceReason || ''}
                          onChange={(e) => handleAllowanceReasonChange(row.employeeId, e.target.value)}
                          className="w-36 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-white font-bold">
                        {formatPKR(row.grossSalary)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="text-[11px] font-bold text-emerald-400 font-mono">
                          {row.presentDays} / {row.totalDays}
                        </div>
                        {row.lopDays > 0 && (
                          <div className="text-[10px] text-rose-400 font-bold">{row.lopDays} LOP</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-400">
                        {row.loanBalance > 0 ? formatPKR(row.loanBalance) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          placeholder="0"
                          value={row.loanDeduction}
                          onChange={(e) => handleLoanDeductionChange(row.employeeId, e.target.value)}
                          className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-rose-300 font-mono font-bold text-right focus:outline-none focus:border-rose-500"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-sm text-emerald-400">
                        Rs. {formatPKR(row.netPayable)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-300 text-[11px] truncate max-w-[130px]">
                          {row.accountTitle || row.name}
                        </div>
                        <div className="text-[10px] text-purple-400 font-mono truncate max-w-[130px]">
                          {row.bankName} • {row.ibanNumber ? row.ibanNumber.slice(-8) : 'Cash'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenSalarySlip(row.employeeId)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 transition inline-flex items-center gap-1 font-bold text-[11px]"
                          title="Generate Printable PDF Salary Slip"
                        >
                          <Printer size={13} /> Slip PDF
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StaffPayrollSubTab;
