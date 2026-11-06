import Employee from '../../models/Employee.js';
import Payroll from '../../models/Payroll.js';
import Attendance from '../../models/Attendance.js';
import StaffLeave from '../../models/StaffLeave.js';
import Transaction from '../../models/Transaction.js';
import Voucher from '../../models/Voucher.js';
import Property from '../../models/Property.js';
import RentalAgreement from '../../models/RentalAgreement.js';
import PendingEntry from '../../models/PendingEntry.js';
import { PERMISSIONS, hasPermission } from '../../middleware/auth.js';
import { round2 } from '../ledgerService.js';
import { calculateMonthlyPayrollRecord } from '../staffPayrollService.js';
import { directoryRows, resolveEntity, DIRECTORY, nameScore } from './businessDirectory.js';
import { authorize, activeStatus, buildReport, column, money, day, idOf, dateMatch, periodFor, readAll, text, escapeRegex, ALL_ROWS } from './businessCommon.js';
import { AiError } from './assistantSecurity.js';

export async function employeeProfile(args,user) {
  authorize(user);const found=await resolveEntity('employee',{id:args.employeeId,name:args.employeeName},user);if(!found.record)return found;
  const employee=found.record, profile=new Employee(employee);
  const details={employeeCode:employee.employeeCode,name:employee.name,designation:employee.designation,department:employee.department,employmentStatus:employee.employmentStatus,employmentType:employee.employmentType,joiningDate:day(employee.joiningDate),staffLocation:employee.staffLocation,reportingManager:employee.reportingManager,basicSalary:round2(employee.basicSalary||0),configuredGrossSalary:round2(profile.grossSalary),loanBalanceSnapshot:round2(employee.loanBalance||0),allowedMonthlyLeaves:employee.allowedMonthlyLeaves,paymentMethod:employee.paymentMethod};
  return {employee:details,report:buildReport({title:`Employee profile — ${employee.name}`,entity:{type:'employee',id:idOf(employee),name:employee.name},rows:Object.entries(details).filter(([,value])=>value!==undefined).map(([field,value])=>({field,value})),columns:[column('field','Field'),column('value','Recorded value')],summary:{basicSalary:details.basicSalary,configuredGrossSalary:details.configuredGrossSalary,loanBalanceSnapshot:details.loanBalanceSnapshot},basis:'Recorded employment profile and the production Employee.grossSalary virtual. Configured salary is not proof of payroll generation or payment. Personal identity, private bank numbers and credential fields are omitted.',exportable:false}),resolved:{employeeId:idOf(employee)}};
}

export async function payrollHistory(args,user) {
  authorize(user);let employee; if(args.employeeId||args.employeeName){const found=await resolveEntity('employee',{id:args.employeeId,name:args.employeeName},user);if(!found.record)return found;employee=found.record;}
  const period=periodFor(args), query={...(employee?{employeeId:employee._id}:{})};
  if(period.startDay||period.endDay)query.payrollMonth={...(period.startDay?{$gte:period.startDay.slice(0,7)}:{}),$lte:period.endDay.slice(0,7)};
  const records=await readAll(Payroll,query,'_id employeeId employeeName payrollMonth designation department basicSalary allowance grossSalary totalDeduction loanDeduction lopDeduction otherDeduction netPayable totalInstallmentsPaid paymentStatus status paymentDate paidDate voucherNo salaryInstallments',{payrollMonth:1,employeeName:1,_id:1});
  const rows=records.map(row=>({id:idOf(row),employeeId:idOf(row.employeeId),employee:row.employeeName||employee?.name,month:row.payrollMonth,basicSalary:round2(row.basicSalary||0),grossSalary:round2(row.grossSalary||0),deductions:round2(row.totalDeduction||0),loanDeduction:round2(row.loanDeduction||0),netPayable:round2(row.netPayable||0),recordedInstallmentsPaid:round2(row.totalInstallmentsPaid||0),remainingPayable:Math.max(0,round2((row.netPayable||0)-(row.totalInstallmentsPaid||0))),status:row.paymentStatus||row.status,voucherNo:row.voucherNo||null}));
  const sum=key=>round2(rows.reduce((total,row)=>total+row[key],0));
  return {report:buildReport({title:`Payroll history${employee?' — '+employee.name:''}`,entity:employee?{type:'employee',id:idOf(employee),name:employee.name}:null,period,rows,columns:[column('month','Payroll month'),column('employee','Employee'),money('grossSalary','Gross salary'),money('deductions','Deductions'),money('netPayable','Net payable'),money('recordedInstallmentsPaid','Recorded installments'),money('remainingPayable','Remaining payable'),column('status','Status')],summary:{payrollRecords:rows.length,totalNetPayable:sum('netPayable'),recordedInstallmentsPaid:sum('recordedInstallmentsPaid'),remainingPayable:sum('remainingPayable')},page:args.page,pageSize:args.pageSize,basis:'Stored payroll-month records, not regenerated payroll. Paid amounts use recorded installment totals; actual payment-date activity is available in the production salary ledger.'}),resolved:employee?{employeeId:idOf(employee)}:{}};
}

