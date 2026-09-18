import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import StaffLoan from '../models/StaffLoan.js';
import Payroll from '../models/Payroll.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { getLogoBase64 } from '../utils/logoHelper.js';

/**
 * Format number into Pakistani Rupees string
 */
const formatPKR = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(num);
};

/**
 * Helper to locate Edge or Chrome browser executable on Windows/Server
 */
const getBrowserExecutablePath = () => {
  const commonPaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
};

/**
 * @desc    Get / Calculate monthly payroll records for YYYY-MM
 * @route   GET /api/staff/payroll
 * @access  Private
 */
export const getMonthlyPayroll = async (req, res) => {
  try {
    const { month = '2026-08', department } = req.query;

    const [y, m] = month.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();

    // Check if payroll already saved for this month
    const existingPayroll = await Payroll.find({ payrollMonth: month }).lean();
    const existingMap = new Map();
    existingPayroll.forEach((p) => existingMap.set(p.employeeId.toString(), p));

    // Fetch active employees
    const empQuery = { isActive: true };
    if (department && department !== 'ALL') empQuery.department = department;
    const employees = await Employee.find(empQuery).sort({ department: 1, name: 1 }).lean();

    // Fetch attendance summary for month
    const attRecords = await Attendance.find({ dateStr: new RegExp(`^${month}`) }).lean();
    const empAttMap = new Map();
    attRecords.forEach((rec) => {
      const idStr = rec.employeeId.toString();
      if (!empAttMap.has(idStr)) empAttMap.set(idStr, []);
      empAttMap.get(idStr).push(rec);
    });

    let grandGrossSalary = 0;
    let grandLoanDeductions = 0;
    let grandNetPayable = 0;

    const payrollRows = employees.map((emp) => {
      const empIdStr = emp._id.toString();
      const saved = existingMap.get(empIdStr);

      const basic = emp.basicSalary || 0;
      const fuel = emp.fuelAllowance || 0;
      const food = emp.foodAllowance || 0;
      const mobile = emp.mobileAllowance || 0;
      const perf = emp.performanceAllowance || 0;
      const other = emp.otherAllowances || 0;
      const extraAllow = saved ? (saved.extraAllowance || 0) : 0;
      const allowReason = saved ? (saved.allowanceReason || '') : '';

      const gross = basic + fuel + food + mobile + perf + other + extraAllow;

      // Attendance metrics
      const records = empAttMap.get(empIdStr) || [];
      let presentDays = 0;
      let lateDays = 0;
      let leaveDays = 0;
      let lopDays = 0;

      records.forEach((r) => {
        if (r.status === 'PRESENT') presentDays += 1;
        if (r.status === 'LATE') {
          presentDays += 1;
          lateDays += 1;
        }
        if (r.status === 'LEAVE') leaveDays += 1;
        if (r.status === 'ABSENT') lopDays += 1;
        if (r.status === 'HALF_DAY') presentDays += 0.5;
      });

      const loanDeduction = saved ? saved.loanDeduction : 0;
      const lopDeduction = saved ? saved.lopDeduction : 0;
      const otherDeduction = saved ? saved.otherDeduction : 0;

      const totalDeduction = loanDeduction + lopDeduction + otherDeduction;
      const netPayable = Math.max(0, gross - totalDeduction);

      grandGrossSalary += gross;
      grandLoanDeductions += loanDeduction;
      grandNetPayable += netPayable;

      return {
        payrollId: saved?._id || null,
        employeeId: emp._id,
        employeeCode: emp.employeeCode,
        name: emp.name,
        designation: emp.designation,
        department: emp.department,
        basicSalary: basic,
        fuelAllowance: fuel,
        foodAllowance: food,
        mobileAllowance: mobile,
        performanceAllowance: perf,
        otherAllowances: other,
        extraAllowance: extraAllow,
        allowanceReason: allowReason,
        grossSalary: gross,
        totalDays,
        presentDays: saved ? saved.presentDays : presentDays,
        lateDays: saved ? saved.lateDays : lateDays,
        leaveDays: saved ? saved.leaveDays : leaveDays,
        lopDays: saved ? saved.lopDays : lopDays,
        loanBalance: emp.loanBalance || 0,
        lopDeduction,
        loanDeduction,
        otherDeduction,
        totalDeduction,
        netPayable: saved ? saved.netPayable : netPayable,
        accountTitle: saved ? saved.accountTitle : emp.accountTitle || emp.name,
        ibanNumber: saved ? saved.ibanNumber : emp.ibanNumber || '',
        bankName: saved ? saved.bankName : emp.bankName || '',
        status: saved ? saved.status : 'DRAFT',
      };
    });

    const summary = {
      month,
      totalEmployees: payrollRows.length,
      grandGrossSalary,
      grandLoanDeductions,
      grandNetPayable,
    };

    return apiSuccess(res, { month, summary, payroll: payrollRows }, `Payroll summary for ${month}.`);
  } catch (error) {
    console.error('[Get Monthly Payroll Error]:', error);
    return apiError(res, 'Failed to fetch monthly payroll.', 500);
  }
};

