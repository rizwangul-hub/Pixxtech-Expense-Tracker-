import Property from '../models/Property.js';
import RentalAgreement from '../models/RentalAgreement.js';
import RentDue from '../models/RentDue.js';
import RentReceived from '../models/RentReceived.js';
import Transaction from '../models/Transaction.js';
import { round2 } from './ledgerService.js';

// July receivable is the signed opening balance carried into the August 2026 ledger.
const RECEIVABLE_BASELINE_MONTH = '2026-08';

const formatMonth = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const monthDateRange = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999)),
  };
};

const unitKey = (propertyId, unitId) =>
  `${propertyId?.toString() || ''}:${unitId?.toString() || ''}`;

const groupByUnit = (items, getPropertyId, getUnitId) => {
  const grouped = new Map();
  items.forEach((item) => {
    const key = unitKey(getPropertyId(item), getUnitId(item));
    const rows = grouped.get(key) || [];
    rows.push(item);
    grouped.set(key, rows);
  });
  return grouped;
};

const getAgreementForMonth = (agreements, month) => {
  const { start, end } = monthDateRange(month);
  return agreements
    .filter((agreement) => {
      const status = String(agreement.status || '').toUpperCase();
      if (['DRAFT', 'TERMINATED', 'INACTIVE'].includes(status)) return false;
      return new Date(agreement.startDate) <= end && new Date(agreement.endDate) >= start;
    })
    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || null;
};

const isReversedOrVoid = (status) =>
  /^(REVERSED|VOID)$/i.test(String(status || ''));

const isPostedRentTransaction = (transaction) =>
  transaction.transactionType === 'INCOME' &&
  (transaction.reportCategory === 'Rent' ||
    transaction.sourceModule === 'RENT_RECEIVED') &&
  ['VERIFIED', 'POSTED'].includes(String(transaction.status || '').toUpperCase());

const dateInRange = (date, start, end) => {
  if (!date) return false;
  const value = new Date(date);
  return value >= start && value <= end;
};

export const loadRentalReceivableContext = async (periodString) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodString)) {
    throw new Error('Rental summary month must be in YYYY-MM format.');
  }

  const historyStartMonth =
    periodString < RECEIVABLE_BASELINE_MONTH
      ? periodString
      : RECEIVABLE_BASELINE_MONTH;
  const { start: historyStartDate } = monthDateRange(historyStartMonth);
  const { end: periodEndDate } = monthDateRange(periodString);

  const [properties, agreements, dues, receipts, rentTransactions] = await Promise.all([
    Property.find({})
      .populate('units.defaultReceivingAccountId', 'name type currentBalance')
      .sort({ plazaName: 1 })
      .lean(),
    RentalAgreement.find({
      startDate: { $lte: periodEndDate },
      endDate: { $gte: historyStartDate },
      status: { $ne: 'DRAFT' },
    }).lean(),
    RentDue.find({
      rentMonth: { $gte: historyStartMonth, $lte: periodString },
    }).lean(),
    RentReceived.find({
      receiptDate: { $gte: historyStartDate, $lte: periodEndDate },
      status: { $ne: 'REVERSED' },
    })
      .populate('receivingAccountId', 'name')
      .lean(),
    Transaction.find({
      date: { $gte: historyStartDate, $lte: periodEndDate },
      transactionType: 'INCOME',
      $or: [{ reportCategory: 'Rent' }, { sourceModule: 'RENT_RECEIVED' }],
    })
      .populate('drAccountId', 'name type')
      .lean(),
  ]);

  return { properties, agreements, dues, receipts, rentTransactions };
};

