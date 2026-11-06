import Account from '../../models/Account.js';
import Employee from '../../models/Employee.js';
import Property from '../../models/Property.js';
import Tenant from '../../models/Tenant.js';
import Category from '../../models/Category.js';
import OtherIncomeHead from '../../models/OtherIncomeHead.js';
import { AiError } from './assistantSecurity.js';
import { authorize, buildReport, column, idOf, readAll, text } from './businessCommon.js';

export const DIRECTORY = {
  employee: { Model:Employee, fields:'_id name employeeCode designation department employmentStatus basicSalary allowance fuelAllowance foodAllowance mobileAllowance transportAllowance performanceAllowance otherAllowances allowancesList loanBalance joiningDate employmentType isActive reportingManager staffLocation paymentMethod allowedMonthlyLeaves', name:row=>row.name, aliases:row=>[row.name,row.employeeCode] },
  account: { Model:Account, fields:'_id name accountName accountCode type accountType bankName ownerName cashHolder openingBalance openingBalanceDate currency branch isActive isClearing', name:row=>row.name, aliases:row=>[row.name,row.accountName,row.accountCode,row.bankName,row.ownerName,row.cashHolder] },
  property: { Model:Property, fields:'_id plazaName propertyName propertyCode address city area propertyType status isActive units', name:row=>row.plazaName||row.propertyName, aliases:row=>[row.plazaName,row.propertyName,row.propertyCode] },
  tenant: { Model:Tenant, fields:'_id fullName companyName status isActive', name:row=>row.fullName, aliases:row=>[row.fullName,row.companyName] },
  category: { Model:Category, fields:'_id name type parentCategoryId propertyId unitId isMainHead isRentalHead excludeFromReports expenseClassification', name:row=>row.name, aliases:row=>[row.name] },
  incomeHead: { Model:OtherIncomeHead, fields:'_id name code isActive description', name:row=>row.name, aliases:row=>[row.name,row.code] },
};
export const normalizeName = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const compact = value => normalizeName(value).replace(/\s/g,'');
function editDistance(left,right) { const row=Array.from({length:right.length+1},(_,i)=>i);for(let i=1;i<=left.length;i++){let previous=row[0];row[0]=i;for(let j=1;j<=right.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(left[i-1]===right[j-1]?0:1));previous=old;}}return row[right.length]; }
export function nameScore(query, alias) {
  const q=normalizeName(query), a=normalizeName(alias);if(!q||!a)return 0;
  if(q===a || compact(q)===compact(a))return 1;
  const qTokens=q.split(' '), aTokens=a.split(' ');
  if(qTokens.every(token=>aTokens.includes(token))) return 0.95;
  if(q.length<4)return 0;
  const similarity=1-editDistance(compact(q),compact(a))/Math.max(compact(q).length,compact(a).length);
  return similarity>=0.8?similarity:0;
}
export async function directoryRows(type, user) {
  authorize(user);const definition=DIRECTORY[type];if(!definition)throw new AiError('Unsupported entity type.');
  const rows=await readAll(definition.Model,{},definition.fields);
  if(rows.length>5000)throw new AiError('Entity directory is too large for fuzzy matching; use an exact record identifier.',413);
  return rows;
}
export function selectEntity(rows, type, query, id) {
  const definition=DIRECTORY[type];
  let matches;
  if(id)matches=rows.filter(row=>idOf(row)===String(id));
  else {
    const scored=rows.map(row=>({row,score:Math.max(...definition.aliases(row).filter(Boolean).map(alias=>nameScore(query,alias)),0)})).filter(item=>item.score>=0.8).sort((a,b)=>b.score-a.score||definition.name(a.row).localeCompare(definition.name(b.row)));
    const exact=scored.filter(item=>item.score===1);
    matches=(exact.length?exact:scored.length && (scored.length===1 || scored[0].score-scored[1].score>=0.12)?[scored[0]]:scored).map(item=>item.row);
  }
  if(matches.length===1)return {record:matches[0]};
  const choices=(matches.length?matches:rows).slice(0,10).map(row=>({entityType:type,id:idOf(row),name:text(definition.name(row))}));
  return {error:matches.length?`More than one ${type} matches '${text(query)}'. Select the intended record.`:`${type} '${text(query||id)}' was not found.`, kind:matches.length?'AMBIGUOUS':'NOT_FOUND', matches:choices};
}
export async function resolveEntity(type, {name,id}, user) {
  authorize(user);if(!name&&!id)return {error:`Specify the ${type} name or select a matching record.`,kind:'MISSING_ENTITY',matches:[]};
  if(id) {
    const row=await DIRECTORY[type].Model.findById(id).select(DIRECTORY[type].fields).maxTimeMS(10000).lean();
    if(!row)return {error:`${type} '${text(id)}' was not found.`,kind:'NOT_FOUND',matches:[]};
    if(name && Math.max(...DIRECTORY[type].aliases(row).filter(Boolean).map(alias=>nameScore(name,alias)),0)<0.8)throw new AiError('Entity name and identifier do not refer to the same record.');
    return {record:row};
  }
  return selectEntity(await directoryRows(type,user),type,name,id);
}
export async function searchDirectory({query='',entityType='ALL',page=1,pageSize=25},user) {
  authorize(user);const types=entityType==='ALL'?Object.keys(DIRECTORY):[entityType];let matches=[];
  for(const type of types){const rows=await directoryRows(type,user), definition=DIRECTORY[type];for(const row of rows){const score=query?Math.max(...definition.aliases(row).filter(Boolean).map(alias=>nameScore(query,alias)),0):1;if(score>=0.8)matches.push({entityType:type,id:idOf(row),name:text(definition.name(row)),status:row.employmentStatus||row.status||(row.isActive===false?'INACTIVE':'ACTIVE'),score});
    if(type==='property')for(const unit of row.units??[]){const value=unit.unitName||unit.unitNumber;const unitScore=query?Math.max(nameScore(query,value),nameScore(query,definition.name(row))):1;if(unitScore>=0.8)matches.push({entityType:'unit',id:idOf(unit),propertyId:idOf(row),name:text(value),property:text(definition.name(row)),status:unit.status,score:unitScore});}}
  }
  matches.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
  return {report:buildReport({title:'Business entity search',rows:matches.map(({score,...row})=>row),columns:[column('entityType','Entity'),column('name','Name'),column('status','Status'),column('property','Property')],summary:{matchingRecords:matches.length},page,pageSize,basis:'Registered database entities; names and safe business fields only.',exportable:false}),matches:matches.slice((page-1)*pageSize,page*pageSize).map(({score,...row})=>row)};
}
