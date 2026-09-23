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
  BookOpen,
  FileText,
  Maximize2,
  Minimize2,
  PanelLeftOpen,
} from 'lucide-react';
import { payrollAPI, accountsAPI } from '../services/api.js';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
  }).format(val || 0);
};

export const StaffPayrollSubTab = () => {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [payrollRows, setPayrollRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Finance Integration State
  const [financeAccounts, setFinanceAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Full-screen mode for the Itemized Salary Sheet table
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [modalError, setModalError] = useState('');
  
  // Pay Single Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTargetRow, setPayTargetRow] = useState(null);
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payNotes, setPayNotes] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [processingPay, setProcessingPay] = useState(false);

  // Reverse Modal
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  const [reverseTargetRow, setReverseTargetRow] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [processingReverse, setProcessingReverse] = useState(false);

  // Individual Employee Ledger Modal
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [selectedLedgerData, setSelectedLedgerData] = useState(null);

  const openEmployeeLedgerModal = async (employeeId) => {
    try {
      setLedgerLoading(true);
      setLedgerModalOpen(true);
      const res = await payrollAPI.getEmployeeLedger(employeeId);
      if (res?.success && res.data) {
        setSelectedLedgerData(res.data);
      }
    } catch (err) {
      console.error('Failed to load employee ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

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
          const newTotDed = numDed + (Number(r.lopDeduction) || 0) + (Number(r.otherDeduction) || 0);
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

  const handleLopDeductionChange = (empId, val) => {
    const numDed = isNaN(Number(val)) ? 0 : Number(val);
    setPayrollRows((prev) =>
      prev.map((r) => {
        if (r.employeeId === empId) {
          const newTotDed = (Number(r.loanDeduction) || 0) + numDed + (Number(r.otherDeduction) || 0);
          const newNet = Math.max(0, r.grossSalary - newTotDed);
          return {
            ...r,
            lopDeduction: val,
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

  const [downloadingMonthlyPDF, setDownloadingMonthlyPDF] = useState(false);

  const handleDownloadExcel = () => {
    const url = payrollAPI.downloadSalarySheetExcelUrl(selectedMonth);
    window.open(url, '_blank');
  };

  const handleDownloadMonthlyPDF = async () => {
    try {
      setDownloadingMonthlyPDF(true);
      await payrollAPI.downloadMonthlySalarySheetPDF(selectedMonth);
    } catch (err) {
      console.error('Download Monthly PDF Error:', err);
      setMsg({
        type: 'error',
        text: err?.message || 'Failed to download Monthly Salary Sheet PDF.',
      });
    } finally {
      setDownloadingMonthlyPDF(false);
    }
  };

  const handlePrintMonthlyPDF = async () => {
    try {
      setDownloadingMonthlyPDF(true);
      await payrollAPI.printMonthlySalarySheetPDF(selectedMonth);
    } catch (err) {
      console.error('Print Monthly PDF Error:', err);
      setMsg({
        type: 'error',
        text: err?.message || 'Failed to print Monthly Salary Sheet PDF.',
      });
    } finally {
      setDownloadingMonthlyPDF(false);
    }
  };

  const handleDownloadSalarySlip = async (row) => {
    try {
      await payrollAPI.downloadSalarySlipPDF(row.employeeId, selectedMonth, row.name, {
        allowance: row.allowance,
        allowanceReason: row.allowanceReason,
        loanDeduction: row.loanDeduction,
        lopDeduction: row.lopDeduction,
        otherDeduction: row.otherDeduction,
      });
    } catch (err) {
      console.error('Download Salary Slip Error:', err);
      setMsg({
        type: 'error',
        text: err?.message || 'Failed to download Salary Slip PDF.',
      });
    }
  };

  const handlePrintSalarySlip = async (row) => {
    try {
      await payrollAPI.printSalarySlipPDF(row.employeeId, selectedMonth, {
        allowance: row.allowance,
        allowanceReason: row.allowanceReason,
        loanDeduction: row.loanDeduction,
        lopDeduction: row.lopDeduction,
        otherDeduction: row.otherDeduction,
      });
    } catch (err) {
      console.error('Print Salary Slip Error:', err);
      setMsg({
        type: 'error',
        text: err?.message || 'Failed to print Salary Slip PDF.',
      });
    }
  };

  // Finance Payout Handlers
  const openPayModal = (row) => {
    if (!row.payrollId) {
      setMsg({ type: 'error', text: 'Please click "Finalize & Save Payroll" before submitting this salary for payout.' });
      return;
    }
    setPayTargetRow(row);
    setPayNotes('');
    setModalError('');
    setPayAmount(String(row.remainingPayable ?? row.netPayable ?? 0));
    setPayModalOpen(true);
  };

  const handleConfirmPayout = async () => {
    if (!payTargetRow || !selectedAccountId) return;
    try {
      setProcessingPay(true);
      setMsg({ type: '', text: '' });

      setModalError('');
      const res = await payrollAPI.paySingleSalary({
        month: selectedMonth,
        payrollId: payTargetRow.payrollId,
        employeeId: payTargetRow.employeeId,
        paidFromAccountId: selectedAccountId,
        paymentMethod: payMethod,
        paymentNotes: payNotes,
        paymentAmount: Number(payAmount),
        amount: Number(payAmount),
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
      const errText = err.response?.data?.message || err.message || 'Failed to disburse salary.';
      setModalError(errText);
      setMsg({ type: 'error', text: errText });
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
        const reversedEmployeeId = reverseTargetRow.employeeId;
        setMsg({ type: 'success', text: res.message || 'Salary payment reversed successfully.' });
        setReverseModalOpen(false);
        setReverseTargetRow(null);
        await Promise.all([fetchPayroll(), fetchAccounts()]);
        if (ledgerModalOpen && reversedEmployeeId) {
          await openEmployeeLedgerModal(reversedEmployeeId);
        }
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

  // Sum actual installments paid (includes PARTIAL_PAYMENT — not just fully PAID employees)
  const totalPaidAmount = payrollRows.reduce((sum, r) => sum + (r.totalInstallmentsPaid || 0), 0);
  const totalPendingAmount = payrollRows.reduce((sum, r) => sum + (r.remainingPayable ?? Math.max(0, (r.netPayable || 0) - (r.totalInstallmentsPaid || 0))), 0);

  const currentDisbursingAccount = financeAccounts.find((a) => a._id === selectedAccountId);

  return (
    <div className="space-y-6">
      {isFullScreen && msg.text && (
        <div
          role="alert"
          className={`fixed top-4 right-4 z-[100] max-w-md px-4 py-3 rounded-xl border shadow-2xl text-xs font-bold ${
            msg.type === 'success'
              ? 'bg-emerald-950 border-emerald-700 text-emerald-200'
              : 'bg-rose-950 border-rose-700 text-rose-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {msg.type === 'success' ? <CheckCircle size={16} className="text-emerald-400 shrink-0" /> : <AlertCircle size={16} className="text-rose-400 shrink-0" />}
            <span>{msg.text}</span>
            <button
              type="button"
              onClick={() => setMsg({ type: '', text: '' })}
              className="ml-2 text-current/70 hover:text-current"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
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
              className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Download Excel Salary Sheet matching official layout"
            >
              <Download size={14} /> Download Excel
            </button>

            <button
              onClick={handleDownloadMonthlyPDF}
              disabled={downloadingMonthlyPDF}
              className="bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-800/60 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              title="Download Official Monthly Salary Sheet & Finance Payout PDF"
            >
              <FileSpreadsheet size={14} /> {downloadingMonthlyPDF ? 'Generating PDF...' : 'Download PDF Sheet'}
            </button>

            <button
              onClick={handlePrintMonthlyPDF}
              disabled={downloadingMonthlyPDF}
              className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800/60 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              title="Print Monthly Salary Sheet PDF directly"
            >
              <Printer size={14} /> Print PDF
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
      <div
        className={
          isFullScreen
            ? 'fixed inset-0 z-50 bg-slate-950 flex flex-col'
            : 'bg-slate-900 border border-slate-800 rounded-2xl shadow-sm'
        }
      >
        {/* Full-screen top bar */}
        {isFullScreen && (
          <div className="shrink-0 flex items-center justify-between bg-slate-900 border-b border-slate-700 px-5 py-3 shadow-md">
            <div className="flex items-center gap-3">
              <Building2 size={18} className="text-purple-400" />
              <div>
                <span className="text-sm font-black text-white">Itemized Employee Salary Sheet</span>
                <span className="ml-3 text-xs text-slate-400 font-mono">{selectedMonth}</span>
                <span className="ml-3 text-xs text-slate-500 font-semibold">{payrollRows.length} Records</span>
              </div>
            </div>
            <button
              onClick={() => setIsFullScreen(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow"
              title="Exit full screen and show sidebar"
            >
              <PanelLeftOpen size={15} />
              Show Sidebar
            </button>
          </div>
        )}

        {/* Section header (shown only in normal mode) */}
        {!isFullScreen && (
          <div className="flex items-center justify-between border-b border-slate-800 px-5 pt-5 pb-3">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Building2 size={16} className="text-purple-400" />
              Itemized Employee Salary Sheet ({selectedMonth})
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-semibold">
                {payrollRows.length} Employee Records
              </span>
              <button
                onClick={() => setIsFullScreen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 font-bold text-xs transition"
                title="Open in full screen (hides sidebar for easier scrolling)"
              >
                <Maximize2 size={13} />
                Full Screen
              </button>
            </div>
          </div>
        )}

        {/* Table wrapper — scrollable */}
        <div className={`border border-slate-800 bg-slate-950 ${isFullScreen ? 'flex-1 overflow-y-auto overflow-x-hidden mx-3 my-2 rounded-xl' : 'overflow-x-auto rounded-b-2xl mx-5 mb-5 mt-0 rounded-t-none'}`}>
          <table className={`w-full table-fixed text-left text-[10px] text-slate-300 ${isFullScreen ? 'min-w-0' : 'min-w-[1300px]'}`}>
            <colgroup>
              <col style={{ width: '2.5%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9.5%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase font-extrabold text-[9px] tracking-wider border-b border-slate-800 z-10">
              <tr>
                <th className="py-2 px-1 text-center">Sr.</th>
                <th className="py-2 px-1.5">Employee Name</th>
                <th className="py-2 px-1">Location</th>
                <th className="py-2 px-1 text-right">Basic</th>
                <th className="py-2 px-1 text-right">Allowance</th>
                <th className="py-2 px-1">Reason</th>
                <th className="py-2 px-1 text-right">Gross</th>
                <th className="py-2 px-1 text-center">Attendance</th>
                <th className="py-2 px-1 text-right">Loan Bal</th>
                <th className="py-2 px-1 text-right">Loan Ded</th>
                <th className="py-2 px-1 text-right">LOP Ded</th>
                <th className="py-2 px-1 text-right">Net Payable</th>
                <th className="py-2 px-1.5">Bank &amp; IBAN</th>
                <th className="py-2 px-1 text-center">Status &amp; Action</th>
                <th className="py-2 px-1 text-center">Payslip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan="15" className="py-8 text-center text-slate-500 font-semibold">
                    Calculating monthly payroll sheet...
                  </td>
                </tr>
              ) : payrollRows.length === 0 ? (
                <tr>
                  <td colSpan="15" className="py-8 text-center text-slate-500 font-semibold">
                    No active staff found.
                  </td>
                </tr>
              ) : (
                payrollRows.map((row, idx) => {
                  const isPaid = row.paymentStatus === 'PAID';
                  const isPartial = row.paymentStatus === 'PARTIAL_PAYMENT';
                  const totalInstPaid = row.totalInstallmentsPaid || 0;
                  const remainingPay = row.remainingPayable ?? Math.max(0, (row.netPayable || 0) - totalInstPaid);

                  return (
                    <tr key={row.employeeId} className="hover:bg-slate-900/60 transition">
                      <td className="py-2 px-1 text-center font-mono font-bold text-slate-500 text-[10px]">{idx + 1}</td>
                      <td className="py-2 px-1.5 min-w-0">
                        <div className="font-bold text-white text-xs truncate" title={row.name}>{row.name}</div>
                        <div className="text-[9px] text-slate-400 truncate" title={row.designation}>{row.designation}</div>
                      </td>
                      <td className="py-2 px-1 font-bold text-purple-400 text-[10px] truncate" title={row.department}>{row.department}</td>
                      <td className="py-2 px-1 text-right font-mono text-slate-300 whitespace-nowrap text-[10px]">
                        {formatPKR(row.basicSalary)}
                      </td>
                      <td className="py-2 px-1">
                        <input
                          type="number"
                          placeholder="0"
                          disabled={isPaid}
                          value={row.allowance !== undefined ? row.allowance : 0}
                          onChange={(e) => handleAllowanceChange(row.employeeId, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-emerald-400 font-mono font-bold text-right focus:outline-none focus:border-emerald-500 disabled:opacity-50 text-[10px]"
                        />
                      </td>
                      <td className="py-2 px-1">
                        <input
                          type="text"
                          placeholder="Reason"
                          disabled={isPaid}
                          value={row.allowanceReason || ''}
                          onChange={(e) => handleAllowanceReasonChange(row.employeeId, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 font-medium text-[10px] focus:outline-none focus:border-purple-500 disabled:opacity-50 truncate"
                          title={row.allowanceReason || ''}
                        />
                      </td>
                      <td className="py-2 px-1 text-right font-mono text-white font-bold text-[10px] whitespace-nowrap">
                        {formatPKR(row.grossSalary)}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <div className="font-mono text-[10px] font-bold text-emerald-300 leading-tight">
                          {row.presentDays}d / {row.totalDays}d
                        </div>
                        {row.lopDays > 0 && (
                          <div className="text-[9px] text-rose-400 font-bold leading-tight mt-0.5">{row.lopDays} LOP</div>
                        )}
                        {row.lateDays > 0 && (
                          <div className="text-[8px] text-amber-400 leading-tight">({row.lateDays} Late)</div>
                        )}
                      </td>
                      <td className="py-2 px-1 text-right font-mono font-bold text-rose-400 text-[10px] whitespace-nowrap">
                        {row.loanBalance > 0 ? formatPKR(row.loanBalance) : '—'}
                      </td>
                      <td className="py-2 px-1">
                        <input
                          type="number"
                          placeholder="0"
                          disabled={isPaid}
                          value={row.loanDeduction !== undefined ? row.loanDeduction : 0}
                          onChange={(e) => handleLoanDeductionChange(row.employeeId, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-rose-300 font-mono font-bold text-right focus:outline-none focus:border-rose-500 disabled:opacity-50 text-[10px]"
                          title="Loan deduction"
                        />
                      </td>
                      <td className="py-2 px-1">
                        <input
                          type="number"
                          placeholder="0"
                          disabled={isPaid}
                          value={row.lopDeduction !== undefined ? row.lopDeduction : 0}
                          onChange={(e) => handleLopDeductionChange(row.employeeId, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-amber-300 font-mono font-bold text-right focus:outline-none focus:border-amber-500 disabled:opacity-50 text-[10px]"
                          title="Absent / Leave deduction"
                        />
                      </td>
                      <td className="py-2 px-1 text-right font-mono font-black text-xs text-emerald-400 whitespace-nowrap">
                        Rs. {formatPKR(row.netPayable)}
                      </td>
                      <td className="py-2 px-1.5 min-w-0">
                        <div className="font-bold text-slate-300 text-[10px] truncate" title={row.accountTitle || row.name}>
                          {row.accountTitle || row.name}
                        </div>
                        <div className="text-[9px] text-purple-400 font-mono truncate" title={`${row.bankName} • ${row.ibanNumber || 'Cash'}`}>
                          {row.bankName} • {row.ibanNumber ? row.ibanNumber.slice(-6) : 'Cash'}
                        </div>
                      </td>

                      {/* Finance Status & Action Cell */}
                      <td className="py-2 px-1 text-center">
                        {isPaid ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold text-[9px]">
                              <ShieldCheck size={10} /> PAID
                            </span>
                            <div className="text-[9px] text-slate-400 font-mono truncate">
                              Vn: <span className="text-emerald-400 font-bold">{row.voucherNo}</span>
                            </div>
                            <button
                              onClick={() => openReverseModal(row)}
                              className="text-[9px] text-rose-400 hover:text-rose-300 underline font-semibold transition"
                            >
                              Reverse
                            </button>
                          </div>
                        ) : isPartial ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 font-bold text-[9px]">
                              ◑ PARTIAL
                            </span>
                            <div className="text-[9px] text-emerald-400 font-mono">
                              Paid: Rs. {formatPKR(totalInstPaid)}
                            </div>
                            <div className="text-[9px] text-amber-400 font-mono">
                              Left: Rs. {formatPKR(remainingPay)}
                            </div>
                            <div>
                              <button
                                onClick={() => openPayModal(row)}
                                className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-2 py-0.5 rounded text-[10px] shadow transition inline-flex items-center gap-0.5"
                              >
                                <DollarSign size={11} /> Pay More
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-bold text-[9px]">
                              PENDING
                            </span>
                            <div>
                              <button
                                onClick={() => openPayModal(row)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-0.5 rounded text-[10px] shadow transition inline-flex items-center gap-0.5"
                              >
                                <DollarSign size={11} /> Pay
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-1 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleDownloadSalarySlip(row)}
                            className="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 transition inline-flex items-center gap-0.5 font-bold text-[9px]"
                            title="Download Official Salary Slip PDF"
                          >
                            <Download size={10} /> Slip
                          </button>
                          <button
                            onClick={() => handlePrintSalarySlip(row)}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-slate-700 transition inline-flex items-center gap-0.5 font-bold text-[9px]"
                            title="Print Official Salary Slip"
                          >
                            <Printer size={10} /> Print
                          </button>
                          <button
                            onClick={() => openEmployeeLedgerModal(row.employeeId)}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-400 hover:text-purple-300 border border-slate-700 transition inline-flex items-center gap-0.5 font-bold text-[9px]"
                            title="View Employee Ledger"
                          >
                            <BookOpen size={10} /> Ledger
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
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

            {modalError && (
              <div className="bg-rose-950/90 border border-rose-800 text-rose-200 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Full Salary Breakdown */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5 text-xs">
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
              {/* Salary breakdown */}
              <div className="border-t border-slate-800/80 pt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400 font-semibold">Gross Salary:</span>
                  <span className="text-slate-300 font-mono font-bold">Rs. {formatPKR(payTargetRow.grossSalary)}</span>
                </div>
                {Number(payTargetRow.loanDeduction) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-orange-400 font-semibold">Loan Deduction (this month):</span>
                    <span className="text-orange-400 font-mono font-bold">− Rs. {formatPKR(payTargetRow.loanDeduction)}</span>
                  </div>
                )}
                {Number(payTargetRow.lopDeduction) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-rose-400 font-semibold">Absent / LOP Deduction:</span>
                    <span className="text-rose-400 font-mono font-bold">− Rs. {formatPKR(payTargetRow.lopDeduction)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-slate-700 pt-1 text-sm">
                  <span className="text-white font-bold">Net Payable:</span>
                  <span className="text-white font-mono font-black">Rs. {formatPKR(payTargetRow.netPayable)}</span>
                </div>
              </div>
              {/* Payment progress */}
              <div className="border-t border-slate-800/80 pt-2 space-y-1">
                {Number(payTargetRow.totalInstallmentsPaid) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-emerald-400 font-semibold">Already Paid:</span>
                    <span className="text-emerald-400 font-mono font-bold">Rs. {formatPKR(payTargetRow.totalInstallmentsPaid)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-amber-300 font-bold">Remaining to Pay:</span>
                  <span className="text-amber-300 font-mono font-black">Rs. {formatPKR(payTargetRow.remainingPayable ?? payTargetRow.netPayable)}</span>
                </div>
              </div>
              {/* Previous installment breakdown */}
              {payTargetRow.salaryInstallments?.length > 0 && (
                <div className="border-t border-slate-800/80 pt-2">
                  <p className="text-slate-500 font-semibold mb-1">Previous installments:</p>
                  {payTargetRow.salaryInstallments.map((item, i) => (
                    <div key={i} className="flex justify-between text-slate-500">
                      <span>Installment {i + 1} ({item.paidFromAccountName || 'Bank'}):</span>
                      <span className="font-mono">Rs. {formatPKR(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="text-slate-300 font-bold">This Payment Amount:</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={payTargetRow.remainingPayable ?? payTargetRow.netPayable}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-emerald-300 font-mono font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500"
              />
              <p className="text-slate-500">You can pay the remaining salary in one payment or multiple installments.</p>
            </div>

            {/* Live payment preview */}
            {Number(payAmount) > 0 && (() => {
              const thisPayment = Number(payAmount) || 0;
              const prevPaid = Number(payTargetRow.totalInstallmentsPaid) || 0;
              const netPayable = Number(payTargetRow.netPayable) || 0;
              const remaining = Number(payTargetRow.remainingPayable ?? netPayable);
              const totalAfter = prevPaid + thisPayment;
              const remainingAfter = Math.max(0, remaining - thisPayment);
              const isOver = thisPayment > remaining + 0.01;
              return (
                <div className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${isOver ? 'bg-rose-950/60 border-rose-800' : 'bg-slate-950 border-slate-800'}`}>
                  <p className="text-slate-400 font-bold mb-1">Payment Preview:</p>
                  {prevPaid > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Previously paid:</span>
                      <span>Rs. {formatPKR(prevPaid)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-400">
                    <span>This payment:</span>
                    <span>+ Rs. {formatPKR(thisPayment)}</span>
                  </div>
                  <div className="flex justify-between text-white border-t border-slate-800 pt-1">
                    <span>Total paid after:</span>
                    <span className="font-black">Rs. {formatPKR(totalAfter)}</span>
                  </div>
                  <div className={`flex justify-between font-black ${isOver ? 'text-rose-400' : remainingAfter === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    <span>Remaining after:</span>
                    <span>Rs. {formatPKR(remainingAfter)}</span>
                  </div>
                  {isOver && (
                    <p className="text-rose-400 font-bold mt-1">⚠ Exceeds remaining salary of Rs. {formatPKR(remaining)}</p>
                  )}
                  {remainingAfter === 0 && !isOver && (
                    <p className="text-emerald-400 font-bold mt-1">✓ This will fully settle the salary.</p>
                  )}
                </div>
              );
            })()}


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
                  <span className="font-bold">- Rs. {formatPKR(Number(payAmount) || 0)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-black border-t border-emerald-900/80 pt-1.5 text-sm">
                  <span>Balance After Payout:</span>
                  <span>Rs. {formatPKR(currentDisbursingAccount.currentBalance - (Number(payAmount) || 0))}</span>
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

      {/* INDIVIDUAL EMPLOYEE ACCOUNT LEDGER MODAL */}
      {ledgerModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-950 border border-purple-800 text-purple-300">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight">
                    Individual Employee Account Ledger Statement
                  </h3>
                  {selectedLedgerData?.employee && (
                    <div className="text-xs text-purple-300 font-medium">
                      <strong className="text-white">{selectedLedgerData.employee.name}</strong> ({selectedLedgerData.employee.employeeCode || 'EMP-PIX'}) • {selectedLedgerData.employee.designation} | {selectedLedgerData.employee.department}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setLedgerModalOpen(false);
                  setSelectedLedgerData(null);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {ledgerLoading ? (
                <div className="py-12 text-center text-slate-400 font-semibold flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="animate-spin text-purple-400" size={24} />
                  Loading employee account statement...
                </div>
              ) : selectedLedgerData ? (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Total Salary Accrued
                      </div>
                      <div className="text-lg font-black text-purple-400 font-mono mt-1">
                        Rs. {formatPKR(selectedLedgerData.summary?.totalAccrued)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Total payroll obligation</div>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Total Disbursed
                      </div>
                      <div className="text-lg font-black text-emerald-400 font-mono mt-1">
                        Rs. {formatPKR(selectedLedgerData.summary?.totalPaid)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Paid via Bank / Cash</div>
                    </div>

                    <div className={`p-4 rounded-xl border text-center ${
                      selectedLedgerData.summary?.pendingBalance > 0
                        ? 'bg-amber-950/40 border-amber-800/80'
                        : 'bg-emerald-950/40 border-emerald-800/80'
                    }`}>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Salary Remaining
                      </div>
                      <div className={`text-lg font-black font-mono mt-1 ${
                        selectedLedgerData.summary?.pendingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        Rs. {formatPKR(selectedLedgerData.summary?.pendingBalance)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {selectedLedgerData.summary?.pendingBalance > 0 ? 'Outstanding Unpaid' : 'FULLY PAID ✓'}
                      </div>
                    </div>

                    {(selectedLedgerData.employee?.loanBalance ?? 0) > 0 && (
                      <div className="bg-orange-950/40 border border-orange-800/60 p-4 rounded-xl text-center">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Outstanding Loan
                        </div>
                        <div className="text-lg font-black text-orange-400 font-mono mt-1">
                          Rs. {formatPKR(selectedLedgerData.employee?.loanBalance)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Loan / Advance balance</div>
                      </div>
                    )}
                  </div>

                  {/* Ledger Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Month</th>
                          <th className="py-2.5 px-3">Voucher No.</th>
                          <th className="py-2.5 px-3">Detail / Narration</th>
                          <th className="py-2.5 px-3 text-right">Accrued (+)</th>
                          <th className="py-2.5 px-3 text-right">Disbursed (-)</th>
                          <th className="py-2.5 px-3 text-right">Pending Balance</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {selectedLedgerData.ledger?.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="py-6 text-center text-slate-500 font-semibold">
                              No ledger entries recorded for this employee.
                            </td>
                          </tr>
                        ) : (
                          selectedLedgerData.ledger?.map((entry, i) => {
                            const isAccrual = entry.type === 'SALARY_ACCRUAL';
                            return (
                              <tr key={i} className={`hover:bg-slate-900/40 transition ${isAccrual ? 'bg-slate-950' : 'bg-slate-900/20'}`}>
                                <td className="py-2.5 px-3 font-mono text-slate-300">
                                  {new Date(entry.date).toLocaleDateString('en-PK')}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-purple-400 font-mono">
                                  {entry.month}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-blue-400">
                                  {entry.voucherNo}
                                </td>
                                <td className="py-2.5 px-3 text-white">
                                  <div className={isAccrual ? 'font-bold' : ''}>{entry.detail}</div>
                                  {!isAccrual && entry.paidFromAccount && entry.paidFromAccount !== '-' && (
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      Account: {entry.paidFromAccount}
                                      {entry.paidBy ? ` • By: ${entry.paidBy}` : ''}
                                    </div>
                                  )}
                                  {isAccrual && entry.loanDeduction > 0 && (
                                    <div className="text-[10px] text-orange-400 font-mono">
                                      Gross: Rs. {formatPKR(entry.grossSalary)} − Loan Ded: Rs. {formatPKR(entry.loanDeduction)}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-300">
                                  {entry.accruedAmount > 0 ? `Rs. ${formatPKR(entry.accruedAmount)}` : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                                  {entry.paidAmount > 0 ? `Rs. ${formatPKR(entry.paidAmount)}` : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-black text-amber-300">
                                  Rs. {formatPKR(entry.runningPendingBalance)}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                                    entry.status === 'PAID'
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : entry.status === 'PARTIAL'
                                      ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                                  }`}>
                                    {entry.status === 'PARTIAL' ? 'PARTIAL' : entry.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>

              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setLedgerModalOpen(false);
                  setSelectedLedgerData(null);
                }}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffPayrollSubTab;
