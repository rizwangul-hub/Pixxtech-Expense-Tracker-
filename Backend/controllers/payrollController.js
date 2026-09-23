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
import PendingEntry from '../models/PendingEntry.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { createTransaction, round2, suggestNextVoucherNumber } from '../services/ledgerService.js';

/**
 * Helper to ensure canonical Salaries category head exists
 */
export const getOrCreateSalariesCategory = async () => {
  let category = await Category.findOne({
    type: 'EXPENSE',
    name: { $regex: /^Salar(?:y|ies)$/i },
    expenseClassification: 'GENERAL_EXPENSE',
  });

  if (!category) {
    category = await Category.create({
      name: 'Salary',
      type: 'EXPENSE',
      expenseClassification: 'GENERAL_EXPENSE',
      propertyId: null,
      unitId: null,
      parentCategoryId: null,
      isMainHead: true,
      isRentalHead: false,
    });
  } else if (!category.isMainHead || category.parentCategoryId) {
    category.parentCategoryId = null;
    category.isMainHead = true;
    await category.save();
  }
  if (category.name !== 'Salary') {
    category.name = 'Salary';
    await category.save();
  }

  return category;
};

export const getOrCreateEmployeeSalaryCategory = async (employeeName, salariesCategory = null) => {
  const parent = salariesCategory || await getOrCreateSalariesCategory();
  const normalizedName = String(employeeName || '').trim();
  if (!normalizedName) throw new Error('Employee name is required for the salary expense head.');

  let category = await Category.findOne({
    type: 'EXPENSE',
    name: normalizedName,
    expenseClassification: 'GENERAL_EXPENSE',
    propertyId: null,
    unitId: null,
    parentCategoryId: parent._id,
  });

  if (!category) {
    category = await Category.create({
      name: normalizedName,
      type: 'EXPENSE',
      expenseClassification: 'GENERAL_EXPENSE',
      propertyId: null,
      unitId: null,
      parentCategoryId: parent._id,
      isMainHead: false,
      isRentalHead: false,
    });
  }

  return category;
};

export const getOrCreateSalaryExpenseAccount = async () => {
  let account = await Account.findOne({ name: { $regex: /^Salaries Expense$/i } });
  if (!account) {
    account = await Account.create({
      name: 'Salaries Expense',
      accountName: 'Salaries Expense',
      type: 'CASH',
      accountType: 'CASH',
      cashHolder: 'Payroll Expense',
      openingBalance: 0,
      currentBalance: 0,
      isClearing: true,
      isActive: true,
      notes: 'Dedicated debit account for all employee salary payouts.',
    });
  }
  return account;
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
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
};

/**
 * Smart Puppeteer launcher — works on Vercel (serverless via @sparticuz/chromium)
 * and on local Windows machines (via installed Edge / Chrome).
 */
const launchPuppeteer = async () => {
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || (await chromium.executablePath());

  const launchOptions = {
    headless: true,
    args: localExecutablePath
      ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ]
      : chromium.args,
    executablePath,
  };

  return await puppeteer.launch(launchOptions);
};


/**
 * @desc    Get / Calculate monthly payroll records for YYYY-MM
 * @route   GET /api/staff/payroll
 * @access  Private
 */