export async function attendanceReport(args,user) {
  authorize(user);let employee;
  if(args.employeeId||args.employeeName){const found=await resolveEntity('employee',{id:args.employeeId,name:args.employeeName},user);if(!found.record)return found;employee=found.record;}
  const period=periodFor(args), query={...(employee?{employeeId:employee._id}:{}),dateStr:{...(period.startDay?{$gte:period.startDay}:{}),$lte:period.endDay}};
  const [records,employees]=await Promise.all([readAll(Attendance,query,'_id employeeId dateStr status arrivalTime shiftOpeningTime lateMinutes',{dateStr:1,employeeId:1,_id:1}),employee?[employee]:directoryRows('employee',user)]);
  const byId=new Map(employees.map(row=>[idOf(row),row])), summaries=[];
  for(const person of employees){const personal=records.filter(row=>idOf(row.employeeId)===idOf(person));const counts=calculateMonthlyPayrollRecord(person,personal,`${period.year??Number(period.endDay.slice(0,4))}-${String(period.month??Number(period.endDay.slice(5,7))).padStart(2,'0')}`);summaries.push({employee:person.name,recordedDays:personal.length,presentDays:counts.presentDays,lateDays:counts.lateDays,absentDays:personal.filter(row=>row.status==='ABSENT').length,leaveDays:counts.leaveDays,halfDays:personal.filter(row=>row.status==='HALF_DAY').length,totalLateMinutes:counts.totalLateMinutes});}
  const displayed=args.status?records.filter(row=>row.status===args.status):records;
  const rows=displayed.map(row=>({id:idOf(row),date:row.dateStr,employee:byId.get(idOf(row.employeeId))?.name??'Employee record unavailable',status:row.status,arrivalTime:row.arrivalTime||null,shiftOpeningTime:row.shiftOpeningTime||null,lateMinutes:row.lateMinutes||0}));
  const aggregate={recordedAttendance:records.length,presentDayEquivalents:summaries.reduce((n,row)=>n+row.presentDays,0),absentDays:summaries.reduce((n,row)=>n+row.absentDays,0),leaveDays:summaries.reduce((n,row)=>n+row.leaveDays,0),lateArrivals:summaries.reduce((n,row)=>n+row.lateDays,0)};
  return {report:buildReport({title:`Attendance${employee?' — '+employee.name:''}`,entity:employee?{type:'employee',id:idOf(employee),name:employee.name}:null,period,rows:args.view==='SUMMARY'?summaries:rows,columns:args.view==='SUMMARY'?[column('employee','Employee'),column('recordedDays','Recorded days'),column('presentDays','Present equivalents'),column('absentDays','Absent'),column('leaveDays','Leave'),column('lateDays','Late'),column('halfDays','Half days'),column('totalLateMinutes','Late minutes')]:[column('date','Date'),column('employee','Employee'),column('status','Status'),column('arrivalTime','Arrival'),column('shiftOpeningTime','Shift'),column('lateMinutes','Late minutes')],summary:aggregate,page:args.page,pageSize:args.pageSize,basis:'Recorded Attendance rows using the production payroll attendance counter: LATE is present and HALF_DAY contributes 0.5 present day. Missing dates are not counted as absences.',warnings:['Clock-out time, early departures and working hours are not recorded in this schema.']}),resolved:employee?{employeeId:idOf(employee)}:{}};
}

