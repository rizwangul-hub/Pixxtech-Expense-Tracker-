import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  AlertCircle,
  FileText,
  Building2,
} from 'lucide-react';
import { staffAPI } from '../services/api.js';

export function StaffLeavesSubTab() {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Form State
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [days, setDays] = useState('1');
  const [leaveType, setLeaveType] = useState('CASUAL');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [leaveRes, empRes] = await Promise.all([
        staffAPI.getLeaves({ status: statusFilter !== 'ALL' ? statusFilter : undefined }),
        staffAPI.getEmployees({ status: 'ACTIVE' }),
      ]);

      if (leaveRes?.success && leaveRes.data) {
        setLeaves(leaveRes.data);
      }
      if (empRes?.success && empRes.data) {
        setEmployees(empRes.data.employees || []);
      }
    } catch (err) {
      console.error('Failed to load leave records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!selectedEmployee || !startDate || !endDate || !days) {
      alert('Please fill out all required leave fields.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await staffAPI.createLeave({
        employeeId: selectedEmployee,
        startDate,
        endDate,
        days: Number(days),
        leaveType,
        reason,
      });

      if (res?.success) {
        alert('Leave request recorded successfully!');
        setShowApplyModal(false);
        setSelectedEmployee('');
        setReason('');
        setDays('1');
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (leaveId, newStatus) => {
    try {
      const res = await staffAPI.updateLeaveStatus(leaveId, { status: newStatus });
      if (res?.success) {
        fetchData();
      }
    } catch (err) {
      alert('Failed to update leave status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Policy Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-950 px-2.5 py-0.5 rounded-md border border-amber-800/60">
                Staff Leave Policy
              </span>
              <span className="text-xs text-slate-400 font-semibold">
                Default 2 Allowed Leaves/Month per Employee
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <Calendar className="text-amber-400" size={24} /> Staff Leave & LOP Management
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Leaves taken beyond the employee's allowed monthly limit automatically trigger Loss of Pay (LOP) deductions during payroll processing.
            </p>
          </div>

          <button
            onClick={() => setShowApplyModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-md self-start md:self-auto"
          >
            <Plus size={16} /> Record Employee Leave
          </button>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800">
          {['ALL', 'APPROVED', 'PENDING', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === st
                  ? 'bg-slate-800 text-amber-400 border border-amber-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {st === 'ALL' ? 'All Requests' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Leave Records List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500 font-semibold animate-pulse">
            Loading staff leave records...
          </div>
        ) : leaves.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="mx-auto text-slate-600 mb-3" size={36} />
            <p className="text-sm text-slate-400 font-semibold">No leave records found for this filter.</p>
            <p className="text-xs text-slate-600 mt-1">Click 'Record Employee Leave' above to create one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase font-black tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Workplace</th>
                  <th className="py-3 px-4">Leave Type</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-semibold text-slate-300">
                {leaves.map((l) => (
                  <tr key={l._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-white">
                      {l.employeeId?.name || 'Employee'}
                      <span className="block text-[11px] font-normal text-slate-500">
                        {l.employeeId?.designation}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {l.employeeId?.department || 'IT Office'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 border border-slate-700 text-amber-300">
                        {l.leaveType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-mono">
                      {new Date(l.startDate).toLocaleDateString('en-GB')} to {new Date(l.endDate).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white font-mono">
                      {l.days} Day(s)
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 max-w-xs truncate">
                      {l.reason || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4">
                      {l.status === 'APPROVED' && (
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-950 text-emerald-400 border border-emerald-800/60 inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> Approved
                        </span>
                      )}
                      {l.status === 'REJECTED' && (
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-rose-950 text-rose-400 border border-rose-800/60 inline-flex items-center gap-1">
                          <XCircle size={12} /> Rejected
                        </span>
                      )}
                      {l.status === 'PENDING' && (
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-amber-950 text-amber-400 border border-amber-800/60 inline-flex items-center gap-1">
                          <Clock size={12} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {l.status !== 'APPROVED' && (
                        <button
                          onClick={() => handleUpdateStatus(l._id, 'APPROVED')}
                          className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-[11px] font-bold transition"
                        >
                          Approve
                        </button>
                      )}
                      {l.status !== 'REJECTED' && (
                        <button
                          onClick={() => handleUpdateStatus(l._id, 'REJECTED')}
                          className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-800 text-[11px] font-bold transition"
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leave Record Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Calendar className="text-amber-400" size={20} /> Record Employee Leave
            </h3>
            <form onSubmit={handleApplyLeave} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Select Employee *</label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-semibold focus:outline-none focus:border-amber-500"
                  required
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.name} ({emp.designation} - {emp.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">End Date *</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Total Days *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Leave Category</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="CASUAL">Casual Leave</option>
                    <option value="SICK">Sick Leave</option>
                    <option value="ANNUAL">Annual Leave</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Reason / Notes</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for leave..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition"
                >
                  {submitting ? 'Saving...' : 'Submit Leave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffLeavesSubTab;
