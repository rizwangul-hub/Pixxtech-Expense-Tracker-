import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import StaffLoan from '../models/StaffLoan.js';
import Payroll from '../models/Payroll.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';
import StaffAuditLog from '../models/StaffAuditLog.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { createTransaction, round2, suggestNextVoucherNumber } from '../services/ledgerService.js';
import { getOrCreateOtherIncomeClearingAccount } from './otherIncomeController.js';

/**
 * Helper to ensure canonical Salaries category head exists
 */
export const getOrCreateSalariesCategory = async () => {
  let category = await Category.findOne({
    type: 'EXPENSE',
    name: { $regex: /^Salaries$/i },
    expenseClassification: 'GENERAL_EXPENSE',
  });

  if (!category) {
    category = await Category.create({
      name: 'Salaries',
      type: 'EXPENSE',
      expenseClassification: 'GENERAL_EXPENSE',
      propertyId: null,
      unitId: null,
      isRentalHead: false,
    });
  }

  return category;
};

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
 * Smart Puppeteer launcher — works on Vercel (serverless) AND local Windows.
 * - On Vercel: uses @sparticuz/chromium (bundled headless Chromium for serverless)
 * - On local Windows: finds Edge or Chrome executable automatically
 */
const launchPuppeteer = async () => {
  const puppeteer = (await import('puppeteer-core')).default;

  // ── Vercel / serverless environment ──────────────────────────────────────
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.RAILWAY_ENVIRONMENT) {
    const chromium = (await import('@sparticuz/chromium')).default;
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    return browser;
  }

  // ── Local Windows development ─────────────────────────────────────────────
  const localPaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  let executablePath;
  for (const p of localPaths) {
    if (fs.existsSync(p)) { executablePath = p; break; }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    ...(executablePath ? { executablePath } : {}),
  });
  return browser;
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
      const legacyAllowances =
        (emp.fuelAllowance || 0) +
        (emp.foodAllowance || 0) +
        (emp.mobileAllowance || 0) +
        (emp.performanceAllowance || 0) +
        (emp.otherAllowances || 0);

      const allowance = saved && saved.allowance !== undefined
        ? saved.allowance
        : (emp.allowance || legacyAllowances);
      const allowanceReason = saved ? (saved.allowanceReason || '') : (emp.allowanceReason || '');

      const gross = basic + allowance;

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
        allowance,
        allowanceReason,
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
        paymentStatus: saved?.paymentStatus || (saved ? 'PENDING_PAYMENT' : 'DRAFT'),
        paidFromAccountId: saved?.paidFromAccountId || null,
        paidFromAccountName: saved?.paidFromAccountName || '',
        paymentDate: saved?.paymentDate || null,
        transactionId: saved?.transactionId || null,
        voucherId: saved?.voucherId || null,
        voucherNo: saved?.voucherNo || '',
        paymentMethod: saved?.paymentMethod || 'BANK_TRANSFER',
        paymentNotes: saved?.paymentNotes || '',
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
      const basic = Number(rec.basicSalary) || 0;
      const allowance = Number(rec.allowance) || 0;
      const gross = basic + allowance;

      const loanDed = Number(rec.loanDeduction) || 0;
      const lopDed = Number(rec.lopDeduction) || 0;
      const othDed = Number(rec.otherDeduction) || 0;
      const totDed = loanDed + lopDed + othDed;
      const netPayable = Math.max(0, gross - totDed);

      const existingDoc = await Payroll.findOne({ payrollMonth: month, employeeId: rec.employeeId });
      const isAlreadyPaid = existingDoc?.paymentStatus === 'PAID';

      const updatePayload = {
        payrollMonth: month,
        employeeId: rec.employeeId,
        employeeName: rec.name,
        designation: rec.designation,
        department: rec.department,
        basicSalary: basic,
        allowance,
        allowanceReason: rec.allowanceReason || '',
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
      };

      if (!isAlreadyPaid) {
        updatePayload.status = 'FINALIZED';
        updatePayload.paymentStatus = 'PENDING_PAYMENT';
      }

      const pDoc = await Payroll.findOneAndUpdate(
        { payrollMonth: month, employeeId: rec.employeeId },
        updatePayload,
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
    ws1.mergeCells('A1:L1');
    const titleCell = ws1.getCell('A1');
    titleCell.value = 'PIXX TECHNOLOGIES PAKISTAN';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 36;

    // Subtitle Row 2: Month & Title
    ws1.mergeCells('A2:L2');
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
      'Allowances (PKR)',
      'Gross Salary (PKR)',
      'Loan / Advance Deduction (PKR)',
      'Net Payable Salary (PKR)',
      'Account Title',
      'IBAN Number',
      'Bank Name',
    ];
    const headerRow = ws1.addRow(headers);
    headerRow.height = 28;

    headerRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
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
      const gross = basic + fuel + food + mobile + perf + other;
      const loanDed = saved ? saved.loanDeduction : 0;
      const netPay = saved ? saved.netPayable : Math.max(0, gross - loanDed);

      const row = ws1.addRow([
        srNo++,
        emp.name,
        emp.designation,
        emp.department,
        basic,
        fuel + food + mobile + perf + other,
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
        } else if ([5, 6, 7, 8, 9].includes(colNumber)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
          if (colNumber === 9) {
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
      { formula: `SUM(H${startRowIndex}:H${endRowIndex})` },
      { formula: `SUM(I${startRowIndex}:I${endRowIndex})` },
      '',
      '',
      '',
    ]);

    totalRow.height = 26;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if ([5, 6, 7, 8, 9].includes(colNumber)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0';
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    ws1.mergeCells(`B${endRowIndex + 1}:D${endRowIndex + 1}`);

    // Precise Auto-Fit Column Widths
    ws1.columns = [
      { width: 8 },  // Sr.No
      { width: 26 }, // Employee Name
      { width: 24 }, // Designation
      { width: 22 }, // Workplace
      { width: 20 }, // Basic Salary
      { width: 18 }, // Allowances
      { width: 20 }, // Gross Salary
      { width: 26 }, // Loan Deduction
      { width: 24 }, // Net Payable
      { width: 26 }, // Account Title
      { width: 28 }, // IBAN Number
      { width: 24 }, // Bank Name
    ];

    // -------------------------------------------------------------
    // SHEET 2: BANK SALARY TRANSFER SHEET
    // -------------------------------------------------------------
    const ws2 = workbook.addWorksheet('Bank Transfer Sheet', {
      views: [{ showGridLines: true }],
    });

    ws2.mergeCells('A1:G1');
    const bTitle = ws2.getCell('A1');
    bTitle.value = 'PIXX TECHNOLOGIES PAKISTAN';
    bTitle.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    bTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    bTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 36;

    ws2.mergeCells('A2:G2');
    const bSub = ws2.getCell('A2');
    bSub.value = `BANK SALARY TRANSFER SHEET — ${month.toUpperCase()}`;
    bSub.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    bSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    bSub.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(2).height = 26;

    ws2.getRow(3).height = 12;

    const bHeaders = ['Sr.No', 'Employee Name', 'Designation', 'Net Salary (PKR)', 'Account Title', 'IBAN Number', 'Bank Name'];
    const bHeaderRow = ws2.addRow(bHeaders);
    bHeaderRow.height = 28;

    bHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF064E3B' } },
        bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
      };
    });

    let bSrNo = 1;
    let bStartRow = 5;

    employees.forEach((emp, index) => {
      const saved = payrollMap.get(emp._id.toString());
      const gross = (emp.basicSalary || 0) + (emp.fuelAllowance || 0) + (emp.foodAllowance || 0) + (emp.mobileAllowance || 0) + (emp.performanceAllowance || 0) + (emp.otherAllowances || 0);
      const loanDed = saved ? saved.loanDeduction : 0;
      const netPay = saved ? saved.netPayable : Math.max(0, gross - loanDed);

      const row = ws2.addRow([
        bSrNo++,
        emp.name,
        emp.designation,
        netPay,
        emp.accountTitle || emp.name,
        emp.ibanNumber || 'N/A',
        emp.bankName || 'Cash / Bank',
      ]);

      row.height = 22;
      const isEven = index % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF0FDF4' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (colNumber === 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        else if (colNumber === 4) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

    const bEndRow = bStartRow + employees.length - 1;

    const bTotalRow = ws2.addRow([
      '',
      'TOTAL BANK PAYOUT',
      '',
      { formula: `SUM(D${bStartRow}:D${bEndRow})` },
      '',
      '',
      '',
    ]);

    bTotalRow.height = 26;
    bTotalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF064E3B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF059669' } },
        bottom: { style: 'double', color: { argb: 'FF064E3B' } },
      };

      if (colNumber === 4) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0';
      }
    });

    ws2.mergeCells(`B${bEndRow + 1}:C${bEndRow + 1}`);

    ws2.columns = [
      { width: 8 },  // Sr.No
      { width: 26 }, // Employee Name
      { width: 24 }, // Designation
      { width: 22 }, // Net Salary
      { width: 26 }, // Account Title
      { width: 28 }, // IBAN Number
      { width: 24 }, // Bank Name
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
 * Helper to encode assets (Logo & Signatures) to base64 data URIs
 */
const getAssetBase64 = (fileName) => {
  const possiblePaths = [
    path.join(process.cwd(), 'Frontend', 'src', 'assets', 'image', fileName),
    path.join(process.cwd(), '..', 'Frontend', 'src', 'assets', 'image', fileName),
    path.join(process.cwd(), 'src', 'assets', 'image', fileName),
    path.join(process.cwd(), 'assets', fileName),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const fileData = fs.readFileSync(p);
      const ext = path.extname(p).replace('.', '');
      return `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${fileData.toString('base64')}`;
    }
  }
  return '';
};

