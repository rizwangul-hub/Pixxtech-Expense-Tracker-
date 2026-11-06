import Employee from '../../models/Employee.js';
import StaffLoan from '../../models/StaffLoan.js';
import RentDue from '../../models/RentDue.js';
import RentReceived from '../../models/RentReceived.js';
import OtherIncome from '../../models/OtherIncome.js';
import { round2, getAccountRunningLedger, getHeadWiseExpenseReport } from '../ledgerService.js';
import { getLiquidityStatementAmounts } from '../ledgerPresentation.js';
import { resolveEntity } from './businessDirectory.js';
import { authorize, buildReport, column, money, day, idOf, inPeriod, periodFor, readAll, MAX_RECORDS, text } from './businessCommon.js';
import { AiError } from './assistantSecurity.js';

export const LEDGER_COLUMNS = [column('date','Date'),column('voucherNo','Voucher / reference'),column('description','Description'),money('debit','Debit'),money('credit','Credit'),money('runningBalance','Running balance')];
const defaultHistory = args => ['month','year','startDate','endDate','allTime'].some(key=>args[key]!==undefined)?periodFor(args):periodFor({allTime:true});
const entity = (type, row, name) => ({type,id:idOf(row),name:text(name??row.name)});
function selectedRows(rows, direction='ALL') {return rows.filter(row=>direction==='ALL'||row.type===direction);}
const sum = (rows,key) => round2(rows.reduce((total,row)=>total+Number(row[key]||0),0));

export async function accountLedger(args,user) {
  authorize(user);const found=await resolveEntity('account',{id:args.accountId,name:args.accountName},user);if(!found.record)return found;
  const account=found.record, period=periodFor(args);
  const ledger=await getAccountRunningLedger(account._id,period.start,period.end,{preserveEndInstant:true,maxRows:MAX_RECORDS,maxTimeMS:10000});
  const all=ledger.entries.map(entry=>{const amounts=account.type==='SUSPENSE'?{debit:entry.drAmount,credit:entry.crAmount}:getLiquidityStatementAmounts(entry,account.name);return {id:idOf(entry),date:day(entry.date),voucherNo:text(entry.voucherNo),description:text(entry.detail),head:text(entry.category),property:text(entry.property),counterparty:text(entry.counterpartyAccount),type:entry.crAmount>0?'WITHDRAWALS':'DEPOSITS',debit:round2(amounts.debit),credit:round2(amounts.credit),runningBalance:round2(entry.runningBalance),status:entry.status};});
  const rows=selectedRows(all,args.direction);
  const report=buildReport({title:`${account.type==='CASH'?'Cash-hand':'Account'} ledger — ${account.name}`,entity:entity('account',account),period,rows,columns:[...LEDGER_COLUMNS,column('head','Head'),column('counterparty','Counterparty')],summary:{openingBalance:round2(ledger.previousBalance),totalDebit:account.type==='SUSPENSE'?ledger.totalDebits:ledger.totalCredits,totalCredit:account.type==='SUSPENSE'?ledger.totalCredits:ledger.totalDebits,closingBalance:round2(ledger.closingBalance),periodEntries:all.length,matchingEntries:rows.length},page:args.page,pageSize:args.pageSize??args.limit,basis:account.type==='SUSPENSE'?'Production suspense ledger: debit increases and credit decreases the balance.':'Production account running ledger and bank/cash statement convention: debit is money out, credit is money in; balance = opening + credit − debit.',warnings:args.direction&&args.direction!=='ALL'?['Running balances include all account movements, including rows hidden by the direction filter.']:[]});
  return {accountName:account.name,accountType:account.type,period:period.label,openingBalance:ledger.previousBalance,closingBalance:ledger.closingBalance,totalDebits:ledger.totalDebits,totalCredits:ledger.totalCredits,totalTransactions:all.length,recentEntries:report.rows.map(row=>({...row,description:row.description,debit:account.type==='SUSPENSE'?row.debit:row.credit,credit:account.type==='SUSPENSE'?row.credit:row.debit})),report,resolved:{accountId:idOf(account)}};
}

