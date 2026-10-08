import Property from '../models/Property.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Transaction from '../models/Transaction.js';
import { getAgreedMonthlyRent } from './rentPricing.js';
import { round2 } from './ledgerService.js';

/**
 * Returns previous YYYY-MM
 * e.g. '2026-10' -> '2026-09'
 */
export const getPreviousMonthStr = (monthStr) => {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const [year, month] = monthStr.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
};

/**
 * Calculates rental summary for a single month given prior balances
 * @param {Array} properties
 * @param {Map} agreementsByUnitId
 * @param {string} periodString YYYY-MM
 * @param {Map} [priorBalanceMap] Optional map of unitId -> prior balance number
 */
export const computeMonthRentalSummary = (properties, agreementsByUnitId, rentTransactions, periodString, priorBalanceMap = null) => {
  let grandTotalAgreed = 0;
  let grandTotalPrior = 0;
  let grandTotalCurrentDue = 0;
  let grandTotalReceived = 0;
  let grandTotalOutstanding = 0;
  let grandTotalAdvance = 0;

  const plazaSummaries = properties.map((plaza) => {
    let plazaAgreed = 0;
    let plazaPrior = 0;
    let plazaCurrentDue = 0;
    let plazaReceived = 0;
    let plazaOutstanding = 0;
    let plazaAdvance = 0;

    const units = (plaza.units || []).map((unit) => {
      const uId = unit._id.toString();
      const agreement = agreementsByUnitId.get(uId);
      const agreed = round2(getAgreedMonthlyRent(unit, agreement));

      // Prior receivable calculation:
      let prior = 0;
      if (priorBalanceMap && priorBalanceMap.has(uId)) {
        prior = round2(priorBalanceMap.get(uId) || 0);
      } else {
        prior = round2(unit.julyReceivable || 0);
      }

      const matchingTransactions = rentTransactions.filter(
        (transaction) =>
          transaction.propertyId?.toString() === plaza._id.toString() &&
          transaction.unitId?.toString() === uId
      );
      const received = round2(
        matchingTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
      );
      const latestTransaction = matchingTransactions[matchingTransactions.length - 1];
      const isVerified =
        matchingTransactions.length > 0 &&
        matchingTransactions.every((transaction) => transaction.status === 'VERIFIED');

      const priorArrears = Math.max(0, prior);
      const priorAdvance = Math.max(0, -prior);
      const totalPayable = round2(agreed + priorArrears);
      const totalCovered = round2(received + priorAdvance);
      const outstanding = round2(Math.max(0, totalPayable - totalCovered));
      const advance = round2(Math.max(0, totalCovered - totalPayable));
      const statusBadge =
        outstanding === 0
          ? advance > 0 ? 'ADVANCE_PAID' : 'FULLY_PAID'
          : totalCovered > 0 ? 'PARTIALLY_PAID' : 'OUTSTANDING';

      // Net closing balance for this month (positive = outstanding receivable, negative = advance credit)
      const netClosingBalance = outstanding > 0 ? outstanding : (advance > 0 ? -advance : 0);

      plazaAgreed += agreed;
      plazaPrior += prior;
      plazaCurrentDue += agreed;
      plazaReceived += received;
      plazaOutstanding += outstanding;
      plazaAdvance += advance;

      return {
        unitId: unit._id,
        unitName: unit.unitName,
        tenantName: unit.tenantName || 'Unassigned',
        dueDay: unit.dueDay ? `${unit.dueDay}th` : '1st',
        agreedRent: agreed,
        priorMonthReceivable: prior,
        currentMonthActualRent: agreed,
        receivedAmount: received,
        receivedDate: latestTransaction && received > 0 && latestTransaction.date
          ? new Date(latestTransaction.date).toISOString().split('T')[0]
          : '-',
        receivingAccountName: latestTransaction?.drAccountId?.name || '-',
        renewalDate: unit.renewalDate
          ? new Date(unit.renewalDate).toISOString().split('T')[0]
          : 'N/A',
        outstandingReceivable: outstanding,
        advanceRentReceived: advance,
        netClosingBalance,
        statusBadge,
        isCheckedByFahad: isVerified,
        checkedBy:
          latestTransaction?.checkedBy ||
          (matchingTransactions.length > 0 ? 'Fahad Sb' : 'Pending'),
      };
    });

    plazaAgreed = round2(plazaAgreed);
    plazaPrior = round2(plazaPrior);
    plazaCurrentDue = round2(plazaCurrentDue);
    plazaReceived = round2(plazaReceived);
    plazaOutstanding = round2(plazaOutstanding);
    plazaAdvance = round2(plazaAdvance);

    grandTotalAgreed += plazaAgreed;
    grandTotalPrior += plazaPrior;
    grandTotalCurrentDue += plazaCurrentDue;
    grandTotalReceived += plazaReceived;
    grandTotalOutstanding += plazaOutstanding;
    grandTotalAdvance += plazaAdvance;

    return {
      plazaId: plaza._id,
      plazaName: plaza.plazaName,
      unitsCount: units.length,
      subtotals: {
        agreedRent: plazaAgreed,
        priorReceivable: plazaPrior,
        currentDue: plazaCurrentDue,
        receivedAmount: plazaReceived,
        outstandingReceivable: plazaOutstanding,
        advanceRentReceived: plazaAdvance,
        collectionRate:
          plazaCurrentDue > 0 ? Math.round((plazaReceived / plazaCurrentDue) * 100) : 0,
      },
      units,
    };
  });

  return {
    period: periodString,
    grandTotals: {
      totalAgreedRent: round2(grandTotalAgreed),
      totalPriorReceivable: round2(grandTotalPrior),
      totalCurrentDue: round2(grandTotalCurrentDue),
      totalReceivedAmount: round2(grandTotalReceived),
      totalOutstandingReceivable: round2(grandTotalOutstanding),
      totalAdvanceRentReceived: round2(grandTotalAdvance),
      collectionRate:
        grandTotalCurrentDue > 0
          ? Math.round((grandTotalReceived / grandTotalCurrentDue) * 100)
          : 0,
    },
    plazas: plazaSummaries,
  };
};

