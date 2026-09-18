import fs from 'fs';
import Employee from '../models/Employee.js';
import StaffLocation from '../models/StaffLocation.js';
import StaffDesignation from '../models/StaffDesignation.js';
import StaffSetting from '../models/StaffSetting.js';
import StaffAuditLog from '../models/StaffAuditLog.js';
import StaffLoan from '../models/StaffLoan.js';
import StaffLeave from '../models/StaffLeave.js';
import Attendance from '../models/Attendance.js';
import Payroll from '../models/Payroll.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { getLogoBase64 } from '../utils/logoHelper.js';

const formatPKR = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(num);
};

/**
 * Log action to StaffAuditLog
 */
export const logStaffAudit = async (req, action, details, recordId = '', oldValue = null, newValue = null) => {
  try {
    await StaffAuditLog.create({
      userId: req?.user?._id || null,
      userName: req?.user?.name || 'System Admin',
      action,
      recordId,
      details,
      oldValue,
      newValue,
    });
  } catch (err) {
    console.error('[Staff Audit Log Error]:', err);
  }
};

/**
 * @desc    Get all employees with filters & summary
 * @route   GET /api/staff/employees
 * @access  Private
 */
export const getEmployees = async (req, res) => {
  try {
    const { department, location, search, status = 'ACTIVE' } = req.query;
    const query = {};

    if (status === 'ACTIVE') query.isActive = true;
    if (status === 'INACTIVE') query.isActive = false;

    if (department && department !== 'ALL') {
      query.department = department;
    }
    if (location && location !== 'ALL') {
      query.staffLocation = location;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: regex },
        { designation: regex },
        { employeeCode: regex },
        { accountTitle: regex },
        { bankName: regex },
        { cnic: regex },
        { mobileNumber: regex },
      ];
    }

    const employees = await Employee.find(query).sort({ department: 1, name: 1 }).lean();

    let totalGrossSalary = 0;
    let totalBasicSalary = 0;
    let totalLoanBalance = 0;

    const enriched = employees.map((emp) => {
      const basic = emp.basicSalary || 0;
      const fuel = emp.fuelAllowance || 0;
      const food = emp.foodAllowance || 0;
      const mobile = emp.mobileAllowance || 0;
      const transport = emp.transportAllowance || 0;
      const perf = emp.performanceAllowance || 0;
      const other = emp.otherAllowances || 0;
      const gross = basic + fuel + food + mobile + transport + perf + other;

      totalBasicSalary += basic;
      totalGrossSalary += gross;
      totalLoanBalance += emp.loanBalance || 0;

      return {
        ...emp,
        grossSalary: gross,
      };
    });

    const summary = {
      totalEmployees: enriched.length,
      totalBasicSalary,
      totalGrossSalary,
      totalLoanBalance,
    };

    return apiSuccess(res, { employees: enriched, summary }, `Found ${enriched.length} employees.`);
  } catch (error) {
    console.error('[Get Employees Error]:', error);
    return apiError(res, 'Failed to fetch employees.', 500);
  }
};

/**
 * @desc    Get single employee by ID
 * @route   GET /api/staff/employees/:id
 * @access  Private
 */
export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id).lean();

    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const loanHistory = await StaffLoan.find({ employeeId: id }).sort({ createdAt: -1 }).lean();

    const basic = employee.basicSalary || 0;
    const fuel = employee.fuelAllowance || 0;
    const food = employee.foodAllowance || 0;
    const mobile = employee.mobileAllowance || 0;
    const transport = employee.transportAllowance || 0;
    const perf = employee.performanceAllowance || 0;
    const other = employee.otherAllowances || 0;
    const gross = basic + fuel + food + mobile + transport + perf + other;

    return apiSuccess(
      res,
      { employee: { ...employee, grossSalary: gross }, loanHistory },
      'Employee details fetched.'
    );
  } catch (error) {
    console.error('[Get Employee Error]:', error);
    return apiError(res, 'Failed to fetch employee details.', 500);
  }
};

/**
 * @desc    Create a new employee
 * @route   POST /api/staff/employees
 * @access  Private
 */
