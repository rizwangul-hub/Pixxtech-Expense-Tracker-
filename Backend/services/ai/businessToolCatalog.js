import { AiError } from './assistantSecurity.js';
import { periodFor, dateOnly } from './businessCommon.js';
const string=(description,extra={})=>({type:'STRING',description,maxLength:120,...extra});
const integer=(description,min,max)=>({type:'INTEGER',description,minimum:min,maximum:max});
const number=description=>({type:'NUMBER',description,minimum:0,maximum:1000000000000});
export const PAGE={page:integer('Page number, starting at 1.',1,100000),pageSize:integer('Rows per page. All-scope totals are independent of this page.',1,100)};
export const DATES={month:integer('Pakistan calendar month 1-12.',1,12),year:integer('Pakistan calendar year.',2000,2100),startDate:string('Inclusive Pakistan date YYYY-MM-DD.'),endDate:string('Inclusive Pakistan date YYYY-MM-DD.'),allTime:{type:'BOOLEAN',description:'Explicitly request complete recorded history; do not combine with month/date fields.'}};
export const EMPLOYEE={employeeId:string('Recorded Employee ObjectId.'),employeeName:string('Exact, partial or misspelled employee name; ambiguity must be clarified.')};
export const PROPERTY={propertyId:string('Recorded Property ObjectId.'),propertyName:string('Property/plaza name.'),unitId:string('Embedded unit ObjectId, belonging to the selected property.')};
export const ACCOUNT={accountId:string('Recorded Account ObjectId.'),accountName:string('Full/partial bank name, account holder or cash custodian. Never replace this with all account balances.')};
export const CATEGORY={categoryId:string('Recorded Category ObjectId.'),categoryName:string('Exact expense category/main head. Category children are included through existing expense rules.')};
export const TENANT={tenantId:string('Recorded Tenant ObjectId.'),tenantName:string('Recorded tenant/company name.')};
export const DIRECTION={direction:string('Account: ALL/WITHDRAWALS/DEPOSITS; salary: SALARY_ACCRUAL/SALARY_DISBURSAL; loans: DISBURSEMENT/REPAYMENT; tenants: RENT_DUE/RENT_RECEIVED; property: INCOME/EXPENSE/TRANSFER/ADJUSTMENT.',{enum:['ALL','WITHDRAWALS','DEPOSITS','SALARY_ACCRUAL','SALARY_DISBURSAL','DISBURSEMENT','REPAYMENT','RENT_DUE','RENT_RECEIVED','INCOME','EXPENSE','TRANSFER','ADJUSTMENT']})};
const tool=(name,description,properties,required=[])=>({name,description,parameters:{type:'OBJECT',properties,...(required.length?{required}:{})}});
export const BUSINESS_TOOL_DECLARATIONS=[
  tool('searchBusinessData','Universal search over registered employees/accounts/properties/embedded units/tenants/heads and actual transaction, voucher, payroll, loan and attendance records. Use entityType to browse or paginate one record family.',{query:string('Name, voucher reference, transaction ID or text to search.'),entityType:string('Record type.',{enum:['ALL','employee','account','property','unit','tenant','category','incomeHead','transaction','voucher','payroll','loan','attendance']}),...DATES,...PAGE}),
  tool('getEmployeeProfile','Complete safe employment profile: actual designation/status/joining date, salary components and production configured gross salary. No invented payroll payments or private identifiers.',{...EMPLOYEE}),
  tool('getEmployeeFinancialHistory','Detailed employee profile plus separate verified salary, loan, linked-payment and recorded attendance reports. Each report is independently paginated.',{...EMPLOYEE,...DATES,...PAGE}),
  tool('getPayrollHistory','Stored individual or all-employee payroll history and salary comparison. Use this for last six months or all pending payroll; never use a global summary for a named employee.',{...EMPLOYEE,...DATES,...PAGE}),
  tool('getAttendanceReport','Recorded employee/all-employee attendance, absences, leave, late arrivals and half-days; SUMMARY compares employees. Missing days are not assumed absent. No clock-out/early-departure/working-hours fields exist.',{...EMPLOYEE,...DATES,...PAGE,status:string('Optional recorded status.',{enum:['PRESENT','LATE','ABSENT','HALF_DAY','LEAVE','NOT_JOINED']}),view:string('DETAIL rows or SUMMARY by employee.',{enum:['DETAIL','SUMMARY']})}),
  tool('getLeaveRecords','Recorded employee leave intervals and approval status overlapping the period.',{...EMPLOYEE,...DATES,...PAGE}),
  tool('getFinancialLedger','Complete, paged meaningful business ledger. ACCOUNT = specific bank/cash account; SALARY = individual accrued/payments ledger; LOAN = employee or all staff loan records; PROPERTY = posted property/unit cash flow; EXPENSE = production classified expense ledger; INCOME = posted other-income heads; TENANT = recorded rent charges/receipts. Reuse entity from context on follow-ups.',{kind:string('Ledger kind.',{enum:['ACCOUNT','SALARY','LOAN','PROPERTY','EXPENSE','INCOME','TENANT']}),...EMPLOYEE,...ACCOUNT,...PROPERTY,...CATEGORY,...TENANT,incomeHeadId:string('OtherIncomeHead ObjectId.'),incomeHeadName:string('Registered non-rental income head.'),...DATES,...DIRECTION,...PAGE},['kind']),
  tool('searchTransactions','All matching actual journal entries, with pagination, amounts, vouchers, dates, accounts, property/unit, creator/verification and document metadata. Employee filters use recorded payroll links. Narration search is not proof of an employee relationship.',{...EMPLOYEE,...ACCOUNT,...PROPERTY,...CATEGORY,...DATES,...PAGE,query:string('Literal narration/reference text.'),voucherNo:string('Exact voucher number.'),transactionType:string('Journal type.',{enum:['EXPENSE','INCOME','TRANSFER','OPENING_BALANCE','ADJUSTMENT']}),minAmount:number('Minimum PKR amount.'),maxAmount:number('Maximum PKR amount.')}),
  tool('getVoucherDetails','Exact voucher header and its linked transaction rows, dates, accounts, status, creator, checker and recorded document names. Explicit lookup retains VOID/REVERSED/DRAFT labels.',{voucherId:string('Voucher ObjectId.'),voucherNo:string('Exact voucher number, not a guessed reference.'),...PAGE}),
  tool('getTransactionDetails','Inspect one exact journal transaction ID with voucher/narration, status, accounts, creator, verification and document metadata.',{transactionId:string('Actual Transaction ObjectId.')},['transactionId']),
  tool('getPropertyDetails','Property address/type/status and all registered embedded units, vacancy, tenants and agreements. Purchase price and valuations are not recorded.',{...PROPERTY,...PAGE,unitStatus:string('Optional unit status.',{enum:['OCCUPIED','VACANT','MAINTENANCE','INACTIVE']})}),
  tool('getTenantDetails','Safe tenant business profile, agreements and linked registered property/units; private CNIC/phone/bank identifiers are omitted.',{...TENANT,...PAGE}),
  tool('getVerificationRecords','Read verification staging metadata. Non-verifiers see only their own submitted entries. Staging is never added to financial totals.',{...DATES,...PAGE,status:string('Staging status.',{enum:['PENDING_VERIFICATION','VERIFIED','REJECTED','EDITED']})}),
  tool('findDuplicateTransactions','Find potential duplicate candidates sharing date, amount, debit/credit accounts, category and narration. These are candidates, never confirmed fraud; nothing is changed.',{...DATES,...PAGE}),
];

