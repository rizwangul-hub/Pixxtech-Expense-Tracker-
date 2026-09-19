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
    const { amount, description = 'Advance Salary / Loan Disbursement' } = req.body;

    const numAmount = Number(amount);
    if (!employeeId || isNaN(numAmount) || numAmount <= 0) {
      return apiError(res, 'Valid employee ID and loan amount are required.', 400);
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const prevBal = employee.loanBalance || 0;
    const newBal = prevBal + numAmount;
    employee.loanBalance = newBal;
    await employee.save();

    const loanDoc = await StaffLoan.create({
      employeeId: employee._id,
      type: 'DISBURSEMENT',
      amount: numAmount,
      previousBalance: prevBal,
      newBalance: newBal,
      description: description.trim(),
      createdBy: req.user?._id || null,
    });

    await logStaffAudit(
      req,
      'LOAN_DISBURSED',
      `Disbursed loan/advance Rs. ${numAmount} to ${employee.name}. New balance: Rs. ${newBal}`,
      employee._id.toString()
    );

    return apiSuccess(res, { employee, loanDoc }, `Loan of Rs. ${numAmount} recorded for ${employee.name}.`, 201);
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

    const loans = await StaffLoan.find(query)
      .populate('employeeId', 'name designation employeeCode department')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
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

