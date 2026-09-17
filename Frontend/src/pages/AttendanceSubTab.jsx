import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Save,
  CheckCheck,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { attendanceAPI, staffAPI } from '../services/api.js';

export const AttendanceSubTab = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shiftOpeningTime, setShiftOpeningTime] = useState('12:30');
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Monthly Summary State
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const fetchDailyAttendance = async () => {
    try {
      setLoading(true);
      const res = await attendanceAPI.getDailyAttendance({ date: selectedDate });
      if (res?.success && res.data) {
        setAttendanceRows(res.data.attendance || []);
        if (res.data.attendance?.length > 0 && res.data.attendance[0].shiftOpeningTime) {
          setShiftOpeningTime(res.data.attendance[0].shiftOpeningTime);
        }
      }
    } catch (err) {
      console.error('Failed to load daily attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlySummary = async () => {
    try {
      setSummaryLoading(true);
      const res = await attendanceAPI.getMonthlyAttendanceSummary({ month: selectedMonth });
      if (res?.success && res.data) {
        setMonthlySummary(res.data.summary || []);
      }
    } catch (err) {
      console.error('Failed to load monthly attendance summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyAttendance();
  }, [selectedDate]);

  useEffect(() => {
    fetchMonthlySummary();
  }, [selectedMonth]);

  const handleRowChange = (empId, field, val) => {
    setAttendanceRows((prev) =>
      prev.map((r) => {
        if (r.employeeId === empId) {
          const updated = { ...r, [field]: val };
          // If shift opening time or arrival time changed, re-check status/late
          if (field === 'arrivalTime' || field === 'shiftOpeningTime') {
            const arr = field === 'arrivalTime' ? val : r.arrivalTime;
            const open = field === 'shiftOpeningTime' ? val : shiftOpeningTime;
            if (arr && open) {
              const [openH, openM] = open.split(':').map(Number);
              const [arrH, arrM] = arr.split(':').map(Number);
              const diff = arrH * 60 + arrM - (openH * 60 + openM);
              if (diff > 0) {
                updated.lateMinutes = diff;
                updated.status = 'LATE';
              } else {
                updated.lateMinutes = 0;
                if (updated.status === 'LATE') updated.status = 'PRESENT';
              }
            }
          }
          return updated;
        }
        return r;
      })
    );
  };

  const handleMarkAllPresent = () => {
    setAttendanceRows((prev) =>
      prev.map((r) => ({
        ...r,
        status: 'PRESENT',
        arrivalTime: r.arrivalTime || shiftOpeningTime,
        lateMinutes: 0,
      }))
    );
  };

  const handleSaveDaily = async () => {
    try {
      setSaving(true);
      setMsg({ type: '', text: '' });

      const records = attendanceRows.map((r) => ({
        employeeId: r.employeeId,
        shiftOpeningTime: shiftOpeningTime,
        arrivalTime: r.arrivalTime || '',
        status: r.status,
        remarks: r.remarks || '',
      }));

      await attendanceAPI.bulkMarkAttendance({
        dateStr: selectedDate,
        records,
      });

      setMsg({ type: 'success', text: `Daily attendance for ${selectedDate} saved successfully.` });
      fetchDailyAttendance();
      fetchMonthlySummary();
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to save attendance.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Daily Attendance Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={14} /> Daily Time Entry & Attendance
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Daily Employee Arrival & Shift Matrix
            </h2>
          </div>

          {/* Date Picker & Global Shift Opening Time Selector */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Calendar size={14} className="text-blue-400" />
              <span className="text-slate-400 font-semibold">Attendance Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-bold font-mono focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Clock size={14} className="text-amber-400" />
              <span className="text-slate-400 font-semibold">Office Opening Time:</span>
              <input
                type="time"
                value={shiftOpeningTime}
                onChange={(e) => setShiftOpeningTime(e.target.value)}
                className="bg-transparent text-amber-300 font-mono font-bold focus:outline-none"
              />
            </div>

            <button
              onClick={handleMarkAllPresent}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1"
            >
              <CheckCheck size={14} className="text-emerald-400" /> Mark All Present
            </button>

            <button
              onClick={handleSaveDaily}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Daily Sheet'}
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

        {/* Attendance Matrix Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Employee Name</th>
                <th className="py-3 px-4">Designation & Location</th>
                <th className="py-3 px-4">Shift Start</th>
                <th className="py-3 px-4">Time Reached (Arrival)</th>
                <th className="py-3 px-4 text-center">Late Mins</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Remarks / Leave Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-semibold">
                    Loading daily attendance sheet...
                  </td>
                </tr>
              ) : attendanceRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-semibold">
                    No active employees registered.
                  </td>
                </tr>
              ) : (
                attendanceRows.map((row) => {
                  const isLate = row.status === 'LATE' || row.lateMinutes > 0;
                  const isAbsent = row.status === 'ABSENT';

                  return (
                    <tr key={row.employeeId} className="hover:bg-slate-900/60 transition">
                      <td className="py-3 px-4 font-bold text-white text-sm">
                        {row.name}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-300">{row.designation}</div>
                        <div className="text-[10px] text-purple-400 font-bold">{row.department}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {shiftOpeningTime}
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="time"
                          value={row.arrivalTime}
                          onChange={(e) => handleRowChange(row.employeeId, 'arrivalTime', e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.lateMinutes > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-mono font-extrabold text-[11px] border border-rose-800/60">
                            +{row.lateMinutes} mins
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={row.status}
                          onChange={(e) => handleRowChange(row.employeeId, 'status', e.target.value)}
                          className={`border rounded-lg px-2.5 py-1 text-xs font-extrabold focus:outline-none ${
                            row.status === 'PRESENT'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : row.status === 'LATE'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : row.status === 'ABSENT'
                              ? 'bg-rose-950 text-rose-300 border-rose-800'
                              : row.status === 'LEAVE'
                              ? 'bg-blue-950 text-blue-300 border-blue-800'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          <option value="PRESENT">PRESENT</option>
                          <option value="LATE">LATE</option>
                          <option value="HALF_DAY">HALF DAY</option>
                          <option value="LEAVE">ALLOWED LEAVE</option>
                          <option value="ABSENT">ABSENT / LOP</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          placeholder="e.g. Approved leave, Traffic delay"
                          value={row.remarks}
                          onChange={(e) => handleRowChange(row.employeeId, 'remarks', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Aggregate Attendance Metrics Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-emerald-400" />
              Monthly Aggregate Attendance Summary
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracks total days, present days, late arrivals, allowed leaves & LOP days per month.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">Select Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono font-bold focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4 text-center">Month Days</th>
                <th className="py-3 px-4 text-center">Present Days</th>
                <th className="py-3 px-4 text-center">Late Arrivals</th>
                <th className="py-3 px-4 text-center">Allowed Leaves</th>
                <th className="py-3 px-4 text-center">LOP (Absent Days)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {summaryLoading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-semibold">
                    Calculating monthly attendance metrics...
                  </td>
                </tr>
              ) : monthlySummary.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-semibold">
                    No attendance records for {selectedMonth}.
                  </td>
                </tr>
              ) : (
                monthlySummary.map((sum) => (
                  <tr key={sum.employeeId} className="hover:bg-slate-900/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white text-sm">{sum.name}</div>
                      <div className="text-[10px] text-slate-400">{sum.designation}</div>
                    </td>
                    <td className="py-3 px-4 font-bold text-purple-400">{sum.department}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-300">{sum.totalDays}</td>
                    <td className="py-3 px-4 text-center font-mono font-extrabold text-emerald-400">{sum.presentDays}</td>
                    <td className="py-3 px-4 text-center font-mono font-extrabold text-amber-400">{sum.lateDays}</td>
                    <td className="py-3 px-4 text-center font-mono font-extrabold text-sky-400">{sum.leaveDays}</td>
                    <td className="py-3 px-4 text-center font-mono font-extrabold text-rose-400">
                      {sum.lopDays > 0 ? `${sum.lopDays} days` : '0'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AttendanceSubTab;