export const createEmployee = async (req, res) => {
  try {
    const {
      name,
      fatherOrHusbandName = '',
      cnic = '',
      mobileNumber = '',
      email = '',
      address = '',
      dateOfBirth = null,
      designation,
      department,
      staffLocation,
      joiningDate,
      basicSalary = 0,
      fuelAllowance = 0,
      foodAllowance = 0,
      mobileAllowance = 0,
      transportAllowance = 0,
      performanceAllowance = 0,
      otherAllowances = 0,
      allowedMonthlyLeaves = 2,
      accountTitle = '',
      ibanNumber = '',
      bankName = '',
      branchName = '',
      accountNumber = '',
      paymentMethod = 'BANK_TRANSFER',
      initialLoanBalance = 0,
      notes = '',
    } = req.body;

    if (!name || !name.trim()) {
      return apiError(res, 'Employee name is required.', 400);
    }
    if (!designation || !designation.trim()) {
      return apiError(res, 'Designation is required.', 400);
    }

    const dept = department || staffLocation || 'IT Office';

    const newEmp = await Employee.create({
      name: name.trim(),
      fatherOrHusbandName: fatherOrHusbandName.trim(),
      cnic: cnic.trim(),
      mobileNumber: mobileNumber.trim(),
      email: email.trim(),
      address: address.trim(),
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      designation: designation.trim(),
      department: dept,
      staffLocation: dept,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      basicSalary: Number(basicSalary) || 0,
      fuelAllowance: Number(fuelAllowance) || 0,
      foodAllowance: Number(foodAllowance) || 0,
      mobileAllowance: Number(mobileAllowance) || 0,
      transportAllowance: Number(transportAllowance) || 0,
      performanceAllowance: Number(performanceAllowance) || 0,
      otherAllowances: Number(otherAllowances) || 0,
      allowedMonthlyLeaves: Number(allowedMonthlyLeaves) || 2,
      accountTitle: accountTitle.trim(),
      ibanNumber: ibanNumber.trim(),
      bankName: bankName.trim(),
      branchName: branchName.trim(),
      accountNumber: accountNumber.trim(),
      paymentMethod: paymentMethod || 'BANK_TRANSFER',
      loanBalance: Number(initialLoanBalance) || 0,
      notes: notes.trim(),
      createdBy: req.user?._id || null,
    });

    if (Number(initialLoanBalance) > 0) {
      await StaffLoan.create({
        employeeId: newEmp._id,
        type: 'DISBURSEMENT',
        amount: Number(initialLoanBalance),
        previousBalance: 0,
        newBalance: Number(initialLoanBalance),
        description: 'Opening Loan / Advance Balance',
        createdBy: req.user?._id || null,
      });
    }

    await logStaffAudit(req, 'EMPLOYEE_CREATED', `Created employee profile '${newEmp.name}' (${newEmp.designation})`, newEmp._id.toString(), null, newEmp.toObject());

    return apiSuccess(res, newEmp, `Employee '${newEmp.name}' created successfully.`, 201);
  } catch (error) {
    console.error('[Create Employee Error]:', error);
    return apiError(res, error.message || 'Failed to create employee.', 500);
  }
};