/**
 * Loads rental summary for any month with automatic dynamic carry forward from 2026-09 onwards
 */
export const getRentalSummaryWithCarryForward = async (targetMonthStr) => {
  const properties = await Property.find({})
    .populate('units.defaultReceivingAccountId', 'name type currentBalance')
    .sort({ plazaName: 1 })
    .lean();

  const allUnitIds = properties.flatMap((property) =>
    (property.units || []).map((unit) => unit._id)
  );
  const activeAgreements = await RentalAgreement.find({
    unitId: { $in: allUnitIds },
    status: 'ACTIVE',
  }).select('unitId monthlyRent').lean();
  const agreementsByUnitId = new Map(
    activeAgreements.map((agreement) => [agreement.unitId.toString(), agreement])
  );

  // If viewing 2026-09 or earlier, 2026-09 uses baseline julyReceivable directly
  if (targetMonthStr <= '2026-09') {
    const [y, m] = targetMonthStr.split('-').map(Number);
    const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const rentTransactions = await Transaction.find({
      $or: [
        { rentMonth: targetMonthStr },
        { date: { $gte: startDate, $lte: endDate }, propertyId: { $ne: null } },
      ],
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    })
      .populate('drAccountId', 'name type')
      .lean();

    return computeMonthRentalSummary(properties, agreementsByUnitId, rentTransactions, targetMonthStr, null);
  }

  // If viewing month > 2026-09 (e.g. 2026-10, 2026-11), chain forward from 2026-09!
  // 1. Calculate September 2026
  const sepStart = new Date(Date.UTC(2026, 8, 1, 0, 0, 0, 0));
  const sepEnd = new Date(Date.UTC(2026, 9, 0, 23, 59, 59, 999));
  const sepTxs = await Transaction.find({
    $or: [
      { rentMonth: '2026-09' },
      { date: { $gte: sepStart, $lte: sepEnd }, propertyId: { $ne: null } },
    ],
    $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
  })
    .populate('drAccountId', 'name type')
    .lean();

  let currentSummary = computeMonthRentalSummary(properties, agreementsByUnitId, sepTxs, '2026-09', null);
  let currentMonthCursor = '2026-09';

  // Build closing balance map from 2026-09
  let closingBalanceMap = new Map();
  for (const plaza of currentSummary.plazas) {
    for (const unit of plaza.units) {
      closingBalanceMap.set(unit.unitId.toString(), unit.netClosingBalance);
    }
  }

  // Iterate forward month by month until targetMonthStr
  while (currentMonthCursor < targetMonthStr) {
    const [cy, cm] = currentMonthCursor.split('-').map(Number);
    let nextY = cy;
    let nextM = cm + 1;
    if (nextM > 12) {
      nextY += 1;
      nextM = 1;
    }
    const nextMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`;
    const nextStart = new Date(Date.UTC(nextY, nextM - 1, 1, 0, 0, 0, 0));
    const nextEnd = new Date(Date.UTC(nextY, nextM, 0, 23, 59, 59, 999));

    const nextTxs = await Transaction.find({
      $or: [
        { rentMonth: nextMonthStr },
        { date: { $gte: nextStart, $lte: nextEnd }, propertyId: { $ne: null } },
      ],
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    })
      .populate('drAccountId', 'name type')
      .lean();

    currentSummary = computeMonthRentalSummary(properties, agreementsByUnitId, nextTxs, nextMonthStr, closingBalanceMap);
    currentMonthCursor = nextMonthStr;

    // Update closing balance map for next iteration
    closingBalanceMap = new Map();
    for (const plaza of currentSummary.plazas) {
      for (const unit of plaza.units) {
        closingBalanceMap.set(unit.unitId.toString(), unit.netClosingBalance);
      }
    }
  }

  return currentSummary;
};