export async function salaryLedger(args,user) {
  authorize(user);const found=await resolveEntity('employee',{id:args.employeeId,name:args.employeeName},user);if(!found.record)return found;
  const employee=found.record;
  const {getEmployeeLedger}=await import('../../controllers/payrollController.js');
  let data,status=200;await getEmployeeLedger({params:{employeeId:idOf(employee)}},{status(code){status=code;return this;},json(body){data=body;return body;}});
  if(status>=400||!data?.success)throw new AiError('The production salary ledger could not be retrieved.',502);
  const source=data.data;
  if(source.ledger.length>MAX_RECORDS)throw new AiError('Salary history exceeds the bounded report limit.',413);
  const period=defaultHistory(args);
  const displayDate=entry=>entry.type==='SALARY_ACCRUAL'?new Date(Date.UTC(Number(entry.salaryForMonth.slice(0,4)),Number(entry.salaryForMonth.slice(5)),0)).toISOString().slice(0,10):day(entry.date);
  // The production controller orders by UTC instants. Reorder the presentation
  // by the displayed Pakistan calendar date so an accrual on month-end is not
  // shown after a payment that falls on the next Pakistan business day.
  const ordered=source.ledger.map(entry=>({entry,date:displayDate(entry)})).sort((left,right)=>{
    if(!left.date&&right.date)return 1;if(left.date&&!right.date)return -1;if(!left.date&&!right.date)return 0;
    const dateDiff=left.date.localeCompare(right.date);if(dateDiff)return dateDiff;
    if(left.entry.type==='SALARY_ACCRUAL'&&right.entry.type==='SALARY_DISBURSAL')return -1;
    if(left.entry.type==='SALARY_DISBURSAL'&&right.entry.type==='SALARY_ACCRUAL')return 1;
    return 0;
  });
  let runningPendingBalance=0;
  const enriched=ordered.map(({entry,date})=>({entry,date,runningBalance:runningPendingBalance=Math.max(0,round2(runningPendingBalance+Number(entry.accruedAmount||0)-Number(entry.paidAmount||0)))}));
  const eligible=enriched.filter(({date})=>date?(!period.startDay||date>=period.startDay)&&(!period.endDay||date<=period.endDay):!period.startDay);
  const before=enriched.filter(({date})=>date&&period.startDay&&date<period.startDay);
  const all=eligible.map(({entry,date,runningBalance})=>({date,salaryMonth:entry.salaryForMonth??entry.month,voucherNo:entry.type==='SALARY_ACCRUAL'?null:text(entry.voucherNo),description:text(entry.detail),type:entry.type,debit:round2(entry.accruedAmount||0),credit:round2(entry.paidAmount||0),runningBalance,status:entry.status,paymentDateNeedsCorrection:entry.requiresPaymentDateCorrection===true}));
  const rows=selectedRows(all,args.direction);
  const report=buildReport({title:`Salary ledger — ${employee.name}`,entity:entity('employee',employee),period,rows,columns:[...LEDGER_COLUMNS,column('salaryMonth','Salary period'),column('type','Entry type')],summary:{openingBalance:before.at(-1)?.runningPendingBalance??0,totalDebit:sum(all,'debit'),totalCredit:sum(all,'credit'),closingBalance:all.at(-1)?.runningBalance??before.at(-1)?.runningPendingBalance??0,lifetimeAccrued:source.summary.totalAccrued,lifetimePaid:source.summary.totalPaid,currentPendingSalary:source.summary.pendingBalance},page:args.page,pageSize:args.pageSize,basis:'Existing production employee ledger: monthly accruals, partial/legacy installments, payment-date corrections and nonnegative pending salary. Accrual display dates identify the salary month end; payment dates use Pakistan time. Accrual references are not presented as posted vouchers.',warnings:[...(source.summary.paymentDatesRequiringCorrection?['Some historical payments have no recorded payment date; they are not assigned an invented date.']:[]),...(args.direction&&args.direction!=='ALL'?['Balances include all salary entries, including hidden entry types.']:[])]});
  return {employee:{name:employee.name,designation:employee.designation,department:employee.department},summary:source.summary,ledger:report.rows.map(row=>({...row,accruedAmount:row.debit,paidAmount:row.credit,runningPendingBalance:row.runningBalance})),report,resolved:{employeeId:idOf(employee)}};
}

