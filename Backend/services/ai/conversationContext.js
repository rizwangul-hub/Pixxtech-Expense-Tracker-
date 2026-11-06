import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { getJwtSecret } from '../../config/jwt.js';
import { AiError, assertFinancialAccess } from './assistantSecurity.js';

const AUDIENCE='pixx-finance-conversation';
export function readConversation(request,user) {
  assertFinancialAccess(user);
  if(!request.contextToken)return {conversationId:request.conversationId??randomUUID(),plans:[],entities:{}};
  const secret=getJwtSecret();if(!secret)throw new AiError('Conversation security is unavailable.',503);
  try {
    const state=jwt.verify(request.contextToken,secret,{algorithms:['HS256'],audience:AUDIENCE,issuer:'pixx-pakistan-assistant'});
    if(state.sub!==String(user._id)||state.tokenVersion!==(user.tokenVersion??0)||request.conversationId&&state.conversationId!==request.conversationId)throw Error('owner');
    if(!Array.isArray(state.plans)||state.plans.length>8||typeof state.conversationId!=='string')throw Error('state');
    return state;
  } catch {throw new AiError('This conversation context is expired, invalid, or belongs to another user/conversation. Start a new chat.',403,'INVALID_CONVERSATION_CONTEXT');}
}
export function signConversation(user,conversationId,plans,entities={},matches=[]) {
  assertFinancialAccess(user);const secret=getJwtSecret();
  if(!secret)throw new AiError('Configure JWT_SECRET to secure assistant conversation context.',503,'CONTEXT_SECURITY_UNAVAILABLE');
  const compactMatches=matches.slice(0,100).map(match=>Object.fromEntries(['entityType','id','name','employeeId','propertyId','period'].filter(key=>match?.[key]!==undefined).map(key=>[key,String(match[key]).slice(0,120)])));
  const payload={conversationId,plans:plans.slice(-8),entities, matches:compactMatches,tokenVersion:user.tokenVersion??0};
  if(JSON.stringify(payload).length>12000)throw new AiError('Conversation state is too large. Narrow the request.');
  return jwt.sign(payload,secret,{algorithm:'HS256',subject:String(user._id),audience:AUDIENCE,issuer:'pixx-pakistan-assistant',expiresIn:'2h'});
}
const entityKeys=['employee','account','property','category','tenant','incomeHead'];
export function inheritPlan(call,state,declarations,question='') {
  const declaration=declarations.find(tool=>tool.name===call.name);
  if(!declaration)return call;
  const allowed=declaration.parameters.properties, supplied=call.args===undefined?{}:call.args;
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))return call;
  const prior=state.plans?.at(-1), args={...supplied};
  const overall=/\b(?:all|every|sab|saare|saray|tamam)\s+(?:bank\s+|cash\s+)?(?:accounts|employees|staff|properties|tenants|categories)\b/i.test(question)||/compare.*\b(?:employees|salaries)\b/i.test(question);
  const kinds={ACCOUNT:['account','property'],SALARY:['employee'],LOAN:['employee'],PROPERTY:['property'],EXPENSE:['property','category'],INCOME:['incomeHead'],TENANT:['tenant']};
  for(const key of entityKeys){
    if(args[key+'Name']!==undefined||args[key+'Id']!==undefined||overall||args.kind&&!(kinds[args.kind]??[]).includes(key))continue;
    if(allowed[key+'Id']&&state.entities?.[key+'Id'])args[key+'Id']=state.entities[key+'Id'];
  }
  const same=prior&&(prior.name===call.name||prior.args?.kind&&prior.args.kind===args.kind);
  const periodKeys=['month','year','startDate','endDate','allTime'];
  if(prior&&Object.keys(allowed).some(key=>periodKeys.includes(key))){
    if(periodKeys.every(key=>supplied[key]===undefined)){for(const key of periodKeys)if(allowed[key]&&prior.args[key]!==undefined)args[key]=prior.args[key];}
    else if(supplied.month!==undefined&&supplied.year===undefined&&allowed.year){const priorYear=prior.args.year??Number(prior.args.startDate?.slice(0,4));if(Number.isInteger(priorYear))args.year=priorYear;}
  }
  if(same&&allowed.direction&&supplied.direction===undefined&&prior.args.direction)args.direction=prior.args.direction;
  if(allowed.page&&supplied.page===undefined)args.page=1;
  return {name:call.name,args};
}
export function explicitAction(action,state,declarations) {
  if(!action)return null;
  if(!state.plans?.length)throw new AiError('Run a report before filtering or requesting another page.');
  if(action.type==='page'||action.type==='filter'){
    const index=action.reportIndex??0, prior=state.plans[index];
    if(!prior)throw new AiError('The selected report is no longer in this conversation.');
    const args={...prior.args};
    if(action.type==='page')args.page=action.page;
    else {
      for(const key of ['month','year','startDate','endDate','allTime','direction','status'])delete args[key];
      Object.assign(args,action.filters,{page:1});
    }
    return [{name:prior.name,args}];
  }
  if(action.type==='select'){
    const match=state.matches?.find(item=>item.id===action.id&&item.entityType===action.entityType);
    if(!match)throw new AiError('Select a matching entity from this conversation, or search again.');
    const prior=state.plans[0];
    const names={employee:'getEmployeeProfile',account:'getAccountLedger',property:'getPropertyDetails',unit:'getPropertyDetails',tenant:'getTenantDetails',category:'getFinancialLedger',incomeHead:'getFinancialLedger',transaction:'getTransactionDetails',voucher:'getVoucherDetails',payroll:'getPayrollHistory',loan:'getEmployeeLoanSummary',attendance:'getAttendanceReport'};
    if(prior.name!=='searchBusinessData'){
      const args={...prior.args};
      const prefix=match.entityType==='unit'?'unit':match.entityType;
      delete args[prefix+'Name'];args[prefix+'Id']=match.id;
      return [{name:prior.name,args}];
    }
    const key={payroll:'employee',loan:'employee',attendance:'employee',unit:'unit'}[match.entityType]??match.entityType;
    const args={[key+'Id']:['payroll','loan','attendance'].includes(match.entityType)?match.employeeId:match.id};
    if(match.entityType==='unit')args.propertyId=match.propertyId;
    if(match.entityType==='category')args.kind='EXPENSE';
    if(match.entityType==='incomeHead')args.kind='INCOME';
    if(match.entityType==='payroll'&&match.period){args.year=Number(match.period.slice(0,4));args.month=Number(match.period.slice(5));}
    return [{name:names[match.entityType],args}];
  }
  throw new AiError('Unsupported conversation action.');
}