export const getMonthlyPayroll = async (req, res) => {
  try {
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const { month = currentMonthStr, department } = req.query;

    const [y, m] = month.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    // Check if payroll already saved for this month
    const existingPayroll = await Payroll.find({ payrollMonth: month }).lean();
    const existingMap = new Map();
    existingPayroll.forEach((p) => existingMap.set(String(p.employeeId), p));

    // Fetch active employees
    const empQuery = { isActive: true };
    if (department && department !== 'ALL') empQuery.department = department;
    const employees = await Employee.find(empQuery).sort({ department: 1, name: 1 }).lean();

    // Fetch attendance summary for month directly matching Attendance collection
    const attRecords = await Attendance.find({
      $or: [
        { dateStr: new RegExp(`^${month}`) },
        { date: { $gte: startDate, $lte: endDate } },
      ],
    }).lean();

    const empAttMap = new Map();
    attRecords.forEach((rec) => {
      const idStr = String(rec.employeeId?._id || rec.employeeId);
      if (!empAttMap.has(idStr)) empAttMap.set(idStr, []);
      empAttMap.get(idStr).push(rec);
    });

    let grandGrossSalary = 0;
    let grandLoanDeductions = 0;
    let grandNetPayable = 0;

    const payrollRows = employees.map((emp) => {
      const empIdStr = String(emp._id);
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

      // Calculate attendance metrics from live Attendance records (identical to Monthly Aggregate Attendance Summary)
      const records = empAttMap.get(empIdStr) || [];
      let presentDays = 0;
      let lateDays = 0;
      let leaveDays = 0;
      let lopDays = 0;
      let halfDays = 0;

      records.forEach((r) => {
        if (r.status === 'PRESENT') presentDays += 1;
        if (r.status === 'LATE') {
          presentDays += 1;
          lateDays += 1;
        }
        if (r.status === 'LEAVE') leaveDays += 1;
        if (r.status === 'ABSENT') lopDays += 1;
        if (r.status === 'HALF_DAY') {
          halfDays += 1;
          presentDays += 0.5;
        }
      });

      // Always reflect actual attendance recorded in the backend
      const finalPresentDays = records.length > 0 ? presentDays : (saved && saved.presentDays !== undefined ? saved.presentDays : presentDays);
      const finalLateDays = records.length > 0 ? lateDays : (saved && saved.lateDays !== undefined ? saved.lateDays : lateDays);
      const finalLeaveDays = records.length > 0 ? leaveDays : (saved && saved.leaveDays !== undefined ? saved.leaveDays : leaveDays);
      const finalLopDays = records.length > 0 ? lopDays : (saved && saved.lopDays !== undefined ? saved.lopDays : lopDays);
      const allowedLeaves = Number(saved?.allowedLeaves ?? emp?.allowedMonthlyLeaves ?? emp?.allowedLeaves ?? 2) || 2;

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
        presentDays: finalPresentDays,
        lateDays: finalLateDays,
        leaveDays: finalLeaveDays,
        lopDays: finalLopDays,
        allowedLeaves,
        loanBalance: emp.loanBalance || 0,
        lopDeduction,
        loanDeduction,
        otherDeduction,
        totalDeduction,
        netPayable: netPayable,
        accountTitle: saved ? saved.accountTitle : emp.accountTitle || emp.name,
        ibanNumber: saved ? saved.ibanNumber : emp.ibanNumber || '',
        bankName: saved ? saved.bankName : emp.bankName || '',
        status: saved ? saved.status : 'DRAFT',
        paymentStatus: saved?.paymentStatus || (saved ? 'PENDING_PAYMENT' : 'DRAFT'),
        totalInstallmentsPaid: round2(saved?.totalInstallmentsPaid || 0),
        remainingPayable: round2(Math.max(0, netPayable - (saved?.totalInstallmentsPaid || 0))),
        salaryInstallments: saved?.salaryInstallments || [],
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

      // Fetch live attendance count if rec metrics are empty
      let pDays = Number(rec.presentDays) || 0;
      let lDays = Number(rec.lateDays) || 0;
      let lvDays = Number(rec.leaveDays) || 0;
      let lpDays = Number(rec.lopDays) || 0;

      if (pDays === 0) {
        const attRecs = await Attendance.find({
          employeeId: rec.employeeId,
          dateStr: new RegExp(`^${month}`),
        }).lean();

        attRecs.forEach((r) => {
          if (r.status === 'PRESENT') pDays += 1;
          if (r.status === 'LATE') {
            pDays += 1;
            lDays += 1;
          }
          if (r.status === 'LEAVE') lvDays += 1;
          if (r.status === 'ABSENT') lpDays += 1;
          if (r.status === 'HALF_DAY') pDays += 0.5;
        });
      }

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
        presentDays: pDays,
        lateDays: lDays,
        leaveDays: lvDays,
        lopDays: lpDays,
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

      // Manage employee loan deduction & StaffLoan ledger accurately
      const existingLoanRecord = await StaffLoan.findOne({
        employeeId: rec.employeeId,
        payrollMonth: month,
        type: 'REPAYMENT',
      });

      const emp = await Employee.findById(rec.employeeId);
      if (emp) {
        if (loanDed > (emp.loanBalance || 0) + 0.01 && !existingLoanRecord) {
          return apiError(
            res,
            `Loan deduction of Rs. ${formatPKR(loanDed)} cannot exceed ${emp.name}'s outstanding loan balance of Rs. ${formatPKR(emp.loanBalance || 0)}.`,
            400
          );
        }
        if (loanDed > 0) {
          if (existingLoanRecord) {
            // Adjust balance for difference in loan deduction
            const prevDeducted = existingLoanRecord.amount || 0;
            const diff = loanDed - prevDeducted;
            const newBal = Math.max(0, emp.loanBalance - diff);
            emp.loanBalance = newBal;
            await emp.save();

            existingLoanRecord.amount = loanDed;
            existingLoanRecord.previousBalance = emp.loanBalance + loanDed;
            existingLoanRecord.newBalance = emp.loanBalance;
            existingLoanRecord.description = `Salary Loan Deduction for ${month}`;
            await existingLoanRecord.save();
          } else {
            // New loan deduction
            const prevBal = emp.loanBalance || 0;
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
        } else if (existingLoanRecord) {
          // Loan deduction removed -> restore loan balance & remove repayment record
          const prevDeducted = existingLoanRecord.amount || 0;
          emp.loanBalance = (emp.loanBalance || 0) + prevDeducted;
          await emp.save();
          await StaffLoan.deleteOne({ _id: existingLoanRecord._id });
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
    subCell.value = `MONTHLY SALARY SHEET â€” ${month.toUpperCase()}`;
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
    bSub.value = `BANK SALARY TRANSFER SHEET â€” ${month.toUpperCase()}`;
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

    const [y, m] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    // Query live attendance records for employee in target month
    const attRecords = await Attendance.find({
      employeeId,
      $or: [
        { dateStr: new RegExp(`^${month}`) },
        { date: { $gte: startDate, $lte: endDate } },
      ],
    }).lean();

    let livePresentDays = 0;
    let liveLateDays = 0;
    let liveLeaveDays = 0;
    let liveLopDays = 0;

    attRecords.forEach((r) => {
      if (r.status === 'PRESENT') livePresentDays += 1;
      if (r.status === 'LATE') {
        livePresentDays += 1;
        liveLateDays += 1;
      }
      if (r.status === 'LEAVE') liveLeaveDays += 1;
      if (r.status === 'ABSENT') liveLopDays += 1;
      if (r.status === 'HALF_DAY') livePresentDays += 0.5;
    });

    const basic = savedPayroll ? savedPayroll.basicSalary : (employee.basicSalary || 0);

    const reqAllowance = req.query.allowance !== undefined ? Number(req.query.allowance) : undefined;
    const reqAllowanceReason = req.query.allowanceReason;
    const reqLoanDed = req.query.loanDeduction !== undefined ? Number(req.query.loanDeduction) : undefined;
    const reqLopDed = req.query.lopDeduction !== undefined ? Number(req.query.lopDeduction) : undefined;
    const reqOthDed = req.query.otherDeduction !== undefined ? Number(req.query.otherDeduction) : undefined;

    const allowance = reqAllowance !== undefined && !isNaN(reqAllowance)
      ? reqAllowance
      : (savedPayroll && savedPayroll.allowance !== undefined
          ? savedPayroll.allowance
          : (employee.allowance || (
              (employee.fuelAllowance || 0) +
              (employee.foodAllowance || 0) +
              (employee.mobileAllowance || 0) +
              (employee.performanceAllowance || 0) +
              (employee.otherAllowances || 0)
            )));

    const allowanceReason = reqAllowanceReason !== undefined
      ? reqAllowanceReason
      : (savedPayroll ? (savedPayroll.allowanceReason || '') : (employee.allowanceReason || ''));

    const overtime = savedPayroll ? savedPayroll.overtimeAmount || 0 : 0;
    const bonus = savedPayroll ? savedPayroll.bonusAmount || 0 : 0;
    const leaveEncashment = savedPayroll ? savedPayroll.leaveEncashmentAmount || 0 : 0;
    const otherReceipts = savedPayroll ? savedPayroll.otherReceiptsAmount || 0 : 0;

    const gross = basic + allowance + overtime + bonus + leaveEncashment + otherReceipts;

    const loanDed = reqLoanDed !== undefined && !isNaN(reqLoanDed)
      ? reqLoanDed
      : (savedPayroll ? (savedPayroll.loanDeduction || 0) : 0);
    const lopDed = reqLopDed !== undefined && !isNaN(reqLopDed)
      ? reqLopDed
      : (savedPayroll ? (savedPayroll.lopDeduction || 0) : 0);
    const othDed = reqOthDed !== undefined && !isNaN(reqOthDed)
      ? reqOthDed
      : (savedPayroll ? (savedPayroll.otherDeduction || 0) : 0);
    const whtDed = savedPayroll ? (savedPayroll.whtDeduction || 0) : 0;

    const totDed = (Number(loanDed) || 0) + (Number(lopDed) || 0) + (Number(othDed) || 0) + (Number(whtDed) || 0);
    const netPayable = Math.max(0, gross - totDed);

    // Attendance metrics
    const presentDays = attRecords.length > 0 ? livePresentDays : (savedPayroll && savedPayroll.presentDays > 0 ? savedPayroll.presentDays : livePresentDays);
    const leaveDays = attRecords.length > 0 ? liveLeaveDays : (savedPayroll && savedPayroll.leaveDays > 0 ? savedPayroll.leaveDays : liveLeaveDays);
    const allowedLeaves = Number(savedPayroll?.allowedLeaves ?? employee?.allowedMonthlyLeaves ?? employee?.allowedLeaves ?? 2) || 2;
    const lopDays = attRecords.length > 0 ? liveLopDays : (savedPayroll && savedPayroll.lopDays > 0 ? savedPayroll.lopDays : liveLopDays);
    const totalSalaryDays = Math.max(0, 30 - lopDays);

    // Convert month to string e.g. "August 2026"
    const dateObj = new Date(y, m - 1, 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
    const formattedTitleDate = `${monthName} ${y}`;

    // Convert Net Payable to Words
    const { numberToWords } = await import('../services/staffPayrollService.js');
    const amountInWords = numberToWords(netPayable);
    const totalPaid = round2(savedPayroll?.totalInstallmentsPaid || 0);
    const remainingPayable = round2(Math.max(0, netPayable - totalPaid));
    const installmentRows = savedPayroll?.salaryInstallments || [];

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
        @page { size: A4 portrait; margin: 10mm 12mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #1e293b;
          background: #fff;
          font-size: 11px;
        }

        /* â”€â”€ HEADER â”€â”€ */
        .hdr {
          display: table;
          width: 100%;
          border-bottom: 2.5px solid #0f172a;
          padding-bottom: 8px;
          margin-bottom: 5px;
        }
        .hdr-logo { display: table-cell; width: 110px; vertical-align: middle; }
        .hdr-logo img { height: 36px; width: auto; object-fit: contain; display: block; }
        .hdr-info { display: table-cell; vertical-align: middle; text-align: right; }
        .hdr-title { font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.1; }
        .hdr-addr { font-size: 8px; color: #64748b; margin-top: 2px; }

        /* â”€â”€ GRADIENT BAR â”€â”€ */
        .grad { height: 3px; background: linear-gradient(90deg,#059669,#0284c7,#6366f1); border-radius:2px; margin: 5px 0; }

        /* â”€â”€ BANNER â”€â”€ */
        .banner {
          background: #0f172a; color: #fff;
          text-align: center; font-size: 11px; font-weight: 800;
          letter-spacing: 1.5px; padding: 6px 0; border-radius: 5px;
          margin-bottom: 8px; text-transform: uppercase;
        }

        /* â”€â”€ INFO GRID â”€â”€ */
        .info-tbl { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .info-tbl td { border: 1px solid #cbd5e1; padding: 5px 7px; font-size: 10.5px; }
        .lbl { background: #f1f5f9; font-weight: 700; color: #334155; width: 18%; white-space: nowrap; }
        .val { font-weight: 600; color: #0f172a; width: 32%; }

        /* â”€â”€ SECTION HEADER â”€â”€ */
        .sec-hdr {
          display: table; width: 100%;
          border-collapse: collapse; margin-bottom: 0;
        }
        .sec-earn { display: table-cell; width: 50%; background: #064e3b; color: #fff;
          font-size: 10px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.8px; padding: 6px 8px;
          border: 1px solid #047857; }
        .sec-ded { display: table-cell; width: 50%; background: #7f1d1d; color: #fff;
          font-size: 10px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.8px; padding: 6px 8px; text-align: right;
          border: 1px solid #991b1b; }

        /* â”€â”€ EARN / DEDUCT TABLES â”€â”€ */
        .ed-wrap { display: table; width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .earn-cell { display: table-cell; width: 50%; vertical-align: top; border: 1px solid #cbd5e1; border-right: none; }
        .ded-cell  { display: table-cell; width: 50%; vertical-align: top; border: 1px solid #cbd5e1; }
        .ed-row { display: table; width: 100%; border-collapse: collapse; }
        .ed-row-r { border-bottom: 1px solid #f1f5f9; }
        .ed-name { display: table-cell; padding: 5px 7px; font-size: 10.5px; color: #334155; }
        .ed-amt  { display: table-cell; padding: 5px 7px; font-size: 10.5px; text-align: right;
                   font-family: 'Courier New', monospace; font-weight: 700; }
        .total-row { background: #f8fafc; border-top: 1.5px solid #94a3b8; }
        .total-row .ed-name { font-weight: 800; font-size: 11px; color: #0f172a; }
        .total-row .ed-amt  { font-size: 11px; font-weight: 900; }
        .earn-col { color: #059669; }
        .ded-col  { color: #e11d48; }

        /* â”€â”€ ATTENDANCE BAR â”€â”€ */
        .att-tbl { width: 100%; border-collapse: collapse; background: #f8fafc;
                   border: 1px solid #e2e8f0; margin-bottom: 10px; }
        .att-tbl td { padding: 6px 8px; font-size: 10px; font-weight: 700;
                      border-right: 1px solid #e2e8f0; text-align: center; }
        .att-tbl td:last-child { border-right: none; }
        .att-val { display: block; font-family: 'Courier New', monospace;
                   font-size: 13px; font-weight: 900; margin-top: 1px; }

        /* â”€â”€ NET PAYOUT â”€â”€ */
        .payout {
          background: #f0fdf4; border: 2px solid #16a34a;
          border-radius: 8px; padding: 12px 16px;
          text-align: center; margin-bottom: 12px;
        }
        .payout-lbl { font-size: 9px; font-weight: 800; color: #166534;
                      text-transform: uppercase; letter-spacing: 1px; }
        .payout-amt { font-size: 28px; font-weight: 900; color: #15803d;
                      font-family: 'Courier New', monospace; margin: 4px 0; }
        .payout-words { font-size: 11px; font-weight: 700; color: #166534; font-style: italic; }

        /* â”€â”€ SIGNATURES â”€â”€ */
        .sign-tbl { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .sign-tbl td { width: 33.33%; text-align: center; padding: 0 10px; vertical-align: bottom; }
        .sign-tbl img { height: 36px; width: auto; object-fit: contain; margin-bottom: 3px; display: block; margin-left: auto; margin-right: auto; }
        .sign-line { border-top: 1.5px dashed #475569; padding-top: 4px; font-size: 9.5px; font-weight: 700; }
        .sign-line span { font-size: 8.5px; color: #94a3b8; font-weight: 400; }

        /* â”€â”€ FOOTER â”€â”€ */
        .slip-footer { font-size: 8px; color: #94a3b8; text-align: center;
                       border-top: 1px solid #e2e8f0; padding-top: 5px; }
      </style>
    </head>
    <body>

      <!-- HEADER -->
      <div class="hdr">
        <div class="hdr-logo">
          ${logoBase64
            ? `<img src="${logoBase64}" alt="Pixx Technologies" />`
            : `<span style="font-size:15px;font-weight:900;color:#059669;">PIXX</span>`}
        </div>
        <div class="hdr-info">
          <div class="hdr-title">PIXX TECHNOLOGIES PAKISTAN</div>
          <div class="hdr-addr">Basement Office 4C chanbeli Block Bahria Town Lahore</div>
        </div>
      </div>

      <!-- GRADIENT BAR -->
      <div class="grad"></div>

      <!-- BANNER -->
      <div class="banner">SALARY PAY SLIP &mdash; ${formattedTitleDate.toUpperCase()}</div>

      <!-- EMPLOYEE INFO GRID -->
      <table class="info-tbl">
        <tr>
          <td class="lbl">Employee Name</td>
          <td class="val" style="color:#0f172a;font-size:12px;font-weight:800;">${employee.name}</td>
          <td class="lbl">Employee Code</td>
          <td class="val" style="font-family:monospace;">${employee.employeeCode || 'EMP-PIX'}</td>
        </tr>
        <tr>
          <td class="lbl">Designation</td>
          <td class="val" style="color:#4f46e5;">${employee.designation}</td>
          <td class="lbl">Department</td>
          <td class="val" style="color:#059669;">${employee.department}</td>
        </tr>
        <tr>
          <td class="lbl">Pay Period</td>
          <td class="val" style="font-family:monospace;">${formattedTitleDate}</td>
          <td class="lbl">Payment Status</td>
          <td class="val" style="color:#15803d;font-weight:800;">${savedPayroll?.paymentStatus || 'FINALIZED'}</td>
        </tr>
        <tr>
          <td class="lbl">Bank Name</td>
          <td class="val">${savedPayroll?.bankName || employee.bankName || 'Cash / Bank'}</td>
          <td class="lbl">IBAN / Account</td>
          <td class="val" style="font-family:monospace;">${savedPayroll?.ibanNumber || employee.ibanNumber || 'N/A'}</td>
        </tr>
      </table>

      <!-- EARNINGS & DEDUCTIONS SECTION HEADERS -->
      <div class="sec-hdr">
        <div class="sec-earn">&#9654; Earnings Itemization</div>
        <div class="sec-ded">Deductions Itemization &#9664;</div>
      </div>

      <!-- EARNINGS & DEDUCTIONS BODY -->
      <div class="ed-wrap">
        <!-- LEFT: EARNINGS -->
        <div class="earn-cell">
          <div class="ed-row ed-row-r">
            <div class="ed-name">Basic Salary</div>
            <div class="ed-amt earn-col">PKR ${formatPKR(basic)}</div>
          </div>
          ${allowance > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Allowance<br/><span style="font-size:9px;color:#64748b;">(${allowanceReason || 'General'})</span></div>
            <div class="ed-amt earn-col">+PKR ${formatPKR(allowance)}</div>
          </div>` : ''}
          ${overtime > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Overtime (OT)</div>
            <div class="ed-amt earn-col">PKR ${formatPKR(overtime)}</div>
          </div>` : ''}
          ${bonus > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Bonus</div>
            <div class="ed-amt earn-col">PKR ${formatPKR(bonus)}</div>
          </div>` : ''}
          ${otherReceipts > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Other Receipts</div>
            <div class="ed-amt earn-col">PKR ${formatPKR(otherReceipts)}</div>
          </div>` : ''}
          <div class="ed-row total-row">
            <div class="ed-name">TOTAL GROSS SALARY</div>
            <div class="ed-amt" style="color:#0f172a;">PKR ${formatPKR(gross)}</div>
          </div>
        </div>

        <!-- RIGHT: DEDUCTIONS -->
        <div class="ded-cell">
          ${loanDed > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Loan / Advance Deduction</div>
            <div class="ed-amt ded-col">-PKR ${formatPKR(loanDed)}</div>
          </div>` : ''}
          ${lopDed > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Absent / Leave Cut (LOP)</div>
            <div class="ed-amt ded-col">-PKR ${formatPKR(lopDed)}</div>
          </div>` : ''}
          ${othDed > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Other Deductions</div>
            <div class="ed-amt ded-col">-PKR ${formatPKR(othDed)}</div>
          </div>` : ''}
          ${whtDed > 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">WHT Tax</div>
            <div class="ed-amt ded-col">-PKR ${formatPKR(whtDed)}</div>
          </div>` : ''}
          ${totDed === 0 ? `
          <div class="ed-row ed-row-r">
            <div class="ed-name">Nil (No Deductions)</div>
            <div class="ed-amt" style="color:#059669;font-weight:700;">PKR 0</div>
          </div>` : ''}
          <div class="ed-row total-row">
            <div class="ed-name" style="color:#9f1239;">TOTAL DEDUCTIONS</div>
            <div class="ed-amt ded-col">-PKR ${formatPKR(totDed)}</div>
          </div>
        </div>
      </div>

      <!-- ATTENDANCE BAR -->
      <table class="att-tbl">
        <tr>
          <td>
            <span style="color:#64748b;font-size:9px;">Attendance</span>
            <span class="att-val" style="color:#059669;">${presentDays} Days</span>
          </td>
          <td>
            <span style="color:#64748b;font-size:9px;">Leaves Taken</span>
            <span class="att-val" style="color:#334155;">${leaveDays} Days</span>
          </td>
          <td>
            <span style="color:#64748b;font-size:9px;">Allowed Leaves</span>
            <span class="att-val" style="color:#334155;">${allowedLeaves} Days</span>
          </td>
          <td>
            <span style="color:#64748b;font-size:9px;">LOP Days</span>
            <span class="att-val" style="color:#e11d48;">${lopDays} Days</span>
          </td>
          <td>
            <span style="color:#64748b;font-size:9px;">Salary Days</span>
            <span class="att-val" style="color:#4f46e5;">${totalSalaryDays} Days</span>
          </td>
        </tr>
      </table>

      <!-- NET PAYOUT BOX -->
      <div class="payout">
        <div class="payout-lbl">NET PAYABLE SALARY</div>
        <div class="payout-amt">PKR ${formatPKR(netPayable)}</div>
        <div class="payout-words">&ldquo;${amountInWords}&rdquo;</div>
      </div>
      <table class="info-tbl" style="margin-top:8px;">
        <tr>
          <td class="lbl">Verified / Paid</td>
          <td class="val" style="color:#15803d;font-weight:800;">PKR ${formatPKR(totalPaid)}</td>
          <td class="lbl">Remaining Balance</td>
          <td class="val" style="color:${remainingPayable > 0 ? '#b45309' : '#15803d'};font-weight:800;">PKR ${formatPKR(remainingPayable)}</td>
        </tr>
      </table>
      ${installmentRows.length > 0 ? `
      <div style="margin-top:10px;font-size:10px;font-weight:800;color:#334155;">VERIFIED PAYMENT INSTALLMENTS</div>
      <table class="info-tbl" style="margin-top:3px;">
        <tr>
          <td class="lbl">Date</td><td class="lbl">Voucher</td><td class="lbl">Account</td><td class="lbl">Amount</td>
        </tr>
        ${installmentRows.map((item) => `
        <tr>
          <td class="val">${item.paymentDate ? new Date(item.paymentDate).toLocaleDateString('en-GB') : '—'}</td>
          <td class="val" style="font-family:monospace;">${item.voucherNo || '—'}</td>
          <td class="val">${item.paidFromAccountName || '—'}</td>
          <td class="val" style="font-weight:800;">PKR ${formatPKR(item.amount)}</td>
        </tr>`).join('')}
      </table>` : ''}

      <!-- SIGNATURES -->
      <table class="sign-tbl">
        <tr>
          <td>
            ${sarfrazSignBase64 ? `<img src="${sarfrazSignBase64}" alt="Sarfraz Sign" />` : '<div style="height:36px;"></div>'}
            <div class="sign-line">Sarfraz (Accountant)<br/><span>Prepared &amp; Checked By</span></div>
          </td>
          <td>
            ${khurshidSignBase64 ? `<img src="${khurshidSignBase64}" alt="Khurshid Sign" />` : '<div style="height:36px;"></div>'}
            <div class="sign-line">Khurshid Anwar (Assistant Manager)<br/><span>Approved &amp; Verified</span></div>
          </td>
          <td>
            <div style="height:36px;"></div>
            <div class="sign-line">${employee.name}<br/><span>Employee Acknowledgement</span></div>
          </td>
        </tr>
      </table>

      <!-- FOOTER -->
      <div class="slip-footer">
        Official Computer-Generated Salary Pay Slip &mdash; Pixx Technologies Pakistan &mdash; Generated: ${new Date().toLocaleDateString('en-PK')} &mdash; Confidential Record
      </div>

    </body>
    </html>
    `;

    // Try Puppeteer PDF rendering
    let browser;
    try {
      browser = await launchPuppeteer();
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        printBackground: true,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=Salary_Slip_${employee.name.replace(/\s+/g, '_')}_${month}.pdf`);
      return res.status(200).send(pdfBuffer);
    } catch (pdfErr) {
      console.error('[Puppeteer Error] Salary Slip PDF failed:', pdfErr.message);
      return res.status(500).json({
        success: false,
        message: `PDF generation failed: ${pdfErr.message}`,
      });
    } finally {
      if (browser) {
        await browser.close().catch((err) => console.error('[Puppeteer Cleanup Error]:', err.message));
      }
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
      paymentAmount,
      amount,
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

    const totalPaid = round2(pDoc.totalInstallmentsPaid || 0);
    const remainingAmount = round2(Math.max(0, pDoc.netPayable - totalPaid));

    if (pDoc.paymentStatus === 'PAID' || remainingAmount <= 0) {
      return apiError(res, `Salary for ${pDoc.employeeName} for ${month} is already fully PAID (Voucher: ${pDoc.voucherNo || 'N/A'}).`, 400);
    }

    const rawAmount = paymentAmount !== undefined && paymentAmount !== '' ? paymentAmount : amount;
    const requestedAmount = rawAmount === undefined || rawAmount === '' ? remainingAmount : round2(Number(rawAmount));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return apiError(res, 'Payment amount must be greater than zero.', 400);
    }
    if (requestedAmount > remainingAmount + 0.01) {
      return apiError(
        res,
        `Payment amount of Rs. ${formatPKR(requestedAmount)} cannot exceed the remaining salary of Rs. ${formatPKR(remainingAmount)}.`,
        400
      );
    }

    const netAmount = Math.min(requestedAmount, remainingAmount);

    const account = await Account.findById(paidFromAccountId);
    if (!account) {
      return apiError(res, 'Selected Finance Bank/Cash Account not found.', 404);
    }
    if (!account.isActive) {
      return apiError(res, `Account "${account.name}" is inactive.`, 400);
    }

    const salariesCategory = await getOrCreateSalariesCategory();
    const salaryCategory = await getOrCreateEmployeeSalaryCategory(pDoc.employeeName, salariesCategory);
    const clearingAccount = await getOrCreateSalaryExpenseAccount();

    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    const endOfMonthDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    let pDate = paymentDate ? new Date(paymentDate) : endOfMonthDate;
    if (isNaN(pDate.getTime()) || pDate.getUTCFullYear() !== year || (pDate.getUTCMonth() + 1) !== monthNum) {
      pDate = endOfMonthDate;
    }

    // Only approvers may post directly. All operational payout submissions are
    // staged for verification so the bank is never debited before approval.
    const canPostDirectly = ['ADMIN', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER'].includes(req.user?.role);
    if (!canPostDirectly) {
      const pendingEntries = await PendingEntry.find({
        entryType: 'SALARY',
        status: { $in: ['PENDING_VERIFICATION', 'EDITED'] },
        'entryData.payrollId': pDoc._id,
      });

      const pendingSum = round2(pendingEntries.reduce((sum, item) => sum + (item.amount || 0), 0));
      const unsubmittedRemaining = round2(Math.max(0, remainingAmount - pendingSum));

      if (unsubmittedRemaining <= 0) {
        return apiError(
          res,
          `A salary payout for ${pDoc.employeeName} of Rs. ${formatPKR(pendingSum)} is already awaiting verification by Khurshid Anwar. Please wait for verification before submitting another installment.`,
          400
        );
      }

      if (netAmount > unsubmittedRemaining + 0.01) {
        return apiError(
          res,
          `Requested amount of Rs. ${formatPKR(netAmount)} exceeds the unsubmitted balance of Rs. ${formatPKR(unsubmittedRemaining)} (Rs. ${formatPKR(pendingSum)} is currently pending verification).`,
          400
        );
      }

      const voucherNo = await suggestNextVoucherNumber(pDate);

      const pending = await PendingEntry.create({
        entryType: 'SALARY',
        amount: netAmount,
        date: pDate,
        voucherNo,
        rentMonth: month,
        crAccountId: account._id,
        drAccountId: clearingAccount._id,
        categoryId: salaryCategory._id,
        receivingAccountId: account._id,
        detail: `Salary Payout to ${pDoc.employeeName} (${pDoc.designation}) — Month ${month}`.trim(),
        tenantId: pDoc.employeeId,
        entryData: {
          payrollId: pDoc._id,
          employeeId: pDoc.employeeId,
          month,
          loanDeduction: pDoc.loanDeduction || 0,
          paidFromAccountId: account._id,
          paymentMethod,
          paymentNotes,
          paymentAmount: netAmount,
          payrollSnapshot: {
            employeeName: pDoc.employeeName || '',
            employeeId: pDoc.employeeId,
            designation: pDoc.designation || '',
            department: pDoc.department || '',
            basicSalary: pDoc.basicSalary || 0,
            allowance: pDoc.allowance || 0,
            allowanceReason: pDoc.allowanceReason || '',
            grossSalary: pDoc.grossSalary || 0,
            loanDeduction: pDoc.loanDeduction || 0,
            lopDeduction: pDoc.lopDeduction || 0,
            otherDeduction: pDoc.otherDeduction || 0,
            totalDeduction: pDoc.totalDeduction || 0,
            netPayable: pDoc.netPayable || 0,
            totalInstallmentsPaid: pDoc.totalInstallmentsPaid || 0,
            salaryInstallments: pDoc.salaryInstallments || [],
            paymentStatus: pDoc.paymentStatus || 'PENDING_PAYMENT',
          },
        },
        status: 'PENDING_VERIFICATION',
        submittedBy: req.user._id,
        submittedByName: req.user?.name || 'Sarfraz Khan',
        submittedAt: new Date(),
        auditLog: [
          {
            action: 'SUBMITTED',
            performedBy: req.user?.name || 'Sarfraz Khan',
            performedById: req.user._id,
            timestamp: new Date(),
            notes: `Salary installment of Rs. ${formatPKR(netAmount)} submitted by Data Entry Operator. Awaiting review and verification by Khurshid Anwar.`,
          },
        ],
      });

      pDoc.paymentStatus = 'PENDING_PAYMENT';
      await pDoc.save();

      return apiSuccess(
        res,
        { pendingEntry: pending, isPending: true, status: 'PENDING_VERIFICATION' },
        `Salary payout installment of Rs. ${formatPKR(netAmount)} for ${pDoc.employeeName} submitted to Verification Queue. Bank funds will be disbursed upon Khurshid Anwar's approval.`,
        201
      );
    }

    // Direct payout for Administrators (Khurshid Anwar / Fahad Sb)
    if (account.currentBalance < netAmount) {
      return apiError(
        res,
        `Insufficient balance in "${account.name}". Current Balance: Rs. ${formatPKR(account.currentBalance)}, Required: Rs. ${formatPKR(netAmount)}.`,
        400
      );
    }

    const voucherNo = await suggestNextVoucherNumber(pDate);

    const transaction = await createTransaction({
      date: pDate,
      voucherNo,
      detail: `Salary Payout to ${pDoc.employeeName} (${pDoc.designation}) — Month ${month}${paymentNotes ? '. ' + paymentNotes : ''}`,
      categoryId: salaryCategory._id,
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

    const updatedTotalPaid = round2(totalPaid + netAmount);
    const isFullyPaid = updatedTotalPaid >= round2(pDoc.netPayable) - 0.01;
    pDoc.totalInstallmentsPaid = updatedTotalPaid;
    pDoc.paymentStatus = isFullyPaid ? 'PAID' : 'PARTIAL_PAYMENT';
    pDoc.status = isFullyPaid ? 'PAID' : 'FINALIZED';
    pDoc.paidFromAccountId = account._id;
    pDoc.paidFromAccountName = account.name;
    pDoc.paymentDate = pDate;
    pDoc.paidDate = pDate;
    pDoc.transactionId = transaction._id;
    pDoc.voucherId = transaction.voucherId;
    pDoc.voucherNo = transaction.voucherNo;
    pDoc.paymentMethod = paymentMethod;
    pDoc.paymentNotes = paymentNotes;
    pDoc.salaryInstallments = pDoc.salaryInstallments || [];
    pDoc.salaryInstallments.push({
      amount: netAmount,
      paymentDate: pDate,
      paidFromAccountId: account._id,
      paidFromAccountName: account.name,
      paymentMethod,
      voucherNo: transaction.voucherNo,
      transactionId: transaction._id,
      notes: paymentNotes,
      paidBy: req.user?.name || 'Finance Manager',
      createdAt: new Date(),
    });
    await pDoc.save();

    // If an existing pending entry was waiting for this payroll record, mark it verified
    const activePending = await PendingEntry.findOne({
      entryType: 'SALARY',
      status: { $in: ['PENDING_VERIFICATION', 'EDITED'] },
      'entryData.payrollId': pDoc._id,
    });
    if (activePending) {
      activePending.status = 'VERIFIED';
      activePending.verifiedBy = req.user._id;
      activePending.verifiedByName = req.user.name;
      activePending.verifiedAt = new Date();
      activePending.postedTransactionId = transaction._id;
      await activePending.save();
    }

    await StaffAuditLog.create({
      userId: req.user?._id || null,
      userName: req.user?.name || 'Finance Manager',
      action: 'SALARY_PAID',
      recordId: pDoc._id.toString(),
      details: `Paid salary of Rs. ${formatPKR(netAmount)} to ${pDoc.employeeName} from ${account.name} (Voucher: ${transaction.voucherNo}).`,
      newValue: {
        amount: netAmount,
        account: account.name,
        voucherNo: transaction.voucherNo,
        remainingBalance: Math.max(0, pDoc.netPayable - updatedTotalPaid),
      },
    });

    return apiSuccess(
      res,
      {
        payroll: pDoc,
        transaction,
        voucherNo: transaction.voucherNo,
        updatedAccountBalance: round2((account.currentBalance || 0) - netAmount),
        isFullyPaid,
        amountPaid: netAmount,
        remainingBalance: round2(Math.max(0, pDoc.netPayable - updatedTotalPaid)),
      },
      isFullyPaid
        ? `Salary of Rs. ${formatPKR(netAmount)} fully paid to ${pDoc.employeeName} from ${account.name}. Voucher: ${transaction.voucherNo}`
        : `Partial salary payout of Rs. ${formatPKR(netAmount)} recorded for ${pDoc.employeeName}. Remaining: Rs. ${formatPKR(pDoc.netPayable - updatedTotalPaid)}. Voucher: ${transaction.voucherNo}`,
      201
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

    const totalRequired = round2(payrollDocs.reduce((sum, p) => sum + (p.netPayable - (p.totalInstallmentsPaid || 0)), 0));
    if (account.currentBalance < totalRequired) {
      return apiError(
        res,
        `Insufficient account balance in "${account.name}". Current: Rs. ${formatPKR(account.currentBalance)}, Total Required for ${payrollDocs.length} employees: Rs. ${formatPKR(totalRequired)}.`,
        400
      );
    }

    const salariesCategory = await getOrCreateSalariesCategory();
    const clearingAccount = await getOrCreateSalaryExpenseAccount();
    
    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    const endOfMonthDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    let pDate = paymentDate ? new Date(paymentDate) : endOfMonthDate;
    if (isNaN(pDate.getTime()) || pDate.getUTCFullYear() !== year || (pDate.getUTCMonth() + 1) !== monthNum) {
      pDate = endOfMonthDate;
    }

    // Routing for Data Entry role (Sarfraz Khan): Create PendingEntry for each unpaid salary record
    if (req.user?.role === 'DATA_ENTRY') {
      const pendingResults = [];

      for (const pDoc of payrollDocs) {
        const remaining = round2(pDoc.netPayable - (pDoc.totalInstallmentsPaid || 0));
        if (remaining <= 0) continue;

        const existingPending = await PendingEntry.findOne({
          entryType: 'SALARY',
          status: { $in: ['PENDING_VERIFICATION', 'EDITED'] },
          'entryData.payrollId': pDoc._id,
        });

        if (existingPending) continue;

        const voucherNo = await suggestNextVoucherNumber(pDate);
        const pending = await PendingEntry.create({
          entryType: 'SALARY',
          amount: remaining,
          date: pDate,
          voucherNo,
          rentMonth: month,
          crAccountId: account._id,
          drAccountId: clearingAccount._id,
          categoryId: (await getOrCreateEmployeeSalaryCategory(pDoc.employeeName, salariesCategory))._id,
          receivingAccountId: account._id,
          detail: `Salary Payout to ${pDoc.employeeName} (${pDoc.designation}) — Month ${month}`.trim(),
          tenantId: pDoc.employeeId,
          entryData: {
            payrollId: pDoc._id,
            employeeId: pDoc.employeeId,
            month,
            loanDeduction: pDoc.loanDeduction || 0,
            paidFromAccountId: account._id,
            paymentMethod,
            paymentNotes,
          },
          status: 'PENDING_VERIFICATION',
          submittedBy: req.user._id,
          submittedByName: req.user?.name || 'Sarfraz Khan',
          submittedAt: new Date(),
          auditLog: [
            {
              action: 'SUBMITTED',
              performedBy: req.user?.name || 'Sarfraz Khan',
              performedById: req.user._id,
              timestamp: new Date(),
              notes: `Bulk salary payout entry submitted by Data Entry Operator. Awaiting review and verification by Khurshid Anwar.`,
            },
          ],
        });

        pDoc.paymentStatus = 'PENDING_PAYMENT';
        await pDoc.save();

        pendingResults.push({
          employeeName: pDoc.employeeName,
          amount: remaining,
          voucherNo,
          pendingEntryId: pending._id,
        });
      }

      return apiSuccess(
        res,
        { count: pendingResults.length, totalAmount: totalRequired, pendingList: pendingResults, isPending: true },
        `Submitted ${pendingResults.length} salary payouts totaling Rs. ${formatPKR(totalRequired)} to Verification Queue for Khurshid Anwar's approval.`,
        201
      );
    }

    const results = [];
    for (const pDoc of payrollDocs) {
      const remaining = round2(pDoc.netPayable - (pDoc.totalInstallmentsPaid || 0));
      if (remaining <= 0) continue;

      const voucherNo = await suggestNextVoucherNumber(pDate);
      const transaction = await createTransaction({
        date: pDate,
        voucherNo,
        detail: `Salary Payout to ${pDoc.employeeName} (${pDoc.designation}) — Month ${month}`,
        categoryId: (await getOrCreateEmployeeSalaryCategory(payroll.employeeName, salariesCategory))._id,
        drAccountId: clearingAccount._id,
        crAccountId: account._id,
        amount: remaining,
        transactionType: 'EXPENSE',
        expenseClassification: 'GENERAL_EXPENSE',
        reportCategory: 'Payments',
        sourceModule: 'EXPENSE',
        sourceId: pDoc._id,
        createdBy: req.user?._id || null,
      });

      pDoc.status = 'PAID';
      pDoc.paymentStatus = 'PAID';
      pDoc.totalInstallmentsPaid = round2((pDoc.totalInstallmentsPaid || 0) + remaining);
      pDoc.paidFromAccountId = account._id;
      pDoc.paidFromAccountName = account.name;
      pDoc.paymentDate = pDate;
      pDoc.paidDate = pDate;
      pDoc.transactionId = transaction._id;
      pDoc.voucherId = transaction.voucherId;
      pDoc.voucherNo = transaction.voucherNo;
      pDoc.paymentMethod = paymentMethod;
      pDoc.paymentNotes = paymentNotes;
      pDoc.salaryInstallments = pDoc.salaryInstallments || [];
      pDoc.salaryInstallments.push({
        amount: remaining,
        paymentDate: pDate,
        paidFromAccountId: account._id,
        paidFromAccountName: account.name,
        paymentMethod,
        voucherNo: transaction.voucherNo,
        transactionId: transaction._id,
        notes: paymentNotes || 'Bulk Payout',
        paidBy: req.user?.name || 'Finance Manager',
        createdAt: new Date(),
      });
      await pDoc.save();

      results.push({
        employeeName: pDoc.employeeName,
        amount: remaining,
        voucherNo: transaction.voucherNo,
      });
    }

    await StaffAuditLog.create({
      userId: req.user?._id || null,
      userName: req.user?.name || 'Finance Manager',
      action: 'BULK_SALARY_PAID',
      recordId: month,
      details: `Bulk paid ${results.length} employee salaries totaling Rs. ${formatPKR(totalRequired)} from ${account.name}.`,
      newValue: { count: results.length, totalPaid: totalRequired, account: account.name },
    });

    return apiSuccess(
      res,
      { count: results.length, totalAmountPaid: totalRequired, paidList: results },
      `Successfully disbursed ${results.length} employee salaries totaling Rs. ${formatPKR(totalRequired)} from ${account.name}.`,
      201
    );
  } catch (error) {
    console.error('[Pay Bulk Salary Error]:', error);
    return apiError(res, error.message || 'Failed to process bulk salary payments.', 500);
  }
};

/**
 * @desc    Reverse a paid salary transaction & restore bank/cash balance
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

    const transactionIds = [
      ...(pDoc.salaryInstallments || []).map((installment) => installment.transactionId).filter(Boolean),
      pDoc.transactionId,
    ].filter((id, index, ids) => ids.findIndex((item) => String(item) === String(id)) === index);
    let paidAmount = 0;

    for (const transactionId of transactionIds) {
      const tx = await Transaction.findById(transactionId);
      if (!tx || tx.status === 'REVERSED') continue;

      const transactionAmount = round2(tx.amount);
      paidAmount = round2(paidAmount + transactionAmount);
      tx.status = 'REVERSED';
      await tx.save();

      if (tx.voucherId) {
        await Voucher.findByIdAndUpdate(tx.voucherId, { status: 'REVERSED' });
      }

      await Promise.all([
        Account.findByIdAndUpdate(tx.crAccountId, { $inc: { currentBalance: transactionAmount } }),
        Account.findByIdAndUpdate(tx.drAccountId, { $inc: { currentBalance: -transactionAmount } }),
      ]);
    }

    // Legacy payroll rows may not have installment transaction links. Keep the
    // audit amount useful without changing balances a second time.
    if (paidAmount <= 0) {
      paidAmount = round2(pDoc.totalInstallmentsPaid || pDoc.netPayable);
    }

    const prevVoucher = pDoc.voucherNo;
    pDoc.status = 'FINALIZED';
    pDoc.paymentStatus = 'PENDING_PAYMENT';
    pDoc.totalInstallmentsPaid = 0;
    pDoc.salaryInstallments = [];
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
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const { month = currentMonthStr } = req.query;

    const [y, m] = month.split('-').map(Number);
    const dateObj = new Date(y, m - 1, 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
    const formattedTitleDate = `${monthName} ${y}`;
    const totalDaysInMonth = new Date(y, m, 0).getDate();
    const startDate = new Date(Date.UTC(y, m - 1, 1));
    const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    // 1. Fetch Employees & Payroll Records
    const employees = await Employee.find({ status: { $ne: 'INACTIVE' } }).sort({ name: 1 }).lean();
    const savedPayrolls = await Payroll.find({ payrollMonth: month }).lean();

    const savedMap = new Map();
    savedPayrolls.forEach((p) => savedMap.set(String(p.employeeId), p));

    // Fetch live attendance records for target month
    const attRecords = await Attendance.find({
      $or: [
        { dateStr: new RegExp(`^${month}`) },
        { date: { $gte: startDate, $lte: endDate } },
      ],
    }).lean();

    const empAttMap = new Map();
    attRecords.forEach((rec) => {
      const idStr = String(rec.employeeId?._id || rec.employeeId);
      if (!empAttMap.has(idStr)) empAttMap.set(idStr, []);
      empAttMap.get(idStr).push(rec);
    });

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
      const empIdStr = String(emp._id);
      const pDoc = savedMap.get(empIdStr);

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

      // Live attendance calculation matching Monthly Aggregate Attendance Summary
      const records = empAttMap.get(empIdStr) || [];
      let livePresentDays = 0;
      let liveLopDays = 0;
      records.forEach((r) => {
        if (r.status === 'PRESENT' || r.status === 'LATE') livePresentDays += 1;
        if (r.status === 'HALF_DAY') livePresentDays += 0.5;
        if (r.status === 'ABSENT') liveLopDays += 1;
      });

      const actualPresentDays = records.length > 0 ? livePresentDays : (pDoc?.presentDays ?? livePresentDays);
      const actualLopDays = records.length > 0 ? liveLopDays : (pDoc?.lopDays ?? liveLopDays);

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
        presentDays: actualPresentDays,
        lopDays: actualLopDays,
        totalDays: totalDaysInMonth,
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
        /* â”€â”€â”€ HEADER â”€â”€â”€ */
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
        /* â”€â”€â”€ GRADIENT LINE â”€â”€â”€ */
        .grad-bar {
          height: 3px;
          background: linear-gradient(90deg, #059669 0%, #0284c7 50%, #6366f1 100%);
          border-radius: 2px;
          margin-bottom: 5px;
        }
        /* â”€â”€â”€ DOCUMENT TITLE STRIP â”€â”€â”€ */
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
        /* â”€â”€â”€ METRICS BAR â”€â”€â”€ */
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
        /* â”€â”€â”€ SALARY TABLE â”€â”€â”€ */
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
        /* â”€â”€â”€ TOTALS ROW â”€â”€â”€ */
        .sal-table .totals-row td {
          background: #0f172a !important;
          color: #fff !important;
          font-weight: 800 !important;
          font-size: 9px !important;
          border-color: #1e293b;
        }
        /* â”€â”€â”€ STATUS BADGES â”€â”€â”€ */
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
          justify-content: space-around;
          max-width: 650px;
          margin: 10px auto 0 auto;
          gap: 60px;
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
        /* â”€â”€â”€ FOOTER â”€â”€â”€ */
        .doc-footer {
          font-size: 7.5px;
          color: #94a3b8;
          text-align: center;
          border-top: 1px solid #e2e8f0;
          padding-top: 4px;
          margin-top: 6px;
        }
        /* â”€â”€â”€ UTILS â”€â”€â”€ */
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
          <div class="company-addr">Basement Office 4C chanbeli Block Bahria Town Lahore</div>
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
              <div class="mono fw7">${r.allowance > 0 ? formatPKR(r.allowance) : 'â€”'}</div>
              ${r.allowanceReason ? `<div style="font-size:7px;color:#64748b;">${r.allowanceReason}</div>` : ''}
            </td>
            <td class="tr mono fw7 col-indigo">${formatPKR(r.gross)}</td>
            <td class="tr mono ${r.loanDed > 0 ? 'col-red' : 'col-slate'}">${r.loanDed > 0 ? formatPKR(r.loanDed) : 'â€”'}</td>
            <td class="tr mono ${r.lopDed > 0 ? 'col-red' : 'col-slate'}">${r.lopDed > 0 ? formatPKR(r.lopDed) : 'â€”'}</td>
            <td class="tr mono ${r.othDed > 0 ? 'col-red' : 'col-slate'}">${r.othDed > 0 ? formatPKR(r.othDed) : 'â€”'}</td>
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
          ${sarfrazSignBase64 ? `<img src="${sarfrazSignBase64}" alt="Sarfraz Sign" />` : '<div style="height:32px;"></div>'}
          <div class="sign-line">Sarfraz (Accountant)<br/><span>Prepared &amp; Disbursed</span></div>
        </div>
        <div class="sign-block">
          ${khurshidSignBase64 ? `<img src="${khurshidSignBase64}" alt="Khurshid Sign" />` : '<div style="height:32px;"></div>'}
          <div class="sign-line">Khurshid Anwar (Assistant Manager)<br/><span>Approved &amp; Verified</span></div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="doc-footer">
        Official Monthly Salary Sheet &amp; Finance Payout System Document &mdash; Pixx Technologies Pakistan &mdash; Generated: ${new Date().toLocaleDateString('en-PK')} &mdash; Confidential Internal Record
      </div>

    </body>
    </html>
    `;

    let browser;
    try {
      browser = await launchPuppeteer();
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
        printBackground: true,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Monthly_Salary_Sheet_${month}.pdf`);
      return res.status(200).send(pdfBuffer);
    } catch (pdfErr) {
      console.error('[Puppeteer Error] Monthly Salary Sheet PDF failed:', pdfErr.message);
      return res.status(500).json({
        success: false,
        message: `PDF generation failed: ${pdfErr.message}`,
      });
    } finally {
      if (browser) {
        await browser.close().catch((closeErr) => {
          console.error('[Puppeteer Cleanup Error] Monthly Salary Sheet PDF:', closeErr.message);
        });
      }
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

      // Correct status label — PARTIAL_PAYMENT must not show as PENDING
      let accrualStatus = 'PENDING';
      if (p.paymentStatus === 'PAID') accrualStatus = 'PAID';
      else if (p.paymentStatus === 'PARTIAL_PAYMENT') accrualStatus = 'PARTIAL';

      // 1. ONE Accrual Entry per salary period (the salary obligation — never duplicated)
      rawLedgerEntries.push({
        date: accrualDate,
        month: p.payrollMonth,
        type: 'SALARY_ACCRUAL',
        voucherNo: `ACCRUAL-${p.payrollMonth}`,
        detail: `Monthly Salary Accrual \u2014 ${p.payrollMonth}${p.loanDeduction > 0 ? ` (Loan Ded: Rs. ${formatPKR(p.loanDeduction)})` : ''}`,
        accruedAmount: netPay,
        paidAmount: 0,
        status: accrualStatus,
        paidFromAccount: '-',
        payrollId: p._id,
        grossSalary: p.grossSalary || 0,
        loanDeduction: p.loanDeduction || 0,
        netPayable: netPay,
        totalInstallmentsPaid: round2(p.totalInstallmentsPaid || 0),
      });

      totalAccrued += netPay;

      // 2. ONE Disbursal Entry PER INSTALLMENT (handles partial payments correctly)
      const installments = Array.isArray(p.salaryInstallments) ? p.salaryInstallments : [];

      if (installments.length > 0) {
        installments.forEach((inst, idx) => {
          const instAmount = round2(inst.amount || 0);
          if (instAmount <= 0) return;

          const instDate = inst.paymentDate ? new Date(inst.paymentDate) : accrualDate;
          const installmentLabel = installments.length > 1
            ? ` (Installment ${idx + 1}/${installments.length})`
            : '';

          rawLedgerEntries.push({
            date: instDate,
            month: p.payrollMonth,
            type: 'SALARY_DISBURSAL',
            voucherNo: inst.voucherNo || p.voucherNo || `PAY-${p.payrollMonth}-${idx + 1}`,
            detail: `Salary Payment${installmentLabel} via ${inst.paidFromAccountName || p.paidFromAccountName || 'Finance Account'} \u2014 ${p.payrollMonth}`,
            accruedAmount: 0,
            paidAmount: instAmount,
            status: 'PAID',
            paidFromAccount: inst.paidFromAccountName || p.paidFromAccountName || 'Finance Account',
            payrollId: p._id,
            paymentMethod: inst.paymentMethod || p.paymentMethod || 'BANK_TRANSFER',
            paidBy: inst.paidBy || '',
          });

          totalPaid += instAmount;
        });
      } else if ((p.paymentStatus === 'PAID' || p.totalInstallmentsPaid > 0) && p.totalInstallmentsPaid > 0) {
        // Fallback: legacy fully-paid record with no installments array populated
        const payoutDate = p.paymentDate || p.paidDate || accrualDate;
        rawLedgerEntries.push({
          date: payoutDate,
          month: p.payrollMonth,
          type: 'SALARY_DISBURSAL',
          voucherNo: p.voucherNo || 'PAID',
          detail: `Salary Disbursal via ${p.paidFromAccountName || 'Finance Account'} (Voucher: ${p.voucherNo || 'N/A'})`,
          accruedAmount: 0,
          paidAmount: round2(p.totalInstallmentsPaid),
          status: 'PAID',
          paidFromAccount: p.paidFromAccountName || 'Finance Account',
          payrollId: p._id,
        });

        totalPaid += round2(p.totalInstallmentsPaid);
      }
    }

    // Sort chronologically; on same date, accrual comes before disbursal
    rawLedgerEntries.sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      if (a.type === 'SALARY_ACCRUAL' && b.type === 'SALARY_DISBURSAL') return -1;
      if (a.type === 'SALARY_DISBURSAL' && b.type === 'SALARY_ACCRUAL') return 1;
      return 0;
    });

    // Running pending liability balance
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
          loanBalance: employee.loanBalance || 0,
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