export async function loanLedger(args,user) {
  authorize(user);const found=await resolveEntity('employee',{id:args.employeeId,name:args.employeeName},user);if(!found.record)return found;
  const employee=found.record, period=defaultHistory(args);
  const history=await readAll(StaffLoan,{employeeId:employee._id},'_id date type amount previousBalance newBalance payrollMonth description',{date:1,createdAt:1,_id:1});
  const before=history.filter(row=>period.start&&new Date(row.date)<period.start), inRange=history.filter(row=>inPeriod(row.date,period));
  const opening=before.at(-1)?.newBalance??history[0]?.previousBalance??null;
  const rows=inRange.map(row=>({id:idOf(row),date:day(row.date),voucherNo:null,description:text(row.description),type:row.type,debit:row.type==='DISBURSEMENT'?round2(row.amount):0,credit:row.type==='REPAYMENT'?round2(row.amount):0,runningBalance:round2(row.newBalance),payrollMonth:row.payrollMonth||null}));
  const current=history.at(-1)?.newBalance??employee.loanBalance??0, warnings=[];
  if(Number(current)!==Number(employee.loanBalance??current))warnings.push('The latest loan entry and employee balance snapshot differ. Both recorded balances are shown for reconciliation.');
  if(!history.length)warnings.push('No loan history is recorded; a historical opening balance cannot be reconstructed from the current employee snapshot.');
  const filtered=selectedRows(rows,args.direction);
  const report=buildReport({title:`Employee loan ledger — ${employee.name}`,entity:entity('employee',employee),period,rows:filtered,columns:[...LEDGER_COLUMNS,column('type','Loan entry'),column('payrollMonth','Payroll period')],summary:{openingBalance:opening,totalDebit:sum(rows,'debit'),totalCredit:sum(rows,'credit'),closingBalance:rows.at(-1)?.runningBalance??opening,currentRecordedLoanBalance:round2(current),employeeBalanceSnapshot:round2(employee.loanBalance??current)},page:args.page,pageSize:args.pageSize,basis:'Recorded StaffLoan disbursements (debit), repayments (credit), previous/new balances. StaffLoan has no transaction/voucher reference; no reference has been invented.',warnings});
  return {employeeName:employee.name,currentLoanBalance:round2(current),totalDisbursed:sum(history.filter(row=>row.type==='DISBURSEMENT'),'amount'),totalRepaid:sum(history.filter(row=>row.type==='REPAYMENT'),'amount'),recordsCount:history.length,loanHistory:report.rows,report,resolved:{employeeId:idOf(employee)}};
}

