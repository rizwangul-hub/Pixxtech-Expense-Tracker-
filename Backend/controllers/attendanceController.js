import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Helper to calculate late minutes between arrivalTime and shiftOpeningTime (HH:mm format)
 * Rule:
 * 15-minute grace period:
 * If arrival <= shiftOpeningTime + 15 minutes (e.g. 12:30 shift, arrived <= 12:45), late = 0 mins.
 * If arrival > shiftOpeningTime + 15 minutes (e.g. 12:50), late = arrival - (shiftStart + 15) = 5 mins.
 */
const calculateLateMinutes = (arrivalTime, shiftOpeningTime) => {
  if (!arrivalTime || !shiftOpeningTime) return 0;
  const [openH, openM] = shiftOpeningTime.split(':').map(Number);
  const [arrH, arrM] = arrivalTime.split(':').map(Number);

  if (isNaN(openH) || isNaN(openM) || isNaN(arrH) || isNaN(arrM)) return 0;

  const openTotal = openH * 60 + openM;
  const arrTotal = arrH * 60 + arrM;

  const graceLimit = openTotal + 15;
  if (arrTotal > graceLimit) {
    return arrTotal - graceLimit;
  }
  return 0;
};

/**
 * @desc    Get daily attendance entries for a specific date
 * @route   GET /api/staff/attendance/daily
 * @access  Private
 */
export const getDailyAttendance = async (req, res) => {
  try {
    const { date, department } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    const empQuery = { isActive: true };
    if (department && department !== 'ALL') empQuery.department = department;

    const employees = await Employee.find(empQuery).sort({ department: 1, name: 1 }).lean();
    const existingAttendance = await Attendance.find({ dateStr }).lean();

    const attMap = new Map();
    existingAttendance.forEach((att) => {
      attMap.set(att.employeeId.toString(), att);
    });

    const rows = employees.map((emp) => {
      const att = attMap.get(emp._id.toString());
      const shiftOpeningTime = att?.shiftOpeningTime || emp.shiftOpeningTime || '12:30';
      const arrivalTime = att?.arrivalTime || '';

      // Default status:
      // If attendance already recorded, use that status.
      // If not yet recorded and date is before employee joiningDate, default to NOT_JOINED!
      let status = att ? att.status : 'PRESENT';
      if (!att && emp.joiningDate) {
        const empJoinDateStr = new Date(emp.joiningDate).toISOString().split('T')[0];
        if (dateStr < empJoinDateStr) {
          status = 'NOT_JOINED';
        }
      }

      let lateMinutes = 0;
      if (status !== 'ABSENT' && status !== 'LEAVE' && status !== 'NOT_JOINED') {
        if (arrivalTime && shiftOpeningTime) {
          lateMinutes = calculateLateMinutes(arrivalTime, shiftOpeningTime);
        } else {
          lateMinutes = att?.lateMinutes || 0;
        }
      }

      if (status !== 'ABSENT' && status !== 'LEAVE' && status !== 'HALF_DAY' && status !== 'NOT_JOINED') {
        status = lateMinutes > 0 ? 'LATE' : 'PRESENT';
      }

      return {
        employeeId: emp._id,
        name: emp.name,
        designation: emp.designation,
        department: emp.department,
        joiningDate: emp.joiningDate,
        dateStr,
        shiftOpeningTime,
        arrivalTime,
        status,
        lateMinutes,
        remarks: att?.remarks || '',
        attendanceId: att?._id || null,
      };
    });

    return apiSuccess(res, { dateStr, attendance: rows }, `Daily attendance for ${dateStr}.`);
  } catch (error) {
    console.error('[Get Daily Attendance Error]:', error);
    return apiError(res, 'Failed to fetch daily attendance.', 500);
  }
};

/**
 * @desc    Mark / Update attendance for an employee
 * @route   POST /api/staff/attendance/mark
 * @access  Private
 */
