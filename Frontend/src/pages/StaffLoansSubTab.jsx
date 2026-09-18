import React, { useState } from 'react';
import {
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  CreditCard,
  History,
  X,
} from 'lucide-react';
import { staffAPI } from '../services/api.js';

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
  }).format(val || 0);
};

export const StaffLoansSubTab = ({ employees = [], onRefresh }) => {
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loanType, setLoanType] = useState('DISBURSEMENT'); // DISBURSEMENT or REPAYMENT
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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

          <div className="flex items-center gap-3">
            <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400">Total Outstanding Loan Pool:</span>
              <span className="font-mono text-base font-black text-rose-400">Rs. {formatPKR(totalLoanBalance)}</span>
            </div>
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
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
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
    </div>
  );
};

export default StaffLoansSubTab;
