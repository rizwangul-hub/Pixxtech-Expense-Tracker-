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
  CreditCard,
  DollarSign,
  X,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { payrollAPI, accountsAPI } from '../services/api.js';

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

  // Finance Integration State
  const [financeAccounts, setFinanceAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  
  // Pay Single Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTargetRow, setPayTargetRow] = useState(null);
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payNotes, setPayNotes] = useState('');
  const [processingPay, setProcessingPay] = useState(false);

  // Reverse Modal
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [reverseTargetRow, setReverseTargetRow] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [processingReverse, setProcessingReverse] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await accountsAPI.getAccounts({ limit: 100 });
      const accList = res?.data?.accounts || (Array.isArray(res?.data) ? res.data : []);
      if (Array.isArray(accList)) {
        const active = accList.filter((a) => a.isActive && !a.isClearing);
        setFinanceAccounts(active);
        if (active.length > 0) {
          setSelectedAccountId((prev) => prev || active[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load finance accounts:', err);
    }
  };

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
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchPayroll();
  }, [selectedMonth]);

  const handleAllowanceChange = (empId, val) => {
    const numAllow = isNaN(Number(val)) ? 0 : Number(val);
    setPayrollRows((prev) =>
      prev.map((r) => {
        if (r.employeeId === empId) {
          const newGross = (r.basicSalary || 0) + numAllow;
          const totDed = (r.loanDeduction || 0) + (r.lopDeduction || 0) + (r.otherDeduction || 0);
          const newNet = Math.max(0, newGross - totDed);
          return {
            ...r,
            allowance: val,
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
          return {
            ...r,
            allowanceReason: val,
          };
        }
        return r;
      })
    );
  };

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

  const handleDownloadSalarySlip = async (employeeId, name) => {
    try {
      await payrollAPI.downloadSalarySlipPDF(employeeId, selectedMonth, name);
    } catch (err) {
      console.error('Download Salary Slip Error:', err);
      const url = payrollAPI.downloadSalarySlipPDFUrl(employeeId, selectedMonth);
      window.open(url, '_blank');
    }
  };

  const handlePrintSalarySlip = async (employeeId) => {
    try {
      await payrollAPI.printSalarySlipPDF(employeeId, selectedMonth);
    } catch (err) {
      console.error('Print Salary Slip Error:', err);
      const url = payrollAPI.downloadSalarySlipPDFUrl(employeeId, selectedMonth);
      window.open(url, '_blank');
    }
  };

  // Finance Payout Handlers
  const openPayModal = (row) => {
    setPayTargetRow(row);
    setPayNotes('');
    setPayModalOpen(true);
  };

  const handleConfirmPayout = async () => {
    if (!payTargetRow || !selectedAccountId) return;
    try {
      setProcessingPay(true);
      setMsg({ type: '', text: '' });

      const res = await payrollAPI.paySingleSalary({
        month: selectedMonth,
        payrollId: payTargetRow.payrollId,
        employeeId: payTargetRow.employeeId,
        paidFromAccountId: selectedAccountId,
        paymentMethod: payMethod,
        paymentNotes: payNotes,
      });

      if (res?.success) {
        setMsg({ type: 'success', text: res.message || 'Salary paid successfully!' });
        setPayModalOpen(false);
        setPayTargetRow(null);
        fetchPayroll();
        fetchAccounts();
        setTimeout(() => setMsg({ type: '', text: '' }), 4000);
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to disburse salary.' });
    } finally {
      setProcessingPay(false);
    }
  };

  const openReverseModal = (row) => {
    setReverseTargetRow(row);
    setReverseReason('');
    setReverseModalOpen(true);
  };

  const handleConfirmReverse = async () => {
    if (!reverseTargetRow) return;
    try {
      setProcessingReverse(true);
      setMsg({ type: '', text: '' });

      const res = await payrollAPI.reverseSalaryPayment({
        payrollId: reverseTargetRow.payrollId,
        employeeId: reverseTargetRow.employeeId,
        month: selectedMonth,
        reason: reverseReason,
      });

      if (res?.success) {
        setMsg({ type: 'success', text: res.message || 'Salary payment reversed successfully.' });
        setReverseModalOpen(false);
        setReverseTargetRow(null);
        fetchPayroll();
        fetchAccounts();
        setTimeout(() => setMsg({ type: '', text: '' }), 4000);
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to reverse salary payment.' });
    } finally {
      setProcessingReverse(false);
    }
  };

  // Dynamic Metrics
  const dynamicGrandGross = payrollRows.reduce((sum, r) => sum + (r.grossSalary || 0), 0);
  const dynamicGrandLoanDed = payrollRows.reduce((sum, r) => sum + (Number(r.loanDeduction) || 0), 0);
  const dynamicGrandNetPay = payrollRows.reduce((sum, r) => sum + (r.netPayable || 0), 0);

  const totalPaidAmount = payrollRows
    .filter((r) => r.paymentStatus === 'PAID')
    .reduce((sum, r) => sum + (r.netPayable || 0), 0);

  const totalPendingAmount = dynamicGrandNetPay - totalPaidAmount;

  const currentDisbursingAccount = financeAccounts.find((a) => a._id === selectedAccountId);

  return (
    <div className="space-y-6">
      {/* Top Banner & Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileSpreadsheet size={14} /> Automated Monthly Payroll & Finance Engine
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Monthly Salary Sheet & Finance Payout System
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
              onClick={handleDownloadExcel}
              className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
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

        {/* Finance Payout Accounts Selector Bar */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CreditCard size={18} className="text-blue-400" />
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Default Finance Bank / Cash Disbursing Account
              </div>
              <div className="text-xs text-slate-300 font-medium">
                Selected payouts will decrease this real Finance Account balance
              </div>
            </div>
          </div>

          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-emerald-400 font-mono font-bold text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:border-emerald-500"
          >
            {financeAccounts.length === 0 ? (
              <option value="">No Active Finance Accounts Found</option>
            ) : (
              financeAccounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.name} ({acc.type}) — Bal: Rs. {formatPKR(acc.currentBalance)}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Dynamic Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold">Total Net Liability</span>
            <div className="text-xl font-black text-white font-mono mt-0.5">Rs. {formatPKR(dynamicGrandNetPay)}</div>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold">Paid From Finance</span>
            <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">Rs. {formatPKR(totalPaidAmount)}</div>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold">Pending Payouts</span>
            <div className="text-xl font-black text-amber-400 font-mono mt-0.5">Rs. {formatPKR(totalPendingAmount)}</div>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-semibold">Loan / Advance Deducted</span>
            <div className="text-xl font-black text-rose-400 font-mono mt-0.5">Rs. {formatPKR(dynamicGrandLoanDed)}</div>
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
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3 text-right">Basic (PKR)</th>
                <th className="py-3 px-3 text-right">Allowance (PKR)</th>
                <th className="py-3 px-4">Reason of Allowance</th>
                <th className="py-3 px-3 text-right">Gross (PKR)</th>
                <th className="py-3 px-3 text-center">Attendance</th>
                <th className="py-3 px-3 text-right">Loan Bal</th>
                <th className="py-3 px-3 text-right">Loan Ded (PKR)</th>
                <th className="py-3 px-4 text-right">Net Payable</th>
                <th className="py-3 px-4">Bank & IBAN</th>
                <th className="py-3 px-4 text-center">Finance Status & Action</th>
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
                  const isPaid = row.paymentStatus === 'PAID';

                  return (
                    <tr key={row.employeeId} className="hover:bg-slate-900/60 transition">
                      <td className="py-3 px-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{row.name}</div>
                        <div className="text-[10px] text-slate-400">{row.designation}</div>
                      </td>
                      <td className="py-3 px-3 font-bold text-purple-400">{row.department}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">
                        {formatPKR(row.basicSalary)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          placeholder="0"
                          disabled={isPaid}
                          value={row.allowance !== undefined ? row.allowance : 0}
                          onChange={(e) => handleAllowanceChange(row.employeeId, e.target.value)}
                          className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-emerald-400 font-mono font-bold text-right focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          placeholder="Reason (e.g. Fuel, Mobile)"
                          disabled={isPaid}
                          value={row.allowanceReason || ''}
                          onChange={(e) => handleAllowanceReasonChange(row.employeeId, e.target.value)}
                          className="w-36 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-medium text-xs focus:outline-none focus:border-purple-500 disabled:opacity-50"
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
                          disabled={isPaid}
                          value={row.loanDeduction}
                          onChange={(e) => handleLoanDeductionChange(row.employeeId, e.target.value)}
                          className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-rose-300 font-mono font-bold text-right focus:outline-none focus:border-rose-500 disabled:opacity-50"
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

                      {/* Finance Status & Action Cell */}
                      <td className="py-3 px-4 text-center">
                        {isPaid ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold text-[10px]">
                              <ShieldCheck size={12} /> PAID
                            </span>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Vn: <span className="text-emerald-400 font-bold">{row.voucherNo}</span>
                            </div>
                            <div className="text-[9px] text-slate-500 truncate max-w-[120px]">
                              {row.paidFromAccountName}
                            </div>
                            <button
                              onClick={() => openReverseModal(row)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 underline font-semibold transition"
                            >
                              Reverse
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-800/80 text-amber-400 font-bold text-[10px]">
                              PENDING PAYMENT
                            </span>
                            <div>
                              <button
                                onClick={() => openPayModal(row)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded-lg text-[11px] shadow transition inline-flex items-center gap-1"
                              >
                                <DollarSign size={13} /> Pay Salary
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleDownloadSalarySlip(row.employeeId, row.name)}
                            className="px-2 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 transition inline-flex items-center gap-1 font-bold text-[10px]"
                            title="Download Official Salary Slip PDF"
                          >
                            <Download size={12} /> Download
                          </button>
                          <button
                            onClick={() => handlePrintSalarySlip(row.employeeId)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-slate-700 transition inline-flex items-center gap-1 font-bold text-[10px]"
                            title="Print Official Salary Slip"
                          >
                            <Printer size={12} /> Print
                          </button>
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

      {/* CONFIRM PAYOUT MODAL */}
      {payModalOpen && payTargetRow && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="text-emerald-400" size={20} />
                <h3 className="text-lg font-black text-white">Confirm Finance Salary Payout</h3>
              </div>
              <button
                onClick={() => setPayModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Employee Payout Details */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Employee Name:</span>
                <span className="text-white font-bold text-sm">{payTargetRow.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Designation / Department:</span>
                <span className="text-purple-400 font-bold">{payTargetRow.designation} ({payTargetRow.department})</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-2">
                <span className="text-slate-400 font-semibold">Payroll Month:</span>
                <span className="text-slate-300 font-mono font-bold">{selectedMonth}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-800/80 pt-2 text-sm">
                <span className="text-slate-300 font-bold">Net Salary Disbursing Amount:</span>
                <span className="text-emerald-400 font-mono font-black text-base">Rs. {formatPKR(payTargetRow.netPayable)}</span>
              </div>
            </div>

            {/* Disbursing Finance Account Selector */}
            <div className="space-y-1.5 text-xs">
              <label className="text-slate-300 font-bold flex items-center justify-between">
                <span>Disbursing Finance Account (Bank or Cash):</span>
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-emerald-300 font-mono font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
              >
                {financeAccounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.name} ({acc.type}) — Current Bal: Rs. {formatPKR(acc.currentBalance)}
                  </option>
                ))}
              </select>
            </div>

            {/* Account Balance Impact Preview */}
            {currentDisbursingAccount && (
              <div className="bg-emerald-950/40 border border-emerald-900/60 p-3.5 rounded-xl space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Current Account Balance:</span>
                  <span className="font-bold text-white">Rs. {formatPKR(currentDisbursingAccount.currentBalance)}</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>Salary Outflow (-):</span>
                  <span className="font-bold">- Rs. {formatPKR(payTargetRow.netPayable)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-black border-t border-emerald-900/80 pt-1.5 text-sm">
                  <span>Balance After Payout:</span>
                  <span>Rs. {formatPKR(currentDisbursingAccount.currentBalance - payTargetRow.netPayable)}</span>
                </div>
              </div>
            )}

            {/* Payment Notes / Method */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Payment Method:</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white font-semibold rounded-xl px-3 py-2 focus:outline-none"
                >
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CASH">Cash in Hand</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 font-bold block mb-1">Payment Notes / Ref:</label>
                <input
                  type="text"
                  placeholder="e.g. Online transfer ref #12345"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white font-medium rounded-xl px-3 py-2 focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayout}
                disabled={processingPay || !selectedAccountId}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg disabled:opacity-50"
              >
                <CheckCircle size={15} />
                {processingPay ? 'Processing Payout...' : 'Disburse & Record Payout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVERSE SALARY PAYMENT MODAL */}
      {reverseModalOpen && reverseTargetRow && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-rose-400" size={20} />
                <h3 className="text-lg font-black text-white">Reverse Salary Payout</h3>
              </div>
              <button
                onClick={() => setReverseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to reverse the paid salary of{' '}
              <strong className="text-white">{reverseTargetRow.name}</strong> (Rs.{' '}
              {formatPKR(reverseTargetRow.netPayable)})?
            </p>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1 font-mono">
              <div className="text-slate-400">Linked Voucher: <span className="text-emerald-400 font-bold">{reverseTargetRow.voucherNo}</span></div>
              <div className="text-slate-400">Paid Account: <span className="text-white font-bold">{reverseTargetRow.paidFromAccountName}</span></div>
            </div>

            <div className="text-xs text-rose-300 bg-rose-950/60 p-3 rounded-xl border border-rose-900/60">
              Reversing will restore Rs. {formatPKR(reverseTargetRow.netPayable)} back to the disbursing account balance and reverse the Finance Voucher.
            </div>

            <div className="text-xs space-y-1">
              <label className="text-slate-400 font-bold">Reversal Reason (Optional):</label>
              <input
                type="text"
                placeholder="e.g. Wrong bank account selected"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white font-medium rounded-xl px-3 py-2 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setReverseModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReverse}
                disabled={processingReverse}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs disabled:opacity-50"
              >
                {processingReverse ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffPayrollSubTab;
