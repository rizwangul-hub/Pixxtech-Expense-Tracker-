import React, { useState } from 'react';
import {
  Users,
  Plus,
  Search,
  Building2,
  CreditCard,
  Phone,
  DollarSign,
  Edit2,
  CheckCircle,
  X,
  Sparkles,
} from 'lucide-react';
import { staffAPI } from '../services/api.js';

const DEPARTMENTS = [
  'ALL',
  'Bahria Town Office',
  'IT Office',
  'Security Guard',
  '4A Home',
  'Admin Rider',
  'Family',
  'Other',
];

const formatPKR = (val) => {
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
  }).format(val || 0);
};

export const StaffDirectorySubTab = ({
  employees = [],
  summary = null,
  onRefresh,
  userIsAdmin = false,
}) => {
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    designation: '',
    department: 'IT Office',
    basicSalary: '0',
    fuelAllowance: '0',
    foodAllowance: '0',
    mobileAllowance: '0',
    performanceAllowance: '0',
    otherAllowances: '0',
    accountTitle: '',
    ibanNumber: '',
    bankName: '',
    initialLoanBalance: '0',
    notes: '',
  });

  const filteredEmployees = employees.filter((emp) => {
    const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      emp.name?.toLowerCase().includes(q) ||
      emp.designation?.toLowerCase().includes(q) ||
      emp.accountTitle?.toLowerCase().includes(q) ||
      emp.bankName?.toLowerCase().includes(q);
    return matchesDept && matchesQuery;
  });

  const handleOpenCreate = () => {
    setEditingEmp(null);
    setFormData({
      name: '',
      designation: '',
      department: 'IT Office',
      basicSalary: '0',
      fuelAllowance: '0',
      foodAllowance: '0',
      mobileAllowance: '0',
      performanceAllowance: '0',
      otherAllowances: '0',
      accountTitle: '',
      ibanNumber: '',
      bankName: '',
      initialLoanBalance: '0',
      notes: '',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp) => {
    setEditingEmp(emp);
    setFormData({
      name: emp.name || '',
      designation: emp.designation || '',
      department: emp.department || 'IT Office',
      basicSalary: String(emp.basicSalary ?? 0),
      fuelAllowance: String(emp.fuelAllowance ?? 0),
      foodAllowance: String(emp.foodAllowance ?? 0),
      mobileAllowance: String(emp.mobileAllowance ?? 0),
      performanceAllowance: String(emp.performanceAllowance ?? 0),
      otherAllowances: String(emp.otherAllowances ?? 0),
      accountTitle: emp.accountTitle || '',
      ibanNumber: emp.ibanNumber || '',
      bankName: emp.bankName || '',
      initialLoanBalance: String(emp.loanBalance ?? 0),
      notes: emp.notes || '',
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSaving(true);

    try {
      if (!formData.name.trim()) throw new Error('Employee name is required.');
      if (!formData.designation.trim()) throw new Error('Designation is required.');

      const payload = {
        name: formData.name.trim(),
        designation: formData.designation.trim(),
        department: formData.department,
        basicSalary: Number(formData.basicSalary) || 0,
        fuelAllowance: Number(formData.fuelAllowance) || 0,
        foodAllowance: Number(formData.foodAllowance) || 0,
        mobileAllowance: Number(formData.mobileAllowance) || 0,
        performanceAllowance: Number(formData.performanceAllowance) || 0,
        otherAllowances: Number(formData.otherAllowances) || 0,
        accountTitle: formData.accountTitle.trim(),
        ibanNumber: formData.ibanNumber.trim(),
        bankName: formData.bankName.trim(),
        initialLoanBalance: Number(formData.initialLoanBalance) || 0,
        notes: formData.notes.trim(),
      };

      if (editingEmp) {
        await staffAPI.updateEmployee(editingEmp._id, payload);
      } else {
        await staffAPI.createEmployee(payload);
      }

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
      {/* Top Controls & Summary Pills */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users size={14} /> Employee Directory & Profiles
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Pixx Technologies Staff Directory
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenCreate}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
            >
              <Plus size={15} /> Add New Employee
            </button>
          </div>
        </div>

        {/* Stats Row */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-semibold">Total Staff</span>
              <div className="text-lg font-black text-white mt-0.5">{summary.totalEmployees}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-semibold">Total Basic Salaries</span>
              <div className="text-lg font-black text-slate-200 mt-0.5">Rs. {formatPKR(summary.totalBasicSalary)}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-semibold">Total Monthly Gross</span>
              <div className="text-lg font-black text-emerald-400 mt-0.5">Rs. {formatPKR(summary.totalGrossSalary)}</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-semibold">Outstanding Loans</span>
              <div className="text-lg font-black text-rose-400 mt-0.5">Rs. {formatPKR(summary.totalLoanBalance)}</div>
            </div>
          </div>
        )}

        {/* Search & Dept Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {/* Department Pills */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {DEPARTMENTS.map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  selectedDept === dept
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search employee, title, bank..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Employees Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.length === 0 ? (
          <div className="col-span-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs font-semibold">
            No employees found matching selected workplace or query.
          </div>
        ) : (
          filteredEmployees.map((emp) => (
            <div
              key={emp._id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between shadow-sm relative group"
            >
              <div>
                {/* Header info */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3 mb-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 inline-block mb-1.5">
                      {emp.department}
                    </span>
                    <h3 className="text-base font-black text-white tracking-tight">{emp.name}</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5">{emp.designation}</p>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(emp)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    title="Edit Employee Profile"
                  >
                    <Edit2 size={13} />
                  </button>
                </div>

                {/* Salary Package Breakdown */}
                <div className="space-y-1.5 text-xs mb-4 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex justify-between text-slate-400">
                    <span>Basic Salary:</span>
                    <span className="font-mono font-bold text-slate-200">Rs. {formatPKR(emp.basicSalary)}</span>
                  </div>
                  {emp.fuelAllowance > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Fuel Allowance:</span>
                      <span className="font-mono font-bold text-emerald-400">+ Rs. {formatPKR(emp.fuelAllowance)}</span>
                    </div>
                  )}
                  {emp.foodAllowance > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Food Allowance:</span>
                      <span className="font-mono font-bold text-emerald-400">+ Rs. {formatPKR(emp.foodAllowance)}</span>
                    </div>
                  )}
                  {emp.mobileAllowance > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Mobile Allowance:</span>
                      <span className="font-mono font-bold text-emerald-400">+ Rs. {formatPKR(emp.mobileAllowance)}</span>
                    </div>
                  )}
                  {emp.performanceAllowance > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Performance Allowance:</span>
                      <span className="font-mono font-bold text-emerald-400">+ Rs. {formatPKR(emp.performanceAllowance)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-300 font-bold border-t border-slate-800 pt-1.5">
                    <span>Gross Salary:</span>
                    <span className="font-mono text-sm text-emerald-400">Rs. {formatPKR(emp.grossSalary)}</span>
                  </div>
                </div>

                {/* Bank Account Information */}
                <div className="text-xs space-y-1 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40">
                  <div className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Bank Details</div>
                  <div className="font-bold text-slate-300 truncate">{emp.accountTitle || emp.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">{emp.ibanNumber || 'No IBAN Added'}</div>
                  <div className="text-[11px] text-purple-400 font-semibold">{emp.bankName || 'Cash / Bank'}</div>
                </div>
              </div>

              {/* Loan status footer */}
              {emp.loanBalance > 0 && (
                <div className="mt-4 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Advance / Loan:</span>
                  <span className="font-mono font-bold text-rose-400">Rs. {formatPKR(emp.loanBalance)}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Employee Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Users size={18} className="text-purple-400" />
                {editingEmp ? 'Edit Employee Package' : 'Add New Employee'}
              </h3>
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

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Employee Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Faiz Mujahid"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Designation *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Graphic Designer"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Workplace Location / Department *</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-purple-500"
                >
                  <option value="Bahria Town Office">Bahria Town Office (Office 4C)</option>
                  <option value="IT Office">IT Office (Amin Park)</option>
                  <option value="Security Guard">Security Guard</option>
                  <option value="4A Home">4A Home</option>
                  <option value="Admin Rider">Admin Rider</option>
                  <option value="Family">Family</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Salary & Allowances */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-extrabold uppercase text-purple-400 tracking-wider">Salary & Allowances (PKR)</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-0.5">Basic Salary</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.basicSalary}
                      onChange={(e) => setFormData({ ...formData, basicSalary: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Fuel Allowance</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.fuelAllowance}
                      onChange={(e) => setFormData({ ...formData, fuelAllowance: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Food Allowance</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.foodAllowance}
                      onChange={(e) => setFormData({ ...formData, foodAllowance: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Performance / Other</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.performanceAllowance}
                      onChange={(e) => setFormData({ ...formData, performanceAllowance: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Bank Transfer Details */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-extrabold uppercase text-purple-400 tracking-wider">Bank Account Info</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-0.5">Account Title</label>
                    <input
                      type="text"
                      placeholder="Account Title"
                      value={formData.accountTitle}
                      onChange={(e) => setFormData({ ...formData, accountTitle: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-0.5">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Allied Bank / Meezan"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-semibold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">IBAN Number / Account No</label>
                  <input
                    type="text"
                    placeholder="PK50MEZN..."
                    value={formData.ibanNumber}
                    onChange={(e) => setFormData({ ...formData, ibanNumber: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
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
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingEmp ? 'Update Package' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDirectorySubTab;