/**
 * @desc    Generate Printable PDF Salary Slip for an Employee matching official format
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
    const allowance = savedPayroll && savedPayroll.allowance !== undefined
      ? savedPayroll.allowance
      : (employee.allowance || (
          (employee.fuelAllowance || 0) +
          (employee.foodAllowance || 0) +
          (employee.mobileAllowance || 0) +
          (employee.performanceAllowance || 0) +
          (employee.otherAllowances || 0)
        ));
    const allowanceReason = savedPayroll ? (savedPayroll.allowanceReason || '') : (employee.allowanceReason || '');

    const overtime = savedPayroll ? savedPayroll.overtimeAmount || 0 : 0;
    const bonus = savedPayroll ? savedPayroll.bonusAmount || 0 : 0;
    const leaveEncashment = savedPayroll ? savedPayroll.leaveEncashmentAmount || 0 : 0;
    const otherReceipts = savedPayroll ? savedPayroll.otherReceiptsAmount || 0 : 0;

    const gross = savedPayroll
      ? savedPayroll.grossSalary
      : basic + allowance + overtime + bonus + leaveEncashment + otherReceipts;

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

    // Base64 Asset Images
    const logoBase64 = getAssetBase64('logo.png');
    const sarfrazSignBase64 = getAssetBase64('sarfrazsign.png');
    const khurshidSignBase64 = getAssetBase64('khurshidsign.png');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Salary Pay Slip - ${employee.name}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #0f172a;
          margin: 0;
          padding: 10px;
          background: #fff;
          font-size: 13px;
        }
        .slip-card {
          border: 2px solid #0f172a;
          border-radius: 12px;
          padding: 20px;
          background: #ffffff;
        }
        .header-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
        }
        .header-table td {
          vertical-align: middle;
        }
        .company-title {
          font-size: 26px;
          font-weight: 900;
          color: #0f172a;
          margin: 0;
          letter-spacing: 0.5px;
        }
        .company-subtitle {
          font-size: 11px;
          color: #475569;
          margin: 3px 0 0 0;
          font-weight: 600;
        }
        .banner-title {
          background: #0f172a;
          color: #ffffff;
          text-align: center;
          padding: 9px;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 1.5px;
          border-radius: 6px;
          text-transform: uppercase;
          margin: 15px 0;
        }
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          font-size: 12px;
        }
        .info-table td {
          padding: 6px 8px;
          border: 1px solid #cbd5e1;
        }
        .info-label {
          background: #f8fafc;
          font-weight: 700;
          color: #334155;
          width: 18%;
        }
        .info-val {
          font-weight: 600;
          color: #0f172a;
          width: 32%;
        }
        .grid-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          font-size: 12px;
        }
        .grid-table th {
          background: #1e293b;
          color: #ffffff;
          padding: 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: left;
          border: 1px solid #0f172a;
        }
        .grid-table td {
          padding: 6px 8px;
          border: 1px solid #cbd5e1;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-mono { font-family: 'Courier New', Courier, monospace; }
        .font-bold { font-weight: bold; }
        
        .payout-box {
          background: #f0fdf4;
          border: 2px solid #16a34a;
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          margin: 18px 0;
        }
        .payout-amount {
          font-size: 32px;
          font-weight: 900;
          color: #15803d;
          letter-spacing: 1px;
          font-family: 'Courier New', Courier, monospace;
        }
        .payout-words {
          font-size: 13px;
          font-weight: 700;
          color: #166534;
          margin-top: 5px;
          font-style: italic;
        }
        .sign-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 25px;
          text-align: center;
        }
        .sign-table td {
          vertical-align: bottom;
          padding: 10px;
          width: 33.33%;
        }
        .sign-line {
          border-top: 1.5px dashed #475569;
          margin-top: 5px;
          padding-top: 5px;
          font-size: 11px;
          font-weight: 700;
          color: #1e293b;
        }
        .footer-note {
          font-size: 10px;
          color: #64748b;
          text-align: center;
          margin-top: 15px;
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
        }
      </style>
    </head>
    <body>
      <div class="slip-card">
        <!-- HEADER -->
        <table class="header-table">
          <tr>
            <td style="width: 25%;">
              ${logoBase64 ? `<img src="${logoBase64}" alt="Pixx Technologies" style="height: 55px; max-width: 190px; object-fit: contain;" />` : `<h2 style="margin:0; color:#059669;">PIXX TECH</h2>`}
            </td>
            <td style="width: 75%; text-align: right;">
              <div class="company-title">PIXX TECHNOLOGIES PAKISTAN</div>
              <div class="company-subtitle">Office 4C, 3rd Floor, Plaza 48-C, Main Boulevard, Bahria Town, Lahore | NTN: 8941205</div>
              <div class="company-subtitle">Email: hr@pixxtech.com | Web: www.pixxtech.com</div>
            </td>
          </tr>
        </table>

        <div style="height: 3px; background: linear-gradient(90deg, #059669, #0284c7, #6366f1); border-radius: 2px;"></div>

        <!-- DOCUMENT TITLE BANNER -->
        <div class="banner-title">
          SALARY PAY SLIP — ${formattedTitleDate.toUpperCase()}
        </div>

        <!-- EMPLOYEE INFO METADATA GRID -->
        <table class="info-table">
          <tr>
            <td class="info-label">Employee Name:</td>
            <td class="info-val font-bold" style="font-size: 14px; color: #0f172a;">${employee.name}</td>
            <td class="info-label">Employee Code:</td>
            <td class="info-val font-mono font-bold">${employee.employeeCode || 'EMP-PIX'}</td>
          </tr>
          <tr>
            <td class="info-label">Designation:</td>
            <td class="info-val font-bold" style="color: #4f46e5;">${employee.designation}</td>
            <td class="info-label">Workplace / Dept:</td>
            <td class="info-val font-bold" style="color: #059669;">${employee.department}</td>
          </tr>
          <tr>
            <td class="info-label">Pay Period:</td>
            <td class="info-val font-mono">${formattedTitleDate}</td>
            <td class="info-label">Payment Status:</td>
            <td class="info-val font-bold" style="color: #059669;">${savedPayroll?.paymentStatus || 'FINALIZED'}</td>
          </tr>
          <tr>
            <td class="info-label">Bank Name:</td>
            <td class="info-val">${savedPayroll?.bankName || employee.bankName || 'Cash / Bank'}</td>
            <td class="info-label">IBAN / Account:</td>
            <td class="info-val font-mono">${savedPayroll?.ibanNumber || employee.ibanNumber || 'N/A'}</td>
          </tr>
        </table>

        <!-- ITEMIZED EARNINGS & DEDUCTIONS BREAKDOWN -->
        <table class="grid-table">
          <thead>
            <tr>
              <th style="width: 50%; background: #065f46;">EARNINGS ITEMIZATION</th>
              <th style="width: 50%; background: #881337;">DEDUCTIONS ITEMIZATION</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <!-- LEFT: EARNINGS -->
              <td style="vertical-align: top; padding: 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="border: none; padding: 6px;">Basic Salary</td>
                    <td class="text-right font-mono font-bold" style="border: none; padding: 6px;">PKR ${formatPKR(basic)}</td>
                  </tr>
                  ${allowance > 0 ? `
                  <tr>
                    <td style="border: none; padding: 6px;">Allowance <br/><span style="font-size:10px; color:#475569;">(${allowanceReason || 'General Allowance'})</span></td>
                    <td class="text-right font-mono font-bold" style="border: none; padding: 6px; color:#059669;">+PKR ${formatPKR(allowance)}</td>
                  </tr>
                  ` : ''}
                  ${overtime > 0 ? `
                  <tr>
                    <td style="border: none; padding: 6px;">Overtime (OT)</td>
                    <td class="text-right font-mono" style="border: none; padding: 6px;">PKR ${formatPKR(overtime)}</td>
                  </tr>
                  ` : ''}
                  ${bonus > 0 ? `
                  <tr>
                    <td style="border: none; padding: 6px;">Bonus</td>
                    <td class="text-right font-mono" style="border: none; padding: 6px;">PKR ${formatPKR(bonus)}</td>
                  </tr>
                  ` : ''}
                  ${otherReceipts > 0 ? `
                  <tr>
                    <td style="border: none; padding: 6px;">Other Receipts</td>
                    <td class="text-right font-mono" style="border: none; padding: 6px;">PKR ${formatPKR(otherReceipts)}</td>
                  </tr>
                  ` : ''}
                  <tr style="border-top: 1px solid #cbd5e1; background: #f8fafc;">
                    <td style="border: none; padding: 8px; font-weight: bold;">TOTAL GROSS SALARY</td>
                    <td class="text-right font-mono font-bold" style="border: none; padding: 8px; font-size: 13px;">PKR ${formatPKR(gross)}</td>
                  </tr>
                </table>
              </td>

              <!-- RIGHT: DEDUCTIONS & ATTENDANCE SUMMARY -->
              <td style="vertical-align: top; padding: 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="border: none; padding: 6px;">Loan / Advance Salary</td>
                    <td class="text-right font-mono font-bold" style="border: none; padding: 6px; color:#e11d48;">-PKR ${formatPKR(loanDed)}</td>
                  </tr>
                  <tr>
                    <td style="border: none; padding: 6px;">Loss of Pay (LOP) Deduction</td>
                    <td class="text-right font-mono" style="border: none; padding: 6px;">-PKR ${formatPKR(lopDed)}</td>
                  </tr>
                  ${othDed > 0 ? `
                  <tr>
                    <td style="border: none; padding: 6px;">Other Deductions</td>
                    <td class="text-right font-mono" style="border: none; padding: 6px;">-PKR ${formatPKR(othDed)}</td>
                  </tr>
                  ` : ''}
                  ${whtDed > 0 ? `
                  <tr>
                    <td style="border: none; padding: 6px;">WHT Tax Deduction</td>
                    <td class="text-right font-mono" style="border: none; padding: 6px;">-PKR ${formatPKR(whtDed)}</td>
                  </tr>
                  ` : ''}
                  <tr style="border-top: 1px solid #cbd5e1; background: #fff1f2;">
                    <td style="border: none; padding: 8px; font-weight: bold; color:#9f1239;">TOTAL DEDUCTIONS</td>
                    <td class="text-right font-mono font-bold" style="border: none; padding: 8px; font-size: 13px; color:#9f1239;">-PKR ${formatPKR(totDed)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- ATTENDANCE METRICS BAR -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
          <tr>
            <td style="padding: 6px 10px; font-weight: bold;">Attendance: <span style="color:#059669; font-family:monospace;">${presentDays} Days</span></td>
            <td style="padding: 6px 10px; font-weight: bold;">Leaves Taken: <span style="color:#334155; font-family:monospace;">${leaveDays} Days</span></td>
            <td style="padding: 6px 10px; font-weight: bold;">Allowed Leaves: <span style="color:#334155; font-family:monospace;">${allowedLeaves} Days</span></td>
            <td style="padding: 6px 10px; font-weight: bold;">LOP Days: <span style="color:#e11d48; font-family:monospace;">${lopDays} Days</span></td>
            <td style="padding: 6px 10px; font-weight: bold;">Salary Days: <span style="color:#4f46e5; font-family:monospace;">${totalSalaryDays} Days</span></td>
          </tr>
        </table>

        <!-- NET TAKE HOME PAYOUT CARD -->
        <div class="payout-box">
          <div style="font-size: 11px; font-weight: 800; color: #166534; text-transform: uppercase; letter-spacing: 1px;">NET PAYABLE SALARY DISBURSED</div>
          <div class="payout-amount">PKR ${formatPKR(netPayable)}</div>
          <div class="payout-words">"${amountInWords}"</div>
        </div>

        <!-- SIGNATURES FOOTER -->
        <table class="sign-table">
          <tr>
            <td>
              ${sarfrazSignBase64 ? `<img src="${sarfrazSignBase64}" style="height: 48px; max-width: 130px; object-fit: contain; margin-bottom: 3px;" />` : ''}
              <div class="sign-line">Sarfaraz (Senior Accountant)<br/><span style="font-size:9px; color:#64748b;">Prepared By</span></div>
            </td>
            <td>
              ${khurshidSignBase64 ? `<img src="${khurshidSignBase64}" style="height: 48px; max-width: 130px; object-fit: contain; margin-bottom: 3px;" />` : ''}
              <div class="sign-line">Khurshid Anwar (Finance Director)<br/><span style="font-size:9px; color:#64748b;">Approved & Verified</span></div>
            </td>
            <td>
              <div style="height: 48px;"></div>
              <div class="sign-line">${employee.name}<br/><span style="font-size:9px; color:#64748b;">Employee Acknowledgement</span></div>
            </td>
          </tr>
        </table>

        <div class="footer-note">
          This is an official computer-generated Salary Pay Slip issued by Pixx Technologies Pakistan. Document generated on ${new Date().toLocaleDateString('en-PK')} • Verified system record.
        </div>
      </div>
    </body>
    </html>
    `;

    // Try Puppeteer PDF rendering
    try {
      const browser = await launchPuppeteer();
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
      console.error('[Puppeteer Error] Salary Slip PDF failed:', pdfErr.message);
      return res.status(500).json({
        success: false,
        message: `PDF generation failed: ${pdfErr.message}`,
      });
    }
  } catch (error) {
    console.error('[Generate Salary Slip PDF Error]:', error);
    return apiError(res, 'Failed to generate Salary Slip PDF.', 500);
  }
};

/**
 * @desc    Pay single employee salary from existing Finance Bank/Cash Account
 * @route   POST /api/staff/payroll/pay-single
 * @access  Private
 */
