import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  CreditCard,
  History,
  X,
  RefreshCw,
} from 'lucide-react';
import { staffAPI } from '../services/api.js';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
  }).format(val || 0);
};

export const StaffLoansSubTab = ({ employees = [], onRefresh }) => {
  useEffect(() => {
    onRefresh?.();
  }, []);

  const [selectedEmp, setSelectedEmp] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loanType, setLoanType] = useState('DISBURSEMENT'); // DISBURSEMENT or REPAYMENT
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Loan History Modal States
  const [historyEmp, setHistoryEmp] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const employeesWithLoans = employees.filter((e) => (e.loanBalance || 0) > 0);
  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase().trim();
    return !q || emp.name?.toLowerCase().includes(q) || emp.designation?.toLowerCase().includes(q);
  });

  const totalLoanBalance = employees.reduce((sum, e) => sum + (e.loanBalance || 0), 0);

  const handleOpenModal = (emp, type) => {
    setSelectedEmp(emp);
    setLoanType(type);
    setAmount('');
    setDescription(type === 'DISBURSEMENT' ? 'Advance Salary Disbursement' : 'Loan Cash Repayment');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenHistory = async (emp) => {
    setHistoryEmp(emp);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await staffAPI.getLoans({ employeeId: emp._id });
      setHistoryLogs(res.data || []);
    } catch (err) {
      console.error('[Loan History Error]:', err);
      setHistoryLogs([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmitLoan = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSaving(true);

    try {
      if (!selectedEmp) throw new Error('Please select an employee.');
      const numAmt = Number(amount);
      if (isNaN(numAmt) || numAmt <= 0) throw new Error('Please enter a valid positive loan amount.');

      await staffAPI.recordLoan(selectedEmp._id, {
        type: loanType,
        amount: numAmt,
        description: description.trim(),
      });

      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || 'Operation failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign size={14} /> Employee Loan & Advance Salary Management
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Staff Loan & Advance Salary Ledger
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400">Total Outstanding Loan Pool:</span>
              <span className="font-mono text-base font-black text-rose-400">Rs. {formatPKR(totalLoanBalance)}</span>
            </div>
            <button
              type="button"
              onClick={() => onRefresh?.()}
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition"
              title="Refresh Loan Balances"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex justify-between items-center pt-1">
          <div className="text-xs font-bold text-slate-400">
            Active Borrowers: <span className="text-white font-black">{employeesWithLoans.length}</span> / {employees.length} Employees
          </div>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search employee by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>
      </div>

      {/* Employee Loan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.map((emp) => {
          const hasLoan = (emp.loanBalance || 0) > 0;

          return (
            <div
              key={emp._id}
              className={`bg-slate-900 border rounded-2xl p-5 transition shadow-sm flex flex-col justify-between ${
                hasLoan ? 'border-rose-950/80 bg-slate-900/90' : 'border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-950 text-purple-400 border border-slate-800 inline-block mb-1">
                      {emp.department}
                    </span>
                    <h3 className="text-base font-black text-white">{emp.name}</h3>
                    <p className="text-xs font-semibold text-slate-400">{emp.designation}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 block">Gross Salary</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">Rs. {formatPKR(emp.grossSalary)}</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 mb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Current Loan Balance:</span>
                    <span
                      className={`font-mono text-base font-black ${
                        hasLoan ? 'text-rose-400' : 'text-slate-500'
                      }`}
                    >
                      Rs. {formatPKR(emp.loanBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOpenModal(emp, 'DISBURSEMENT')}
                    className="bg-rose-950/70 hover:bg-rose-900/90 text-rose-300 border border-rose-800/60 rounded-xl py-2 px-3 text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <ArrowUpRight size={14} /> Issue Advance
                  </button>
                  <button
                    onClick={() => handleOpenModal(emp, 'REPAYMENT')}
                    className="bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-800/60 rounded-xl py-2 px-3 text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <ArrowDownLeft size={14} /> Repay Loan
                  </button>
                </div>
                <button
                  onClick={() => handleOpenHistory(emp)}
                  className="w-full bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl py-1.5 px-3 text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <History size={14} className="text-purple-400" /> View Loan Timeline & Ledger
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Record Loan / Repayment Modal */}
      {isModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <DollarSign size={18} className={loanType === 'DISBURSEMENT' ? 'text-rose-400' : 'text-emerald-400'} />
                  {loanType === 'DISBURSEMENT' ? 'Issue Advance / Loan' : 'Record Loan Repayment'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Employee: <strong className="text-white font-bold">{selectedEmp.name}</strong> ({selectedEmp.designation})
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800/60 text-xs font-bold text-rose-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmitLoan} className="space-y-3.5 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400 font-semibold">Current Loan Balance:</span>
                <span className="font-mono text-sm font-black text-rose-400">Rs. {formatPKR(selectedEmp.loanBalance)}</span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  {loanType === 'DISBURSEMENT' ? 'Advance Amount Issued (PKR) *' : 'Repayment Amount (PKR) *'}
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 5000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Description / Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Emergency advance, Fuel loan"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-4 py-2 rounded-xl text-white font-bold transition disabled:opacity-50 ${
                    loanType === 'DISBURSEMENT'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {saving ? 'Processing...' : loanType === 'DISBURSEMENT' ? 'Issue Loan' : 'Record Repayment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan History Timeline Modal */}
      {isHistoryOpen && historyEmp && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <History size={18} className="text-purple-400" />
                  Loan & Advance History Ledger
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Employee: <strong className="text-white font-bold">{historyEmp.name}</strong> ({historyEmp.designation}) | Outstanding Balance: <strong className="text-rose-400 font-mono font-bold">Rs. {formatPKR(historyEmp.loanBalance)}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {historyLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading loan timeline...</div>
              ) : historyLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 font-medium">
                  No loan transactions recorded for this employee yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                        <th className="py-2.5 px-3">Date & Time</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Amount (PKR)</th>
                        <th className="py-2.5 px-3 text-right">Balance (Prev → New)</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Handled By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {historyLogs.map((log) => {
                        const isDisbursement = log.type === 'DISBURSEMENT';
                        const createdDate = new Date(log.date || log.createdAt);
                        const dateStr = createdDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        const operatorName = log.createdBy?.name || log.operatorName || 'System Operator';

                        return (
                          <tr key={log._id} className="hover:bg-slate-800/40 transition">
                            <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                              <span className="font-bold text-white block">{dateStr}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{timeStr}</span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {isDisbursement ? (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded border inline-block bg-rose-950/80 text-rose-300 border-rose-800/60">
                                  📤 ADVANCE ISSUED
                                </span>
                              ) : log.payrollMonth ? (
                                <div className="space-y-0.5">
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded border inline-block bg-amber-950/80 text-amber-300 border-amber-700/60">
                                    📋 SALARY DEDUCTION
                                  </span>
                                  <div className="text-[9px] text-purple-400 font-semibold">
                                    Month: {log.payrollMonth}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded border inline-block bg-emerald-950/80 text-emerald-300 border-emerald-800/60">
                                  💵 CASH REPAYMENT
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black whitespace-nowrap">
                              <span className={isDisbursement ? 'text-rose-400' : 'text-emerald-400'}>
                                {isDisbursement ? '+' : '-'} Rs. {formatPKR(log.amount)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                              Rs. {formatPKR(log.previousBalance)} → <strong className="text-white">Rs. {formatPKR(log.newBalance)}</strong>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate">
                              {log.description || (isDisbursement ? 'Advance Salary' : 'Loan Recovery')}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="text-[11px] font-bold text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                👤 {operatorName}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition text-xs"
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

export default StaffLoansSubTab;