export const LEGACY_EXTENSION={
  getAccountLedger:{...DATES,...PAGE,...DIRECTION,limit:integer('Legacy display-row limit; prefer pageSize.',1,25)},getEmployeeLedger:{...DATES,...PAGE,...DIRECTION},getEmployeeLoanSummary:{...DATES,...PAGE,...DIRECTION},
  getSalarySummary:{...PAGE},getExpenseSummary:{categoryId:CATEGORY.categoryId,...DATES,...PAGE},getRecentTransactions:{accountId:ACCOUNT.accountId},getAccountBalances:{accountId:ACCOUNT.accountId},getTenantRentSummary:{tenantId:TENANT.tenantId},
};
export function validateBusinessArguments(declaration,args) {
  if(!declaration||!args||typeof args!=='object'||Array.isArray(args))throw new AiError('Unsupported read-only financial tool.');
  const properties=declaration.parameters.properties;
  for(const required of declaration.parameters.required??[])if(args[required]===undefined)throw new AiError(`Missing required ${required} filter.`);
  for(const [key,value] of Object.entries(args)){
    const spec=properties[key];if(!spec)throw new AiError('Unsupported financial filter.');
    const type=spec.type.toUpperCase();
    if(type==='STRING'&&(typeof value!=='string'||!value.trim()||value.length>(spec.maxLength??120)))throw new AiError(`Invalid ${key} filter.`);
    if(type==='INTEGER'&&!Number.isInteger(value)||type==='NUMBER'&&(!Number.isFinite(value)||typeof value!=='number')||type==='BOOLEAN'&&typeof value!=='boolean')throw new AiError(`Invalid ${key} filter type.`);
    if((spec.minimum!==undefined&&value<spec.minimum)||(spec.maximum!==undefined&&value>spec.maximum))throw new AiError(`The ${key} filter is out of range.`);
    if(spec.enum&&!spec.enum.includes(value))throw new AiError(`Invalid ${key} filter value.`);
    if(/Id$/.test(key)&&!/^[a-f0-9]{24}$/i.test(value))throw new AiError('Invalid business record identifier.');
    if(['startDate','endDate'].includes(key))dateOnly(value);
  }
  if(args.minAmount!==undefined&&args.maxAmount!==undefined&&args.minAmount>args.maxAmount)throw new AiError('Minimum amount must not exceed maximum amount.');
  if(Object.keys(args).some(key=>Object.hasOwn(DATES,key)))periodFor(args);
  const directions={getAccountLedger:['ALL','WITHDRAWALS','DEPOSITS'],getEmployeeLedger:['ALL','SALARY_ACCRUAL','SALARY_DISBURSAL'],getEmployeeLoanSummary:['ALL','DISBURSEMENT','REPAYMENT']};
  if(directions[declaration.name]&&args.direction&&!directions[declaration.name].includes(args.direction))throw new AiError('That direction does not apply to this ledger type.');
  if(declaration.name==='getVoucherDetails'&&!args.voucherId&&!args.voucherNo)throw new AiError('Specify the exact voucher ID or voucher number.');
  return args;
}