export const paySingleSalary = async (req, res) => {
  try {
    const {
      month,
      employeeId,
      payrollId,
      paidFromAccountId,
      paymentMethod = 'BANK_TRANSFER',
      paymentNotes = '',
      paymentDate = new Date(),
    } = req.body;

    if (!month || (!employeeId && !payrollId) || !paidFromAccountId) {
      return apiError(res, 'Month (YYYY-MM), employeeId/payrollId, and paidFromAccountId are required.', 400);
    }

    let pDoc = null;
    if (payrollId) {
      pDoc = await Payroll.findById(payrollId);
    } else {
      pDoc = await Payroll.findOne({ payrollMonth: month, employeeId });
    }

    if (!pDoc) {
      return apiError(res, 'Payroll record not found. Please calculate and save payroll first.', 404);
    }

    if (pDoc.paymentStatus === 'PAID') {
      return apiError(res, `Salary for ${pDoc.employeeName} for ${month} is already marked PAID (Voucher: ${pDoc.voucherNo}).`, 400);
    }

    const netAmount = round2(pDoc.netPayable);
    if (netAmount <= 0) {
      return apiError(res, `Net payable for ${pDoc.employeeName} is Rs. 0. Payout not required.`, 400);
    }

    const account = await Account.findById(paidFromAccountId);
    if (!account) {
      return apiError(res, 'Selected Finance Bank/Cash Account not found.', 404);
    }
    if (!account.isActive) {
      return apiError(res, `Account "${account.name}" is inactive.`, 400);
    }

    if (account.currentBalance < netAmount) {
      return apiError(
        res,
        `Insufficient balance in "${account.name}". Current Balance: Rs. ${formatPKR(account.currentBalance)}, Required: Rs. ${formatPKR(netAmount)}.`,
        400
      );
    }

    const salariesCategory = await getOrCreateSalariesCategory();
    const clearingAccount = await getOrCreateOtherIncomeClearingAccount();

    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    const endOfMonthDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    let pDate = paymentDate ? new Date(paymentDate) : endOfMonthDate;
    if (isNaN(pDate.getTime()) || pDate.getUTCFullYear() !== year || (pDate.getUTCMonth() + 1) !== monthNum) {
      pDate = endOfMonthDate;
    }

    const voucherNo = await suggestNextVoucherNumber('EXPENSE', pDate);

    const transaction = await createTransaction({
      date: pDate,
      voucherNo,
      detail: `Salary Payout to ${pDoc.employeeName} (${pDoc.designation}) — Month ${month}`,
      categoryId: salariesCategory._id,
      drAccountId: clearingAccount._id,
      crAccountId: account._id,
      amount: netAmount,
      transactionType: 'EXPENSE',
      expenseClassification: 'GENERAL_EXPENSE',
      reportCategory: 'Payments',
      sourceModule: 'EXPENSE',
      sourceId: pDoc._id,
      createdBy: req.user?._id || null,
    });

    pDoc.status = 'PAID';
    pDoc.paymentStatus = 'PAID';
    pDoc.paidFromAccountId = account._id;
    pDoc.paidFromAccountName = account.name;
    pDoc.paymentDate = pDate;
    pDoc.paidDate = pDate;
    pDoc.transactionId = transaction._id;
    pDoc.voucherId = transaction.voucherId;
    pDoc.voucherNo = transaction.voucherNo;
    pDoc.paymentMethod = paymentMethod;
    pDoc.paymentNotes = paymentNotes;
    await pDoc.save();

    await StaffAuditLog.create({
      userId: req.user?._id || null,
      userName: req.user?.name || 'System Operator',
      action: 'SALARY_PAID',
      recordId: pDoc._id.toString(),
      details: `Paid salary of Rs. ${formatPKR(netAmount)} to ${pDoc.employeeName} from ${account.name} (Voucher: ${transaction.voucherNo}).`,
      newValue: {
        amount: netAmount,
        account: account.name,
        voucherNo: transaction.voucherNo,
      },
    });

    return apiSuccess(
      res,
      { payroll: pDoc, transaction, updatedAccountBalance: account.currentBalance - netAmount },
      `Salary of Rs. ${formatPKR(netAmount)} successfully paid to ${pDoc.employeeName} from ${account.name}.`
    );
  } catch (error) {
    console.error('[Pay Single Salary Error]:', error);
    return apiError(res, error.message || 'Failed to process salary payment.', 500);
  }
};