/**
 * @desc    Update employee profile & salary package
 * @route   PUT /api/staff/employees/:id
 * @access  Private
 */
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);

    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const oldVal = employee.toObject();

    const {
      name,
      fatherOrHusbandName,
      cnic,
      mobileNumber,
      email,
      address,
      dateOfBirth,
      designation,
      department,
      staffLocation,
      joiningDate,
      basicSalary,
      fuelAllowance,
      foodAllowance,
      mobileAllowance,
      transportAllowance,
      performanceAllowance,
      otherAllowances,
      allowedMonthlyLeaves,
      accountTitle,
      ibanNumber,
      bankName,
      branchName,
      accountNumber,
      paymentMethod,
      isActive,
      notes,
    } = req.body;

    if (name !== undefined) employee.name = name.trim();
    if (fatherOrHusbandName !== undefined) employee.fatherOrHusbandName = fatherOrHusbandName.trim();
    if (cnic !== undefined) employee.cnic = cnic.trim();
    if (mobileNumber !== undefined) employee.mobileNumber = mobileNumber.trim();
    if (email !== undefined) employee.email = email.trim();
    if (address !== undefined) employee.address = address.trim();
    if (dateOfBirth !== undefined) employee.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (designation !== undefined) employee.designation = designation.trim();
    if (department !== undefined) employee.department = department;
    if (staffLocation !== undefined) employee.staffLocation = staffLocation;
    if (joiningDate !== undefined) employee.joiningDate = new Date(joiningDate);
    if (basicSalary !== undefined) employee.basicSalary = Number(basicSalary) || 0;
    if (fuelAllowance !== undefined) employee.fuelAllowance = Number(fuelAllowance) || 0;
    if (foodAllowance !== undefined) employee.foodAllowance = Number(foodAllowance) || 0;
    if (mobileAllowance !== undefined) employee.mobileAllowance = Number(mobileAllowance) || 0;
    if (transportAllowance !== undefined) employee.transportAllowance = Number(transportAllowance) || 0;
    if (performanceAllowance !== undefined) employee.performanceAllowance = Number(performanceAllowance) || 0;
    if (otherAllowances !== undefined) employee.otherAllowances = Number(otherAllowances) || 0;
    if (allowedMonthlyLeaves !== undefined) employee.allowedMonthlyLeaves = Number(allowedMonthlyLeaves) || 2;
    if (accountTitle !== undefined) employee.accountTitle = accountTitle.trim();
    if (ibanNumber !== undefined) employee.ibanNumber = ibanNumber.trim();
    if (bankName !== undefined) employee.bankName = bankName.trim();
    if (branchName !== undefined) employee.branchName = branchName.trim();
    if (accountNumber !== undefined) employee.accountNumber = accountNumber.trim();
    if (paymentMethod !== undefined) employee.paymentMethod = paymentMethod;
    if (isActive !== undefined) employee.isActive = Boolean(isActive);
    if (notes !== undefined) employee.notes = notes.trim();

    await employee.save();

    await logStaffAudit(req, 'EMPLOYEE_UPDATED', `Updated employee profile '${employee.name}'`, employee._id.toString(), oldVal, employee.toObject());

    return apiSuccess(res, employee, `Employee '${employee.name}' updated successfully.`);
  } catch (error) {
    console.error('[Update Employee Error]:', error);
    return apiError(res, error.message || 'Failed to update employee.', 500);
  }
};

/**
 * Staff Locations Endpoints
 */
export const getLocations = async (req, res) => {
  try {
    const locations = await StaffLocation.find({ isActive: true }).sort({ name: 1 }).lean();
    return apiSuccess(res, locations, `Found ${locations.length} workplaces.`);
  } catch (error) {
    return apiError(res, 'Failed to fetch staff locations.', 500);
  }
};

export const createLocation = async (req, res) => {
  try {
    const { name, openingTime = '12:30', gracePeriodMinutes = 15, description = '' } = req.body;
    if (!name || !name.trim()) return apiError(res, 'Location name is required.', 400);

    const loc = await StaffLocation.create({
      name: name.trim(),
      openingTime,
      gracePeriodMinutes: Number(gracePeriodMinutes) || 15,
      description: description.trim(),
    });
    return apiSuccess(res, loc, `Workplace location '${loc.name}' created.`, 201);
  } catch (error) {
    return apiError(res, error.message || 'Failed to create location.', 500);
  }
};

/**
 * Staff Designations Endpoints
 */
export const getDesignations = async (req, res) => {
  try {
    const designations = await StaffDesignation.find({ isActive: true }).sort({ name: 1 }).lean();
    return apiSuccess(res, designations, `Found ${designations.length} designations.`);
  } catch (error) {
    return apiError(res, 'Failed to fetch designations.', 500);
  }
};

export const createDesignation = async (req, res) => {
  try {
    const { name, department = 'General', description = '' } = req.body;
    if (!name || !name.trim()) return apiError(res, 'Designation name is required.', 400);

    const desig = await StaffDesignation.create({
      name: name.trim(),
      department: department.trim(),
      description: description.trim(),
    });
    return apiSuccess(res, desig, `Designation '${desig.name}' created.`, 201);
  } catch (error) {
    return apiError(res, error.message || 'Failed to create designation.', 500);
  }
};