/**
 * @desc    Save / Finalize monthly payroll records & record loan deductions
 * @route   POST /api/staff/payroll/save
 * @access  Private (Admin / Publisher)
 */
export const savePayroll = async (req, res) => {
  try {
    const { month, payrollRecords = [] } = req.body;

    if (!month || !Array.isArray(payrollRecords)) {
      return apiError(res, 'Valid month (YYYY-MM) and payrollRecords array are required.', 400);
    }

    const savedResults = [];

    for (const rec of payrollRecords) {
      const extraAllow = Number(rec.extraAllowance) || 0;
      const allowReason = (rec.allowanceReason || '').trim();

      const gross =
        (Number(rec.basicSalary) || 0) +
        (Number(rec.fuelAllowance) || 0) +
        (Number(rec.foodAllowance) || 0) +
        (Number(rec.mobileAllowance) || 0) +
        (Number(rec.performanceAllowance) || 0) +
        (Number(rec.otherAllowances) || 0) +
        extraAllow;

      const loanDed = Number(rec.loanDeduction) || 0;
      const lopDed = Number(rec.lopDeduction) || 0;
      const othDed = Number(rec.otherDeduction) || 0;
      const totDed = loanDed + lopDed + othDed;
      const netPayable = Math.max(0, gross - totDed);

      const pDoc = await Payroll.findOneAndUpdate(
        { payrollMonth: month, employeeId: rec.employeeId },
        {
          payrollMonth: month,
          employeeId: rec.employeeId,
          employeeName: rec.name,
          designation: rec.designation,
          department: rec.department,
          basicSalary: Number(rec.basicSalary) || 0,
          fuelAllowance: Number(rec.fuelAllowance) || 0,
          foodAllowance: Number(rec.foodAllowance) || 0,
          mobileAllowance: Number(rec.mobileAllowance) || 0,
          performanceAllowance: Number(rec.performanceAllowance) || 0,
          otherAllowances: Number(rec.otherAllowances) || 0,
          extraAllowance: extraAllow,
          allowanceReason: allowReason,
          grossSalary: gross,
          totalDays: Number(rec.totalDays) || 30,
          presentDays: Number(rec.presentDays) || 0,
          lateDays: Number(rec.lateDays) || 0,
          leaveDays: Number(rec.leaveDays) || 0,
          lopDays: Number(rec.lopDays) || 0,
          lopDeduction: lopDed,
          loanDeduction: loanDed,
          otherDeduction: othDed,
          totalDeduction: totDed,
          netPayable,
          accountTitle: rec.accountTitle || '',
          ibanNumber: rec.ibanNumber || '',
          bankName: rec.bankName || '',
          status: 'FINALIZED',
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );

      // If loan deduction was recorded, update employee loan balance
      if (loanDed > 0) {
        const emp = await Employee.findById(rec.employeeId);
        if (emp && emp.loanBalance > 0) {
          const prevBal = emp.loanBalance;
          const newBal = Math.max(0, prevBal - loanDed);
          emp.loanBalance = newBal;
          await emp.save();

          await StaffLoan.create({
            employeeId: emp._id,
            type: 'REPAYMENT',
            amount: loanDed,
            previousBalance: prevBal,
            newBalance: newBal,
            payrollMonth: month,
            description: `Salary Loan Deduction for ${month}`,
            createdBy: req.user?._id || null,
          });
        }
      }

      savedResults.push(pDoc);
    }

    return apiSuccess(res, { month, count: savedResults.length }, `Payroll for ${month} saved successfully.`);
  } catch (error) {
    console.error('[Save Payroll Error]:', error);
    return apiError(res, 'Failed to save payroll.', 500);
  }
};

/**
 * @desc    Download Monthly Salary Sheet as Excel (.xlsx) file matching exact user format
 * @route   GET /api/staff/payroll/excel
 * @access  Private
 */
export const downloadSalarySheetExcel = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;

    const employees = await Employee.find({ isActive: true }).sort({ department: 1, name: 1 }).lean();
    const existingPayroll = await Payroll.find({ payrollMonth: month }).lean();
    const payrollMap = new Map();
    existingPayroll.forEach((p) => payrollMap.set(p.employeeId.toString(), p));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pixx Technologies HR System';
    workbook.created = new Date();

    // -------------------------------------------------------------
    // SHEET 1: OVERALL SALARY SHEET
    // -------------------------------------------------------------
    const ws1 = workbook.addWorksheet('Overall Salary Sheet', {
      views: [{ showGridLines: true }],
    });

    // Title Row 1: Company Name Banner
    ws1.mergeCells('A1:N1');
    const titleCell = ws1.getCell('A1');
    titleCell.value = 'PIXX TECHNOLOGIES PAKISTAN';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 36;

    // Subtitle Row 2: Month & Title
    ws1.mergeCells('A2:N2');
    const subCell = ws1.getCell('A2');
    subCell.value = `MONTHLY SALARY SHEET — ${month.toUpperCase()}`;
    subCell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(2).height = 26;

    // Blank Row 3
    ws1.getRow(3).height = 12;

    // Header Row 4
    const headers = [
      'Sr.No',
      'Employee Name',
      'Designation',
      'Workplace / Dept',
      'Basic Salary (PKR)',
      'Regular Allowances (PKR)',
      'Extra Allowance (PKR)',
      'Allowance Reason',
      'Gross Salary (PKR)',
      'Loan / Adv Ded (PKR)',
      'Net Payable (PKR)',
      'Account Title',
      'IBAN Number',
      'Bank Name',
    ];
    const headerRow = ws1.addRow(headers);
    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    let srNo = 1;
    let startRowIndex = 5;

    employees.forEach((emp, index) => {
      const saved = payrollMap.get(emp._id.toString());
      const basic = emp.basicSalary || 0;
      const fuel = emp.fuelAllowance || 0;
      const food = emp.foodAllowance || 0;
      const mobile = emp.mobileAllowance || 0;
      const perf = emp.performanceAllowance || 0;
      const other = emp.otherAllowances || 0;
      const extraAllow = saved ? (saved.extraAllowance || 0) : 0;
      const allowReason = saved ? (saved.allowanceReason || '') : '';

      const regAllow = fuel + food + mobile + perf + other;
      const gross = basic + regAllow + extraAllow;
      const loanDed = saved ? saved.loanDeduction : 0;
      const netPay = saved ? saved.netPayable : Math.max(0, gross - loanDed);

      const row = ws1.addRow([
        srNo++,
        emp.name,
        emp.designation,
        emp.department,
        basic,
        regAllow,
        extraAllow,
        allowReason,
        gross,
        loanDed,
        netPay,
        emp.accountTitle || emp.name,
        emp.ibanNumber || 'N/A',
        emp.bankName || 'Cash / Bank',
      ]);

      row.height = 22;
      const isEven = index % 2 === 0;
      const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (colNumber === 1) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if ([5, 6, 7, 9, 10, 11].includes(colNumber)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
          if (colNumber === 11) {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } };
          }
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

    const endRowIndex = startRowIndex + employees.length - 1;

    // Total Row
    const totalRow = ws1.addRow([
      '',
      'GRAND TOTAL',
      '',
      '',
      { formula: `SUM(E${startRowIndex}:E${endRowIndex})` },
      { formula: `SUM(F${startRowIndex}:F${endRowIndex})` },
      { formula: `SUM(G${startRowIndex}:G${endRowIndex})` },
      '',
      { formula: `SUM(I${startRowIndex}:I${endRowIndex})` },
      { formula: `SUM(J${startRowIndex}:J${endRowIndex})` },
      { formula: `SUM(K${startRowIndex}:K${endRowIndex})` },
      '',
      '',
      '',
    ]);

    totalRow.height = 26;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if ([5, 6, 7, 9, 10, 11].includes(colNumber)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0';
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    ws1.mergeCells(`B${endRowIndex + 1}:D${endRowIndex + 1}`);

    // Precise Auto-Fit Column Widths
    ws1.columns = [
      { width: 7 },  // Sr.No
      { width: 24 }, // Employee Name
      { width: 22 }, // Designation
      { width: 20 }, // Workplace
      { width: 18 }, // Basic Salary
      { width: 20 }, // Reg Allowances
      { width: 18 }, // Extra Allowance
      { width: 24 }, // Allowance Reason
      { width: 18 }, // Gross Salary
      { width: 20 }, // Loan Ded
      { width: 22 }, // Net Payable
      { width: 24 }, // Account Title
      { width: 26 }, // IBAN Number
      { width: 22 }, // Bank Name
    ];

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Salary_Sheet_${month}.xlsx`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[Download Salary Sheet Excel Error]:', error);
    return apiError(res, 'Failed to generate Excel Salary Sheet.', 500);
  }
};

/**
 * @desc    Generate Printable PDF Salary Slip for an Employee
 * @route   GET /api/staff/payroll/slip/:employeeId/pdf
 * @access  Private
 */
export const generateSalarySlipPDF = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month = '2026-08' } = req.query;

    const employee = await Employee.findById(employeeId).lean();
    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const savedPayroll = await Payroll.findOne({ employeeId, payrollMonth: month }).lean();

    const basic = savedPayroll ? savedPayroll.basicSalary : employee.basicSalary || 0;
    const fuel = savedPayroll ? savedPayroll.fuelAllowance : employee.fuelAllowance || 0;
    const food = savedPayroll ? savedPayroll.foodAllowance : employee.foodAllowance || 0;
    const mobile = savedPayroll ? savedPayroll.mobileAllowance : employee.mobileAllowance || 0;
    const perf = savedPayroll ? savedPayroll.performanceAllowance : employee.performanceAllowance || 0;
    const otherAllow = savedPayroll ? savedPayroll.otherAllowances : employee.otherAllowances || 0;
    const extraAllow = savedPayroll ? (savedPayroll.extraAllowance || 0) : 0;
    const allowReason = savedPayroll ? (savedPayroll.allowanceReason || '') : '';

    const totalAllowances = fuel + food + mobile + perf + otherAllow + extraAllow;

    const overtime = savedPayroll ? savedPayroll.overtimeAmount || 0 : 0;
    const bonus = savedPayroll ? savedPayroll.bonusAmount || 0 : 0;
    const leaveEncashment = savedPayroll ? savedPayroll.leaveEncashmentAmount || 0 : 0;
    const otherReceipts = savedPayroll ? savedPayroll.otherReceiptsAmount || 0 : 0;

    const gross = savedPayroll
      ? savedPayroll.grossSalary
      : basic + totalAllowances + overtime + bonus + leaveEncashment + otherReceipts;

    const loanDed = savedPayroll ? savedPayroll.loanDeduction : 0;
    const lopDed = savedPayroll ? savedPayroll.lopDeduction : 0;
    const othDed = savedPayroll ? savedPayroll.otherDeduction : 0;
    const whtDed = savedPayroll ? savedPayroll.whtDeduction || 0 : 0;
    const totDed = loanDed + lopDed + othDed + whtDed;
    const netPayable = Math.max(0, gross - totDed);

    // Attendance metrics
    const presentDays = savedPayroll ? savedPayroll.presentDays : 30;
    const leaveDays = savedPayroll ? savedPayroll.leaveDays : 0;
    const allowedLeaves = savedPayroll ? savedPayroll.allowedLeaves : employee.allowedMonthlyLeaves || 2;
    const lopDays = savedPayroll ? savedPayroll.lopDays : 0;
    const totalSalaryDays = savedPayroll ? savedPayroll.totalSalaryDays || (30 - lopDays) : 30;

    // Convert month to string e.g. "August 2026"
    const [y, m] = month.split('-').map(Number);
    const dateObj = new Date(y, m - 1, 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
    const formattedTitleDate = `${monthName} ${y}`;

    // Convert Net Payable to Words
    const { numberToWords } = await import('../services/staffPayrollService.js');
    const amountInWords = numberToWords(netPayable);

    // Get Base64 Logo
    const logoDataUri = getLogoBase64();

    // Render Colorful HTML template with Pixx Technologies branding & logo
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Salary Pay Slip - ${employee.name}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 15px;
          background: #fff;
        }
        .slip-container {
          width: 100%;
          max-width: 850px;
          margin: 0 auto;
          box-sizing: border-box;
          border: 2px solid #0f172a;
          border-radius: 8px;
          overflow: hidden;
        }
        .brand-header {
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
          color: #ffffff;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .brand-logo-area {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .brand-logo {
          max-height: 50px;
          width: auto;
          background: #ffffff;
          padding: 4px;
          border-radius: 6px;
        }
        .brand-title {
          font-size: 24px;
          font-weight: 900;
          letter-spacing: 1px;
          margin: 0;
          color: #38bdf8;
        }
        .brand-sub {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
          margin-top: 2px;
        }
        .slip-tag {
          text-align: right;
        }
        .slip-tag-title {
          font-size: 16px;
          font-weight: 800;
          color: #34d399;
          text-transform: uppercase;
        }
        .slip-tag-month {
          font-size: 12px;
          color: #cbd5e1;
          font-weight: 600;
        }
        
        /* Employee details header bar */
        .emp-bar {
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
          padding: 12px 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          font-size: 12px;
        }
        .emp-bar-row {
          display: flex;
          justify-content: space-between;
          padding: 3px 0;
        }
        .emp-label { color: #64748b; font-weight: 600; }
        .emp-val { color: #0f172a; font-weight: 800; }

        table.outer-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        table.outer-table td {
          border: 1px solid #cbd5e1;
          padding: 0;
          vertical-align: top;
        }
        .inner-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .inner-table td, .inner-table th {
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
        }
        .table-header {
          background: #1e293b;
          color: #ffffff;
          font-weight: 800;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 10px;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: 700; }
        .font-black { font-weight: 900; }
        
        .big-payout-box {
          background: linear-gradient(135deg, #064e3b 0%, #047857 100%);
          color: #ffffff;
          text-align: center;
          padding: 40px 15px;
          border-radius: 8px;
          margin: 15px;
        }
        .big-payout-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #a7f3d0;
          margin-bottom: 6px;
        }
        .big-payout-val {
          font-size: 38px;
          font-weight: 900;
          letter-spacing: 1px;
          font-family: 'Segoe UI', sans-serif;
        }
        .words-box {
          background: #f0fdf4;
          border: 1px border #bbf7d0;
          color: #166534;
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          padding: 10px;
          margin: 0 15px 15px 15px;
          border-radius: 6px;
        }
        .reason-badge {
          background: #eff6ff;
          color: #1d4ed8;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          display: inline-block;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="slip-container">
        <!-- BRAND HEADER WITH LOGO -->
        <div class="brand-header">
          <div class="brand-logo-area">
            ${logoDataUri ? `<img src="${logoDataUri}" class="brand-logo" alt="Pixx Tech Logo" />` : ''}
            <div>
              <div class="brand-title">PIXX TECHNOLOGIES</div>
              <div class="brand-sub">Official Employee Salary Pay Slip</div>
            </div>
          </div>
          <div class="slip-tag">
            <div class="slip-tag-title">SALARY SLIP</div>
            <div class="slip-tag-month">${formattedTitleDate}</div>
          </div>
        </div>

        <!-- EMPLOYEE INFO BAR -->
        <div class="emp-bar">
          <div>
            <div class="emp-bar-row">
              <span class="emp-label">Employee Name:</span>
              <span class="emp-val" style="font-size: 14px; color: #0284c7;">${employee.name}</span>
            </div>
            <div class="emp-bar-row">
              <span class="emp-label">Employee Code:</span>
              <span class="emp-val">${employee.employeeCode || 'PK-EMP'}</span>
            </div>
            <div class="emp-bar-row">
              <span class="emp-label">Designation:</span>
              <span class="emp-val">${employee.designation}</span>
            </div>
          </div>
          <div>
            <div class="emp-bar-row">
              <span class="emp-label">Workplace / Dept:</span>
              <span class="emp-val" style="color: #7c3aed;">${employee.department}</span>
            </div>
            <div class="emp-bar-row">
              <span class="emp-label">Bank Account:</span>
              <span class="emp-val">${employee.bankName || 'Cash / Bank'}</span>
            </div>
            <div class="emp-bar-row">
              <span class="emp-label">Account Title / IBAN:</span>
              <span class="emp-val">${employee.accountTitle || employee.name} (${employee.ibanNumber || 'N/A'})</span>
            </div>
          </div>
        </div>

        <!-- MAIN CONTENT TABLE -->
        <table class="outer-table">
          <tr>
            <!-- LEFT COLUMN: EARNINGS & DEDUCTIONS -->
            <td style="width: 55%;">
              <div class="table-header">Financial Payout Breakdown</div>
              <table class="inner-table">
                <tr style="background: #f8fafc;">
                  <th style="text-align: left; color: #475569;">Description</th>
                  <th style="text-align: center; color: #475569; width: 50px;">Curr</th>
                  <th style="text-align: right; color: #475569; width: 100px;">Amount (PKR)</th>
                </tr>
                <tr>
                  <td>Basic Salary</td>
                  <td class="text-center font-bold">PKR</td>
                  <td class="text-right font-bold">${formatPKR(basic)}</td>
                </tr>
                ${
                  totalAllowances > 0
                    ? `
                <tr>
                  <td>
                    Regular & Staff Allowances
                    ${allowReason ? `<br/><span class="reason-badge">Reason: ${allowReason}</span>` : ''}
                  </td>
                  <td class="text-center font-bold">PKR</td>
                  <td class="text-right font-bold" style="color: #059669;">+${formatPKR(totalAllowances)}</td>
                </tr>
                `
                    : ''
                }
                ${
                  overtime > 0
                    ? `
                <tr>
                  <td>Overtime Pay</td>
                  <td class="text-center">PKR</td>
                  <td class="text-right">+${formatPKR(overtime)}</td>
                </tr>
                `
                    : ''
                }
                ${
                  bonus > 0
                    ? `
                <tr>
                  <td>Performance Bonus</td>
                  <td class="text-center">PKR</td>
                  <td class="text-right">+${formatPKR(bonus)}</td>
                </tr>
                `
                    : ''
                }
                <tr style="background: #f1f5f9;">
                  <td class="font-bold">TOTAL GROSS SALARY</td>
                  <td class="text-center font-bold">PKR</td>
                  <td class="text-right font-black" style="color: #0f172a; font-size: 13px;">${formatPKR(gross)}</td>
                </tr>
                
                <!-- DEDUCTIONS -->
                <tr style="background: #fef2f2;">
                  <td colspan="3" class="font-bold" style="color: #991b1b; text-transform: uppercase; font-size: 11px;">Deductions & Adjustments</td>
                </tr>
                <tr>
                  <td>Advance Loan Repayment Deduction</td>
                  <td class="text-center">PKR</td>
                  <td class="text-right" style="color: #dc2626;">-${formatPKR(loanDed)}</td>
                </tr>
                ${
                  lopDed > 0 || othDed > 0
                    ? `
                <tr>
                  <td>Loss of Pay / Other Deductions</td>
                  <td class="text-center">PKR</td>
                  <td class="text-right" style="color: #dc2626;">-${formatPKR(lopDed + othDed)}</td>
                </tr>
                `
                    : ''
                }
                <tr style="background: #fee2e2;">
                  <td class="font-bold" style="color: #991b1b;">TOTAL DEDUCTIONS</td>
                  <td class="text-center font-bold" style="color: #991b1b;">PKR</td>
                  <td class="text-right font-black" style="color: #991b1b;">-${formatPKR(totDed)}</td>
                </tr>

                <tr style="background: #ecfdf5; border-top: 2px solid #10b981;">
                  <td class="font-black" style="color: #065f46; font-size: 13px;">NET TAKE HOME SALARY</td>
                  <td class="text-center font-black" style="color: #065f46;">PKR</td>
                  <td class="text-right font-black" style="color: #047857; font-size: 15px;">${formatPKR(netPayable)}</td>
                </tr>
              </table>
            </td>

            <!-- RIGHT COLUMN: ATTENDANCE & NET PAYOUT CALLOUT -->
            <td style="width: 45%;">
              <div class="table-header" style="background: #0f766e;">Monthly Attendance Record</div>
              <table class="inner-table">
                <tr>
                  <td class="font-bold">Total Days in Month</td>
                  <td class="text-right font-bold">30</td>
                </tr>
                <tr>
                  <td class="font-bold">Present / Worked Days</td>
                  <td class="text-right font-bold" style="color: #047857;">${presentDays}</td>
                </tr>
                <tr>
                  <td class="font-bold">Approved Leaves</td>
                  <td class="text-right font-bold">${leaveDays} (Allowed: ${allowedLeaves})</td>
                </tr>
                <tr>
                  <td class="font-bold">Loss of Pay (Absent) Days</td>
                  <td class="text-right font-bold" style="color: #dc2626;">${lopDays}</td>
                </tr>
                <tr style="background: #f0fdf4;">
                  <td class="font-black" style="color: #166534;">Paid Salary Days</td>
                  <td class="text-right font-black" style="color: #166534;">${totalSalaryDays} Days</td>
                </tr>
              </table>

              <!-- BIG BOLD NET SALARY CARD -->
              <div class="big-payout-box">
                <div class="big-payout-title">NET PAYOUT AMOUNT</div>
                <div class="big-payout-val">PKR ${formatPKR(netPayable)}</div>
              </div>

              <div class="words-box">
                <strong>Amount in Words:</strong><br/>
                ${amountInWords}
              </div>
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>
    `;

    // Try Puppeteer PDF rendering
    try {
      const puppeteer = (await import('puppeteer-core')).default;
      const execPath = getBrowserExecutablePath();

      const launchOpts = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      if (execPath) launchOpts.executablePath = execPath;

      const browser = await puppeteer.launch(launchOpts);
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        printBackground: true,
      });

      await browser.close();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=Salary_Slip_${employee.name.replace(/\s+/g, '_')}_${month}.pdf`);
      return res.status(200).send(pdfBuffer);
    } catch (pdfErr) {
      console.warn('[Puppeteer Warning]: Falling back to raw HTML for Salary Slip:', pdfErr.message);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(htmlContent);
    }
  } catch (error) {
    console.error('[Generate Salary Slip PDF Error]:', error);
    return apiError(res, 'Failed to generate Salary Slip PDF.', 500);
  }
};

/**
 * @desc    Generate Printable PDF Landscape Monthly Salary Sheet with Logo & Branding
 * @route   GET /api/staff/payroll/pdf
 * @access  Private
 */
export const generateSalarySheetPDF = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;

    const employees = await Employee.find({ isActive: true }).sort({ department: 1, name: 1 }).lean();
    const existingPayroll = await Payroll.find({ payrollMonth: month }).lean();
    const payrollMap = new Map();
    existingPayroll.forEach((p) => payrollMap.set(p.employeeId.toString(), p));

    const logoDataUri = getLogoBase64();

    let grandGross = 0;
    let grandLoanDed = 0;
    let grandNetPay = 0;

    const rowsHTML = employees
      .map((emp, index) => {
        const saved = payrollMap.get(emp._id.toString());
        const basic = emp.basicSalary || 0;
        const fuel = emp.fuelAllowance || 0;
        const food = emp.foodAllowance || 0;
        const mobile = emp.mobileAllowance || 0;
        const perf = emp.performanceAllowance || 0;
        const other = emp.otherAllowances || 0;
        const extraAllow = saved ? (saved.extraAllowance || 0) : 0;
        const allowReason = saved ? (saved.allowanceReason || '') : '';

        const regAllow = fuel + food + mobile + perf + other;
        const gross = basic + regAllow + extraAllow;
        const loanDed = saved ? saved.loanDeduction : 0;
        const netPay = saved ? saved.netPayable : Math.max(0, gross - loanDed);

        grandGross += gross;
        grandLoanDed += loanDed;
        grandNetPay += netPay;

        const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';

        return `
        <tr style="background: ${bg};">
          <td style="text-align: center; font-weight: bold; color: #64748b;">${index + 1}</td>
          <td style="font-weight: 800; color: #0f172a;">${emp.name}</td>
          <td style="color: #334155;">${emp.designation}</td>
          <td style="font-weight: 700; color: #7c3aed;">${emp.department}</td>
          <td style="text-align: right; font-family: monospace;">${formatPKR(basic)}</td>
          <td style="text-align: right; font-family: monospace; color: #059669;">+${formatPKR(regAllow + extraAllow)}</td>
          <td style="font-size: 10px; color: #2563eb;">${allowReason || '—'}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 800; color: #0f172a;">${formatPKR(gross)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 800; color: #dc2626;">${loanDed > 0 ? '-' + formatPKR(loanDed) : '0'}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 900; color: #047857; font-size: 12px;">Rs. ${formatPKR(netPay)}</td>
          <td style="font-size: 10px;">${emp.accountTitle || emp.name}</td>
          <td style="font-size: 10px; font-family: monospace; color: #6366f1;">${emp.bankName || 'Cash'} • ${emp.ibanNumber || 'N/A'}</td>
        </tr>
      `;
      })
      .join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Monthly Salary Sheet - ${month}</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 8mm;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 10px;
          background: #fff;
        }
        .header-banner {
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
          color: #ffffff;
          padding: 14px 20px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .logo-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-img {
          max-height: 44px;
          background: #fff;
          padding: 3px;
          border-radius: 5px;
        }
        .banner-title {
          font-size: 22px;
          font-weight: 900;
          color: #38bdf8;
          letter-spacing: 1px;
        }
        .banner-sub {
          font-size: 12px;
          color: #a7f3d0;
          font-weight: 700;
          text-transform: uppercase;
        }
        .kpi-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 12px;
        }
        .kpi-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 12px;
          border-radius: 6px;
        }
        .kpi-label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }
        .kpi-val { font-size: 16px; font-weight: 900; font-family: monospace; }
        
        table.sheet-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        table.sheet-table th {
          background: #1e1b4b;
          color: #ffffff;
          padding: 8px 6px;
          font-size: 10px;
          text-transform: uppercase;
          border: 1px solid #0f172a;
        }
        table.sheet-table td {
          padding: 6px;
          border: 1px solid #cbd5e1;
        }
        .total-row {
          background: #fef3c7 !important;
          font-weight: 900;
          font-size: 12px;
        }
        .total-row td {
          border-top: 2px solid #0f172a !important;
          border-bottom: 3px double #0f172a !important;
        }
      </style>
    </head>
    <body>
      <div class="header-banner">
        <div class="logo-box">
          ${logoDataUri ? `<img src="${logoDataUri}" class="logo-img" alt="Pixx Logo" />` : ''}
          <div>
            <div class="banner-title">PIXX TECHNOLOGIES PAKISTAN</div>
            <div class="banner-sub">Monthly Staff Salary Sheet — ${month}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; color: #cbd5e1;">Generated Date:</div>
          <div style="font-size: 12px; font-weight: 800; color: #ffffff;">${new Date().toLocaleDateString('en-PK')}</div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Total Monthly Gross Salary</div>
          <div class="kpi-val" style="color: #0f172a;">Rs. ${formatPKR(grandGross)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Loan / Advance Deducted</div>
          <div class="kpi-val" style="color: #dc2626;">Rs. ${formatPKR(grandLoanDed)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Net Payable Salary</div>
          <div class="kpi-val" style="color: #047857;">Rs. ${formatPKR(grandNetPay)}</div>
        </div>
      </div>

      <table class="sheet-table">
        <thead>
          <tr>
            <th style="width: 30px;">Sr</th>
            <th>Employee Name</th>
            <th>Designation</th>
            <th>Workplace</th>
            <th style="text-align: right;">Basic (PKR)</th>
            <th style="text-align: right;">Allowances</th>
            <th>Reason</th>
            <th style="text-align: right;">Gross (PKR)</th>
            <th style="text-align: right;">Loan Ded</th>
            <th style="text-align: right;">Net Payable</th>
            <th>Account Title</th>
            <th>Bank & IBAN</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
          <tr class="total-row">
            <td colspan="4" style="text-align: center;">GRAND TOTAL PAYOUT</td>
            <td style="text-align: right;">—</td>
            <td style="text-align: right;">—</td>
            <td>—</td>
            <td style="text-align: right; color: #0f172a;">Rs. ${formatPKR(grandGross)}</td>
            <td style="text-align: right; color: #dc2626;">Rs. ${formatPKR(grandLoanDed)}</td>
            <td style="text-align: right; color: #047857; font-size: 13px;">Rs. ${formatPKR(grandNetPay)}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
    `;

    // Try Puppeteer PDF rendering
    try {
      const puppeteer = (await import('puppeteer-core')).default;
      const execPath = getBrowserExecutablePath();

      const launchOpts = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      if (execPath) launchOpts.executablePath = execPath;

      const browser = await puppeteer.launch(launchOpts);
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
        printBackground: true,
      });

      await browser.close();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=Monthly_Salary_Sheet_${month}.pdf`);
      return res.status(200).send(pdfBuffer);
    } catch (pdfErr) {
      console.warn('[Puppeteer Warning]: Falling back to raw HTML for Salary Sheet PDF:', pdfErr.message);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(htmlContent);
    }
  } catch (error) {
    console.error('[Generate Salary Sheet PDF Error]:', error);
    return apiError(res, 'Failed to generate Monthly Salary Sheet PDF.', 500);
  }
};