export async function expenseLedger(args,user) {
  authorize(user);const period=periodFor(args);let property,category;
  if(args.propertyId||args.propertyName){const found=await resolveEntity('property',{id:args.propertyId,name:args.propertyName},user);if(!found.record)return found;property=found.record;}
  if(args.categoryId||args.categoryName){const found=await resolveEntity('category',{id:args.categoryId,name:args.categoryName},user);if(!found.record)return found;category=found.record;if(category.type!=='EXPENSE')throw new AiError('Select an expense category for an expense ledger.');}
  // The production head-wise service is month-oriented, but its date filters
  // can safely cover an all-time request. Use a valid anchor month only to
  // satisfy that helper; the explicit 1900-through-now range is authoritative.
  const fallback=period.year?period:periodFor({month:1,year:2000});
  const source=await getHeadWiseExpenseReport(fallback.year,fallback.month,{...(property?{propertyId:idOf(property)}:{}),...(category?{categoryId:idOf(category)}:{}),...(period.start?{startDate:period.start}:args.allTime?{startDate:new Date('1900-01-01T00:00:00+05:00')} :{}),endDate:period.end});
  const entries=source.heads.flatMap(head=>head.transactions.map(row=>({...row,head:head.headName}))).sort((a,b)=>new Date(a.date)-new Date(b.date)||idOf(a).localeCompare(idOf(b)));
  if(entries.length>MAX_RECORDS)throw new AiError('Expense ledger exceeds the bounded report limit. Narrow the dates.',413);
  const filtered=entries.filter(row=>!args.unitId||idOf(row.unitId)===args.unitId);let running=0;
  const rows=filtered.map(row=>({id:idOf(row),date:day(row.date),voucherNo:text(row.voucherNo),description:text(row.detail),head:text(row.head),property:text(row.property),unit:text(row.unit),paidFromAccount:text(row.paidFromAccount),debit:round2(row.amount),credit:0,runningBalance:running=round2(running+row.amount)}));
  return {period:period.year?`${period.year}-${String(period.month).padStart(2,'0')}`:period.label,totalExpenses:running,transactionCount:rows.length,classification:source.classificationTotals,topExpenseHeads:source.mainHeads.map(head=>({head:head.mainHeadName,amount:head.totalSpent})),report:buildReport({title:`Expense ledger${category?' — '+category.name:''}${property?' — '+(property.plazaName||property.propertyName):''}`,entity:category?entity('category',category):property?entity('property',property,property.plazaName||property.propertyName):null,period,rows,columns:[...LEDGER_COLUMNS,column('head','Expense head'),column('property','Property'),column('paidFromAccount','Paid from')],summary:{openingBalance:0,totalDebit:sum(rows,'debit'),totalCredit:0,closingBalance:running,totalExpenses:running,transactionCount:rows.length},page:args.page,pageSize:args.pageSize,basis:'Production classified expense report: excludes rent/income/transfers/opening balances/owner personal and reversed/void entries. This is period expense accumulation starting at zero, not a cash-account balance.'}),resolved:{...(property?{propertyId:idOf(property)}:{}),...(category?{categoryId:idOf(category)}:{})}};
}

export async function tenantLedger(args,user) {
  authorize(user);const found=await resolveEntity('tenant',{id:args.tenantId,name:args.tenantName},user);if(!found.record)return found;
  const tenant=found.record, period=periodFor(args);
  const [dues,receipts]=await Promise.all([readAll(RentDue,{tenantId:tenant._id,status:{$nin:['CANCELLED','VOID','REVERSED']},dueDate:{$lte:period.end}},'_id dueDate rentMonth expectedRentAmount status propertyId unitId'),readAll(RentReceived,{tenantId:tenant._id,status:{$nin:['REVERSED','VOID']},receiptDate:{$lte:period.end}},'_id receiptDate receiptNumber rentMonth amount description status transactionId propertyId unitId')]);
  const combined=[...dues.map(row=>({id:idOf(row),rawDate:row.dueDate,date:day(row.dueDate),voucherNo:null,description:`Recorded rent charge — ${row.rentMonth}`,type:'RENT_DUE',debit:round2(row.expectedRentAmount),credit:0,rentMonth:row.rentMonth,status:row.status})),...receipts.map(row=>({id:idOf(row),rawDate:row.receiptDate,date:day(row.receiptDate),voucherNo:text(row.receiptNumber),description:text(row.description),type:'RENT_RECEIVED',debit:0,credit:round2(row.amount),rentMonth:row.rentMonth,status:row.status}))].sort((a,b)=>new Date(a.rawDate)-new Date(b.rawDate)||a.id.localeCompare(b.id));
  let balance=0,opening=0;const rows=[];
  for(const row of combined){balance=round2(balance+row.debit-row.credit);if(period.start&&new Date(row.rawDate)<period.start)opening=balance;else{const {rawDate,...display}=row;rows.push({...display,runningBalance:balance});}}
  return {report:buildReport({title:`Tenant invoice and receipt ledger — ${tenant.fullName}`,entity:entity('tenant',tenant,tenant.fullName),period,rows:selectedRows(rows,args.direction),columns:[...LEDGER_COLUMNS,column('rentMonth','Rent allocation'),column('type','Entry type')],summary:{openingBalance:opening,totalDebit:sum(rows,'debit'),totalCredit:sum(rows,'credit'),closingBalance:balance},page:args.page,pageSize:args.pageSize,basis:'Recorded RentDue charges (debit) and non-reversed RentReceived receipts (credit). Receipt numbers are labeled as references, not invented journal vouchers. This invoice/receipt receivable is distinct from the active-agreement allocation/carry-forward report; unrecorded pre-system arrears cannot be reconstructed.'}),resolved:{tenantId:idOf(tenant)}};
}

