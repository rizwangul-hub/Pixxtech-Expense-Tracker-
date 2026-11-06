import mongoose from 'mongoose';
import Transaction from '../../models/Transaction.js';
import PendingEntry from '../../models/PendingEntry.js';
import Account from '../../models/Account.js';
import Category from '../../models/Category.js';
import Property from '../../models/Property.js';
import Employee from '../../models/Employee.js';
import StaffLoan from '../../models/StaffLoan.js';
import Payroll from '../../models/Payroll.js';
import RentReceived from '../../models/RentReceived.js';
import RentDue from '../../models/RentDue.js';
import RentalAgreement from '../../models/RentalAgreement.js';
import MonthlyReport from '../../models/MonthlyReport.js';
import { createTransaction, round2, suggestNextVoucherNumber, syncAccountBalances } from '../ledgerService.js';
import { recordAuditLog } from '../auditService.js';
import { getOrCreateOtherIncomeClearingAccount } from '../../controllers/otherIncomeController.js';
import { hasPermission, PERMISSIONS } from '../../middleware/auth.js';
import { AiError } from './assistantSecurity.js';

/**
 * Helper to ensure a rental income category exists
 */
const getOrCreateRentalIncomeCategory = async () => {
  let category = await Category.findOne({
    $or: [{ isRentalHead: true, type: 'INCOME' }, { name: /Rental Income/i }],
  });
  if (!category) {
    category = await Category.create({
      name: 'Rental Income',
      type: 'INCOME',
      isRentalHead: true,
    });
  }
  return category;
};

/**
 * Helper to ensure an internal funds transfer category exists
 */
const getOrCreateTransferCategory = async () => {
  let category = await Category.findOne({ type: 'TRANSFER' });
  if (!category) {
    category = await Category.findOne({ name: /transfer/i });
  }
  if (!category) {
    category = await Category.create({
      name: 'Internal Funds Transfer',
      type: 'TRANSFER',
      isRentalHead: false,
    });
  }
  return category;
};

/**
 * Helper to ensure a clearing account exists for double-entry credits
 */
const getOrCreateClearingAccount = async (receivingAccountId) => {
  let clearingAccount = await Account.findOne({
    $or: [
      { name: /Clearing/i },
      { name: /External Parties/i },
      { name: /Tenant Receivable/i },
    ],
    _id: { $ne: receivingAccountId },
  });

  if (!clearingAccount) {
    clearingAccount = await Account.create({
      name: 'External Parties / Rental Clearing',
      accountName: 'External Parties / Rental Clearing',
      type: 'CASH',
      accountType: 'CASH',
      cashHolder: 'Operations Clearing',
      currentBalance: 0,
      openingBalance: 0,
      isActive: true,
      notes: 'System clearing account for counterparty double-entry rent credits',
    });
  }

  return clearingAccount;
};

/**
 * Master Execution Engine for Confirmed AI Financial Operations
 */