/**
 * Staff Settings Endpoints
 */
export const getStaffSettings = async (req, res) => {
  try {
    let settings = await StaffSetting.findOne().lean();
    if (!settings) {
      settings = await StaffSetting.create({});
    }
    return apiSuccess(res, settings, 'Staff settings fetched.');
  } catch (error) {
    return apiError(res, 'Failed to fetch staff settings.', 500);
  }
};

export const updateStaffSettings = async (req, res) => {
  try {
    let settings = await StaffSetting.findOne();
    if (!settings) settings = new StaffSetting();

    const { defaultShiftOpeningTime, defaultGracePeriodMinutes, salaryCalculationBasis, defaultAllowedLeaves, whtRate } = req.body;
    if (defaultShiftOpeningTime) settings.defaultShiftOpeningTime = defaultShiftOpeningTime;
    if (defaultGracePeriodMinutes !== undefined) settings.defaultGracePeriodMinutes = Number(defaultGracePeriodMinutes) || 15;
    if (salaryCalculationBasis) settings.salaryCalculationBasis = salaryCalculationBasis;
    if (defaultAllowedLeaves !== undefined) settings.defaultAllowedLeaves = Number(defaultAllowedLeaves) || 2;
    if (whtRate !== undefined) settings.whtRate = Number(whtRate) || 0;

    await settings.save();
    return apiSuccess(res, settings, 'Staff settings updated.');
  } catch (error) {
    return apiError(res, 'Failed to update staff settings.', 500);
  }
};

/**
 * Audit Log Endpoint
 */
export const getStaffAuditLogs = async (req, res) => {
  try {
    const logs = await StaffAuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
    return apiSuccess(res, logs, `Fetched ${logs.length} audit records.`);
  } catch (error) {
    return apiError(res, 'Failed to fetch staff audit logs.', 500);
  }
};

/**
 * Record a new loan / advance salary disbursement for an employee
 */
export const recordLoan = async (req, res) => {
  try {
    const employeeId = req.params.id || req.body.employeeId;
    const { type = 'DISBURSEMENT', amount, description = '' } = req.body;

    const numAmount = Number(amount);
    if (!employeeId || isNaN(numAmount) || numAmount <= 0) {
      return apiError(res, 'Valid employee ID and loan amount are required.', 400);
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const isRepayment = type === 'REPAYMENT';
    const prevBal = employee.loanBalance || 0;
    const newBal = isRepayment ? Math.max(0, prevBal - numAmount) : prevBal + numAmount;
    employee.loanBalance = newBal;
    await employee.save();

    const defaultDesc = isRepayment ? 'Loan Cash Repayment' : 'Advance Salary / Loan Disbursement';

    const loanDoc = await StaffLoan.create({
      employeeId: employee._id,
      type: isRepayment ? 'REPAYMENT' : 'DISBURSEMENT',
      amount: numAmount,
      previousBalance: prevBal,
      newBalance: newBal,
      description: description.trim() || defaultDesc,
      createdBy: req.user?._id || null,
    });

    await logStaffAudit(
      req,
      isRepayment ? 'LOAN_REPAID' : 'LOAN_DISBURSED',
      `${isRepayment ? 'Repaid' : 'Disbursed'} loan/advance Rs. ${numAmount} for ${employee.name}. New balance: Rs. ${newBal}`,
      employee._id.toString()
    );

    return apiSuccess(res, { employee, loanDoc }, `Loan transaction recorded for ${employee.name}.`, 201);
  } catch (error) {
    console.error('[Record Loan Error]:', error);
    return apiError(res, error.message || 'Failed to record loan.', 500);
  }
};

/**
 * Get all loans history with optional employee filter
 */
export const getLoans = async (req, res) => {
  try {
    const { employeeId } = req.query;
    const query = {};
    if (employeeId) query.employeeId = employeeId;

    const loans = await StaffLoan.find(query).populate('employeeId', 'name designation employeeCode department').sort({ createdAt: -1 }).lean();
    return apiSuccess(res, loans, `Fetched ${loans.length} loan records.`);
  } catch (error) {
    return apiError(res, 'Failed to fetch loan records.', 500);
  }
};

/**
 * Get staff leaves
 */
export const getLeaves = async (req, res) => {
  try {
    const { employeeId, status } = req.query;
    const query = {};
    if (employeeId) query.employeeId = employeeId;
    if (status) query.status = status;

    const leaves = await StaffLeave.find(query).populate('employeeId', 'name designation department staffLocation').sort({ startDate: -1 }).lean();
    return apiSuccess(res, leaves, `Fetched ${leaves.length} leave records.`);
  } catch (error) {
    return apiError(res, 'Failed to fetch leaves.', 500);
  }
};

/**
 * Create leave request
 */
export const createLeave = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, days, leaveType = 'CASUAL', reason = '' } = req.body;
    if (!employeeId || !startDate || !endDate || !days) {
      return apiError(res, 'Employee ID, Start Date, End Date and Days are required.', 400);
    }

    const leave = await StaffLeave.create({
      employeeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: Number(days),
      leaveType,
      reason: reason.trim(),
      status: 'APPROVED',
      approvedBy: req.user?._id || null,
    });

    const emp = await Employee.findById(employeeId).select('name');
    await logStaffAudit(req, 'LEAVE_CREATED', `Leave created for ${emp?.name || 'Employee'} (${days} days)`, leave._id.toString());

    return apiSuccess(res, leave, 'Leave record created.', 201);
  } catch (error) {
    return apiError(res, error.message || 'Failed to create leave.', 500);
  }
};

