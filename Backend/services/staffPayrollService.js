import xlsx from 'xlsx';

/**
 * Converts numbers into Pakistani English Words for Salary Slips
 * e.g., 48276 -> "Rupees Forty Eight Thousand Two Hundred Seventy Six Only"
 */
export const numberToWords = (num) => {
  const amount = Math.floor(Math.abs(Number(num) || 0));
  if (amount === 0) return 'Rupees Zero Only';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  }

  return `Rupees ${inWords(amount)} Only`;
};

/**
 * Central Payroll Calculation Service
 */
export const calculateMonthlyPayrollRecord = (employee, attRecords = [], monthStr = '2026-08', options = {}) => {
  const [y, m] = monthStr.split('-').map(Number);
  const calendarDays = new Date(y, m, 0).getDate();

  const basisOption = options.salaryCalculationBasis || 'FIXED_30_DAYS';
  let calculationBasisDays = 30;
  if (basisOption === 'CALENDAR_DAYS') calculationBasisDays = calendarDays;
  if (basisOption === 'WORKING_DAYS') calculationBasisDays = 26; // Standard 26 working days

  // Aggregate Attendance
  let presentDays = 0;
  let lateDays = 0;
  let totalLateMinutes = 0;
  let leaveDays = 0;
  let absentDays = 0;
  let halfDays = 0;

  attRecords.forEach((r) => {
    if (r.status === 'PRESENT') presentDays += 1;
    if (r.status === 'LATE') {
      presentDays += 1;
      lateDays += 1;
      totalLateMinutes += r.lateMinutes || 0;
    }
    if (r.status === 'HALF_DAY') {
      halfDays += 1;
      presentDays += 0.5;
    }
    if (r.status === 'LEAVE') leaveDays += 1;
    if (r.status === 'ABSENT') absentDays += 1;
  });

  const allowedLeaves = employee.allowedMonthlyLeaves ?? (options.defaultAllowedLeaves || 2);
  const excessLeaves = Math.max(0, leaveDays - allowedLeaves);
  const lopDays = excessLeaves + absentDays;
  const totalSalaryDays = Math.max(0, calculationBasisDays - lopDays);

  // Salary & Allowances
  const baseSalary = employee.basicSalary || 0;
  const fuel = employee.fuelAllowance || 0;
  const food = employee.foodAllowance || 0;
  const mobile = employee.mobileAllowance || 0;
  const transport = employee.transportAllowance || 0;
  const perf = employee.performanceAllowance || 0;
  const otherAllow = employee.otherAllowances || 0;

  const overtime = Number(options.overtimeAmount) || 0;
  const bonus = Number(options.bonusAmount) || 0;
  const leaveEncashment = Number(options.leaveEncashmentAmount) || 0;
  const otherReceipts = Number(options.otherReceiptsAmount) || 0;

  const totalAllowances = fuel + food + mobile + transport + perf + otherAllow;
  const grossSalary = baseSalary + totalAllowances + overtime + bonus + leaveEncashment + otherReceipts;

  // LOP Deduction
  const dailyRate = baseSalary / calculationBasisDays;
  const lopDeduction = Math.round(dailyRate * lopDays);

  // Deductions
  const loanDeduction = Number(options.loanDeduction) || 0;
  const otherDeduction = Number(options.otherDeduction) || 0;
  const whtDeduction = Number(options.whtDeduction) || 0;

  const totalDeductions = lopDeduction + loanDeduction + otherDeduction + whtDeduction;
  const netTakeHome = Math.max(0, grossSalary - totalDeductions);
  const amountInWords = numberToWords(netTakeHome);

  return {
    payrollMonth: monthStr,
    employeeId: employee._id,
    employeeCode: employee.employeeCode,
    employeeName: employee.name,
    designation: employee.designation,
    locationName: employee.department || employee.staffLocation || 'IT Office',
    department: employee.department || 'IT Office',

    // Attendance
    totalWorkingDays: calculationBasisDays,
    presentDays,
    lateDays,
    totalLateMinutes,
    leaveDays,
    allowedLeaves,
    lopDays,
    totalSalaryDays,

    // Earnings
    baseSalary,
    fuelAllowance: fuel,
    foodAllowance: food,
    mobileAllowance: mobile,
    transportAllowance: transport,
    performanceAllowance: perf,
    otherAllowances: otherAllow,
    overtimeAmount: overtime,
    bonusAmount: bonus,
    leaveEncashmentAmount: leaveEncashment,
    otherReceiptsAmount: otherReceipts,
    grossSalary,

    // Deductions
    lopDeduction,
    loanDeduction,
    remainingLoanBalance: Math.max(0, (employee.loanBalance || 0) - loanDeduction),
    otherDeduction,
    whtDeduction,
    totalDeductions,

    // Final
    netTakeHome,
    amountInWords,

    // Bank
    accountTitle: employee.accountTitle || employee.name,
    ibanNumber: employee.ibanNumber || '',
    bankName: employee.bankName || 'Cash / Bank',
    paymentMethod: employee.paymentMethod || 'BANK_TRANSFER',
  };
};