/**
 * @desc    Pay multiple employee salaries in bulk from single Finance Account
 * @route   POST /api/staff/payroll/pay-bulk
 * @access  Private
 */
export const payBulkSalary = async (req, res) => {
  try {
    const {
      month,
      payrollIds = [],
      paidFromAccountId,
      paymentMethod = 'BANK_TRANSFER',
      paymentNotes = '',
      paymentDate = new Date(),
    } = req.body;

    if (!month || !Array.isArray(payrollIds) || payrollIds.length === 0 || !paidFromAccountId) {
      return apiError(res, 'Month, non-empty payrollIds array, and paidFromAccountId are required.', 400);
    }

    const account = await Account.findById(paidFromAccountId);
    if (!account || !account.isActive) {
      return apiError(res, 'Valid, active Finance Bank/Cash Account is required.', 400);
    }

    const payrollDocs = await Payroll.find({
      _id: { $in: payrollIds },
      payrollMonth: month,
      paymentStatus: { $ne: 'PAID' },
    });

    if (payrollDocs.length === 0) {
      return apiError(res, 'No eligible unpaid payroll records found for payout.', 400);
    }

    const totalRequired = round2(payrollDocs.reduce((sum, p) => sum + p.netPayable, 0));
    if (account.currentBalance < totalRequired) {
      return apiError(
        res,
        `Insufficient account balance in "${account.name}". Current: Rs. ${formatPKR(account.currentBalance)}, Total Required for ${payrollDocs.length} employees: Rs. ${formatPKR(totalRequired)}.`,
        400
      );
    }

    const salariesCategory = await getOrCreateSalariesCategory();
    const clearingAccount = await getOrCreateOtherIncomeClearingAccount();
    
    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    const endOfMonthDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    let pDate = paymentDate ? new Date(paymentDate) : endOfMonthDate;
    if (isNaN(pDate.getTime()) || pDate.getUTCFullYear() !== year || (pDate.getUTCMonth() + 1) !== monthNum) {
      pDate = endOfMonthDate;
    }

    const results = [];
    for (const pDoc of payrollDocs) {
      const netAmount = round2(pDoc.netPayable);
      if (netAmount <= 0) continue;

      const voucherNo = await suggestNextVoucherNumber('EXPENSE', pDate);
      const transaction = await createTransaction({
        date: pDate,
        voucherNo,
        detail: `Salary Payout to ${pDoc.employeeName} (${pDoc.designation}) — Month ${month}`,
        categoryId: salariesCategory._id,
        drAccountId: clearingAccount._id,
        crAccountId: account._id,
        amount: netAmount,
        transactionType: 'EXPENSE',
        expenseClassification: 'GENERAL_EXPENSE',
        reportCategory: 'Payments',
        sourceModule: 'EXPENSE',
        sourceId: pDoc._id,
        createdBy: req.user?._id || null,
      });

      pDoc.status = 'PAID';
      pDoc.paymentStatus = 'PAID';
      pDoc.paidFromAccountId = account._id;
      pDoc.paidFromAccountName = account.name;
      pDoc.paymentDate = pDate;
      pDoc.paidDate = pDate;
      pDoc.transactionId = transaction._id;
      pDoc.voucherId = transaction.voucherId;
      pDoc.voucherNo = transaction.voucherNo;
      pDoc.paymentMethod = paymentMethod;
      pDoc.paymentNotes = paymentNotes;
      await pDoc.save();

      results.push({
        employeeName: pDoc.employeeName,
        amount: netAmount,
        voucherNo: transaction.voucherNo,
      });
    }

    await StaffAuditLog.create({
      userId: req.user?._id || null,
      userName: req.user?.name || 'System Operator',
      action: 'BULK_SALARY_PAID',
      recordId: month,
      details: `Bulk paid ${results.length} employee salaries totaling Rs. ${formatPKR(totalRequired)} from ${account.name}.`,
      newValue: { count: results.length, totalPaid: totalRequired, account: account.name },
    });

    return apiSuccess(
      res,
      { count: results.length, totalAmountPaid: totalRequired, paidList: results },
      `Successfully disbursed ${results.length} employee salaries totaling Rs. ${formatPKR(totalRequired)} from ${account.name}.`
    );
  } catch (error) {
    console.error('[Pay Bulk Salary Error]:', error);
    return apiError(res, error.message || 'Failed to process bulk salary payments.', 500);
  }
};

