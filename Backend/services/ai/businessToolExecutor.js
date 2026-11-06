import Employee from '../../models/Employee.js';
import Payroll from '../../models/Payroll.js';
import StaffLoan from '../../models/StaffLoan.js';
import RentalAgreement from '../../models/RentalAgreement.js';
import { round2 } from '../ledgerService.js';
import { resolveEntity, directoryRows } from './businessDirectory.js';
import { accountLedger, salaryLedger, loanLedger, expenseLedger, tenantLedger, incomeLedger, propertyLedger } from './businessLedgers.js';
import { employeeProfile, payrollHistory, attendanceReport, leaveReport, transactionSearch, voucherDetails, transactionDetails, propertyDetails, verificationRecords, duplicateTransactions } from './businessRecords.js';
import { universalSearch } from './businessSearch.js';
import { authorize, buildReport, column, money, day, idOf, periodFor, dateMatch, readAll } from './businessCommon.js';
import { AiError } from './assistantSecurity.js';

async function salarySummary(args,user) {
  if(!args.employeeId&&!args.employeeName)return undefined;
  const found=await resolveEntity('employee',{id:args.employeeId,name:args.employeeName},user);if(!found.record)return found;
  const employee=found.record,period=periodFor(args);
  if(!period.year)throw new AiError('Use payroll history for multi-month salary records. A salary snapshot requires one payroll month.');
  const month=`${period.year}-${String(period.month).padStart(2,'0')}`;
  const [payroll,latestLoan]=await Promise.all([Payroll.findOne({employeeId:employee._id,payrollMonth:month}).maxTimeMS(10000).lean(),StaffLoan.findOne({employeeId:employee._id}).sort({date:-1,createdAt:-1}).maxTimeMS(10000).lean()]);
  const profile=new Employee(employee), result={period:month,employeeName:employee.name,designation:employee.designation,department:employee.department,employmentStatus:employee.employmentStatus,basicSalary:round2(employee.basicSalary||0),allowance:round2(employee.allowance||0),configuredGrossSalary:round2(profile.grossSalary),grossSalary:round2(payroll?.grossSalary??profile.grossSalary),netPayable:payroll?round2(payroll.netPayable):null,payrollStatus:payroll?.paymentStatus||payroll?.status||'NO_PAYROLL_GENERATED',totalDeductions:payroll?round2(payroll.totalDeduction||0):null,currentLoanBalance:round2(latestLoan?.newBalance??employee.loanBalance??0)};
  return {...result,report:buildReport({title:`Individual salary — ${employee.name}`,entity:{type:'employee',id:idOf(employee),name:employee.name},period,summary:result,rows:[],columns:[],basis:'Configured salary uses the production Employee.grossSalary virtual. Monthly gross/net/deductions are the stored payroll values; absent payroll is labeled and net payable is not guessed.'}),resolved:{employeeId:idOf(employee)}};
}
async function allLoans(args,user) {
  const period=periodFor(args), employees=await directoryRows('employee',user), byId=new Map(employees.map(row=>[idOf(row),row]));
  const entries=await readAll(StaffLoan,{date:dateMatch(period)},'_id employeeId date type amount previousBalance newBalance payrollMonth description',{date:1,_id:1});
  const rows=entries.map(row=>({id:idOf(row),date:day(row.date),employee:byId.get(idOf(row.employeeId))?.name||null,type:row.type,debit:row.type==='DISBURSEMENT'?round2(row.amount):0,credit:row.type==='REPAYMENT'?round2(row.amount):0,employeeBalanceAfter:row.newBalance,payrollMonth:row.payrollMonth||null}));
  return {report:buildReport({title:'All employee loan records',period,rows,columns:[column('date','Date'),column('employee','Employee'),column('type','Type'),money('debit','Disbursed'),money('credit','Recovered'),money('employeeBalanceAfter','Employee balance after entry'),column('payrollMonth','Payroll period')],summary:{recordedDisbursements:round2(rows.reduce((n,row)=>n+row.debit,0)),recordedRecoveries:round2(rows.reduce((n,row)=>n+row.credit,0)),currentEmployeeLoanSnapshots:round2(employees.reduce((n,row)=>n+Number(row.loanBalance||0),0))},page:args.page,pageSize:args.pageSize,basis:'Each row retains its own employee loan balance. Current employee snapshots are labeled separately from period loan movements; unrelated employee balances are not combined into one fictitious running ledger.'})};
}
async function financialLedger(args,user) {
  authorize(user);const selectors={ACCOUNT:['accountId','accountName'],SALARY:['employeeId','employeeName'],LOAN:['employeeId','employeeName'],PROPERTY:['propertyId','propertyName','unitId'],EXPENSE:['propertyId','propertyName','unitId','categoryId','categoryName'],INCOME:['incomeHeadId','incomeHeadName'],TENANT:['tenantId','tenantName']};
  for(const key of Object.values(selectors).flat())if(args[key]!==undefined&&!selectors[args.kind]?.includes(key))throw new AiError(`The ${key} filter does not apply to a ${args.kind} ledger.`);
  const directions={ACCOUNT:['ALL','WITHDRAWALS','DEPOSITS'],SALARY:['ALL','SALARY_ACCRUAL','SALARY_DISBURSAL'],LOAN:['ALL','DISBURSEMENT','REPAYMENT'],PROPERTY:['ALL','INCOME','EXPENSE','TRANSFER','ADJUSTMENT'],EXPENSE:['ALL'],INCOME:['ALL'],TENANT:['ALL','RENT_DUE','RENT_RECEIVED']};
  if(args.direction&&!directions[args.kind]?.includes(args.direction))throw new AiError('That transaction-direction filter is not valid for this ledger type.');
  if(args.kind==='LOAN'&&!args.employeeId&&!args.employeeName)return allLoans(args,user);
  const handler={ACCOUNT:accountLedger,SALARY:salaryLedger,LOAN:loanLedger,PROPERTY:propertyLedger,EXPENSE:expenseLedger,INCOME:incomeLedger,TENANT:tenantLedger}[args.kind];
  if(!handler)throw new AiError('Unsupported ledger kind.');return handler(args,user);
}
async function tenantDetails(args,user) {
  const found=await resolveEntity('tenant',{id:args.tenantId,name:args.tenantName},user);if(!found.record)return found;
  const tenant=found.record,records=await readAll(RentalAgreement,{tenantId:tenant._id},'_id agreementNumber propertyId unitId startDate endDate monthlyRent securityDeposit status dueDay',{startDate:1,_id:1},[['propertyId','plazaName propertyName units.unitName units.unitNumber']]);
  const rows=records.map(row=>({agreement:row.agreementNumber,property:row.propertyId?.plazaName||row.propertyId?.propertyName,unit:row.propertyId?.units?.find(unit=>idOf(unit)===idOf(row.unitId))?.unitName||null,startDate:day(row.startDate),endDate:day(row.endDate),monthlyRent:row.monthlyRent,securityDeposit:row.securityDeposit,status:row.status,dueDay:row.dueDay}));
  return {report:buildReport({title:`Tenant details — ${tenant.fullName}`,entity:{type:'tenant',id:idOf(tenant),name:tenant.fullName},rows,columns:[column('agreement','Agreement'),column('property','Property'),column('unit','Unit'),column('startDate','Start'),column('endDate','End'),money('monthlyRent','Monthly rent'),money('securityDeposit','Security deposit'),column('status','Status')],summary:{tenantName:tenant.fullName,companyName:tenant.companyName,status:tenant.status,agreements:rows.length},page:args.page,pageSize:args.pageSize,basis:'Recorded tenant business identity and rental agreements. Contact/identity numbers are not included.'}),resolved:{tenantId:idOf(tenant)}};
}
async function employeeHistory(args,user) {
  authorize(user);const profile=await employeeProfile(args,user);if(!profile.resolved)return profile;
  const employeeId=profile.resolved.employeeId;
  const scoped={...args,employeeId};delete scoped.employeeName;
  const children=[{name:'getEmployeeProfile',args:{employeeId},result:profile}];
  for(const [name,handler] of [['getEmployeeLedger',salaryLedger],['getEmployeeLoanSummary',loanLedger],['getAttendanceReport',attendanceReport],['searchTransactions',transactionSearch]]){
    const childArgs={...scoped};if(name==='getAttendanceReport')childArgs.view='SUMMARY';
    children.push({name,args:childArgs,result:await handler(childArgs,user)});
  }
  return {children,resolved:{employeeId}};
}
export const BUSINESS_HANDLERS={getAccountLedger:accountLedger,getEmployeeLedger:salaryLedger,getEmployeeLoanSummary:loanLedger,getExpenseSummary:expenseLedger,getSalarySummary:salarySummary,searchBusinessData:universalSearch,getEmployeeProfile:employeeProfile,getEmployeeFinancialHistory:employeeHistory,getPayrollHistory:payrollHistory,getAttendanceReport:attendanceReport,getLeaveRecords:leaveReport,getFinancialLedger:financialLedger,searchTransactions:transactionSearch,getVoucherDetails:voucherDetails,getTransactionDetails:transactionDetails,getPropertyDetails:propertyDetails,getTenantDetails:tenantDetails,getVerificationRecords:verificationRecords,findDuplicateTransactions:duplicateTransactions};
export async function prepareLegacyArguments(name,args,user) {
  const prepared={...args};
  for(const [type,key] of [['property','property'],['account','account'],['category','category'],['tenant','tenant']]){
    if(!prepared[key+'Name'])continue;
    const found=await resolveEntity(type,{name:prepared[key+'Name'],id:prepared[key+'Id']},user);
    if(!found.record)return {...found,...(type==='property'?{availableProperties:found.matches.map(row=>row.name)}:{})};
    prepared[key+'Id']=idOf(found.record);delete prepared[key+'Name'];
  }
  return {args:prepared};
}
