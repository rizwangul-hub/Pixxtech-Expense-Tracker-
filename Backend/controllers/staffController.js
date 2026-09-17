import Employee from '../models/Employee.js';
import StaffLoan from '../models/StaffLoan.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * @desc    Get all employees with filters & summary
 * @route   GET /api/staff/employees
 * @access  Private
 */
export const getEmployees = async (req, res) => {
  try {
    const { department, search, status = 'ACTIVE' } = req.query;
    const query = {};

    if (status === 'ACTIVE') query.isActive = true;
    if (status === 'INACTIVE') query.isActive = false;

    if (department && department !== 'ALL') {
      query.department = department;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: regex },
        { designation: regex },
        { employeeCode: regex },
        { accountTitle: regex },
        { bankName: regex },
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
      const perf = emp.performanceAllowance || 0;
      const other = emp.otherAllowances || 0;
      const gross = basic + fuel + food + mobile + perf + other;

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
 * @desc    Get single employee by ID with loan history
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
    const perf = employee.performanceAllowance || 0;
    const other = employee.otherAllowances || 0;
    const gross = basic + fuel + food + mobile + perf + other;

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
 * @access  Private (Admin / Publisher)
 */
export const createEmployee = async (req, res) => {
  try {
    const {
      name,
      designation,
      department,
      joiningDate,
      basicSalary = 0,
      fuelAllowance = 0,
      foodAllowance = 0,
      mobileAllowance = 0,
      performanceAllowance = 0,
      otherAllowances = 0,
      accountTitle = '',
      ibanNumber = '',
      bankName = '',
      initialLoanBalance = 0,
      notes = '',
    } = req.body;

    if (!name || !name.trim()) {
      return apiError(res, 'Employee name is required.', 400);
    }
    if (!designation || !designation.trim()) {
      return apiError(res, 'Designation is required.', 400);
    }

    const newEmp = await Employee.create({
      name: name.trim(),
      designation: designation.trim(),
      department: department || 'IT Office',
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      basicSalary: Number(basicSalary) || 0,
      fuelAllowance: Number(fuelAllowance) || 0,
      foodAllowance: Number(foodAllowance) || 0,
      mobileAllowance: Number(mobileAllowance) || 0,
      performanceAllowance: Number(performanceAllowance) || 0,
      otherAllowances: Number(otherAllowances) || 0,
      accountTitle: accountTitle.trim(),
      ibanNumber: ibanNumber.trim(),
      bankName: bankName.trim(),
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

    return apiSuccess(res, newEmp, `Employee '${newEmp.name}' created successfully.`, 201);
  } catch (error) {
    console.error('[Create Employee Error]:', error);
    return apiError(res, error.message || 'Failed to create employee.', 500);
  }
};

/**
 * @desc    Update employee details
 * @route   PUT /api/staff/employees/:id
 * @access  Private (Admin / Publisher)
 */
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);

    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const {
      name,
      designation,
      department,
      joiningDate,
      basicSalary,
      fuelAllowance,
      foodAllowance,
      mobileAllowance,
      performanceAllowance,
      otherAllowances,
      accountTitle,
      ibanNumber,
      bankName,
      isActive,
      notes,
    } = req.body;

    if (name !== undefined) employee.name = name.trim();
    if (designation !== undefined) employee.designation = designation.trim();
    if (department !== undefined) employee.department = department;
    if (joiningDate !== undefined) employee.joiningDate = new Date(joiningDate);
    if (basicSalary !== undefined) employee.basicSalary = Number(basicSalary) || 0;
    if (fuelAllowance !== undefined) employee.fuelAllowance = Number(fuelAllowance) || 0;
    if (foodAllowance !== undefined) employee.foodAllowance = Number(foodAllowance) || 0;
    if (mobileAllowance !== undefined) employee.mobileAllowance = Number(mobileAllowance) || 0;
    if (performanceAllowance !== undefined) employee.performanceAllowance = Number(performanceAllowance) || 0;
    if (otherAllowances !== undefined) employee.otherAllowances = Number(otherAllowances) || 0;
    if (accountTitle !== undefined) employee.accountTitle = accountTitle.trim();
    if (ibanNumber !== undefined) employee.ibanNumber = ibanNumber.trim();
    if (bankName !== undefined) employee.bankName = bankName.trim();
    if (isActive !== undefined) employee.isActive = Boolean(isActive);
    if (notes !== undefined) employee.notes = notes.trim();

    await employee.save();

    return apiSuccess(res, employee, `Employee '${employee.name}' updated successfully.`);
  } catch (error) {
    console.error('[Update Employee Error]:', error);
    return apiError(res, error.message || 'Failed to update employee.', 500);
  }
};

/**
 * @desc    Record loan disbursement or repayment for an employee
 * @route   POST /api/staff/employees/:id/loan
 * @access  Private
 */
export const recordLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, description = '', payrollMonth = '' } = req.body;

    if (!['DISBURSEMENT', 'REPAYMENT'].includes(type)) {
      return apiError(res, 'Loan type must be DISBURSEMENT or REPAYMENT.', 400);
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return apiError(res, 'Valid positive loan amount is required.', 400);
    }

    const employee = await Employee.findById(id);
    if (!employee) {
      return apiError(res, 'Employee not found.', 404);
    }

    const prevBal = employee.loanBalance || 0;
    let newBal = prevBal;

    if (type === 'DISBURSEMENT') {
      newBal = prevBal + numAmount;
    } else {
      newBal = Math.max(0, prevBal - numAmount);
    }

    employee.loanBalance = newBal;
    await employee.save();

    const loanEntry = await StaffLoan.create({
      employeeId: employee._id,
      type,
      amount: numAmount,
      previousBalance: prevBal,
      newBalance: newBal,
      payrollMonth,
      description: description.trim() || (type === 'DISBURSEMENT' ? 'Advance Salary / Loan Issued' : 'Loan Repayment'),
      createdBy: req.user?._id || null,
    });

    return apiSuccess(
      res,
      { employee, loanEntry },
      `Loan ${type.toLowerCase()} of Rs. ${numAmount} recorded successfully.`
    );
  } catch (error) {
    console.error('[Record Loan Error]:', error);
    return apiError(res, 'Failed to record loan transaction.', 500);
  }
};