export async function leaveReport(args,user) {
  authorize(user);let employee;if(args.employeeId||args.employeeName){const found=await resolveEntity('employee',{id:args.employeeId,name:args.employeeName},user);if(!found.record)return found;employee=found.record;}
  const period=periodFor(args), entries=await readAll(StaffLeave,{...(employee?{employeeId:employee._id}:{}),startDate:{$lte:period.end},...(period.start?{endDate:{$gte:period.start}}:{})},'_id employeeId startDate endDate days leaveType status',{startDate:1,_id:1},[['employeeId','name']]);
  const rows=entries.map(row=>({id:idOf(row),employee:row.employeeId?.name||employee?.name||null,startDate:day(row.startDate),endDate:day(row.endDate),recordedIntervalDays:row.days,type:row.leaveType,status:row.status}));
  return {report:buildReport({title:'Employee leave records',period,rows,columns:[column('employee','Employee'),column('startDate','Start'),column('endDate','End'),column('recordedIntervalDays','Whole interval days'),column('type','Leave type'),column('status','Approval')],summary:{matchingIntervals:rows.length,approvedIntervals:rows.filter(row=>row.status==='APPROVED').length},page:args.page,pageSize:args.pageSize,basis:'Recorded leave intervals overlapping the selected dates. Interval days are not incorrectly attributed entirely to one month.'}),resolved:employee?{employeeId:idOf(employee)}:{}};
}

const TX_FIELDS='_id date voucherNo voucherId detail amount transactionType reportCategory sourceModule sourceId reference categoryId propertyId unitId tenantId agreementId drAccountId crAccountId status checkedBy createdBy attachments';
const TX_POPULATE=[['categoryId','name'],['propertyId','plazaName propertyName units.unitName units.unitNumber'],['drAccountId','name type'],['crAccountId','name type'],['createdBy','name']];
export const transactionRow=row=>({id:idOf(row),date:day(row.date),voucherNo:text(row.voucherNo),description:text(row.detail),amount:round2(row.amount),type:row.transactionType,status:row.status,head:text(row.categoryId?.name),property:text(row.propertyId?.plazaName||row.propertyId?.propertyName),unitId:idOf(row.unitId)||null,debitAccount:text(row.drAccountId?.name),creditAccount:text(row.crAccountId?.name),createdBy:text(row.createdBy?.name),checkedBy:text(row.checkedBy),reference:text(row.reference),documentCount:row.attachments?.length??0,documents:(row.attachments??[]).map(file=>text(file.originalName)).filter(Boolean).join('; ')});
const TX_COLUMNS=[column('date','Date'),column('voucherNo','Voucher'),column('description','Narration'),money('amount','Amount'),column('head','Head'),column('debitAccount','Debit account'),column('creditAccount','Credit account'),column('property','Property'),column('createdBy','Created by'),column('checkedBy','Checked by'),column('status','Status'),column('documentCount','Documents')];

export async function transactionSearch(args,user) {
  authorize(user);const period=periodFor(args), query={...activeStatus,date:dateMatch(period)},resolved={};
  for(const [type,key] of [['account','account'],['property','property'],['category','category'],['employee','employee']])if(args[key+'Id']||args[key+'Name']){
    const found=await resolveEntity(type,{id:args[key+'Id'],name:args[key+'Name']},user);if(!found.record)return found;
    const id=found.record._id;resolved[key+'Id']=idOf(id);
    if(type==='account')query.$or=[{drAccountId:id},{crAccountId:id}];
    else if(type==='employee'){const payrolls=await readAll(Payroll,{employeeId:id},'transactionId salaryInstallments.transactionId');const ids=payrolls.flatMap(row=>[row.transactionId,...(row.salaryInstallments??[]).map(item=>item.transactionId)]).filter(Boolean);query._id={$in:ids};}
    else query[key+'Id']=id;
  }
  if(args.unitId){if(!resolved.propertyId)throw new AiError('Select a property when filtering a unit.');const property=await Property.findById(resolved.propertyId).select('units._id').maxTimeMS(10000).lean();if(!property?.units.some(unit=>idOf(unit)===args.unitId))throw new AiError('Unit does not belong to the selected property.');query.unitId=args.unitId;}
  if(args.transactionType)query.transactionType=args.transactionType;
  if(args.voucherNo)query.voucherNo=new RegExp('^'+escapeRegex(args.voucherNo)+'$','i');
  if(args.query){const literal=new RegExp(escapeRegex(args.query),'i');query.$and=[{$or:[{detail:literal},{voucherNo:literal},{reference:literal}]}];}
  if(args.minAmount!==undefined||args.maxAmount!==undefined)query.amount={...(args.minAmount!==undefined?{$gte:args.minAmount}:{}),...(args.maxAmount!==undefined?{$lte:args.maxAmount}:{})};
  const entries=await readAll(Transaction,query,TX_FIELDS,{date:1,createdAt:1,_id:1},TX_POPULATE),rows=entries.map(transactionRow);
  return {report:buildReport({title:'Transaction search',period,rows,columns:TX_COLUMNS,summary:{matchingTransactions:rows.length,totalMatchedAmount:round2(rows.reduce((total,row)=>total+row.amount,0))},page:args.page,pageSize:args.pageSize,basis:'Actual journal entries excluding reversed/void records. Employee filters use recorded Payroll/installment transaction links, never a nonexistent Transaction.employeeId or guessed narration relationship.'}),resolved};
}

