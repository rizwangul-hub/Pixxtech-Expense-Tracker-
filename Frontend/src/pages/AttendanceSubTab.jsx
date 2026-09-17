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
  Printer,
  Download,
} from 'lucide-react';
import { attendanceAPI } from '../services/api.js';

export const AttendanceSubTab = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeLocationTab, setActiveLocationTab] = useState('IT Office'); // 'IT Office' | 'Bahria Town Office'
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

  // Filter attendance rows by selected active location tab
  // Excludes Security Guard, 4A Home, and non-attendance locations
  const filteredRows = attendanceRows.filter((r) => {
    const dept = r.department || '';
    const desig = r.designation || '';

    if (activeLocationTab === 'IT Office') {
      return dept === 'IT Office';
    }
    if (activeLocationTab === 'Bahria Town Office') {
      return dept === 'Bahria Town Office' || dept === 'Admin Rider' || desig === 'Admin Rider';
    }
    return false;
  });

  const handleRowChange = (empId, field, val) => {
    setAttendanceRows((prev) =>
      prev.map((r) => {
        if (r.employeeId === empId) {
          const updated = { ...r, [field]: val };

          // Re-calculate late minutes if arrivalTime or shiftOpeningTime changes
          if (field === 'arrivalTime' || field === 'shiftOpeningTime') {
            const arr = field === 'arrivalTime' ? val : r.arrivalTime;
            const open = field === 'shiftOpeningTime' ? val : r.shiftOpeningTime;

            if (arr && open) {
              const [openH, openM] = open.split(':').map(Number);
              const [arrH, arrM] = arr.split(':').map(Number);
              const openMins = openH * 60 + openM;
              const arrMins = arrH * 60 + arrM;

              // Grace period: 15 mins
              const graceLimit = openMins + 15;
              if (arrMins > graceLimit) {
                updated.lateMinutes = arrMins - openMins;
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
      prev.map((r) => {
        // Only update rows belonging to active tab
        const dept = r.department || '';
        const desig = r.designation || '';
        const isMatch =
          activeLocationTab === 'IT Office'
            ? dept === 'IT Office'
            : dept === 'Bahria Town Office' || dept === 'Admin Rider' || desig === 'Admin Rider';

        if (isMatch) {
          return {
            ...r,
            status: 'PRESENT',
            arrivalTime: r.arrivalTime || r.shiftOpeningTime || '12:30',
            lateMinutes: 0,
          };
        }
        return r;
      })
    );
  };

  const handleSaveDaily = async () => {
    try {
      setSaving(true);
      setMsg({ type: '', text: '' });

      const records = attendanceRows.map((r) => ({
        employeeId: r.employeeId,
        shiftOpeningTime: r.shiftOpeningTime || '12:30',
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

  const handlePrintDailySheet = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow pop-ups to print attendance sheet.');
      return;
    }

    const rowsHtml = filteredRows
      .map(
        (r, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-weight: bold;">${r.name}</td>
        <td>${r.designation}</td>
        <td style="text-align: center; font-family: monospace;">${r.shiftOpeningTime || '12:30'}</td>
        <td style="text-align: center; font-family: monospace;">${r.arrivalTime || '—'}</td>
        <td style="text-align: center; font-weight: bold; color: ${r.lateMinutes > 0 ? '#dc2626' : '#16a34a'};">
          ${r.lateMinutes > 0 ? `+${r.lateMinutes} mins` : '—'}
        </td>
        <td style="text-align: center; font-weight: bold;">${r.status}</td>
        <td>${r.remarks || ''}</td>
      </tr>
    `
      )
      .join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Attendance Sheet - ${activeLocationTab} (${selectedDate})</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #000; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
        .company { font-size: 22px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
        .subtitle { font-size: 14px; font-weight: 700; margin-top: 4px; text-transform: uppercase; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 12px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
        th { background: #f1f5f9; text-transform: uppercase; font-size: 11px; }
        .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; }
        .sig { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company">PIXX TECHNOLOGIES PAKISTAN</div>
        <div class="subtitle">DAILY STAFF ATTENDANCE SHEET — ${activeLocationTab.toUpperCase()}</div>
      </div>
      <div class="meta">
        <span>WORKPLACE: ${activeLocationTab}</span>
        <span>DATE: ${selectedDate}</span>
        <span>TOTAL STAFF: ${filteredRows.length}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">Sr.</th>
            <th>Employee Name</th>
            <th>Designation</th>
            <th style="text-align: center;">Shift Start</th>
            <th style="text-align: center;">Arrival Time</th>
            <th style="text-align: center;">Late Mins</th>
            <th style="text-align: center;">Status</th>
            <th>Remarks / Signature</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div class="footer">
        <div class="sig">Recorded By (HR)</div>
        <div class="sig">Verified By (Manager)</div>
      </div>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Daily Attendance Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={14} /> Daily Staff Attendance
            </div>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              Daily Employee Arrival & Shift Matrix
            </h2>
          </div>

          {/* Date Picker & Controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <Calendar size={14} className="text-blue-400" />
              <span className="text-slate-400 font-semibold">Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-bold font-mono focus:outline-none"
              />
            </div>

            <button
              onClick={handleMarkAllPresent}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1"
            >
              <CheckCheck size={14} className="text-emerald-400" /> Mark All Present
            </button>

            <button
              onClick={handlePrintDailySheet}
              className="bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5"
              title="Print / Export Daily Attendance Sheet PDF"
            >
              <Printer size={14} /> Print Sheet (PDF)
            </button>

            <button
              onClick={handleSaveDaily}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Attendance'}
            </button>
          </div>
        </div>

        {/* Location Workplace Tabs (IT Office vs Bahria Town Office) */}
        <div className="flex items-center gap-2 pt-1 border-b border-slate-800/80 pb-3">
          <button
            onClick={() => setActiveLocationTab('IT Office')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeLocationTab === 'IT Office'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 size={15} /> IT Office Attendance ({attendanceRows.filter((r) => r.department === 'IT Office').length})
          </button>

          <button
            onClick={() => setActiveLocationTab('Bahria Town Office')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeLocationTab === 'Bahria Town Office'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 size={15} /> Bahria Town Office & Admin Rider ({attendanceRows.filter((r) => r.department === 'Bahria Town Office' || r.department === 'Admin Rider' || r.designation === 'Admin Rider').length})
          </button>
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
                <th className="py-3 px-4">Designation</th>
                <th className="py-3 px-4 text-center">Shift Start (Editable)</th>
                <th className="py-3 px-4 text-center">Time Reached (Arrival)</th>
                <th className="py-3 px-4 text-center">Late Mins</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Remarks / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-semibold">
                    Loading daily attendance sheet...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 font-semibold">
                    No staff assigned to {activeLocationTab}.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  return (
                    <tr key={row.employeeId} className="hover:bg-slate-900/60 transition">
                      <td className="py-3 px-4 font-bold text-white text-sm">
                        {row.name}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-300">{row.designation}</div>
                        <div className="text-[10px] text-purple-400 font-bold">{row.department}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="time"
                          value={row.shiftOpeningTime || '12:30'}
                          onChange={(e) => handleRowChange(row.employeeId, 'shiftOpeningTime', e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-amber-300 font-mono font-bold text-center focus:outline-none focus:border-amber-500"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="time"
                          value={row.arrivalTime}
                          onChange={(e) => handleRowChange(row.employeeId, 'arrivalTime', e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono font-bold text-center focus:outline-none focus:border-blue-500"
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
                          placeholder="Remarks..."
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