/**
 * @desc    Reverse a paid salary transaction & restore bank/cash balance
 * @route   POST /api/staff/payroll/reverse
 * @access  Private
 */
export const reverseSalaryPayment = async (req, res) => {
  try {
    const { payrollId, employeeId, month, reason = '' } = req.body;

    let pDoc = null;
    if (payrollId) {
      pDoc = await Payroll.findById(payrollId);
    } else {
      pDoc = await Payroll.findOne({ payrollMonth: month, employeeId });
    }

    if (!pDoc) {
      return apiError(res, 'Payroll record not found.', 404);
    }

    if (pDoc.paymentStatus !== 'PAID') {
      return apiError(res, `Salary for ${pDoc.employeeName} is not marked as PAID.`, 400);
    }

    const transactionId = pDoc.transactionId;
    const paidAccountId = pDoc.paidFromAccountId;
    const paidAmount = round2(pDoc.netPayable);

    if (transactionId) {
      const tx = await Transaction.findById(transactionId);
      if (tx && tx.status !== 'REVERSED') {
        tx.status = 'REVERSED';
        await tx.save();

        if (tx.voucherId) {
          await Voucher.findByIdAndUpdate(tx.voucherId, { status: 'REVERSED' });
        }

        if (paidAccountId) {
          await Account.findByIdAndUpdate(paidAccountId, {
            $inc: { currentBalance: paidAmount },
          });
        }

        const clearingAcc = await getOrCreateOtherIncomeClearingAccount();
        if (clearingAcc) {
          await Account.findByIdAndUpdate(clearingAcc._id, {
            $inc: { currentBalance: -paidAmount },
          });
        }
      }
    }

    const prevVoucher = pDoc.voucherNo;
    pDoc.status = 'FINALIZED';
    pDoc.paymentStatus = 'PENDING_PAYMENT';
    pDoc.paidFromAccountId = null;
    pDoc.paidFromAccountName = '';
    pDoc.paymentDate = null;
    pDoc.paidDate = null;
    pDoc.transactionId = null;
    pDoc.voucherId = null;
    pDoc.voucherNo = '';
    pDoc.paymentMethod = 'BANK_TRANSFER';
    pDoc.paymentNotes = '';
    await pDoc.save();

    await StaffAuditLog.create({
      userId: req.user?._id || null,
      userName: req.user?.name || 'System Operator',
      action: 'SALARY_PAYMENT_REVERSED',
      recordId: pDoc._id.toString(),
      details: `Reversed salary payment of Rs. ${formatPKR(paidAmount)} for ${pDoc.employeeName} (Voucher ${prevVoucher}). Reason: ${reason || 'N/A'}.`,
    });

    return apiSuccess(
      res,
      { payroll: pDoc },
      `Salary payment for ${pDoc.employeeName} reversed successfully. Disbursing account balance restored.`
    );
  } catch (error) {
    console.error('[Reverse Salary Payment Error]:', error);
    return apiError(res, error.message || 'Failed to reverse salary payment.', 500);
  }
};

/**
 * @desc    Get monthly salary liability vs finance payouts reconciliation
 * @route   GET /api/staff/payroll/reconciliation
 * @access  Private
 */