export const buildRentalReceivableSummary = (context, periodString) => {
  const {
    properties,
    agreements,
    dues,
    receipts,
    rentTransactions,
  } = context;
  const { start: periodStart, end: periodEnd } = monthDateRange(periodString);
  const historyStartMonth =
    periodString < RECEIVABLE_BASELINE_MONTH
      ? periodString
      : RECEIVABLE_BASELINE_MONTH;
  const duesByUnit = groupByUnit(dues, (due) => due.propertyId, (due) => due.unitId);
  const agreementsByUnit = groupByUnit(
    agreements,
    (agreement) => agreement.propertyId,
    (agreement) => agreement.unitId
  );
  const receiptsByUnit = groupByUnit(
    receipts,
    (receipt) => receipt.propertyId,
    (receipt) => receipt.unitId
  );
  const transactionsByUnit = groupByUnit(
    rentTransactions,
    (transaction) => transaction.propertyId,
    (transaction) => transaction.unitId
  );
  const transactionsById = new Map(
    rentTransactions.map((transaction) => [transaction._id.toString(), transaction])
  );

  let grandTotalAgreed = 0;
  let grandTotalPrior = 0;
  let grandTotalReceived = 0;
  let grandTotalOutstanding = 0;
  let grandTotalAdvance = 0;

  const plazaSummaries = properties.map((property) => {
    let plazaAgreed = 0;
    let plazaPrior = 0;
    let plazaReceived = 0;
    let plazaOutstanding = 0;
    let plazaAdvance = 0;

    const units = (property.units || []).map((unit) => {
      const key = unitKey(property._id, unit._id);
      const unitDues = duesByUnit.get(key) || [];
      const unitAgreements = agreementsByUnit.get(key) || [];
      const unitReceipts = receiptsByUnit.get(key) || [];
      const unitTransactions = transactionsByUnit.get(key) || [];
      const dueByMonth = new Map();

      unitDues.forEach((due) => {
        const monthDues = dueByMonth.get(due.rentMonth) || [];
        monthDues.push(due);
        dueByMonth.set(due.rentMonth, monthDues);
      });

      const expectedForMonth = (month) => {
        const monthlyDues = dueByMonth.get(month);
        if (monthlyDues) {
          return round2(
            monthlyDues.reduce(
              (sum, due) =>
                sum +
                (String(due.status || '').toUpperCase() === 'CANCELLED'
                  ? 0
                  : Number(due.expectedRentAmount) || 0),
              0
            )
          );
        }

        const agreement = getAgreementForMonth(unitAgreements, month);
        if (agreement) return round2(Number(agreement.monthlyRent) || 0);

        if (month === periodString && unitAgreements.length === 0) {
          return round2(Number(unit.agreedRent) || 0);
        }
        return 0;
      };

      const validReceipts = unitReceipts.filter((receipt) => {
        if (isReversedOrVoid(receipt.status)) return false;
        if (!dateInRange(receipt.receiptDate, new Date(`${historyStartMonth}-01T00:00:00.000Z`), periodEnd)) {
          return false;
        }
        const linkedTransaction = receipt.transactionId
          ? transactionsById.get(receipt.transactionId.toString())
          : null;
        return !linkedTransaction || !isReversedOrVoid(linkedTransaction.status);
      });
      const receiptTransactionIds = new Set(
        unitReceipts
          .filter((receipt) => receipt.transactionId)
          .map((receipt) => receipt.transactionId.toString())
      );
      const validLegacyTransactions = unitTransactions.filter(
        (transaction) =>
          !isReversedOrVoid(transaction.status) &&
          isPostedRentTransaction(transaction) &&
          !receiptTransactionIds.has(transaction._id.toString()) &&
          dateInRange(
            transaction.date,
            new Date(`${historyStartMonth}-01T00:00:00.000Z`),
            periodEnd
          )
      );

      const currentAllocationByMonth = new Map();
      const priorAllocationByPaymentMonth = new Map();
      const advanceAllocationByPaymentMonth = new Map();
      const addAllocation = (map, month, amount) => {
        if (!month || !amount) return;
        map.set(month, round2((map.get(month) || 0) + amount));
      };
      const payments = [];

      validReceipts.forEach((receipt) => {
        const date = new Date(receipt.receiptDate);
        const paymentMonth = formatMonth(date);
        const amount = Number(receipt.amount) || 0;
        const currentAllocation = Number(receipt.allocatedCurrentMonth) || 0;
        const priorAllocation = Number(receipt.allocatedPreviousReceivable) || 0;
        const advanceAllocation = Number(receipt.allocatedAdvance) || 0;
        const hasAllocation =
          currentAllocation > 0 ||
          priorAllocation > 0 ||
          advanceAllocation > 0;

        if (hasAllocation) {
          addAllocation(
            currentAllocationByMonth,
            receipt.rentMonth || paymentMonth,
            currentAllocation
          );
          addAllocation(priorAllocationByPaymentMonth, paymentMonth, priorAllocation);
          addAllocation(advanceAllocationByPaymentMonth, paymentMonth, advanceAllocation);

          const unallocatedAmount = Math.max(
            0,
            round2(amount - currentAllocation - priorAllocation - advanceAllocation)
          );
          addAllocation(advanceAllocationByPaymentMonth, paymentMonth, unallocatedAmount);
        } else {
          addAllocation(
            currentAllocationByMonth,
            receipt.rentMonth || paymentMonth,
            amount
          );
        }

        payments.push({
          amount,
          date,
          accountName: receipt.receivingAccountId?.name || '-',
          status: receipt.status,
          checkedBy: receipt.checkedBy || null,
        });
      });

      validLegacyTransactions.forEach((transaction) => {
        const date = new Date(transaction.date);
        const paymentMonth = formatMonth(date);
        addAllocation(
          currentAllocationByMonth,
          transaction.rentMonth || paymentMonth,
          Number(transaction.amount) || 0
        );
        payments.push({
          amount: Number(transaction.amount) || 0,
          date,
          accountName: transaction.drAccountId?.name || '-',
          status: transaction.status,
          checkedBy: transaction.checkedBy || null,
        });
      });
      payments.sort((a, b) => a.date - b.date);

      const monthStart = new Date(`${historyStartMonth}-01T00:00:00.000Z`);
      let monthCursor = monthStart;
      const openingBalance = periodString >= RECEIVABLE_BASELINE_MONTH
        ? Number(unit.julyReceivable) || 0
        : 0;
      let arrears = Math.max(0, openingBalance);
      let advanceBalance = Math.max(0, -openingBalance);
      let priorMonthReceivable = arrears;
      let currentMonthAppliedAmount = 0;
      const currentMonthAgreed = expectedForMonth(periodString);

      while (formatMonth(monthCursor) <= periodString) {
        const month = formatMonth(monthCursor);
        let monthDue = expectedForMonth(month);
        const advanceApplied = Math.min(advanceBalance, monthDue);
        advanceBalance = round2(advanceBalance - advanceApplied);
        monthDue = round2(monthDue - advanceApplied);

        const currentAllocated = currentAllocationByMonth.get(month) || 0;
        const currentApplied = Math.min(monthDue, currentAllocated);
        if (month === periodString) currentMonthAppliedAmount += currentApplied;
        monthDue = round2(monthDue - currentApplied);
        advanceBalance = round2(advanceBalance + Math.max(0, currentAllocated - currentApplied));
        arrears = round2(arrears + monthDue);

        const priorAllocated = priorAllocationByPaymentMonth.get(month) || 0;
        const priorApplied = Math.min(arrears, priorAllocated);
        if (month === periodString) currentMonthAppliedAmount += priorApplied;
        arrears = round2(arrears - priorApplied);
        advanceBalance = round2(advanceBalance + Math.max(0, priorAllocated - priorApplied));
        advanceBalance = round2(
          advanceBalance + (advanceAllocationByPaymentMonth.get(month) || 0)
        );

        if (month < periodString) {
          priorMonthReceivable = round2(arrears - advanceBalance);
        }
        monthCursor = new Date(Date.UTC(
          monthCursor.getUTCFullYear(),
          monthCursor.getUTCMonth() + 1,
          1
        ));
      }

      const periodPayments = payments
        .filter((payment) => payment.date >= periodStart && payment.date <= periodEnd)
        .reduce((sum, payment) => sum + payment.amount, 0);
      const currentMonthPayments = payments.filter(
        (payment) => payment.date >= periodStart && payment.date <= periodEnd
      );
      const futurePrepayments = [...currentAllocationByMonth.entries()]
        .filter(([month]) => month > periodString)
        .reduce((sum, [, amount]) => sum + amount, 0);
      const monthEndNetBalance = round2(arrears - advanceBalance);
      const outstandingReceivable = round2(Math.max(0, monthEndNetBalance));
      const advanceRentReceived = round2(
        Math.max(0, -monthEndNetBalance) + futurePrepayments
      );
      const latestPayment = currentMonthPayments.at(-1);
      const isVerified =
        currentMonthPayments.length > 0 &&
        currentMonthPayments.every(
          (payment) => String(payment.status).toUpperCase() === 'VERIFIED'
        );
      const statusBadge =
        outstandingReceivable === 0
          ? 'FULLY_PAID'
          : currentMonthAppliedAmount > 0
            ? 'PARTIALLY_PAID'
            : 'OUTSTANDING';

      plazaAgreed += currentMonthAgreed;
      plazaPrior += priorMonthReceivable;
      plazaReceived += periodPayments;
      plazaOutstanding += outstandingReceivable;
      plazaAdvance += advanceRentReceived;

      return {
        unitId: unit._id,
        unitName: unit.unitName,
        tenantName: unit.tenantName || 'Unassigned',
        dueDay: unit.dueDay ? `${unit.dueDay}th` : '1st',
        agreedRent: currentMonthAgreed,
        priorMonthReceivable: round2(priorMonthReceivable),
        currentMonthActualRent: currentMonthAgreed,
        receivedAmount: round2(periodPayments),
        receivedDate: latestPayment
          ? latestPayment.date.toISOString().split('T')[0]
          : '-',
        receivingAccountName: latestPayment?.accountName || '-',
        renewalDate: unit.renewalDate
          ? new Date(unit.renewalDate).toISOString().split('T')[0]
          : 'N/A',
        outstandingReceivable,
        advanceRentReceived,
        statusBadge,
        isCheckedByFahad: isVerified,
        checkedBy: latestPayment?.checkedBy || (isVerified ? 'Fahad Sb' : 'Pending'),
        outstanding: outstandingReceivable,
        receivedDateForReport: latestPayment
          ? latestPayment.date.toISOString().split('T')[0]
          : '-',
        receivingAccount: latestPayment?.accountName || '-',
      };
    });

    const collectionRate =
      plazaAgreed > 0 ? Math.round((plazaReceived / plazaAgreed) * 100) : 0;
    plazaAgreed = round2(plazaAgreed);
    plazaPrior = round2(plazaPrior);
    plazaReceived = round2(plazaReceived);
    plazaOutstanding = round2(plazaOutstanding);
    plazaAdvance = round2(plazaAdvance);

    grandTotalAgreed += plazaAgreed;
    grandTotalPrior += plazaPrior;
    grandTotalReceived += plazaReceived;
    grandTotalOutstanding += plazaOutstanding;
    grandTotalAdvance += plazaAdvance;

    return {
      plazaId: property._id,
      plazaName: property.plazaName,
      location: property.location || '',
      city: property.city || '',
      unitsCount: units.length,
      totalUnits: units.length,
      agreedRent: plazaAgreed,
      receivedAmount: plazaReceived,
      outstanding: plazaOutstanding,
      collectionRate,
      subtotals: {
        agreedRent: plazaAgreed,
        priorReceivable: plazaPrior,
        currentDue: plazaAgreed,
        receivedAmount: plazaReceived,
        outstandingReceivable: plazaOutstanding,
        advanceRentReceived: plazaAdvance,
        collectionRate,
      },
      units,
    };
  });

  grandTotalAgreed = round2(grandTotalAgreed);
  grandTotalPrior = round2(grandTotalPrior);
  grandTotalReceived = round2(grandTotalReceived);
  grandTotalOutstanding = round2(grandTotalOutstanding);
  grandTotalAdvance = round2(grandTotalAdvance);

  return {
    period: periodString,
    properties: plazaSummaries,
    plazas: plazaSummaries,
    grandTotals: {
      totalAgreedRent: grandTotalAgreed,
      grandTotalAgreed: grandTotalAgreed,
      totalPriorReceivable: grandTotalPrior,
      totalCurrentDue: grandTotalAgreed,
      totalReceivedAmount: grandTotalReceived,
      grandTotalReceived: grandTotalReceived,
      totalOutstandingReceivable: grandTotalOutstanding,
      grandTotalOutstanding: grandTotalOutstanding,
      totalAdvanceRentReceived: grandTotalAdvance,
      collectionRate:
        grandTotalAgreed > 0
          ? Math.round((grandTotalReceived / grandTotalAgreed) * 100)
          : 0,
    },
  };
};