/**
 * Update leave status (APPROVED / REJECTED)
 */
export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      return apiError(res, 'Invalid leave status.', 400);
    }

    const leave = await StaffLeave.findByIdAndUpdate(id, { status, approvedBy: req.user?._id || null }, { new: true });
    return apiSuccess(res, leave, `Leave status updated to ${status}.`);
  } catch (error) {
    return apiError(res, 'Failed to update leave status.', 500);
  }
};

/**
 * Dashboard stats overview
 */
export const getStaffDashboardStats = async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments({});
    const activeEmployees = await Employee.countDocuments({ isActive: true });

    // Today's attendance
    const todayStr = new Date().toISOString().split('T')[0];
    const todayAtt = await Attendance.find({ dateStr: todayStr }).lean();

    let presentToday = 0;
    let leaveToday = 0;
    let absentToday = 0;

    todayAtt.forEach((r) => {
      if (r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'HALF_DAY') presentToday++;
      if (r.status === 'LEAVE') leaveToday++;
      if (r.status === 'ABSENT') absentToday++;
    });

    // Active loan totals
    const activeEmpDocs = await Employee.find({ isActive: true }).select('basicSalary fuelAllowance foodAllowance mobileAllowance performanceAllowance otherAllowances loanBalance').lean();
    let totalGrossMonthly = 0;
    let totalOutstandingLoans = 0;

    activeEmpDocs.forEach((emp) => {
      const gross = (emp.basicSalary || 0) + (emp.fuelAllowance || 0) + (emp.foodAllowance || 0) + (emp.mobileAllowance || 0) + (emp.performanceAllowance || 0) + (emp.otherAllowances || 0);
      totalGrossMonthly += gross;
      totalOutstandingLoans += emp.loanBalance || 0;
    });

    return apiSuccess(res, {
      totalEmployees,
      activeEmployees,
      presentToday,
      leaveToday,
      absentToday,
      totalGrossMonthly,
      totalOutstandingLoans,
    }, 'Staff dashboard stats fetched.');
  } catch (error) {
    console.error('[Dashboard Stats Error]:', error);
    return apiError(res, 'Failed to fetch staff dashboard stats.', 500);
  }
};

/**
 * @desc    Get individual employee advance loan ledger
 * @route   GET /api/staff/employees/:id/loan-ledger
 * @access  Private
 */
