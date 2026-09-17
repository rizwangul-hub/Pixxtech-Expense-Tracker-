import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import StaffLoan from '../models/StaffLoan.js';
import Payroll from '../models/Payroll.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

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
      const gross = basic + fuel + food + mobile + perf + other;

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
      const gross =
        (Number(rec.basicSalary) || 0) +
        (Number(rec.fuelAllowance) || 0) +
        (Number(rec.foodAllowance) || 0) +
        (Number(rec.mobileAllowance) || 0) +
        (Number(rec.performanceAllowance) || 0) +
        (Number(rec.otherAllowances) || 0);

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

    // Group employees by Department
    const deptMap = new Map();
    employees.forEach((emp) => {
      const dept = emp.department || 'Other';
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept).push(emp);
    });

    const wb = xlsx.utils.book_new();

    // Sheet 1: Master Overall Summary
    const masterRows = [
      ['PIXX TECHNOLOGIES PAKISTAN'],
      [`MONTHLY SALARY SHEET - ${month.toUpperCase()}`],
      [''],
      [
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
      ],
    ];

    let srNo = 1;
    let grandGross = 0;
    let grandLoanDed = 0;
    let grandNetPay = 0;

    employees.forEach((emp) => {
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

      grandGross += gross;
      grandLoanDed += loanDed;
      grandNetPay += netPay;

      masterRows.push([
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
    });

    masterRows.push(['']);
    masterRows.push([
      '',
      'GRAND TOTAL',
      '',
      '',
      '',
      '',
      grandGross,
      grandLoanDed,
      grandNetPay,
      '',
      '',
      '',
    ]);

    const wsMaster = xlsx.utils.aoa_to_sheet(masterRows);
    xlsx.utils.book_append_sheet(wb, wsMaster, 'Overall Salary Sheet');

    // Sheet 2: Bank Transfer List
    const bankTransferRows = [
      ['PIXX TECHNOLOGIES PAKISTAN'],
      [`BANK SALARY TRANSFER SHEET - ${month}`],
      [''],
      ['Sr.No', 'Employee Name', 'Designation', 'Net Salary (PKR)', 'Account Title', 'IBAN Number', 'Bank Name'],
    ];

    let bSrNo = 1;
    employees.forEach((emp) => {
      const saved = payrollMap.get(emp._id.toString());
      const gross = (emp.basicSalary || 0) + (emp.fuelAllowance || 0) + (emp.foodAllowance || 0) + (emp.mobileAllowance || 0) + (emp.performanceAllowance || 0) + (emp.otherAllowances || 0);
      const loanDed = saved ? saved.loanDeduction : 0;
      const netPay = saved ? saved.netPayable : Math.max(0, gross - loanDed);

      bankTransferRows.push([
        bSrNo++,
        emp.name,
        emp.designation,
        netPay,
        emp.accountTitle || emp.name,
        emp.ibanNumber || 'N/A',
        emp.bankName || 'Cash / Bank',
      ]);
    });

    const wsBank = xlsx.utils.aoa_to_sheet(bankTransferRows);
    xlsx.utils.book_append_sheet(wb, wsBank, 'Bank Transfer Sheet');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Salary_Sheet_${month}.xlsx`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[Download Salary Sheet Excel Error]:', error);
    return apiError(res, 'Failed to generate Excel Salary Sheet.', 500);
  }
};

/**
 * @desc    Generate Printable PDF Salary Slip for an Employee matching Salary Slip.pdf format
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
    const other = savedPayroll ? savedPayroll.otherAllowances : employee.otherAllowances || 0;

    const gross = basic + fuel + food + mobile + perf + other;
    const loanDed = savedPayroll ? savedPayroll.loanDeduction : 0;
    const lopDed = savedPayroll ? savedPayroll.lopDeduction : 0;
    const othDed = savedPayroll ? savedPayroll.otherDeduction : 0;
    const totDed = loanDed + lopDed + othDed;
    const netPayable = Math.max(0, gross - totDed);

    // Render HTML template matching the official Salary Slip layout
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Salary Slip - ${employee.name}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; }
        .slip-card { border: 2px solid #0f172a; border-radius: 12px; padding: 28px; max-width: 750px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .header { text-align: center; border-b: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
        .company-name { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
        .sub-heading { font-size: 13px; color: #64748b; font-weight: 600; margin-top: 4px; }
        .slip-title { font-size: 16px; font-weight: 800; color: #0284c7; text-transform: uppercase; background: #f0f9ff; display: inline-block; padding: 4px 16px; rounded: 6px; margin-top: 10px; border: 1px solid #bae6fd; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; margin-bottom: 20px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .meta-item { display: flex; justify-content: space-between; padding: 2px 0; }
        .label { color: #64748b; font-weight: 600; }
        .val { font-weight: 700; color: #0f172a; }
        .table-container { margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #0f172a; color: #fff; font-weight: 700; text-transform: uppercase; font-size: 11px; padding: 10px 12px; text-align: left; }
        td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; }
        .amount-col { text-align: right; font-family: monospace; font-size: 13px; font-weight: 700; }
        .net-row { background: #ecfdf5; border-top: 2px solid #10b981; }
        .net-row td { font-size: 15px; font-weight: 800; color: #047857; }
        .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; pt-20; }
        .sig-box { text-align: center; border-top: 1px solid #94a3b8; width: 180px; padding-top: 6px; font-size: 12px; font-weight: 700; color: #475569; }
      </style>
    </head>
    <body>
      <div class="slip-card">
        <div class="header">
          <h1 class="company-name">Pixx Technologies Pakistan</h1>
          <div class="sub-heading">Finance & Human Resource Management System</div>
          <div class="slip-title">PAYSLIP FOR THE MONTH OF ${month}</div>
        </div>

        <div class="meta-grid">
          <div>
            <div class="meta-item"><span class="label">Employee Name:</span> <span class="val">${employee.name}</span></div>
            <div class="meta-item"><span class="label">Designation:</span> <span class="val">${employee.designation}</span></div>
            <div class="meta-item"><span class="label">Workplace / Dept:</span> <span class="val">${employee.department}</span></div>
          </div>
          <div>
            <div class="meta-item"><span class="label">Account Title:</span> <span class="val">${employee.accountTitle || employee.name}</span></div>
            <div class="meta-item"><span class="label">Bank Name:</span> <span class="val">${employee.bankName || 'Cash / Bank'}</span></div>
            <div class="meta-item"><span class="label">IBAN No:</span> <span class="val">${employee.ibanNumber || 'N/A'}</span></div>
          </div>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Earnings & Allowances</th>
                <th class="amount-col">Amount (PKR)</th>
                <th>Deductions & Advances</th>
                <th class="amount-col">Amount (PKR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic Salary</td>
                <td class="amount-col">${formatPKR(basic)}</td>
                <td>Loan / Advance Salary Deduction</td>
                <td class="amount-col" style="color: #e11d48;">${formatPKR(loanDed)}</td>
              </tr>
              <tr>
                <td>Fuel Allowance</td>
                <td class="amount-col">${formatPKR(fuel)}</td>
                <td>Loss of Pay (LOP) Deduction</td>
                <td class="amount-col" style="color: #e11d48;">${formatPKR(lopDed)}</td>
              </tr>
              <tr>
                <td>Food & Refreshment Allowance</td>
                <td class="amount-col">${formatPKR(food)}</td>
                <td>Other Deductions</td>
                <td class="amount-col" style="color: #e11d48;">${formatPKR(othDed)}</td>
              </tr>
              <tr>
                <td>Mobile / Phone Allowance</td>
                <td class="amount-col">${formatPKR(mobile)}</td>
                <td style="color: #64748b;">Total Deductions</td>
                <td class="amount-col" style="color: #e11d48;">${formatPKR(totDed)}</td>
              </tr>
              <tr>
                <td>Performance Allowance</td>
                <td class="amount-col">${formatPKR(perf)}</td>
                <td style="color: #64748b;">Remaining Loan Balance</td>
                <td class="amount-col" style="color: #d97706;">${formatPKR(employee.loanBalance || 0)}</td>
              </tr>
              <tr style="background: #f1f5f9;">
                <td style="font-weight: 800;">TOTAL GROSS SALARY</td>
                <td class="amount-col" style="font-weight: 800; color: #1e293b;">${formatPKR(gross)}</td>
                <td colspan="2"></td>
              </tr>
              <tr class="net-row">
                <td colspan="2" style="font-weight: 800; font-size: 15px;">NET SALARY PAYABLE</td>
                <td colspan="2" class="amount-col" style="font-size: 16px; font-weight: 900;">Rs. ${formatPKR(netPayable)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="font-size: 11px; color: #64748b; line-height: 1.5; margin-top: 15px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
          * This is a computer-generated salary document issued by Pixx Technologies Pakistan HR System.
        </div>

        <div class="footer" style="margin-top: 50px;">
          <div class="sig-box">Employee Signature</div>
          <div class="sig-box">HR / Finance Manager</div>
          <div class="sig-box">Authorized Signature</div>
        </div>
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
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
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
