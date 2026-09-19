// loanLedgerController.js
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import StaffLoan from '../models/StaffLoan.js';
import Employee from '../models/Employee.js';

/**
 * GET /api/staff/loan-ledger
 * Returns loan ledger for all employees or a specific employee.
 * Query params:
 *   employeeId (optional) - filter by employee
 *   month (optional) - filter loans/payments by month (YYYY-MM) based on loan date or payrollMonth
 */
export const getLoanLedger = async (req, res) => {
  try {
    const { employeeId, month } = req.query;
    const loanFilter = {};
    if (employeeId) loanFilter.employeeId = employeeId;
    if (month) {
      // match either loan date or payrollMonth that starts with month
      const monthRegex = new RegExp(`^${month}`);
      loanFilter.$or = [
        { date: { $gte: new Date(`${month}-01`), $lt: new Date(`${month}-31`) } },
        { payrollMonth: month },
      ];
    }

    // fetch loans with operator details
    const loans = await StaffLoan.find(loanFilter)
      .populate('createdBy', 'name email')
      .sort({ date: 1 })
      .lean();

    // group by employee
    const ledgerMap = new Map();
    for (const loan of loans) {
      const empId = loan.employeeId.toString();
      if (!ledgerMap.has(empId)) ledgerMap.set(empId, []);
      ledgerMap.get(empId).push({
        _id: loan._id,
        date: loan.date || loan.createdAt,
        type: loan.type,
        amount: loan.amount,
        previousBalance: loan.previousBalance,
        newBalance: loan.newBalance,
        payrollMonth: loan.payrollMonth || '',
        description: loan.description || (loan.type === 'DISBURSEMENT' ? 'Advance Salary Issued' : 'Loan Repayment / Deduction'),
        createdBy: loan.createdBy ? { _id: loan.createdBy._id, name: loan.createdBy.name, email: loan.createdBy.email } : null,
        operatorName: loan.createdBy?.name || 'System Operator',
      });
    }

    // attach employee details
    const employeeIds = Array.from(ledgerMap.keys());
    const employees = await Employee.find({ _id: { $in: employeeIds } }, { name: 1, designation: 1, department: 1, loanBalance: 1 }).lean();
    const employeeMap = new Map();
    employees.forEach((e) => employeeMap.set(e._id.toString(), e));

    const result = [];
    for (const [empId, entries] of ledgerMap.entries()) {
      const empInfo = employeeMap.get(empId) || {};
      const totalDisbursed = entries.filter(e => e.type === 'DISBURSEMENT').reduce((s, e) => s + e.amount, 0);
      const totalRepaid = entries.filter(e => e.type === 'REPAYMENT').reduce((s, e) => s + e.amount, 0);
      const outstanding = empInfo.loanBalance !== undefined ? empInfo.loanBalance : Math.max(0, totalDisbursed - totalRepaid);
      result.push({
        employeeId: empId,
        employeeName: empInfo.name || '',
        designation: empInfo.designation || '',
        department: empInfo.department || '',
        totalDisbursed,
        totalRepaid,
        outstandingBalance: outstanding,
        ledger: entries,
      });
    }

    return apiSuccess(res, result, 'Staff loan ledger retrieved');
  } catch (err) {
    console.error('[Loan Ledger Error]:', err);
    return apiError(res, 'Failed to retrieve loan ledger', 500);
  }
};