export const getEmployeeLoanLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id).lean();
    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const loans = await StaffLoan.find({ employeeId: id }).sort({ createdAt: 1 }).lean();

    let totalDisbursed = 0;
    let totalRepaid = 0;

    const ledgerRows = loans.map((loan) => {
      const isDisbursement = loan.type === 'DISBURSEMENT';
      if (isDisbursement) totalDisbursed += loan.amount;
      else totalRepaid += loan.amount;

      return {
        id: loan._id,
        date: loan.createdAt,
        payrollMonth: loan.payrollMonth || '',
        type: loan.type,
        description: loan.description || (isDisbursement ? 'Advance Salary Disbursement' : 'Loan Repayment / Salary Deduction'),
        debit: isDisbursement ? loan.amount : 0,
        credit: isDisbursement ? 0 : loan.amount,
        previousBalance: loan.previousBalance,
        runningBalance: loan.newBalance,
      };
    });

    return apiSuccess(
      res,
      {
        employee,
        ledgerRows,
        summary: {
          totalDisbursed,
          totalRepaid,
          currentBalance: employee.loanBalance || 0,
        },
      },
      `Fetched loan ledger for ${employee.name}.`
    );
  } catch (error) {
    console.error('[Get Loan Ledger Error]:', error);
    return apiError(res, 'Failed to fetch loan ledger.', 500);
  }
};

/**
 * @desc    Generate Printable PDF Statement for Employee Loan Ledger
 * @route   GET /api/staff/employees/:id/loan-ledger/pdf
 * @access  Private
 */