export async function executeConfirmedAction(action, user) {
  if (!user || !user._id) {
    throw new AiError('Authentication required to perform financial entries.', 401);
  }

  if (!hasPermission(user, PERMISSIONS.ENTER_DATA)) {
    throw new AiError('You do not have permission to record financial transactions.', 403);
  }

  const { actionType, payload } = action;
  const isDataEntry = user.role === 'DATA_ENTRY';

  switch (actionType) {
    // -----------------------------------------------------------
    // 1. RENT COLLECTION
    // -----------------------------------------------------------
    case 'CREATE_RENT': {
      const { amount, propertyId, unitId, tenantId, agreementId, receivingAccountId, rentMonth, date, paymentMethod, description } = payload;
      const numAmount = round2(amount);

      if (numAmount <= 0) throw new AiError('Rent amount must be greater than zero.', 400);

      // DATA_ENTRY: Creates temporary pending entry
      if (isDataEntry) {
        const pending = await PendingEntry.create({
          entryType: 'RENT',
          amount: numAmount,
          date: date ? new Date(date) : new Date(),
          rentMonth,
          propertyId,
          unitId,
          tenantId,
          agreementId,
          receivingAccountId,
          paymentMethod: paymentMethod || 'CASH',
          detail: description || `Rent received for ${rentMonth}`,
          entryData: payload,
          status: 'PENDING_VERIFICATION',
          submittedBy: user._id,
          submittedByName: user.name,
          submittedAt: new Date(),
          auditLog: [
            {
              action: 'SUBMITTED_VIA_AI',
              performedBy: user.name,
              performedById: user._id,
              timestamp: new Date(),
              notes: 'Recorded via Pixx AI Finance Assistant (Awaiting review & verification).',
            },
          ],
        });

        await recordAuditLog({
          userId: user._id,
          userName: user.name,
          userRole: user.role,
          action: 'AI_RENT_STAGED',
          module: 'RENTAL',
          recordType: 'PendingEntry',
          recordId: String(pending._id),
          description: `Staged pending rent receipt of PKR ${numAmount.toLocaleString('en-PK')} via AI assistant.`,
        });

        return {
          success: true,
          isPending: true,
          actionType,
          voucherNo: `PENDING-${String(pending._id).slice(-6).toUpperCase()}`,
          message: `Rent collection of PKR ${numAmount.toLocaleString('en-PK')} recorded as temporary pending entry awaiting verification.`,
          record: pending,
        };
      }

      // VERIFIER / ADMIN: Post directly to verified journal
      const rentalCategory = await getOrCreateRentalIncomeCategory();
      const clearingAccount = await getOrCreateClearingAccount(receivingAccountId);

      // Generate receipt number
      const year = (rentMonth || new Date().toISOString().slice(0, 7)).slice(0, 4);
      const prefix = `RR-${year}-`;
      const latestRR = await RentReceived.findOne({ receiptNumber: new RegExp(`^${prefix}`) }).sort({ receiptNumber: -1 }).lean();
      let nextSeq = 1;
      if (latestRR && latestRR.receiptNumber) {
        const parts = latestRR.receiptNumber.split('-');
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
      const receiptNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;

      // Create RentReceived record
      const rentReceivedDoc = await RentReceived.create({
        receiptNumber,
        tenantId,
        agreementId,
        propertyId,
        unitId,
        rentMonth,
        receiptDate: date ? new Date(date) : new Date(),
        amount: numAmount,
        paymentMethod: paymentMethod || 'CASH',
        receivingAccountId,
        description: description || `Rent collection ${rentMonth}`,
        status: 'VERIFIED',
        checkedBy: user.name,
        createdBy: user._id,
      });

      // Post double-entry transaction
      const transaction = await createTransaction({
        date: date ? new Date(date) : new Date(),
        voucherNo: receiptNumber,
        detail: description || `Rent collection for ${rentMonth}`,
        categoryId: rentalCategory._id,
        drAccountId: receivingAccountId,
        crAccountId: clearingAccount._id,
        amount: numAmount,
        transactionType: 'INCOME',
        reportCategory: 'Rent',
        propertyId,
        unitId,
        rentMonth,
        status: 'VERIFIED',
        createdBy: user._id,
        checkedBy: user.name,
      });

      // Update account balances
      await syncAccountBalances([receivingAccountId]);

      // Record audit log
      await recordAuditLog({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'AI_RENT_RECORDED',
        module: 'RENTAL',
        recordType: 'Transaction',
        recordId: String(transaction._id),
        description: `Recorded rent receipt #${receiptNumber} of PKR ${numAmount.toLocaleString('en-PK')} via AI assistant.`,
      });

      return {
        success: true,
        isPending: false,
        actionType,
        voucherNo: receiptNumber,
        transactionId: String(transaction._id),
        message: `🎉 Rent collection of PKR ${numAmount.toLocaleString('en-PK')} recorded successfully! Voucher: ${receiptNumber}.`,
        record: rentReceivedDoc,
      };
    }

    // -----------------------------------------------------------
    // 2. EXPENSE VOUCHER
    // -----------------------------------------------------------
    case 'CREATE_EXPENSE': {
      const { amount, categoryId, crAccountId, propertyId, unitId, expenseClassification, voucherNo: suggestedVn, detail, date } = payload;
      const numAmount = round2(amount);

      if (numAmount <= 0) throw new AiError('Expense amount must be greater than zero.', 400);

      // Auto-resolve drAccountId (clearing account for simple single-entry expense voucher)
      const clearingAcc = await getOrCreateOtherIncomeClearingAccount();
      const drAccountId = clearingAcc._id;

      const voucherNo = suggestedVn || await suggestNextVoucherNumber(date ? new Date(date) : new Date());

      // DATA_ENTRY: Creates temporary pending entry
      if (isDataEntry) {
        const pending = await PendingEntry.create({
          entryType: 'EXPENSE',
          amount: numAmount,
          date: date ? new Date(date) : new Date(),
          voucherNo,
          detail: detail || 'Expense voucher',
          categoryId,
          drAccountId,
          crAccountId,
          propertyId: propertyId || null,
          unitId: unitId || null,
          expenseClassification: expenseClassification || 'GENERAL_EXPENSE',
          status: 'PENDING_VERIFICATION',
          submittedBy: user._id,
          submittedByName: user.name,
          submittedAt: new Date(),
          entryData: payload,
          auditLog: [
            {
              action: 'SUBMITTED_VIA_AI',
              performedBy: user.name,
              performedById: user._id,
              timestamp: new Date(),
              notes: 'Recorded via Pixx AI Finance Assistant (Awaiting review & verification).',
            },
          ],
        });

        await recordAuditLog({
          userId: user._id,
          userName: user.name,
          userRole: user.role,
          action: 'AI_EXPENSE_STAGED',
          module: 'EXPENSE',
          recordType: 'PendingEntry',
          recordId: String(pending._id),
          description: `Staged pending expense voucher #${voucherNo} for PKR ${numAmount.toLocaleString('en-PK')} via AI assistant.`,
        });

        return {
          success: true,
          isPending: true,
          actionType,
          voucherNo,
          message: `Expense voucher #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} submitted as temporary pending entry awaiting verification.`,
          record: pending,
        };
      }

      // VERIFIER / ADMIN: Direct journal posting
      const transaction = await createTransaction({
        date: date ? new Date(date) : new Date(),
        voucherNo,
        detail: detail || 'Expense voucher',
        categoryId,
        drAccountId,
        crAccountId,
        amount: numAmount,
        transactionType: 'EXPENSE',
        propertyId: propertyId || null,
        unitId: unitId || null,
        expenseClassification: expenseClassification || 'GENERAL_EXPENSE',
        status: 'VERIFIED',
        createdBy: user._id,
        checkedBy: user.name,
      });

      // Update account balances
      await syncAccountBalances([crAccountId]);

      await recordAuditLog({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'AI_EXPENSE_RECORDED',
        module: 'EXPENSE',
        recordType: 'Transaction',
        recordId: String(transaction._id),
        description: `Recorded expense voucher #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} via AI assistant.`,
      });

      return {
        success: true,
        isPending: false,
        actionType,
        voucherNo,
        transactionId: String(transaction._id),
        message: `🎉 Expense voucher #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} recorded successfully!`,
        record: transaction,
      };
    }

    // -----------------------------------------------------------
    // 3. INTERNAL ACCOUNT TRANSFER
    // -----------------------------------------------------------
    case 'CREATE_TRANSFER': {
      const { fromAccountId, toAccountId, amount, detail, voucherNo: customVn, date } = payload;
      const numAmount = round2(amount);

      if (numAmount <= 0) throw new AiError('Transfer amount must be greater than zero.', 400);
      if (String(fromAccountId) === String(toAccountId)) {
        throw new AiError('Source and destination accounts must be distinct.', 400);
      }

      const transferCategory = await getOrCreateTransferCategory();
      const dateStr = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
      const voucherNo = customVn || `TRF-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      // DATA_ENTRY: Creates temporary pending entry
      if (isDataEntry) {
        const pending = await PendingEntry.create({
          entryType: 'TRANSFER',
          amount: numAmount,
          date: date ? new Date(date) : new Date(),
          voucherNo,
          detail: detail || 'Internal funds transfer',
          categoryId: transferCategory._id,
          drAccountId: toAccountId,
          crAccountId: fromAccountId,
          receivingAccountId: toAccountId,
          entryData: payload,
          status: 'PENDING_VERIFICATION',
          submittedBy: user._id,
          submittedByName: user.name,
          submittedAt: new Date(),
          auditLog: [
            {
              action: 'SUBMITTED_VIA_AI',
              performedBy: user.name,
              performedById: user._id,
              timestamp: new Date(),
              notes: 'Internal transfer staged via Pixx AI Finance Assistant.',
            },
          ],
        });

        await recordAuditLog({
          userId: user._id,
          userName: user.name,
          userRole: user.role,
          action: 'AI_TRANSFER_STAGED',
          module: 'TRANSFER',
          recordType: 'PendingEntry',
          recordId: String(pending._id),
          description: `Staged pending transfer #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} via AI assistant.`,
        });

        return {
          success: true,
          isPending: true,
          actionType,
          voucherNo,
          message: `Internal transfer #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} submitted as temporary pending entry.`,
          record: pending,
        };
      }

      // VERIFIER / ADMIN: Post directly
      const transaction = await createTransaction({
        date: date ? new Date(date) : new Date(),
        voucherNo,
        detail: detail || 'Internal funds transfer',
        categoryId: transferCategory._id,
        drAccountId: toAccountId,
        crAccountId: fromAccountId,
        amount: numAmount,
        transactionType: 'TRANSFER',
        sourceModule: 'TRANSFER',
        status: 'VERIFIED',
        createdBy: user._id,
        checkedBy: user.name,
      });

      // Update balances for both accounts
      await syncAccountBalances([fromAccountId, toAccountId]);

      await recordAuditLog({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'AI_TRANSFER_RECORDED',
        module: 'TRANSFER',
        recordType: 'Transaction',
        recordId: String(transaction._id),
        description: `Executed internal transfer #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} via AI assistant.`,
      });

      return {
        success: true,
        isPending: false,
        actionType,
        voucherNo,
        transactionId: String(transaction._id),
        message: `🎉 Internal transfer #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} recorded successfully!`,
        record: transaction,
      };
    }

    // -----------------------------------------------------------
    // 4. EMPLOYEE LOAN DISBURSEMENT & REPAYMENT
    // -----------------------------------------------------------
    case 'CREATE_LOAN_DISBURSEMENT':
    case 'CREATE_LOAN_REPAYMENT': {
      const { employeeId, type, amount, description } = payload;
      const numAmount = round2(amount);

      if (numAmount <= 0) throw new AiError('Loan amount must be greater than zero.', 400);

      const employee = await Employee.findById(employeeId);
      if (!employee) throw new AiError('Employee not found.', 404);

      const prevBal = employee.loanBalance || 0;
      const isDisburse = type === 'DISBURSEMENT';
      const newBal = isDisburse ? prevBal + numAmount : Math.max(0, prevBal - numAmount);

      employee.loanBalance = newBal;
      await employee.save();

      const loanDoc = await StaffLoan.create({
        employeeId: employee._id,
        type: isDisburse ? 'DISBURSEMENT' : 'REPAYMENT',
        amount: numAmount,
        previousBalance: prevBal,
        newBalance: newBal,
        description: description || (isDisburse ? 'Advance Loan via AI' : 'Loan Repayment via AI'),
        createdBy: user._id,
      });

      await recordAuditLog({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: isDisburse ? 'AI_LOAN_DISBURSED' : 'AI_LOAN_REPAID',
        module: 'STAFF',
        recordType: 'StaffLoan',
        recordId: String(loanDoc._id),
        description: `${isDisburse ? 'Disbursed' : 'Repaid'} loan of PKR ${numAmount.toLocaleString('en-PK')} for ${employee.name}. Balance: PKR ${newBal.toLocaleString('en-PK')}.`,
      });

      return {
        success: true,
        isPending: false,
        actionType,
        message: isDisburse
          ? `🎉 Loan disbursement of PKR ${numAmount.toLocaleString('en-PK')} recorded for ${employee.name}. Current loan balance: PKR ${newBal.toLocaleString('en-PK')}.`
          : `🎉 Loan repayment of PKR ${numAmount.toLocaleString('en-PK')} recorded from ${employee.name}. Remaining loan balance: PKR ${newBal.toLocaleString('en-PK')}.`,
        record: loanDoc,
      };
    }

    // -----------------------------------------------------------
    // 5. SALARY PAYMENT
    // -----------------------------------------------------------
    case 'PAY_SALARY': {
      const { employeeId, employeeName, amount, disbursingAccountId, salaryMonth, date } = payload;
      const numAmount = round2(amount);

      if (numAmount <= 0) throw new AiError('Salary amount must be greater than zero.', 400);

      // Find or create salary category
      let salaryCategory = await Category.findOne({
        $or: [{ name: /salary/i }, { name: /salaries/i }],
      });
      if (!salaryCategory) {
        salaryCategory = await Category.create({ name: 'Salary', type: 'EXPENSE' });
      }

      // Update Payroll record status if exists
      const payroll = await Payroll.findOne({ employeeId, payrollMonth: salaryMonth });
      if (payroll) {
        payroll.status = 'PAID';
        payroll.paymentStatus = 'PAID';
        await payroll.save();
      }

      const clearingAcc = await getOrCreateOtherIncomeClearingAccount();
      const voucherNo = await suggestNextVoucherNumber(date ? new Date(date) : new Date());

      const transaction = await createTransaction({
        date: date ? new Date(date) : new Date(),
        voucherNo,
        detail: `Salary payment for ${employeeName} (${salaryMonth})`,
        categoryId: salaryCategory._id,
        drAccountId: clearingAcc._id,
        crAccountId: disbursingAccountId,
        amount: numAmount,
        transactionType: 'EXPENSE',
        reportCategory: 'Salary',
        status: isDataEntry ? 'PENDING' : 'VERIFIED',
        createdBy: user._id,
        checkedBy: user.name,
      });

      await syncAccountBalances([disbursingAccountId]);

      await recordAuditLog({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'AI_SALARY_PAID',
        module: 'PAYROLL',
        recordType: 'Transaction',
        recordId: String(transaction._id),
        description: `Recorded salary payment #${voucherNo} of PKR ${numAmount.toLocaleString('en-PK')} for ${employeeName} via AI assistant.`,
      });

      return {
        success: true,
        isPending: isDataEntry,
        actionType,
        voucherNo,
        transactionId: String(transaction._id),
        message: `🎉 Salary payment of PKR ${numAmount.toLocaleString('en-PK')} recorded for ${employeeName}! Voucher: ${voucherNo}.`,
        record: transaction,
      };
    }

    // -----------------------------------------------------------
    // 6. DELETE / REVERSE TRANSACTION
    // -----------------------------------------------------------
    case 'DELETE_TRANSACTION': {
      const { transactionId, voucherNo } = payload;
      const tx = await Transaction.findById(transactionId);
      if (!tx) throw new AiError('Transaction not found or already deleted.', 404);

      // Check locked period
      const txDate = tx.date ? new Date(tx.date) : new Date();
      const txMonth = `${txDate.getUTCFullYear()}-${String(txDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const isLocked = await MonthlyReport.findOne({ month: txMonth, status: 'PUBLISHED' }).lean();
      if (isLocked) {
        throw new AiError(`Financial period ${txMonth} is officially published and locked. Transaction cannot be deleted.`, 403);
      }

      const drAccId = tx.drAccountId;
      const crAccId = tx.crAccountId;
      const deletedAmount = tx.amount;

      await Transaction.findByIdAndDelete(transactionId);

      if (drAccId && crAccId) {
        await syncAccountBalances([drAccId, crAccId]);
      }

      await recordAuditLog({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'AI_TRANSACTION_DELETED',
        module: 'LEDGER',
        recordType: 'Transaction',
        recordId: transactionId,
        description: `Deleted voucher #${voucherNo} (PKR ${deletedAmount.toLocaleString('en-PK')}) and reversed account balances via AI assistant.`,
      });

      return {
        success: true,
        isPending: false,
        actionType,
        voucherNo,
        message: `🗑️ Voucher #${voucherNo} has been deleted and affected account balances were reversed successfully.`,
      };
    }

    // -----------------------------------------------------------
    // 7. EDIT TRANSACTION
    // -----------------------------------------------------------
    case 'EDIT_TRANSACTION': {
      const { transactionId, voucherNo, newAmount } = payload;
      const tx = await Transaction.findById(transactionId);
      if (!tx) throw new AiError('Transaction not found.', 404);

      const oldAmount = tx.amount;
      tx.amount = round2(newAmount);
      await tx.save();

      if (tx.drAccountId && tx.crAccountId) {
        await syncAccountBalances([tx.drAccountId, tx.crAccountId]);
      }

      await recordAuditLog({
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        action: 'AI_TRANSACTION_UPDATED',
        module: 'LEDGER',
        recordType: 'Transaction',
        recordId: transactionId,
        description: `Updated amount on voucher #${voucherNo} from PKR ${oldAmount.toLocaleString('en-PK')} to PKR ${newAmount.toLocaleString('en-PK')} via AI assistant.`,
      });

      return {
        success: true,
        isPending: false,
        actionType,
        voucherNo,
        message: `✏️ Voucher #${voucherNo} amount updated from PKR ${oldAmount.toLocaleString('en-PK')} to PKR ${newAmount.toLocaleString('en-PK')} successfully.`,
        record: tx,
      };
    }

    default:
      throw new AiError(`Unsupported financial operation: ${actionType}`, 400);
  }
}
