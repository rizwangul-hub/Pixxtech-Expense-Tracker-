import fs from 'fs';
import path from 'path';

const filePath = path.resolve('Backend/controllers/payrollController.js');
let content = fs.readFileSync(filePath, 'utf8');

const updatedFunctions = `export const paySingleSalary = async (req, res) => {
  try {
    const {
      month,
      employeeId,
      payrollId,
      paidFromAccountId,
      paymentMethod = 'BANK_TRANSFER',
      paymentNotes = '',
      paymentDate = new Date(),
      paymentAmount,
      amount,
    } = req.body;

    if (!month || (!employeeId && !payrollId) || !paidFromAccountId) {
      return apiError(res, 'Month (YYYY-MM), employeeId/payrollId, and paidFromAccountId are required.', 400);
    }

    let pDoc = null;
    if (payrollId) {
      pDoc = await Payroll.findById(payrollId);
    } else {
      pDoc = await Payroll.findOne({ payrollMonth: month, employeeId });
    }

    if (!pDoc) {
      return apiError(res, 'Payroll record not found. Please calculate and save payroll first.', 404);
    }

    const totalPaid = round2(pDoc.totalInstallmentsPaid || 0);
    const remainingAmount = round2(Math.max(0, pDoc.netPayable - totalPaid));

    if (pDoc.paymentStatus === 'PAID' || remainingAmount <= 0) {
      return apiError(res, \`Salary for \${pDoc.employeeName} for \${month} is already fully PAID (Voucher: \${pDoc.voucherNo || 'N/A'}).\`, 400);
    }

    const rawAmount = paymentAmount !== undefined && paymentAmount !== '' ? paymentAmount : amount;
    const requestedAmount = rawAmount === undefined || rawAmount === '' ? remainingAmount : round2(Number(rawAmount));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return apiError(res, 'Payment amount must be greater than zero.', 400);
    }
    if (requestedAmount > remainingAmount + 0.01) {
      return apiError(
        res,
        \`Payment amount of Rs. \${formatPKR(requestedAmount)} cannot exceed the remaining salary of Rs. \${formatPKR(remainingAmount)}.\`,
        400
      );
    }

    const netAmount = Math.min(requestedAmount, remainingAmount);

    const account = await Account.findById(paidFromAccountId);
    if (!account) {
      return apiError(res, 'Selected Finance Bank/Cash Account not found.', 404);
    }
    if (!account.isActive) {
      return apiError(res, \`Account "\${account.name}" is inactive.\`, 400);
    }

    const salariesCategory = await getOrCreateSalariesCategory();
    const clearingAccount = await getOrCreateOtherIncomeClearingAccount();

    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    const endOfMonthDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    let pDate = paymentDate ? new Date(paymentDate) : endOfMonthDate;
    if (isNaN(pDate.getTime()) || pDate.getUTCFullYear() !== year || (pDate.getUTCMonth() + 1) !== monthNum) {
      pDate = endOfMonthDate;
    }

    // Routing for Data Entry role (Sarfraz Khan): Create PendingEntry awaiting Khurshid's verification
    if (req.user?.role === 'DATA_ENTRY') {
      const pendingEntries = await PendingEntry.find({
        entryType: 'SALARY',
        status: { $in: ['PENDING_VERIFICATION', 'EDITED'] },
        'entryData.payrollId': pDoc._id,
      });

      const pendingSum = round2(pendingEntries.reduce((sum, item) => sum + (item.amount || 0), 0));
      const unsubmittedRemaining = round2(Math.max(0, remainingAmount - pendingSum));

      if (unsubmittedRemaining <= 0) {
        return apiError(
          res,
          \`A salary payout for \${pDoc.employeeName} of Rs. \${formatPKR(pendingSum)} is already awaiting verification by Khurshid Anwar. Please wait for verification before submitting another installment.\`,
          400
        );
      }

      if (netAmount > unsubmittedRemaining + 0.01) {
        return apiError(
          res,
          \`Requested amount of Rs. \${formatPKR(netAmount)} exceeds the unsubmitted balance of Rs. \${formatPKR(unsubmittedRemaining)} (Rs. \${formatPKR(pendingSum)} is currently pending verification).\`,
          400
        );
      }

      const voucherNo = await suggestNextVoucherNumber(pDate);

      const pending = await PendingEntry.create({
        entryType: 'SALARY',
        amount: netAmount,
        date: pDate,
        voucherNo,
        rentMonth: month,
        crAccountId: account._id,
        drAccountId: clearingAccount._id,
        receivingAccountId: account._id,
        detail: \`Salary Payout to \${pDoc.employeeName} (\${pDoc.designation}) — Month \${month}\`.trim(),
        tenantId: pDoc.employeeId,
        entryData: {
          payrollId: pDoc._id,
          employeeId: pDoc.employeeId,
          month,
          loanDeduction: pDoc.loanDeduction || 0,
          paidFromAccountId: account._id,
          paymentMethod,
          paymentNotes,
          paymentAmount: netAmount,
          payrollSnapshot: {
            basicSalary: pDoc.basicSalary || 0,
            allowance: pDoc.allowance || 0,
            allowanceReason: pDoc.allowanceReason || '',
            grossSalary: pDoc.grossSalary || 0,
            loanDeduction: pDoc.loanDeduction || 0,
            lopDeduction: pDoc.lopDeduction || 0,
            otherDeduction: pDoc.otherDeduction || 0,
            totalDeduction: pDoc.totalDeduction || 0,
            netPayable: pDoc.netPayable || 0,
            totalInstallmentsPaid: pDoc.totalInstallmentsPaid || 0,
            salaryInstallments: pDoc.salaryInstallments || [],
            paymentStatus: pDoc.paymentStatus || 'PENDING_PAYMENT',
          },
        },
        status: 'PENDING_VERIFICATION',
        submittedBy: req.user._id,
        submittedByName: req.user?.name || 'Sarfraz Khan',
        submittedAt: new Date(),
        auditLog: [
          {
            action: 'SUBMITTED',
            performedBy: req.user?.name || 'Sarfraz Khan',
            performedById: req.user._id,
            timestamp: new Date(),
            notes: \`Salary installment of Rs. \${formatPKR(netAmount)} submitted by Data Entry Operator. Awaiting review and verification by Khurshid Anwar.\`,
          },
        ],
      });

      pDoc.paymentStatus = 'PENDING_PAYMENT';
      await pDoc.save();

      return apiSuccess(
        res,
        { pendingEntry: pending, isPending: true, status: 'PENDING_VERIFICATION' },
        \`Salary payout installment of Rs. \${formatPKR(netAmount)} for \${pDoc.employeeName} submitted to Verification Queue. Bank funds will be disbursed upon Khurshid Anwar's approval.\`,
        201
      );
    }

    // Direct payout for Administrators (Khurshid Anwar / Fahad Sb)
    if (account.currentBalance < netAmount) {
      return apiError(
        res,
        \`Insufficient balance in "\${account.name}". Current Balance: Rs. \${formatPKR(account.currentBalance)}, Required: Rs. \${formatPKR(netAmount)}.\`,
        400
      );
    }

    const voucherNo = await suggestNextVoucherNumber(pDate);

    const transaction = await createTransaction({
      date: pDate,
      voucherNo,
      detail: \`Salary Payout to \${pDoc.employeeName} (\${pDoc.designation}) — Month \${month}\${paymentNotes ? '. ' + paymentNotes : ''}\`,
      categoryId: salariesCategory._id,
      drAccountId: clearingAccount._id,
      crAccountId: account._id,
      amount: netAmount,
      transactionType: 'EXPENSE',
      expenseClassification: 'GENERAL_EXPENSE',
      reportCategory: 'Payments',
      sourceModule: 'EXPENSE',
      sourceId: pDoc._id,
      createdBy: req.user?._id || null,
    });

    const updatedTotalPaid = round2(totalPaid + netAmount);
    const isFullyPaid = updatedTotalPaid >= round2(pDoc.netPayable) - 0.01;
    pDoc.totalInstallmentsPaid = updatedTotalPaid;
    pDoc.paymentStatus = isFullyPaid ? 'PAID' : 'PARTIAL_PAYMENT';
    pDoc.status = isFullyPaid ? 'PAID' : 'FINALIZED';
    pDoc.paidFromAccountId = account._id;
    pDoc.paidFromAccountName = account.name;
    pDoc.paymentDate = pDate;
    pDoc.paidDate = pDate;
    pDoc.transactionId = transaction._id;
    pDoc.voucherId = transaction.voucherId;
    pDoc.voucherNo = transaction.voucherNo;
    pDoc.paymentMethod = paymentMethod;
    pDoc.paymentNotes = paymentNotes;
    pDoc.salaryInstallments = pDoc.salaryInstallments || [];
    pDoc.salaryInstallments.push({
      amount: netAmount,
      paymentDate: pDate,
      paidFromAccountId: account._id,
      paidFromAccountName: account.name,
      paymentMethod,
      voucherNo: transaction.voucherNo,
      transactionId: transaction._id,
      notes: paymentNotes,
      paidBy: req.user?.name || 'Finance Manager',
      createdAt: new Date(),
    });
    await pDoc.save();

    // If an existing pending entry was waiting for this payroll record, mark it verified
    const activePending = await PendingEntry.findOne({
      entryType: 'SALARY',
      status: { $in: ['PENDING_VERIFICATION', 'EDITED'] },
      'entryData.payrollId': pDoc._id,
    });
    if (activePending) {
      activePending.status = 'VERIFIED';
      activePending.verifiedBy = req.user._id;
      activePending.verifiedByName = req.user.name;
      activePending.verifiedAt = new Date();
      activePending.postedTransactionId = transaction._id;
      await activePending.save();
    }

    await StaffAuditLog.create({
      userId: req.user?._id || null,
      userName: req.user?.name || 'Finance Manager',
      action: 'SALARY_PAID',
      recordId: pDoc._id.toString(),
      details: \`Paid salary of Rs. \${formatPKR(netAmount)} to \${pDoc.employeeName} from \${account.name} (Voucher: \${transaction.voucherNo}).\`,
      newValue: {
        amount: netAmount,
        account: account.name,
        voucherNo: transaction.voucherNo,
        remainingBalance: Math.max(0, pDoc.netPayable - updatedTotalPaid),
      },
    });

    return apiSuccess(
      res,
      {
        payroll: pDoc,
        transaction,
        voucherNo: transaction.voucherNo,
        updatedAccountBalance: round2((account.currentBalance || 0) - netAmount),
        isFullyPaid,
        amountPaid: netAmount,
        remainingBalance: round2(Math.max(0, pDoc.netPayable - updatedTotalPaid)),
      },
      isFullyPaid
        ? \`Salary of Rs. \${formatPKR(netAmount)} fully paid to \${pDoc.employeeName} from \${account.name}. Voucher: \${transaction.voucherNo}\`
        : \`Partial salary payout of Rs. \${formatPKR(netAmount)} recorded for \${pDoc.employeeName}. Remaining: Rs. \${formatPKR(pDoc.netPayable - updatedTotalPaid)}. Voucher: \${transaction.voucherNo}\`,
      201
    );
  } catch (error) {
    console.error('[Pay Single Salary Error]:', error);
    return apiError(res, error.message || 'Failed to process salary payment.', 500);
  }
};

/**
 * @desc    Pay multiple employee salaries in bulk from single Finance Account
 * @route   POST /api/staff/payroll/pay-bulk
 * @access  Private
 */
export const payBulkSalary = async (req, res) => {
  try {
    const {
      month,
      payrollIds = [],
      paidFromAccountId,
      paymentMethod = 'BANK_TRANSFER',
      paymentNotes = '',
      paymentDate = new Date(),
    } = req.body;

    if (!month || !Array.isArray(payrollIds) || payrollIds.length === 0 || !paidFromAccountId) {
      return apiError(res, 'Month, non-empty payrollIds array, and paidFromAccountId are required.', 400);
    }

    const account = await Account.findById(paidFromAccountId);
    if (!account || !account.isActive) {
      return apiError(res, 'Valid, active Finance Bank/Cash Account is required.', 400);
    }

    const payrollDocs = await Payroll.find({
      _id: { $in: payrollIds },
      payrollMonth: month,
      paymentStatus: { $ne: 'PAID' },
    });

    if (payrollDocs.length === 0) {
      return apiError(res, 'No eligible unpaid payroll records found for payout.', 400);
    }

    const totalRequired = round2(payrollDocs.reduce((sum, p) => sum + (p.netPayable - (p.totalInstallmentsPaid || 0)), 0));
    if (account.currentBalance < totalRequired) {
      return apiError(
        res,
        \`Insufficient account balance in "\${account.name}". Current: Rs. \${formatPKR(account.currentBalance)}, Total Required for \${payrollDocs.length} employees: Rs. \${formatPKR(totalRequired)}.\`,
        400
      );
    }

    const salariesCategory = await getOrCreateSalariesCategory();
    const clearingAccount = await getOrCreateOtherIncomeClearingAccount();
    
    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    const endOfMonthDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    let pDate = paymentDate ? new Date(paymentDate) : endOfMonthDate;
    if (isNaN(pDate.getTime()) || pDate.getUTCFullYear() !== year || (pDate.getUTCMonth() + 1) !== monthNum) {
      pDate = endOfMonthDate;
    }

    // Routing for Data Entry role (Sarfraz Khan): Create PendingEntry for each unpaid salary record
    if (req.user?.role === 'DATA_ENTRY') {
      const pendingResults = [];

      for (const pDoc of payrollDocs) {
        const remaining = round2(pDoc.netPayable - (pDoc.totalInstallmentsPaid || 0));
        if (remaining <= 0) continue;

        const existingPending = await PendingEntry.findOne({
          entryType: 'SALARY',
          status: { $in: ['PENDING_VERIFICATION', 'EDITED'] },
          'entryData.payrollId': pDoc._id,
        });

        if (existingPending) continue;

        const voucherNo = await suggestNextVoucherNumber(pDate);
        const pending = await PendingEntry.create({
          entryType: 'SALARY',
          amount: remaining,
          date: pDate,
          voucherNo,
          rentMonth: month,
          crAccountId: account._id,
          drAccountId: clearingAccount._id,
          receivingAccountId: account._id,
          detail: \`Salary Payout to \${pDoc.employeeName} (\${pDoc.designation}) — Month \${month}\`.trim(),
          tenantId: pDoc.employeeId,
          entryData: {
            payrollId: pDoc._id,
            employeeId: pDoc.employeeId,
            month,
            loanDeduction: pDoc.loanDeduction || 0,
            paidFromAccountId: account._id,
            paymentMethod,
            paymentNotes,
          },
          status: 'PENDING_VERIFICATION',
          submittedBy: req.user._id,
          submittedByName: req.user?.name || 'Sarfraz Khan',
          submittedAt: new Date(),
          auditLog: [
            {
              action: 'SUBMITTED',
              performedBy: req.user?.name || 'Sarfraz Khan',
              performedById: req.user._id,
              timestamp: new Date(),
              notes: \`Bulk salary payout entry submitted by Data Entry Operator. Awaiting review and verification by Khurshid Anwar.\`,
            },
          ],
        });

        pDoc.paymentStatus = 'PENDING_PAYMENT';
        await pDoc.save();

        pendingResults.push({
          employeeName: pDoc.employeeName,
          amount: remaining,
          voucherNo,
          pendingEntryId: pending._id,
        });
      }

      return apiSuccess(
        res,
        { count: pendingResults.length, totalAmount: totalRequired, pendingList: pendingResults, isPending: true },
        \`Submitted \${pendingResults.length} salary payouts totaling Rs. \${formatPKR(totalRequired)} to Verification Queue for Khurshid Anwar's approval.\`,
        201
      );
    }

    const results = [];
    for (const pDoc of payrollDocs) {
      const remaining = round2(pDoc.netPayable - (pDoc.totalInstallmentsPaid || 0));
      if (remaining <= 0) continue;

      const voucherNo = await suggestNextVoucherNumber(pDate);
      const transaction = await createTransaction({
        date: pDate,
        voucherNo,
        detail: \`Salary Payout to \${pDoc.employeeName} (\${pDoc.designation}) — Month \${month}\`,
        categoryId: salariesCategory._id,
        drAccountId: clearingAccount._id,
        crAccountId: account._id,
        amount: remaining,
        transactionType: 'EXPENSE',
        expenseClassification: 'GENERAL_EXPENSE',
        reportCategory: 'Payments',
        sourceModule: 'EXPENSE',
        sourceId: pDoc._id,
        createdBy: req.user?._id || null,
      });

      pDoc.status = 'PAID';
      pDoc.paymentStatus = 'PAID';
      pDoc.totalInstallmentsPaid = round2((pDoc.totalInstallmentsPaid || 0) + remaining);
      pDoc.paidFromAccountId = account._id;
      pDoc.paidFromAccountName = account.name;
      pDoc.paymentDate = pDate;
      pDoc.paidDate = pDate;
      pDoc.transactionId = transaction._id;
      pDoc.voucherId = transaction.voucherId;
      pDoc.voucherNo = transaction.voucherNo;
      pDoc.paymentMethod = paymentMethod;
      pDoc.paymentNotes = paymentNotes;
      pDoc.salaryInstallments = pDoc.salaryInstallments || [];
      pDoc.salaryInstallments.push({
        amount: remaining,
        paymentDate: pDate,
        paidFromAccountId: account._id,
        paidFromAccountName: account.name,
        paymentMethod,
        voucherNo: transaction.voucherNo,
        transactionId: transaction._id,
        notes: paymentNotes || 'Bulk Payout',
        paidBy: req.user?.name || 'Finance Manager',
        createdAt: new Date(),
      });
      await pDoc.save();

      results.push({
        employeeName: pDoc.employeeName,
        amount: remaining,
        voucherNo: transaction.voucherNo,
      });
    }

    await StaffAuditLog.create({
      userId: req.user?._id || null,
      userName: req.user?.name || 'Finance Manager',
      action: 'BULK_SALARY_PAID',
      recordId: month,
      details: \`Bulk paid \${results.length} employee salaries totaling Rs. \${formatPKR(totalRequired)} from \${account.name}.\`,
      newValue: { count: results.length, totalPaid: totalRequired, account: account.name },
    });

    return apiSuccess(
      res,
      { count: results.length, totalAmountPaid: totalRequired, paidList: results },
      \`Successfully disbursed \${results.length} employee salaries totaling Rs. \${formatPKR(totalRequired)} from \${account.name}.\`,
      201
    );
  } catch (error) {
    console.error('[Pay Bulk Salary Error]:', error);
    return apiError(res, error.message || 'Failed to process bulk salary payments.', 500);
  }
};
`;

const startPaySingle = content.indexOf('export const paySingleSalary = async');
const startReverse = content.indexOf('export const reverseSalaryPayment = async');

if (startPaySingle === -1 || startReverse === -1) {
  console.error('Could not find anchor points in payrollController.js');
  process.exit(1);
}

const newContent = content.slice(0, startPaySingle) + updatedFunctions + '\n/**\n * @desc    Reverse a paid salary transaction & restore bank/cash balance\n */\n' + content.slice(startReverse);

fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully updated paySingleSalary and payBulkSalary in payrollController.js');