export async function voucherDetails(args,user) {
  authorize(user);const query=args.voucherId?{_id:args.voucherId}:{voucherNumber:new RegExp('^'+escapeRegex(args.voucherNo)+'$','i')};
  const voucher=await Voucher.findOne(query).select('_id voucherNumber voucherDate voucherType description reference status totalAmount totalDebit totalCredit isBalanced linesCount checkedBy createdBy').populate('createdBy','name').maxTimeMS(10000).lean();
  if(!voucher)return {error:`Voucher '${text(args.voucherNo||args.voucherId)}' was not found.`,kind:'NOT_FOUND',matches:[]};
  const transactions=await readAll(Transaction,{$or:[{voucherId:voucher._id},{voucherNo:new RegExp('^'+escapeRegex(voucher.voucherNumber)+'$','i')}]},TX_FIELDS,{date:1,_id:1},TX_POPULATE);
  return {report:buildReport({title:`Voucher — ${voucher.voucherNumber}`,entity:{type:'voucher',id:idOf(voucher),name:voucher.voucherNumber},rows:transactions.map(transactionRow),columns:TX_COLUMNS,summary:{voucherDate:day(voucher.voucherDate),voucherType:voucher.voucherType,status:voucher.status,totalAmount:voucher.totalAmount,totalDebit:voucher.totalDebit,totalCredit:voucher.totalCredit,isBalanced:voucher.isBalanced,createdBy:voucher.createdBy?.name??null,checkedBy:voucher.checkedBy??null},page:args.page,pageSize:args.pageSize,basis:'Actual voucher header and linked journal rows. Reversed/void/draft status remains visible for this explicit lookup; these records are not silently included in posted financial totals.'}),resolved:{voucherId:idOf(voucher)}};
}
export async function transactionDetails(args,user) {
  authorize(user);const entry=await Transaction.findById(args.transactionId).select(TX_FIELDS).populate('categoryId','name').populate('propertyId','plazaName propertyName').populate('drAccountId','name').populate('crAccountId','name').populate('createdBy','name').maxTimeMS(10000).lean();
  if(!entry)return {error:'The transaction was not found.',kind:'NOT_FOUND',matches:[]};
  return {report:buildReport({title:`Transaction — ${entry.voucherNo}`,entity:{type:'transaction',id:idOf(entry),name:entry.voucherNo},rows:[transactionRow(entry)],columns:TX_COLUMNS,summary:{transactionId:idOf(entry),voucherNo:entry.voucherNo,amount:entry.amount,status:entry.status,date:day(entry.date)},basis:'Explicit journal lookup, including its actual status and recorded document names. No financial posting or verification is performed.'}),resolved:{transactionId:idOf(entry)}};
}