export const markAttendance = async (req, res) => {
  try {
    const { employeeId, dateStr, shiftOpeningTime = '12:30', arrivalTime = '', status = 'PRESENT', lateMinutes, remarks = '' } = req.body;

    if (!employeeId || !dateStr) {
      return apiError(res, 'Employee ID and date string (YYYY-MM-DD) are required.', 400);
    }

    let lateMins = 0;
    if (status !== 'ABSENT' && status !== 'LEAVE' && status !== 'NOT_JOINED') {
      if (arrivalTime && shiftOpeningTime) {
        lateMins = calculateLateMinutes(arrivalTime, shiftOpeningTime);
      } else if (lateMinutes !== undefined && !isNaN(Number(lateMinutes))) {
        lateMins = Math.max(0, Number(lateMinutes));
      }
    }

    const finalStatus =
      status === 'ABSENT' || status === 'LEAVE' || status === 'HALF_DAY' || status === 'NOT_JOINED'
        ? status
        : lateMins > 0
        ? 'LATE'
        : 'PRESENT';

    const dateObj = new Date(dateStr);

    const att = await Attendance.findOneAndUpdate(
      { employeeId, dateStr },
      {
        employeeId,
        date: dateObj,
        dateStr,
        shiftOpeningTime,
        arrivalTime,
        status: finalStatus,
        lateMinutes: lateMins,
        remarks: remarks.trim(),
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    return apiSuccess(res, att, `Attendance marked for employee.`);
  } catch (error) {
    console.error('[Mark Attendance Error]:', error);
    return apiError(res, 'Failed to mark attendance.', 500);
  }
};

/**
 * @desc    Bulk mark attendance for multiple employees for a given date
 * @route   POST /api/staff/attendance/bulk-mark
 * @access  Private
 */
export const bulkMarkAttendance = async (req, res) => {
  try {
    const { dateStr, records = [] } = req.body;

    if (!dateStr || !Array.isArray(records)) {
      return apiError(res, 'Valid dateStr and records array are required.', 400);
    }

    const dateObj = new Date(dateStr);
    const operations = records.map((rec) => {
      let lateMins = 0;
      if (rec.status !== 'ABSENT' && rec.status !== 'LEAVE' && rec.status !== 'NOT_JOINED') {
        if (rec.arrivalTime && rec.shiftOpeningTime) {
          lateMins = calculateLateMinutes(rec.arrivalTime, rec.shiftOpeningTime);
        } else if (rec.lateMinutes !== undefined && !isNaN(Number(rec.lateMinutes))) {
          lateMins = Math.max(0, Number(rec.lateMinutes));
        }
      }

      const finalStatus =
        rec.status === 'ABSENT' || rec.status === 'LEAVE' || rec.status === 'HALF_DAY' || rec.status === 'NOT_JOINED'
          ? rec.status
          : lateMins > 0
          ? 'LATE'
          : 'PRESENT';

      return {
        updateOne: {
          filter: { employeeId: rec.employeeId, dateStr },
          update: {
            $set: {
              employeeId: rec.employeeId,
              date: dateObj,
              dateStr,
              shiftOpeningTime: rec.shiftOpeningTime || '12:30',
              arrivalTime: rec.arrivalTime || '',
              status: finalStatus,
              lateMinutes: lateMins,
              remarks: (rec.remarks || '').trim(),
            },
          },
          upsert: true,
        },
      };
    });

    if (operations.length > 0) {
      await Attendance.bulkWrite(operations);
    }

    return apiSuccess(res, { count: operations.length }, `Updated ${operations.length} attendance records.`);
  } catch (error) {
    console.error('[Bulk Mark Attendance Error]:', error);
    return apiError(res, 'Failed to bulk mark attendance.', 500);
  }
};

/**
 * @desc    Get monthly aggregate attendance metrics per employee for YYYY-MM
 * @route   GET /api/staff/attendance/monthly-summary
 * @access  Private
 */
export const getMonthlyAttendanceSummary = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    const employees = await Employee.find({ isActive: true }).sort({ department: 1, name: 1 }).lean();

    // Regex for dateStr matching YYYY-MM
    const attRecords = await Attendance.find({ dateStr: new RegExp(`^${month}`) }).lean();

    const empAttMap = new Map();
    attRecords.forEach((rec) => {
      const empIdStr = rec.employeeId.toString();
      if (!empAttMap.has(empIdStr)) empAttMap.set(empIdStr, []);
      empAttMap.get(empIdStr).push(rec);
    });

    const summaryList = employees.map((emp) => {
      const records = empAttMap.get(emp._id.toString()) || [];

      let presentDays = 0;
      let lateDays = 0;
      let totalLateMinutes = 0;
      let leaveDays = 0;
      let lopDays = 0;
      let halfDays = 0;

      records.forEach((r) => {
        const isNotJoined = r.status === 'NOT_JOINED';
        const isAbsent = r.status === 'ABSENT';
        const isLeave = r.status === 'LEAVE';
        const isHalfDay = r.status === 'HALF_DAY';

        if (isNotJoined) {
          // Employee had not joined yet on this date: do not count as present, absent, leave, or late!
          return;
        }
        if (isLeave) {
          leaveDays += 1;
          return;
        }
        if (isAbsent) {
          lopDays += 1;
          return;
        }
        if (isHalfDay) {
          halfDays += 1;
          presentDays += 0.5;
          return;
        }

        // Present or Late arrival:
        let lateMins = 0;
        if (r.arrivalTime && r.shiftOpeningTime) {
          lateMins = calculateLateMinutes(r.arrivalTime, r.shiftOpeningTime);
        } else {
          lateMins = Number(r.lateMinutes) || 0;
        }

        presentDays += 1;
        if (lateMins > 0) {
          lateDays += 1;
          totalLateMinutes += lateMins;
        }
      });

      return {
        employeeId: emp._id,
        name: emp.name,
        designation: emp.designation,
        department: emp.department,
        totalDays: daysInMonth,
        presentDays,
        lateDays,
        totalLateMinutes,
        leaveDays,
        lopDays,
        halfDays,
        recordedCount: records.length,
      };
    });

    return apiSuccess(res, { month, totalDays: daysInMonth, summary: summaryList }, `Monthly summary for ${month}.`);
  } catch (error) {
    console.error('[Get Monthly Attendance Summary Error]:', error);
    return apiError(res, 'Failed to calculate monthly attendance summary.', 500);
  }
};