export async function incomeLedger(args,user) {
  authorize(user);const period=periodFor(args);let head;
  if(args.incomeHeadId||args.incomeHeadName){const found=await resolveEntity('incomeHead',{id:args.incomeHeadId,name:args.incomeHeadName},user);if(!found.record)return found;head=found.record;}
  const entries=await readAll(OtherIncome,{status:'POSTED',...(head?{incomeHeadId:head._id}:{}),receiptDate:{...(period.start?{$gte:period.start}:{}),$lte:period.end}},'_id receiptNumber receiptDate headName incomeHeadId amount receivedFrom transactionDetail description voucherNo referenceNumber propertyId',{receiptDate:1,_id:1});
  let running=0;const rows=entries.map(row=>({id:idOf(row),date:day(row.receiptDate),voucherNo:text(row.voucherNo||row.receiptNumber),description:text(row.transactionDetail||row.description),head:text(row.headName||head?.name),receivedFrom:text(row.receivedFrom),debit:0,credit:round2(row.amount),runningBalance:running=round2(running+row.amount)}));
  return {report:buildReport({title:`Other income ledger${head?' — '+head.name:''}`,entity:head?entity('incomeHead',head):null,period,rows,columns:[...LEDGER_COLUMNS,column('head','Income head'),column('receivedFrom','Received from')],summary:{openingBalance:0,totalDebit:0,totalCredit:running,closingBalance:running},page:args.page,pageSize:args.pageSize,basis:'Posted OtherIncome source receipts only; excludes DRAFT/VOID/REVERSED. Period income accumulation starts at zero. Linked journal entries are not added a second time; rental income is reported through the separate rent tools.'}),resolved:head?{incomeHeadId:idOf(head)}:{}};
}

export async function propertyLedger(args,user) {
  authorize(user);const found=await resolveEntity('property',{id:args.propertyId,name:args.propertyName},user);if(!found.record)return found;
  const property=found.record,period=periodFor(args);
  if(args.unitId&&!(property.units??[]).some(unit=>idOf(unit)===args.unitId))throw new AiError('The selected unit does not belong to this property.');
  const {getLedgerReportData}=await import('../../controllers/ledgerController.js');
  const source=await getLedgerReportData({type:'PROPERTY',entityId:idOf(property),...(args.unitId?{unitId:args.unitId}:{}),datePreset:'CUSTOM',startDate:period.start?.toISOString(),endDate:period.end.toISOString(),preserveEndInstant:true});
  if(source.entries.length>MAX_RECORDS)throw new AiError('Property journal exceeds the bounded report limit. Narrow its dates.',413);
  const rows=source.entries.map(row=>({id:idOf(row),date:day(row.date),voucherNo:text(row.voucherNo),description:text(row.detail),head:text(row.categoryName),type:row.transactionType,debit:row.debit,credit:row.credit,runningBalance:row.balance,status:row.status}));
  return {report:buildReport({title:`Property journal — ${property.plazaName||property.propertyName}`,entity:entity('property',property,property.plazaName||property.propertyName),period,rows:selectedRows(rows,args.direction),columns:[...LEDGER_COLUMNS,column('head','Head'),column('type','Transaction type')],summary:source.summary,page:args.page,pageSize:args.pageSize,basis:'Existing central PROPERTY journal: posted/verified income minus payments in the selected period, starting at zero. This is recorded cash-flow activity, not a property valuation or tenant receivable.'}),resolved:{propertyId:idOf(property)}};
}