export async function propertyDetails(args,user) {
  authorize(user);const found=await resolveEntity('property',{id:args.propertyId,name:args.propertyName},user);if(!found.record)return found;
  const property=found.record, selected=(property.units??[]).filter(unit=>(!args.unitId||idOf(unit)===args.unitId)&&(!args.unitStatus||unit.status===args.unitStatus));
  if(args.unitId&&!selected.length)throw new AiError('That unit does not belong to the selected property or status filter.');
  const agreements=await readAll(RentalAgreement,{propertyId:property._id},'_id agreementNumber tenantId unitId startDate endDate monthlyRent status securityDeposit dueDay',{startDate:1,_id:1},[['tenantId','fullName']]);
  const rows=selected.map(unit=>{const agreement=agreements.find(item=>idOf(item.unitId)===idOf(unit)&&item.status==='ACTIVE');return {id:idOf(unit),propertyId:idOf(property),unit:unit.unitName||unit.unitNumber,floor:unit.floor,type:unit.unitType,status:unit.status,tenant:agreement?.tenantId?.fullName||unit.tenantName||null,recordedAgreedRent:agreement?.monthlyRent??unit.agreedRent??null,agreementNumber:agreement?.agreementNumber??null,agreementStart:day(agreement?.startDate),agreementEnd:day(agreement?.endDate),dueDay:agreement?.dueDay??unit.dueDay};});
  return {report:buildReport({title:`Property and units — ${property.plazaName||property.propertyName}`,entity:{type:'property',id:idOf(property),name:property.plazaName||property.propertyName},rows,columns:[column('unit','Unit'),column('floor','Floor'),column('status','Status'),column('tenant','Tenant'),money('recordedAgreedRent','Agreed rent'),column('agreementNumber','Agreement'),column('agreementEnd','Agreement end'),column('dueDay','Due day')],summary:{propertyCode:property.propertyCode,address:property.address,city:property.city,propertyType:property.propertyType,status:property.status,registeredUnits:property.units?.length??0,matchingUnits:rows.length,vacantUnits:(property.units??[]).filter(unit=>unit.status==='VACANT').length},page:args.page,pageSize:args.pageSize,basis:'Stored property, embedded units and active agreement details. Rental financial totals use separate allocation/carry-forward reports.',warnings:['Purchase price and valuation data are not recorded in this Property schema.']}),resolved:{propertyId:idOf(property),...(args.unitId?{unitId:args.unitId}:{})}};
}

export async function verificationRecords(args,user) {
  authorize(user);const period=periodFor(args),query={date:dateMatch(period)};
  if(!hasPermission(user,PERMISSIONS.APPROVE_RECORDS))query.submittedBy=user._id;
  if(args.status)query.status=args.status;
  const rows=await readAll(PendingEntry,query,'_id entryType date voucherNo detail amount status submittedByName verifiedByName verifiedAt rejectionReason',{date:1,_id:1});
  return {report:buildReport({title:'Verification staging records',period,rows:rows.map(row=>({id:idOf(row),date:day(row.date),voucherNo:row.voucherNo,description:text(row.detail),amount:row.amount,entryType:row.entryType,status:row.status,submittedBy:row.submittedByName,verifiedBy:row.verifiedByName||null,verifiedAt:day(row.verifiedAt)})),columns:[column('date','Date'),column('voucherNo','Reference'),column('description','Narration'),money('amount','Staged amount'),column('status','Status'),column('submittedBy','Submitted by'),column('verifiedBy','Verified by')],summary:{matchingRecords:rows.length,scope:query.submittedBy?'Only your submissions':'Existing verification permission scope'},page:args.page,pageSize:args.pageSize,basis:'PendingEntry staging records, not posted transactions. No stage amount is added to financial totals.'})};
}

export async function duplicateTransactions(args,user) {
  authorize(user);const period=periodFor(args),records=await readAll(Transaction,{...activeStatus,date:dateMatch(period)},'_id date voucherNo detail amount drAccountId crAccountId categoryId status',{date:1,_id:1});
  const groups=new Map();for(const row of records){const key=JSON.stringify([day(row.date),round2(row.amount),idOf(row.drAccountId),idOf(row.crAccountId),idOf(row.categoryId),String(row.detail??'').trim().toLowerCase()]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  const rows=[...groups.values()].filter(group=>group.length>1).map(group=>({date:day(group[0].date),description:text(group[0].detail),amount:group[0].amount,count:group.length,transactionIds:group.map(idOf).join(', '),voucherNumbers:group.map(row=>text(row.voucherNo)).join(', ')}));
  return {report:buildReport({title:'Potential duplicate transaction candidates',period,rows,columns:[column('date','Pakistan date'),column('description','Narration'),money('amount','Each recorded amount'),column('count','Matching rows'),column('voucherNumbers','Vouchers'),column('transactionIds','Transaction IDs')],summary:{candidateGroups:rows.length},page:args.page,pageSize:args.pageSize,basis:'Candidates share date, amount, debit account, credit account, category and normalized narration. These are review candidates, not confirmed duplicate postings; nothing is deleted or reversed.'})};
}