export const generateLoanLedgerPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id).lean();
    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const loans = await StaffLoan.find({ employeeId: id }).sort({ createdAt: 1 }).lean();

    let totalDisbursed = 0;
    let totalRepaid = 0;

    const ledgerRowsHTML = loans
      .map((loan, idx) => {
        const isDisbursement = loan.type === 'DISBURSEMENT';
        if (isDisbursement) totalDisbursed += loan.amount;
        else totalRepaid += loan.amount;

        const dateStr = new Date(loan.createdAt).toLocaleDateString('en-PK', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const typeBadge = isDisbursement
          ? `<span style="background: #fef2f2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px;">DISBURSED</span>`
          : `<span style="background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 10px;">REPAID</span>`;

        return `
        <tr style="background: ${bg};">
          <td style="text-align: center; font-weight: bold; color: #64748b;">${idx + 1}</td>
          <td style="font-weight: 700; color: #334155;">${dateStr}</td>
          <td style="text-align: center;">${typeBadge}</td>
          <td style="color: #0f172a; font-weight: 600;">${loan.description || 'Advance / Loan Transaction'}</td>
          <td style="text-align: right; font-family: monospace; color: #dc2626; font-weight: 700;">${isDisbursement ? 'Rs. ' + formatPKR(loan.amount) : '—'}</td>
          <td style="text-align: right; font-family: monospace; color: #047857; font-weight: 700;">${!isDisbursement ? 'Rs. ' + formatPKR(loan.amount) : '—'}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 900; color: #0f172a;">Rs. ${formatPKR(loan.newBalance)}</td>
        </tr>
      `;
      })
      .join('');

    const logoDataUri = getLogoBase64();

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Loan Ledger - ${employee.name}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; margin: 0; padding: 10px; background: #fff; }
        .header-banner {
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
          color: #ffffff;
          padding: 16px 20px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .logo-box { display: flex; align-items: center; gap: 12px; }
        .logo-img { max-height: 48px; background: #fff; padding: 3px; border-radius: 6px; }
        .banner-title { font-size: 22px; font-weight: 900; color: #38bdf8; letter-spacing: 1px; }
        .banner-sub { font-size: 12px; color: #f43f5e; font-weight: 800; text-transform: uppercase; }

        .emp-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 15px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          font-size: 12px;
        }
        .emp-row { display: flex; justify-content: space-between; padding: 3px 0; }
        .emp-lbl { color: #64748b; font-weight: 600; }
        .emp-val { color: #0f172a; font-weight: 800; }

        .kpi-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 15px;
        }
        .kpi-box {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          padding: 10px;
          border-radius: 6px;
          text-align: center;
        }
        .kpi-lbl { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .kpi-num { font-size: 18px; font-weight: 900; font-family: monospace; margin-top: 2px; }

        table.ledger-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        table.ledger-table th { background: #1e1b4b; color: #ffffff; padding: 8px; font-size: 10px; text-transform: uppercase; border: 1px solid #0f172a; }
        table.ledger-table td { padding: 6px 8px; border: 1px solid #cbd5e1; }
        
        .summary-row { background: #fef2f2 !important; font-weight: 900; }
        .summary-row td { border-top: 2px solid #991b1b !important; }
      </style>
    </head>
    <body>
      <div class="header-banner">
        <div class="logo-box">
          ${logoDataUri ? `<img src="${logoDataUri}" class="logo-img" alt="Pixx Logo" />` : ''}
          <div>
            <div class="banner-title">PIXX TECHNOLOGIES PAKISTAN</div>
            <div class="banner-sub">Staff Advance Loan Statement & Ledger</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; color: #cbd5e1;">Statement Date:</div>
          <div style="font-size: 12px; font-weight: 800; color: #ffffff;">${new Date().toLocaleDateString('en-PK')}</div>
        </div>
      </div>

      <div class="emp-card">
        <div>
          <div class="emp-row"><span class="emp-lbl">Employee Name:</span><span class="emp-val" style="font-size: 14px; color: #0284c7;">${employee.name}</span></div>
          <div class="emp-row"><span class="emp-lbl">Employee Code:</span><span class="emp-val">${employee.employeeCode || 'PK-EMP'}</span></div>
          <div class="emp-row"><span class="emp-lbl">Designation:</span><span class="emp-val">${employee.designation}</span></div>
        </div>
        <div>
          <div class="emp-row"><span class="emp-lbl">Department / Workplace:</span><span class="emp-val" style="color: #7c3aed;">${employee.department}</span></div>
          <div class="emp-row"><span class="emp-lbl">Basic Salary:</span><span class="emp-val">Rs. ${formatPKR(employee.basicSalary)}</span></div>
          <div class="emp-row"><span class="emp-lbl">Status:</span><span class="emp-val" style="color: #047857;">ACTIVE STAFF</span></div>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-lbl">Total Loans Issued</div>
          <div class="kpi-num" style="color: #dc2626;">Rs. ${formatPKR(totalDisbursed)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-lbl">Total Loan Repaid</div>
          <div class="kpi-num" style="color: #047857;">Rs. ${formatPKR(totalRepaid)}</div>
        </div>
        <div class="kpi-box" style="background: #fef2f2; border-color: #fca5a5;">
          <div class="kpi-lbl" style="color: #991b1b;">Current Outstanding Balance</div>
          <div class="kpi-num" style="color: #e11d48;">Rs. ${formatPKR(employee.loanBalance)}</div>
        </div>
      </div>

      <table class="ledger-table">
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th style="width: 90px;">Date</th>
            <th style="width: 80px;">Type</th>
            <th>Description / Purpose</th>
            <th style="text-align: right; width: 100px;">Debit (+)</th>
            <th style="text-align: right; width: 100px;">Credit (-)</th>
            <th style="text-align: right; width: 110px;">Running Bal</th>
          </tr>
        </thead>
        <tbody>
          ${
            ledgerRowsHTML ||
            `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">No loan or advance transactions recorded for this employee.</td></tr>`
          }
          <tr class="summary-row">
            <td colspan="4" style="text-align: center; font-weight: 900;">TOTALS & CURRENT OUTSTANDING BALANCE</td>
            <td style="text-align: right; color: #dc2626;">Rs. ${formatPKR(totalDisbursed)}</td>
            <td style="text-align: right; color: #047857;">Rs. ${formatPKR(totalRepaid)}</td>
            <td style="text-align: right; color: #e11d48; font-size: 13px;">Rs. ${formatPKR(employee.loanBalance)}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
    `;

    // Try Puppeteer PDF rendering
    try {
      const puppeteer = (await import('puppeteer-core')).default;
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
      res.setHeader('Content-Disposition', `inline; filename=Loan_Ledger_${employee.name.replace(/\s+/g, '_')}.pdf`);
      return res.status(200).send(pdfBuffer);
    } catch (pdfErr) {
      console.warn('[Puppeteer Warning]: Falling back to raw HTML for Loan Ledger PDF:', pdfErr.message);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(htmlContent);
    }
  } catch (error) {
    console.error('[Generate Loan Ledger PDF Error]:', error);
    return apiError(res, 'Failed to generate Loan Ledger PDF.', 500);
  }
};

