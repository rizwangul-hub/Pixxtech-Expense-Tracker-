import Transaction from '../../models/Transaction.js';
import Voucher from '../../models/Voucher.js';
import Payroll from '../../models/Payroll.js';
import StaffLoan from '../../models/StaffLoan.js';
import Attendance from '../../models/Attendance.js';
import { searchDirectory, directoryRows } from './businessDirectory.js';
import { ALL_ROWS, authorize, buildReport, column, money, day, idOf, text, escapeRegex, periodFor, dateMatch } from './businessCommon.js';

export async function universalSearch(args,user) {
  authorize(user);const type=args.entityType??'ALL', query=args.query??'', page=args.page??1,pageSize=args.pageSize??25;
  const directoryTypes=['employee','account','property','unit','tenant','category','incomeHead'];
  const directory=type==='ALL'||directoryTypes.includes(type)?await searchDirectory({query,entityType:type==='ALL'?'ALL':type==='unit'?'property':type,page:1,pageSize:100},user):null;
  const directoryMatches=directory?directory.report[ALL_ROWS].filter(row=>type!=='unit'||row.entityType==='unit'):[];
  const employees=await directoryRows('employee',user), byEmployee=new Map(employees.map(row=>[idOf(row),row.name]));
  const matchedEmployees=directoryMatches.filter(row=>row.entityType==='employee').map(row=>row.id);
  if(type!=='ALL'&&!directoryTypes.includes(type)&&query){const {nameScore}=await import('./businessDirectory.js');matchedEmployees.push(...employees.filter(row=>nameScore(query,row.name)>=0.8).map(idOf));}
  const p=['month','year','startDate','endDate','allTime'].some(key=>args[key]!==undefined)?periodFor(args):periodFor({allTime:true});
  const pattern=new RegExp(escapeRegex(query),'i'), id=/^[a-f0-9]{24}$/i.test(query)?query:null;
  const definitions=[
    {type:'transaction',Model:Transaction,fields:'_id date voucherNo detail amount status',date:'date',clauses:[{voucherNo:pattern},{detail:pattern},...(id?[{_id:id}]:[])],row:row=>({name:row.voucherNo,description:text(row.detail),date:day(row.date),amount:row.amount,status:row.status})},
    {type:'voucher',Model:Voucher,fields:'_id voucherDate voucherNumber description totalAmount status',date:'voucherDate',clauses:[{voucherNumber:pattern},{description:pattern},...(id?[{_id:id}]:[])],row:row=>({name:row.voucherNumber,description:text(row.description),date:day(row.voucherDate),amount:row.totalAmount,status:row.status})},
    {type:'payroll',Model:Payroll,fields:'_id employeeId employeeName payrollMonth netPayable paymentStatus',clauses:[{employeeName:pattern},{payrollMonth:pattern},...(matchedEmployees.length?[{employeeId:{$in:matchedEmployees}}]:[]),...(id?[{_id:id}]:[])],base:{payrollMonth:{...(p.startDay?{$gte:p.startDay.slice(0,7)}:{}),$lte:p.endDay.slice(0,7)}},row:row=>({name:`${row.employeeName||byEmployee.get(idOf(row.employeeId))||'Payroll'} — ${row.payrollMonth}`,employeeId:idOf(row.employeeId),period:row.payrollMonth,amount:row.netPayable,status:row.paymentStatus})},
    {type:'loan',Model:StaffLoan,fields:'_id employeeId date amount type description',date:'date',clauses:[{description:pattern},...(matchedEmployees.length?[{employeeId:{$in:matchedEmployees}}]:[]),...(id?[{_id:id}]:[])],row:row=>({name:`${byEmployee.get(idOf(row.employeeId))||'Employee'} — ${row.type}`,employeeId:idOf(row.employeeId),date:day(row.date),amount:row.amount,description:text(row.description),status:row.type})},
    {type:'attendance',Model:Attendance,fields:'_id employeeId dateStr status',base:{dateStr:{...(p.startDay?{$gte:p.startDay}:{}),$lte:p.endDay}},clauses:[{dateStr:pattern},...(matchedEmployees.length?[{employeeId:{$in:matchedEmployees}}]:[]),...(id?[{_id:id}]:[])],row:row=>({name:`${byEmployee.get(idOf(row.employeeId))||'Employee'} — ${row.dateStr}`,employeeId:idOf(row.employeeId),date:row.dateStr,status:row.status})},
  ].filter(definition=>type==='ALL'||type===definition.type);
  const sources=[];
  if(directoryMatches.length)sources.push({count:directoryMatches.length,rows:directoryMatches});
  for(const definition of definitions){const match={...(definition.base??{}),...(definition.date?{[definition.date]:dateMatch(p)}:{}),...(query?{$or:definition.clauses}:{})};const count=await definition.Model.countDocuments(match).maxTimeMS(10000);sources.push({...definition,match,count});}
  const total=sources.reduce((sum,source)=>sum+source.count,0);let offset=(page-1)*pageSize,remaining=pageSize;const rows=[];
  for(const source of sources){if(offset>=source.count){offset-=source.count;continue;}const take=Math.min(remaining,source.count-offset);if(source.rows)rows.push(...source.rows.slice(offset,offset+take));else{const records=await source.Model.find(source.match).select(source.fields).sort({_id:1}).skip(offset).limit(take).maxTimeMS(10000).lean();rows.push(...records.map(row=>({entityType:source.type,id:idOf(row),...source.row(row)})));}offset=0;remaining-=take;if(!remaining)break;}
  const report=buildReport({title:'Universal business search',period:p,rows,columns:[column('entityType','Entity'),column('name','Matching record'),column('date','Date'),money('amount','Recorded amount'),column('status','Status')],summary:{matchingRecords:total},basis:'Authorized name/alias directory matches and actual record searches, grouped by entity type. Counts are queried independently of the visible page; amounts are recorded values, never model estimates.',exportable:false});
  report.rows=rows;report.pagination={page,pageSize,total,pageCount:Math.ceil(total/pageSize),hasPrevious:page>1,hasNext:page*pageSize<total};
  return {report,matches:rows};
}
