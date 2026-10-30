import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Helper to check if an employee belongs to the Bahria Town Office workplace
 */
export const isBahriaTownEmployee = (emp) => {
  if (!emp) return false;
  const dept = (emp.department || '').trim();
  const desig = (emp.designation || '').trim();
  const name = (emp.name || '').trim().toLowerCase();

  if (dept === 'IT Office') return false;

  return (
    dept === 'Bahria Town Office' ||
    dept === 'Admin Rider' ||
    desig === 'Admin Rider' ||
    name.includes('majid javed')
  );
};

/**
 * Helper to determine default shift opening time for an employee on a given date.
 * Rules:
 * - Before 26 October 2026: Bahria Town Office default shift was 12:30.
 * - From 26 October 2026 onwards:
 *   - Friday: Shift starts at 14:30 (2:30 PM).
 *   - Other days (Mon-Thu, Sat-Sun): Shift starts at 13:30 (1:30 PM, 1 hour later).
 * - Early morning staff (Zaffar Hussain Driver 07:00, Sabir Nawaz 09:00) retain their custom shifts.
 * - IT Office staff retain their custom shifts.
 */
export const getDefaultShiftOpeningTime = (emp, dateStr) => {
  const isFromOct26 = dateStr ? dateStr >= '2026-10-26' : false;
  const isFriday = dateStr ? new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 5 : false;

  const dept = (emp?.department || '').trim();
  const desig = (emp?.designation || '').trim();
  const name = (emp?.name || '').trim().toLowerCase();

  // Custom early morning staff
  if (name.includes('zaffar hussain') || desig.toLowerCase().includes('driver')) {
    return emp?.shiftOpeningTime || '07:00';
  }
  if (name.includes('sabir nawaz')) {
    return emp?.shiftOpeningTime || '09:00';
  }

  // Bahria Town Office staff
  if (isBahriaTownEmployee(emp)) {
    if (isFromOct26) {
      return isFriday ? '14:30' : '13:30';
    }
    return '12:30';
  }

  // IT Office staff
  if (dept === 'IT Office') {
    if (emp?.shiftOpeningTime) return emp.shiftOpeningTime;
    if (name.includes('saeed') || name.includes('faiz') || name.includes('naveed')) {
      return '13:00';
    }
    if (name.includes('sawera')) {
      return '15:00';
    }
    if (name.includes('nousheen') || name.includes('nausheen') || name.includes('noushin')) {
      return '15:30';
    }
    if (name.includes('rafey') || name.includes('abdul rafey')) {
      return '17:00';
    }
    if (name.includes('samina')) {
      return '14:00';
    }
    if (name.includes('gulzaib')) {
      return '13:00';
    }
    if (name.includes('zulaikha')) {
      return '15:00';
    }
    if (name.includes('armaghan')) {
      return '12:30';
    }
    return '12:00';
  }

  return emp?.shiftOpeningTime || (isFromOct26 ? (isFriday ? '14:30' : '13:30') : '12:30');
};

/**
 * Helper to calculate late minutes between arrivalTime and shiftOpeningTime (HH:mm format)
 * Rule:
 * 15-minute grace period:
 * If arrival <= shiftOpeningTime + 15 minutes (e.g. 13:30 shift, arrived <= 13:45), late = 0 mins.
 * If arrival > shiftOpeningTime + 15 minutes (e.g. 13:50), late = arrival - (shiftStart + 15) = 5 mins.
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
    let dateStr;
    if (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      dateStr = date.trim();
    } else if (date) {
      dateStr = new Date(date).toISOString().split('T')[0];
    } else {
      dateStr = new Date().toISOString().split('T')[0];
    }

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
      const defaultShift = getDefaultShiftOpeningTime(emp, dateStr);
      let shiftOpeningTime = att?.shiftOpeningTime || defaultShift;

      // If an attendance was saved with the old 12:30 default for a date >= 2026-10-26 for Bahria Town Office,
      // upgrade to the new default (14:30 on Friday, 13:30 on other days)
      if (dateStr >= '2026-10-26' && isBahriaTownEmployee(emp) && shiftOpeningTime === '12:30') {
        shiftOpeningTime = defaultShift;
      }

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
    const { employeeId, dateStr, shiftOpeningTime, arrivalTime = '', status = 'PRESENT', lateMinutes, remarks = '' } = req.body;

    if (!employeeId || !dateStr) {
      return apiError(res, 'Employee ID and date string (YYYY-MM-DD) are required.', 400);
    }

    const emp = await Employee.findById(employeeId).lean();
    const effectiveShift = shiftOpeningTime || getDefaultShiftOpeningTime(emp, dateStr);

    let lateMins = 0;
    if (status !== 'ABSENT' && status !== 'LEAVE' && status !== 'NOT_JOINED') {
      if (arrivalTime && effectiveShift) {
        lateMins = calculateLateMinutes(arrivalTime, effectiveShift);
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
        shiftOpeningTime: effectiveShift,
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
    const empIds = records.map((r) => r.employeeId);
    const employees = await Employee.find({ _id: { $in: empIds } }).lean();
    const empMap = new Map(employees.map((e) => [e._id.toString(), e]));

    const operations = records.map((rec) => {
      const emp = empMap.get(rec.employeeId?.toString());
      const effectiveShift = rec.shiftOpeningTime || getDefaultShiftOpeningTime(emp, dateStr);

      let lateMins = 0;
      if (rec.status !== 'ABSENT' && rec.status !== 'LEAVE' && rec.status !== 'NOT_JOINED') {
        if (rec.arrivalTime && effectiveShift) {
          lateMins = calculateLateMinutes(rec.arrivalTime, effectiveShift);
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
              shiftOpeningTime: effectiveShift,
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

