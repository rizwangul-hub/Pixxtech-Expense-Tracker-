import { AiError, assertFinancialAccess } from './assistantSecurity.js';
import { round2 } from '../ledgerService.js';
import { getUtcMonthDateRange, getUtcMonthKey } from '../salaryReportingService.js';

export const MAX_RECORDS = 50000;
export const ALL_ROWS = Symbol('authorized-report-rows');
export const idOf = value => String(value?._id ?? value ?? '');
export const text = value => {
  const content=String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'');
  return /-----BEGIN .*PRIVATE KEY-----|(?:password|api[_-]?key|secret|authorization|access[_-]?token)\s*[:=]\s*\S+|Bearer\s+[\w.-]{12,}|AIza[\w-]{20,}|sk-(?:proj-)?[\w-]{16,}/i.test(content)?'[sensitive text omitted]':content.slice(0,1200);
};
export const day = value => value ? new Date(new Date(value).getTime() + 18000000).toISOString().slice(0, 10) : null;
export const activeStatus = { $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }] };
export const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const money = (key, label = key) => ({ key, label, type: 'money' });
export const column = (key, label = key) => ({ key, label, type: 'text' });

export function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AiError('Use a real calendar date in YYYY-MM-DD format.');
  return value;
}

export function periodFor(args = {}, now = new Date()) {
  const current = getUtcMonthKey(now);
  if (args.allTime === true) {
    if (['month', 'year', 'startDate', 'endDate'].some(key => args[key] !== undefined)) throw new AiError('All-time and date filters cannot be combined.');
    return { start: null, end: now, label: 'All recorded history through today (Asia/Karachi)', startDay: null, endDay: day(now) };
  }
  if (args.startDate !== undefined || args.endDate !== undefined) {
    const startDay = dateOnly(args.startDate), endDay = dateOnly(args.endDate);
    if (startDay > endDay || endDay > day(now)) throw new AiError('Choose an ordered date range through today in Pakistan.');
    if (args.month !== undefined || args.year !== undefined) {
      const month = `${args.year ?? Number(current.slice(0,4))}-${String(args.month ?? Number(current.slice(5))).padStart(2,'0')}`;
      if (startDay.slice(0,7) !== month || endDay.slice(0,7) !== month) throw new AiError('Month and explicit dates must identify the same period.');
    }
    return { start: new Date(startDay + 'T00:00:00+05:00'), end: new Date(endDay + 'T23:59:59.999+05:00'), startDay, endDay, label: `${startDay} to ${endDay} (Asia/Karachi)` };
  }
  const year = args.year ?? Number(current.slice(0,4)), month = args.month ?? Number(current.slice(5));
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2000 || month < 1 || month > 12 || `${year}-${String(month).padStart(2,'0')}` > current) throw new AiError('Choose a valid month through the current Pakistan month.');
  const { startDate: start, endDate: end } = getUtcMonthDateRange(year, month);
  return { start, end, year, month, startDay: day(start), endDay: day(end), label: `${year}-${String(month).padStart(2,'0')} (Asia/Karachi)` };
}
export const dateMatch = period => ({ ...(period.start ? { $gte: period.start } : {}), ...(period.end ? { $lte: period.end } : {}) });
export const inPeriod = (value, period) => value && (!period.start || new Date(value) >= period.start) && (!period.end || new Date(value) <= period.end);

export async function readAll(Model, query, projection = '', sort = { _id: 1 }, populate = []) {
  const request = Model.find(query).select(projection).sort(sort).limit(MAX_RECORDS + 1).maxTimeMS(10000);
  for (const [field,fields] of populate) request.populate(field,fields);
  const rows = await request.lean();
  if (rows.length > MAX_RECORDS) throw new AiError('This report exceeds 50,000 records. Narrow its dates or use the existing financial export workflow; partial totals have not been returned.', 413, 'REPORT_TOO_LARGE');
  return rows;
}
export function buildReport({ title, entity, period, rows = [], summary = {}, columns = [], basis, page = 1, pageSize = 25, warnings = [], filters = {}, exportable = true }) {
  const total = rows.length, pageCount = Math.ceil(total / pageSize);
  if (page > Math.max(1, pageCount)) throw new AiError('That page is beyond the matching records. Start with page 1.');
  const report = { title, entity, period: period?.label ?? 'Current recorded profile', timeZone: 'Asia/Karachi', retrievedAt: new Date().toISOString(), summary, columns, rows: rows.slice((page-1)*pageSize,page*pageSize), pagination: { page, pageSize, total, pageCount, hasPrevious: page > 1, hasNext: page < pageCount }, basis, warnings, filters, exportable };
  Object.defineProperty(report, ALL_ROWS, {value: rows});
  return report;
}
export function paginateLedger({ rows, period, opening = 0, movement, direction = 'ALL', page, pageSize, ...rest }) {
  let running = round2(opening), debit = 0, credit = 0;
  const included = rows.filter(row => inPeriod(row.rawDate, period) || row.rawDate === null && !period.start);
  const computed = included.map(row => {
    debit = round2(debit + Number(row.debit || 0)); credit = round2(credit + Number(row.credit || 0));
    running = round2(running + movement(row));
    const { rawDate, ...display } = row;
    return { ...display, runningBalance: running };
  });
  const filtered = computed.filter(row => direction === 'ALL' || direction === 'WITHDRAWALS' && row.debit > 0 || direction === 'DEPOSITS' && row.credit > 0 || direction === row.type);
  return buildReport({ ...rest, period, page, pageSize, rows: filtered,
    summary: {openingBalance:opening, totalDebit:debit, totalCredit:credit, closingBalance:running, periodEntries:computed.length, matchingEntries:filtered.length, ...rest.summary},
    warnings: [...(rest.warnings ?? []), ...(direction !== 'ALL' ? ['Running and closing balances include all period movements, including rows hidden by the type filter.'] : [])] });
}
export function authorize(user) { assertFinancialAccess(user); }