export const getSalaryReconciliation = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;

    const payrollDocs = await Payroll.find({ payrollMonth: month }).lean();

    let totalLiability = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const accountBreakdown = {};

    payrollDocs.forEach((p) => {
      const net = round2(p.netPayable);
      totalLiability += net;

      if (p.paymentStatus === 'PAID') {
        totalPaid += net;
        const accName = p.paidFromAccountName || 'Unknown Finance Account';
        accountBreakdown[accName] = round2((accountBreakdown[accName] || 0) + net);
      } else {
        totalPending += net;
      }
    });

    return apiSuccess(
      res,
      {
        month,
        totalEmployees: payrollDocs.length,
        totalLiability: round2(totalLiability),
        totalPaid: round2(totalPaid),
        totalPending: round2(totalPending),
        accountBreakdown,
        payroll: payrollDocs,
      },
      `Salary reconciliation for ${month}.`
    );
  } catch (error) {
    console.error('[Get Salary Reconciliation Error]:', error);
    return apiError(res, 'Failed to fetch salary reconciliation data.', 500);
  }
};

/**
 * @desc    Generate official Monthly Salary Sheet & Finance Payout PDF Report
 * @route   GET /api/staff/payroll/monthly-sheet-pdf
 * @access  Private
 */
export const generateMonthlySalarySheetPDF = async (req, res) => {
  try {
    const { month = '2026-08' } = req.query;

    const [y, m] = month.split('-').map(Number);
    const dateObj = new Date(y, m - 1, 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
    const formattedTitleDate = `${monthName} ${y}`;

    // 1. Fetch Employees & Payroll Records
    const employees = await Employee.find({ status: { $ne: 'INACTIVE' } }).sort({ name: 1 }).lean();
    const savedPayrolls = await Payroll.find({ payrollMonth: month }).lean();

    const savedMap = new Map();
    savedPayrolls.forEach((p) => savedMap.set(p.employeeId.toString(), p));

    let grandBasic = 0;
    let grandAllowance = 0;
    let grandOvertime = 0;
    let grandBonus = 0;
    let grandGross = 0;
    let grandLoanDed = 0;
    let grandLopDed = 0;
    let grandOtherDed = 0;
    let grandTotalDed = 0;
    let grandNetPay = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const accountBreakdownMap = {};

    const itemizedRows = employees.map((emp, index) => {
      const pDoc = savedMap.get(emp._id.toString());

      const basic = pDoc ? pDoc.basicSalary : (emp.basicSalary || 0);
      const allowance = pDoc && pDoc.allowance !== undefined
        ? pDoc.allowance
        : (emp.allowance || (
            (emp.fuelAllowance || 0) +
            (emp.foodAllowance || 0) +
            (emp.mobileAllowance || 0) +
            (emp.performanceAllowance || 0) +
            (emp.otherAllowances || 0)
          ));
      const allowanceReason = pDoc ? (pDoc.allowanceReason || '') : (emp.allowanceReason || '');

      const overtime = pDoc ? pDoc.overtimeAmount || 0 : 0;
      const bonus = pDoc ? pDoc.bonusAmount || 0 : 0;
      const gross = pDoc ? pDoc.grossSalary : (basic + allowance + overtime + bonus);

      const loanDed = pDoc ? pDoc.loanDeduction || 0 : 0;
      const lopDed = pDoc ? pDoc.lopDeduction || 0 : 0;
      const othDed = pDoc ? (pDoc.otherDeduction || 0) + (pDoc.whtDeduction || 0) : 0;
      const totDed = loanDed + lopDed + othDed;
      const netPayable = Math.max(0, gross - totDed);

      const status = pDoc?.paymentStatus === 'PAID' ? 'PAID' : 'PENDING';
      const paidAccount = pDoc?.paidFromAccountName || '-';
      const voucherNo = pDoc?.voucherNo || '-';

      grandBasic += basic;
      grandAllowance += allowance;
      grandOvertime += overtime;
      grandBonus += bonus;
      grandGross += gross;
      grandLoanDed += loanDed;
      grandLopDed += lopDed;
      grandOtherDed += othDed;
      grandTotalDed += totDed;
      grandNetPay += netPayable;

      if (status === 'PAID') {
        totalPaid += netPayable;
        if (pDoc?.paidFromAccountName) {
          accountBreakdownMap[pDoc.paidFromAccountName] = round2((accountBreakdownMap[pDoc.paidFromAccountName] || 0) + netPayable);
        }
      } else {
        totalPending += netPayable;
      }

      return {
        srNo: index + 1,
        code: emp.employeeCode || `EMP-${index + 101}`,
        name: emp.name,
        designation: emp.designation || 'Staff',
        department: emp.department || 'General',
        presentDays: pDoc ? pDoc.presentDays : 30,
        lopDays: pDoc ? pDoc.lopDays : 0,
        basic,
        allowance,
        allowanceReason,
        overtime,
        bonus,
        gross,
        loanDed,
        lopDed,
        othDed,
        totDed,
        netPayable,
        status,
        paidAccount,
        voucherNo,
      };
    });

    const logoBase64 = getAssetBase64('logo.png');
    const sarfrazSignBase64 = getAssetBase64('sarfrazsign.png');
    const khurshidSignBase64 = getAssetBase64('khurshidsign.png');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Monthly Salary Sheet - ${formattedTitleDate}</title>
      <style>
        @page { size: A4 landscape; margin: 7mm 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #1e293b;
          background: #fff;
          font-size: 9.5px;
        }
        /* ─── HEADER ─── */
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2.5px solid #0f172a;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .logo-wrap img {
          height: 34px;
          width: auto;
          object-fit: contain;
          display: block;
        }
        .company-block { text-align: right; }
        .company-name {
          font-size: 15px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: 0.4px;
          line-height: 1.1;
        }
        .company-addr {
          font-size: 8px;
          color: #64748b;
          margin-top: 2px;
        }
        /* ─── GRADIENT LINE ─── */
        .grad-bar {
          height: 3px;
          background: linear-gradient(90deg, #059669 0%, #0284c7 50%, #6366f1 100%);
          border-radius: 2px;
          margin-bottom: 5px;
        }
        /* ─── DOCUMENT TITLE STRIP ─── */
        .doc-title {
          background: #0f172a;
          color: #fff;
          text-align: center;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.2px;
          padding: 5px 0;
          border-radius: 5px;
          margin-bottom: 6px;
        }
        /* ─── METRICS BAR ─── */
        .metrics-bar {
          display: flex;
          gap: 5px;
          margin-bottom: 7px;
        }
        .metric-box {
          flex: 1;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 5px 8px;
          text-align: center;
          background: #f8fafc;
        }
        .metric-box.green { background: #f0fdf4; border-color: #bbf7d0; }
        .metric-box.amber { background: #fffbeb; border-color: #fde68a; }
        .metric-lbl {
          font-size: 7.5px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .metric-val {
          font-size: 12px;
          font-weight: 900;
          color: #0f172a;
          margin-top: 1px;
        }
        .metric-val.indigo { color: #4f46e5; }
        .metric-val.gn { color: #166534; }
        .metric-val.am { color: #92400e; }
        /* ─── SALARY TABLE ─── */
        .sal-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
          font-size: 8.5px;
        }
        .sal-table thead tr {
          background: #0f172a;
          color: #fff;
        }
        .sal-table th {
          padding: 5px 4px;
          text-align: center;
          font-weight: 700;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          border: 1px solid #1e293b;
        }
        .sal-table th.left { text-align: left; }
        .sal-table td {
          padding: 4px 4px;
          border: 1px solid #e2e8f0;
          vertical-align: top;
        }
        .sal-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .sal-table tbody tr:hover td { background: #eff6ff; }
        /* ─── TOTALS ROW ─── */
        .sal-table .totals-row td {
          background: #0f172a !important;
          color: #fff !important;
          font-weight: 800 !important;
          font-size: 9px !important;
          border-color: #1e293b;
        }
        /* ─── STATUS BADGES ─── */
        .badge-paid {
          display: inline-block;
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #86efac;
          font-weight: 800;
          font-size: 7.5px;
          padding: 1px 5px;
          border-radius: 3px;
        }
        .badge-pending {
          display: inline-block;
          background: #fef3c7;
          color: #b45309;
          border: 1px solid #fcd34d;
          font-weight: 800;
          font-size: 7.5px;
          padding: 1px 5px;
          border-radius: 3px;
        }
        /* ─── SIGNATURES ─── */
        .sign-section {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          gap: 20px;
        }
        .sign-block {
          flex: 1;
          text-align: center;
        }
        .sign-block img {
          height: 32px;
          width: auto;
          object-fit: contain;
          margin-bottom: 3px;
          display: block;
          margin-left: auto;
          margin-right: auto;
        }
        .sign-line {
          border-top: 1px solid #64748b;
          padding-top: 3px;
          font-size: 8px;
          font-weight: 700;
          color: #1e293b;
        }
        .sign-line span { font-size: 7px; color: #94a3b8; font-weight: 400; }
        /* ─── FOOTER ─── */
        .doc-footer {
          font-size: 7.5px;
          color: #94a3b8;
          text-align: center;
          border-top: 1px solid #e2e8f0;
          padding-top: 4px;
          margin-top: 6px;
        }
        /* ─── UTILS ─── */
        .tr { text-align: right; }
        .tc { text-align: center; }
        .tl { text-align: left; }
        .fw9 { font-weight: 900; }
        .fw7 { font-weight: 700; }
        .mono { font-family: 'Courier New', monospace; }
        .col-indigo { color: #4f46e5; }
        .col-green { color: #059669; }
        .col-red { color: #e11d48; }
        .col-slate { color: #64748b; }
        .col-blue { color: #0284c7; }
      </style>
    </head>
    <body>

      <!-- PAGE HEADER -->
      <div class="page-header">
        <div class="logo-wrap">
          ${logoBase64
            ? `<img src="${logoBase64}" alt="Pixx Technologies" />`
            : `<div style="font-size:16px;font-weight:900;color:#059669;">PIXX TECH</div>`
          }
        </div>
        <div class="company-block">
          <div class="company-name">PIXX TECHNOLOGIES PAKISTAN</div>
          <div class="company-addr">Office 4C, 3rd Floor, Plaza 48-C, Main Boulevard, Bahria Town, Lahore &nbsp;|&nbsp; NTN: 8941205</div>
          <div class="company-addr">HR &amp; Finance Payroll Management System &nbsp;|&nbsp; hr@pixxtech.com</div>
        </div>
      </div>

      <!-- GRADIENT BAR -->
      <div class="grad-bar"></div>

      <!-- DOCUMENT TITLE -->
      <div class="doc-title">
        MONTHLY SALARY SHEET &amp; FINANCE PAYOUT REPORT &mdash; ${formattedTitleDate.toUpperCase()}
      </div>

      <!-- METRICS BAR -->
      <div class="metrics-bar">
        <div class="metric-box">
          <div class="metric-lbl">Total Employees</div>
          <div class="metric-val">${itemizedRows.length}</div>
        </div>
        <div class="metric-box">
          <div class="metric-lbl">Total Basic Salary</div>
          <div class="metric-val mono">Rs. ${formatPKR(grandBasic)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-lbl">Gross Payroll Amount</div>
          <div class="metric-val indigo mono">Rs. ${formatPKR(grandGross)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-lbl">Total Deductions</div>
          <div class="metric-val mono" style="color:#e11d48;">Rs. ${formatPKR(grandTotalDed)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-lbl">Net Salary Liability</div>
          <div class="metric-val fw9 mono">Rs. ${formatPKR(grandNetPay)}</div>
        </div>
        <div class="metric-box green">
          <div class="metric-lbl" style="color:#15803d;">Total Disbursed</div>
          <div class="metric-val gn mono">Rs. ${formatPKR(totalPaid)}</div>
        </div>
        <div class="metric-box amber">
          <div class="metric-lbl" style="color:#b45309;">Total Pending</div>
          <div class="metric-val am mono">Rs. ${formatPKR(totalPending)}</div>
        </div>
      </div>

      <!-- ITEMIZED SALARY TABLE -->
      <table class="sal-table">
        <thead>
          <tr>
            <th style="width:2.5%;">#</th>
            <th class="left" style="width:12%;">Employee Name</th>
            <th class="left" style="width:9%;">Designation / Dept</th>
            <th style="width:4.5%;">Days</th>
            <th style="width:8%;">Basic (Rs.)</th>
            <th style="width:9%;">Allowance &amp; Reason</th>
            <th style="width:7%;">Gross (Rs.)</th>
            <th style="width:6%;">Loan Ded.</th>
            <th style="width:5%;">LOP Ded.</th>
            <th style="width:5%;">Other Ded.</th>
            <th style="width:8%;">Net Payable (Rs.)</th>
            <th style="width:6%;">Status</th>
            <th style="width:18%;">Paid Account &amp; Voucher</th>
          </tr>
        </thead>
        <tbody>
          ${itemizedRows.map((r) => `
          <tr>
            <td class="tc mono fw7" style="color:#94a3b8;">${r.srNo}</td>
            <td>
              <div class="fw7" style="color:#0f172a;">${r.name}</div>
              <div class="mono col-slate" style="font-size:7px;">${r.code}</div>
            </td>
            <td>
              <div class="fw7" style="color:#334155;">${r.designation}</div>
              <div style="font-size:7px;color:#7c3aed;">${r.department}</div>
            </td>
            <td class="tc mono">
              <span class="fw7">${r.presentDays}</span><span class="col-slate">/30</span>
              ${r.lopDays > 0 ? `<div class="col-red" style="font-size:7px;">${r.lopDays} LOP</div>` : ''}
            </td>
            <td class="tr mono">${formatPKR(r.basic)}</td>
            <td class="tr">
              <div class="mono fw7">${r.allowance > 0 ? formatPKR(r.allowance) : '—'}</div>
              ${r.allowanceReason ? `<div style="font-size:7px;color:#64748b;">${r.allowanceReason}</div>` : ''}
            </td>
            <td class="tr mono fw7 col-indigo">${formatPKR(r.gross)}</td>
            <td class="tr mono ${r.loanDed > 0 ? 'col-red' : 'col-slate'}">${r.loanDed > 0 ? formatPKR(r.loanDed) : '—'}</td>
            <td class="tr mono ${r.lopDed > 0 ? 'col-red' : 'col-slate'}">${r.lopDed > 0 ? formatPKR(r.lopDed) : '—'}</td>
            <td class="tr mono ${r.othDed > 0 ? 'col-red' : 'col-slate'}">${r.othDed > 0 ? formatPKR(r.othDed) : '—'}</td>
            <td class="tr mono fw9 col-green" style="font-size:9.5px;">Rs. ${formatPKR(r.netPayable)}</td>
            <td class="tc">
              <span class="${r.status === 'PAID' ? 'badge-paid' : 'badge-pending'}">${r.status}</span>
            </td>
            <td>
              <div class="fw7" style="font-size:8px;color:#1e293b;">${r.paidAccount}</div>
              ${r.voucherNo !== '-' ? `<div class="mono col-blue" style="font-size:7px;">Vn: ${r.voucherNo}</div>` : ''}
            </td>
          </tr>
          `).join('')}

          <!-- GRAND TOTALS ROW -->
          <tr class="totals-row">
            <td colspan="4" class="tc fw9" style="letter-spacing:0.5px;">TOTAL MONTHLY PAYROLL SUMMARY</td>
            <td class="tr mono">${formatPKR(grandBasic)}</td>
            <td class="tr mono">${formatPKR(grandAllowance)}</td>
            <td class="tr mono">${formatPKR(grandGross)}</td>
            <td class="tr mono">${formatPKR(grandLoanDed)}</td>
            <td class="tr mono">${formatPKR(grandLopDed)}</td>
            <td class="tr mono">${formatPKR(grandOtherDed)}</td>
            <td class="tr mono fw9" style="font-size:10px;">Rs. ${formatPKR(grandNetPay)}</td>
            <td class="tc">${totalPending === 0 ? 'ALL PAID' : `${itemizedRows.filter(r => r.status === 'PAID').length} PAID`}</td>
            <td class="tr mono" style="font-size:7.5px;">Paid: Rs. ${formatPKR(totalPaid)}<br/>Pending: Rs. ${formatPKR(totalPending)}</td>
          </tr>
        </tbody>
      </table>

      <!-- SIGNATURES -->
      <div class="sign-section">
        <div class="sign-block">
          <div style="height:32px;"></div>
          <div class="sign-line">Prepared By: Human Resources Manager<br/><span>Payroll &amp; Attendance Verified</span></div>
        </div>
        <div class="sign-block">
          ${sarfrazSignBase64 ? `<img src="${sarfrazSignBase64}" alt="Sarfraz Sign" />` : '<div style="height:32px;"></div>'}
          <div class="sign-line">Sarfraz Sb (Manager Operations)<br/><span>Checked &amp; Disbursed</span></div>
        </div>
        <div class="sign-block">
          ${khurshidSignBase64 ? `<img src="${khurshidSignBase64}" alt="Khurshid Sign" />` : '<div style="height:32px;"></div>'}
          <div class="sign-line">Khurshid Anwar (Finance Director)<br/><span>Approved &amp; Executive Verification</span></div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="doc-footer">
        Official Monthly Salary Sheet &amp; Finance Payout System Document &mdash; Pixx Technologies Pakistan &mdash; Generated: ${new Date().toLocaleDateString('en-PK')} &mdash; Confidential Internal Record
      </div>

    </body>
    </html>
    `;

    try {
      const browser = await launchPuppeteer();
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
        printBackground: true,
      });

      await browser.close();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Monthly_Salary_Sheet_${month}.pdf`);
      return res.status(200).send(pdfBuffer);
    } catch (pdfErr) {
      console.error('[Puppeteer Error] Monthly Salary Sheet PDF failed:', pdfErr.message);
      return res.status(500).json({
        success: false,
        message: `PDF generation failed: ${pdfErr.message}`,
      });
    }
  } catch (error) {
    console.error('[Generate Monthly Salary Sheet PDF Error]:', error);
    return apiError(res, error.message || 'Failed to generate Monthly Salary Sheet PDF.', 500);
  }
};

/**
 * @desc    Get detailed individual Employee Account Ledger (Accruals, Payouts, & Pending Balance)
 * @route   GET /api/staff/payroll/employee-ledger/:employeeId
 * @access  Private
 */
export const getEmployeeLedger = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const employee = await Employee.findById(employeeId).lean();
    if (!employee) {
      return apiError(res, 'Employee record not found.', 404);
    }

    const payrollDocs = await Payroll.find({ employeeId }).sort({ payrollMonth: 1 }).lean();

    const rawLedgerEntries = [];
    let totalAccrued = 0;
    let totalPaid = 0;

    for (const p of payrollDocs) {
      const netPay = round2(p.netPayable);
      if (netPay <= 0) continue;

      const [yStr, mStr] = p.payrollMonth.split('-');
      const year = parseInt(yStr, 10);
      const monthNum = parseInt(mStr, 10);
      const accrualDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

      // 1. Accrual Entry (Credit / Salary Due to Employee)
      rawLedgerEntries.push({
        date: accrualDate,
        month: p.payrollMonth,
        type: 'SALARY_ACCRUAL',
        voucherNo: p.voucherNo || `ACCRUAL-${p.payrollMonth}`,
        detail: `Monthly Salary Accrual — ${p.payrollMonth}`,
        accruedAmount: netPay,
        paidAmount: 0,
        status: p.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
        paidFromAccount: p.paidFromAccountName || '-',
        payrollId: p._id,
      });

      totalAccrued += netPay;

      // 2. Disbursal Entry (Debit / Salary Paid to Employee)
      if (p.paymentStatus === 'PAID') {
        const payoutDate = p.paymentDate || p.paidDate || accrualDate;
        rawLedgerEntries.push({
          date: payoutDate,
          month: p.payrollMonth,
          type: 'SALARY_DISBURSAL',
          voucherNo: p.voucherNo || 'PAID',
          detail: `Salary Disbursal via ${p.paidFromAccountName || 'Finance Bank/Cash'} (Voucher: ${p.voucherNo})`,
          accruedAmount: 0,
          paidAmount: netPay,
          status: 'PAID',
          paidFromAccount: p.paidFromAccountName || 'Finance Account',
          payrollId: p._id,
        });

        totalPaid += netPay;
      }
    }

    // Sort entries chronologically: Date ASC
    rawLedgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running pending liability balance
    let runningPendingBalance = 0;
    const ledger = rawLedgerEntries.map((entry) => {
      runningPendingBalance = round2(runningPendingBalance + entry.accruedAmount - entry.paidAmount);
      return {
        ...entry,
        runningPendingBalance: Math.max(0, runningPendingBalance),
      };
    });

    const pendingBalance = Math.max(0, round2(totalAccrued - totalPaid));

    return apiSuccess(
      res,
      {
        employee: {
          _id: employee._id,
          name: employee.name,
          employeeCode: employee.employeeCode,
          designation: employee.designation,
          department: employee.department,
          basicSalary: employee.basicSalary,
        },
        summary: {
          totalAccrued: round2(totalAccrued),
          totalPaid: round2(totalPaid),
          pendingBalance,
        },
        ledger,
      },
      `Employee account ledger fetched for ${employee.name}.`
    );
  } catch (error) {
    console.error('[Get Employee Ledger Error]:', error);
    return apiError(res, error.message || 'Failed to fetch employee ledger.', 500);
  }
};




