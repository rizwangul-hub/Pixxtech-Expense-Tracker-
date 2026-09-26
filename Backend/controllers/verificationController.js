import mongoose from 'mongoose';
import PendingEntry from '../models/PendingEntry.js';
import Transaction from '../models/Transaction.js';
import RentReceived from '../models/RentReceived.js';
import RentDue from '../models/RentDue.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import Category from '../models/Category.js';
import Account from '../models/Account.js';
import Payroll from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import StaffLoan from '../models/StaffLoan.js';
import { createTransaction, round2, suggestNextVoucherNumber } from '../services/ledgerService.js';
import { getOrCreateOtherIncomeClearingAccount } from './otherIncomeController.js';
import {
  getOrCreateEmployeeSalaryCategory,
  getOrCreateSalaryExpenseAccount,
  getOrCreateSalariesCategory,
} from './payrollController.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';
import { validateExpenseClassification } from '../services/expenseClassificationService.js';
import { generateReceiptEvidencePDF } from '../services/pdfReportService.js';

/**
 * Generate sequential Receipt Number for Rent
 */
const generateReceiptNumber = async (rentMonth) => {
  const cleanMonth = (rentMonth || new Date().toISOString().slice(0, 7)).replace('-', '');
  const prefix = `REC-${cleanMonth}-`;
  const count = await RentReceived.countDocuments({
    receiptNumber: { $regex: `^${prefix}` },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

/**
 * Get or create Transfer category
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
 * Get or create Rental Income category
 */
const getOrCreateRentalIncomeCategory = async () => {
  let category = await Category.findOne({
    $or: [{ name: /Rental Income/i }, { name: /Rent/i }],
    isRentalHead: true,
  });
  if (!category) {
    category = await Category.findOne({ isRentalHead: true });
  }
  if (!category) {
    category = await Category.create({
      name: 'Rental Income',
      type: 'INCOME',
      isRentalHead: true,
      reportGroup: 'Rent',
      isActive: true,
    });
  }
  return category;
};

/**
 * Get or create Clearing Account
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
 * @desc    Get all pending entries with multi-filter & pagination
 * @route   GET /api/verification/pending
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const getPendingEntries = async (req, res) => {
  try {
    const {
      status,
      entryType,
      submittedBy,
      propertyId,
      tenantId,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};

    if (status && status !== 'ALL') {
      query.status =
        status === 'PENDING_VERIFICATION'
          ? { $in: ['PENDING_VERIFICATION', 'EDITED'] }
          : status;
    } else if (!status) {
      // Default to unverified / pending entries if no status filter parameter is specified
      query.status = { $in: ['PENDING_VERIFICATION', 'EDITED'] };
    }

    if (entryType && entryType !== 'ALL') {
      query.entryType = entryType;
    }

    if (submittedBy && mongoose.Types.ObjectId.isValid(submittedBy)) query.submittedBy = submittedBy;
    if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) query.propertyId = propertyId;
    if (tenantId && mongoose.Types.ObjectId.isValid(tenantId)) query.tenantId = tenantId;

    if (startDate || endDate) {
      query.submittedAt = {};
      if (startDate) query.submittedAt.$gte = new Date(startDate);
      if (endDate) query.submittedAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { voucherNo: regex },
        { detail: regex },
        { submittedByName: regex },
        { referenceNumber: regex },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await Promise.all([
      PendingEntry.find(query)
        .populate('submittedBy', 'name email role')
        .populate('verifiedBy', 'name email role')
        .populate('rejectedBy', 'name email role')
        .populate('propertyId', 'plazaName location')
        .populate('tenantId', 'fullName phone')
        .populate('agreementId', 'agreementNumber monthlyRent')
        .populate('categoryId', 'name type isRentalHead')
        .populate('drAccountId', 'name type currentBalance bankName cashHolder')
        .populate('crAccountId', 'name type currentBalance bankName cashHolder')
        .populate('receivingAccountId', 'name type currentBalance bankName cashHolder')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PendingEntry.countDocuments(query),
    ]);

    const salaryEntries = entries.filter((entry) => entry.entryType === 'SALARY');
    if (salaryEntries.length > 0) {
      const salaryIds = salaryEntries
        .map((entry) => entry.entryData?.payrollId)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
      const payrollDocs = salaryIds.length > 0
        ? await Payroll.find({ _id: { $in: salaryIds } })
            .select('employeeName employeeId designation department basicSalary allowance allowanceReason grossSalary loanDeduction lopDeduction otherDeduction totalDeduction netPayable totalInstallmentsPaid salaryInstallments paymentStatus')
            .lean()
        : [];
      const payrollMap = new Map(payrollDocs.map((doc) => [doc._id.toString(), doc]));

      // Also look up by employeeId + payrollMonth for any salary entry without payrollId or missing in map
      const missingEntries = salaryEntries.filter((e) => !payrollMap.has(String(e.entryData?.payrollId)));
      if (missingEntries.length > 0) {
        const orConditions = missingEntries
          .map((e) => {
            const empId = e.tenantId || e.entryData?.employeeId || e.entryData?.payrollSnapshot?.employeeId;
            const month = e.rentMonth || e.entryData?.month;
            if (empId && month && mongoose.Types.ObjectId.isValid(empId)) {
              return { employeeId: empId, payrollMonth: month };
            }
            return null;
          })
          .filter(Boolean);
        if (orConditions.length > 0) {
          const extraDocs = await Payroll.find({ $or: orConditions })
            .select('employeeName employeeId designation department basicSalary allowance allowanceReason grossSalary loanDeduction lopDeduction otherDeduction totalDeduction netPayable totalInstallmentsPaid salaryInstallments paymentStatus')
            .lean();
          extraDocs.forEach((doc) => {
            payrollMap.set(doc._id.toString(), doc);
            payrollMap.set(`${doc.employeeId.toString()}_${doc.payrollMonth}`, doc);
          });
        }
      }

      const empIds = salaryEntries
        .map((e) => e.tenantId || e.entryData?.employeeId || e.entryData?.payrollSnapshot?.employeeId)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
      const empDocs = empIds.length > 0
        ? await Employee.find({ _id: { $in: empIds } }).select('name loanBalance designation department').lean()
        : [];
      const empMap = new Map(empDocs.map((e) => [e._id.toString(), e]));

      entries.forEach((entry) => {
        if (entry.entryType !== 'SALARY') return;
        const snapshot = entry.entryData?.payrollSnapshot;
        const pIdStr = String(entry.entryData?.payrollId || '');
        const empId = entry.tenantId || entry.entryData?.employeeId || snapshot?.employeeId;
        const month = entry.rentMonth || entry.entryData?.month;
        const payroll = payrollMap.get(pIdStr) || payrollMap.get(`${String(empId)}_${month}`);
        const emp = empMap.get(String(empId));
        const currentLoanBalance = emp ? (emp.loanBalance || 0) : 0;

        const employeeName = snapshot?.employeeName || payroll?.employeeName || entry.submittedByName || '';
        const designation = snapshot?.designation || payroll?.designation || '';
        const department = snapshot?.department || payroll?.department || '';
        const basicSalary = Number(snapshot?.basicSalary ?? payroll?.basicSalary ?? 0);
        const allowance = Number(snapshot?.allowance ?? payroll?.allowance ?? 0);
        const allowanceReason = snapshot?.allowanceReason || payroll?.allowanceReason || '';
        const grossSalary = Number(snapshot?.grossSalary ?? payroll?.grossSalary ?? 0);
        const loanDed = Number(snapshot?.loanDeduction ?? entry.entryData?.loanDeduction ?? payroll?.loanDeduction ?? 0);
        const lopDed = Number(snapshot?.lopDeduction ?? payroll?.lopDeduction ?? 0);
        const otherDed = Number(snapshot?.otherDeduction ?? payroll?.otherDeduction ?? 0);
        const totalDed = Number(snapshot?.totalDeduction ?? (loanDed + lopDed + otherDed));
        const netPayable = Number(snapshot?.netPayable ?? payroll?.netPayable ?? Math.max(0, grossSalary - totalDed));

        // LIVE alreadyPaid from actual Payroll document in MongoDB
        const alreadyPaid = round2(payroll ? (payroll.totalInstallmentsPaid || 0) : (snapshot?.totalInstallmentsPaid || 0));
        const thisPayout = round2(entry.amount || 0);
        const totalPaidAfterThis = round2(alreadyPaid + thisPayout);
        const remainingAfterThis = Math.max(0, round2(netPayable - totalPaidAfterThis));
        const isFullySettled = (remainingAfterThis <= 0.01);

        entry.salaryDetails = {
          employeeName,
          employeeId: empId,
          designation,
          department,
          basicSalary,
          allowance,
          allowanceReason,
          grossSalary,
          loanDeduction: loanDed,
          lopDeduction: lopDed,
          otherDeduction: otherDed,
          totalDeduction: totalDed,
          netPayable,
          alreadyPaid,
          thisPayout,
          totalPaidAfterThis,
          remainingAfterThis,
          remainingPayable: remainingAfterThis, // for compatibility
          isFullySettled,
          paymentStatus: payroll?.paymentStatus || snapshot?.paymentStatus || 'PENDING_PAYMENT',
          installments: payroll?.salaryInstallments || snapshot?.salaryInstallments || [],
          currentLoanBalance,
        };
      });
    }

    return apiSuccess(
      res,
      {
        entries,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum,
        },
      },
      `Retrieved ${entries.length} pending entries.`
    );
  } catch (error) {
    console.error('[Get Pending Entries Error]:', error);
    return apiError(res, error.message || 'Failed to fetch pending entries.', 500);
  }
};

/**
 * @desc    Get verification summary counts and KPIs
 * @route   GET /api/verification/summary
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const getVerificationSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      pendingRentCount,
      pendingExpenseCount,
      pendingTransferCount,
      totalPendingCount,
      submittedTodayCount,
      submittedBySarfrazCount,
      recentlyVerifiedCount,
      recentlyRejectedCount,
    ] = await Promise.all([
      PendingEntry.countDocuments({ status: { $in: ['PENDING_VERIFICATION', 'EDITED'] }, entryType: 'RENT' }),
      PendingEntry.countDocuments({ status: { $in: ['PENDING_VERIFICATION', 'EDITED'] }, entryType: 'EXPENSE' }),
      PendingEntry.countDocuments({ status: { $in: ['PENDING_VERIFICATION', 'EDITED'] }, entryType: 'TRANSFER' }),
      PendingEntry.countDocuments({ status: { $in: ['PENDING_VERIFICATION', 'EDITED'] } }),
      PendingEntry.countDocuments({ submittedAt: { $gte: today } }),
      PendingEntry.countDocuments({
        $or: [
          { submittedByName: { $regex: /Sarfraz|entry/i } },
        ],
      }),
      PendingEntry.countDocuments({ status: 'VERIFIED', verifiedAt: { $gte: sevenDaysAgo } }),
      PendingEntry.countDocuments({ status: 'REJECTED', rejectedAt: { $gte: sevenDaysAgo } }),
    ]);

    return apiSuccess(
      res,
      {
        pendingRentCount,
        pendingExpenseCount,
        pendingTransferCount,
        totalPendingCount,
        submittedTodayCount,
        submittedBySarfrazCount,
        recentlyVerifiedCount,
        recentlyRejectedCount,
      },
      'Verification summary KPIs calculated.'
    );
  } catch (error) {
    console.error('[Get Verification Summary Error]:', error);
    return apiError(res, error.message || 'Failed to calculate verification summary.', 500);
  }
};

/**
 * @desc    Get entries submitted by logged-in Data Entry user
 * @route   GET /api/verification/my-submissions
 * @access  Private (Authenticated)
 */
export const getMySubmissions = async (req, res) => {
  try {
    const query = {
      $or: [
        { submittedBy: req.user._id },
        { status: { $in: ['PENDING_VERIFICATION', 'EDITED'] } },
      ],
    };

    const entries = await PendingEntry.find(query)
      .populate('submittedBy', 'name email role')
      .populate('propertyId', 'plazaName')
      .populate('tenantId', 'fullName')
      .populate('categoryId', 'name')
      .populate('drAccountId', 'name')
      .populate('crAccountId', 'name')
      .populate('receivingAccountId', 'name')
      .sort({ submittedAt: -1 })
      .limit(100)
      .lean();

    return apiSuccess(res, entries, `Found ${entries.length} submissions.`);
  } catch (error) {
    console.error('[Get My Submissions Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve your submissions.', 500);
  }
};

/**
 * @desc    Get single pending entry by ID
 * @route   GET /api/verification/:id
 * @access  Private (Authenticated)
 */
export const getPendingEntryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid pending entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id)
      .populate('submittedBy', 'name email role')
      .populate('verifiedBy', 'name email role')
      .populate('rejectedBy', 'name email role')
      .populate('propertyId', 'plazaName location')
      .populate('tenantId', 'fullName phone')
      .populate('agreementId', 'agreementNumber monthlyRent')
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type currentBalance bankName cashHolder')
      .populate('crAccountId', 'name type currentBalance bankName cashHolder')
      .populate('receivingAccountId', 'name type currentBalance bankName cashHolder')
      .lean();

    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    return apiSuccess(res, entry, 'Pending entry details retrieved.');
  } catch (error) {
    console.error('[Get Pending Entry Detail Error]:', error);
    return apiError(res, error.message || 'Failed to retrieve pending entry details.', 500);
  }
};

/**
 * @desc    Edit a pending entry before verification
 * @route   PUT /api/verification/:id
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const updatePendingEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    if (entry.status === 'VERIFIED') {
      return apiError(res, 'Cannot edit an entry that has already been verified and posted.', 400);
    }

    const previousSnapshot = {
      amount: entry.amount,
      date: entry.date,
      rentMonth: entry.rentMonth,
      detail: entry.detail,
      expenseClassification: entry.expenseClassification,
      attachments: entry.attachments || [],
      propertyId: entry.propertyId,
      unitId: entry.unitId,
      tenantId: entry.tenantId,
      categoryId: entry.categoryId,
      drAccountId: entry.drAccountId,
      crAccountId: entry.crAccountId,
      receivingAccountId: entry.receivingAccountId,
      entryData: entry.entryData,
    };

    const updates = req.body;
    if (updates.amount !== undefined) entry.amount = round2(Number(updates.amount));
    if (updates.date) entry.date = new Date(updates.date);
    if (updates.rentMonth) entry.rentMonth = updates.rentMonth;
    if (updates.detail !== undefined) entry.detail = updates.detail.trim();
    if (updates.voucherNo !== undefined) entry.voucherNo = updates.voucherNo.trim();
    if (updates.propertyId) entry.propertyId = updates.propertyId;
    if (updates.propertyId === null || updates.propertyId === '') entry.propertyId = null;
    if (updates.unitId) entry.unitId = updates.unitId;
    if (updates.unitId === null || updates.unitId === '') entry.unitId = null;
    if (updates.attachments !== undefined) {
      entry.attachments = updates.attachments || [];
      if (entry.entryData) {
        entry.entryData.attachments = entry.attachments;
        entry.markModified('entryData');
      }
    }
    if (updates.expenseClassification !== undefined) {
      entry.expenseClassification = updates.expenseClassification || null;
    }
    if (updates.tenantId) entry.tenantId = updates.tenantId;
    if (updates.categoryId) entry.categoryId = updates.categoryId;
    if (updates.drAccountId) entry.drAccountId = updates.drAccountId;
    if (updates.crAccountId) entry.crAccountId = updates.crAccountId;
    if (updates.receivingAccountId) entry.receivingAccountId = updates.receivingAccountId;

    const paidFromAcc = updates.paidFromAccountId || updates.crAccountId;
    if (paidFromAcc) {
      entry.crAccountId = paidFromAcc;
      if (entry.entryType === 'SALARY') {
        entry.receivingAccountId = paidFromAcc;
        if (!entry.entryData) entry.entryData = {};
        entry.entryData.paidFromAccountId = paidFromAcc;
        entry.markModified('entryData');
      }
    }

    if (entry.entryType === 'EXPENSE') {
      const classification = await validateExpenseClassification({
        expenseClassification: entry.expenseClassification,
        expenseScope: updates.expenseScope,
        propertyExpenseType: updates.propertyExpenseType,
        propertyId: entry.propertyId,
        unitId: entry.unitId,
      });
      entry.expenseClassification = classification.expenseClassification;
      entry.propertyId = classification.propertyId;
      entry.unitId = classification.unitId;
    } else if (entry.entryType === 'SALARY') {
      const grossSalary = updates.grossSalary !== undefined ? round2(Number(updates.grossSalary)) : undefined;
      const loanDeduction = updates.loanDeduction !== undefined ? round2(Number(updates.loanDeduction)) : undefined;
      const lopDeduction = updates.lopDeduction !== undefined ? round2(Number(updates.lopDeduction)) : undefined;
      const otherDeduction = updates.otherDeduction !== undefined ? round2(Number(updates.otherDeduction)) : undefined;

      const currentGross = grossSalary !== undefined ? grossSalary : Number(entry.entryData?.payrollSnapshot?.grossSalary ?? entry.amount ?? 0);
      const currentLoan = loanDeduction !== undefined ? loanDeduction : Number(entry.entryData?.loanDeduction ?? entry.entryData?.payrollSnapshot?.loanDeduction ?? 0);
      const currentLop = lopDeduction !== undefined ? lopDeduction : Number(entry.entryData?.payrollSnapshot?.lopDeduction ?? 0);
      const currentOther = otherDeduction !== undefined ? otherDeduction : Number(entry.entryData?.payrollSnapshot?.otherDeduction ?? 0);

      const totalDed = round2(currentLoan + currentLop + currentOther);
      const calculatedNetPayable = round2(Math.max(0, currentGross - totalDed));
      const netPayable = updates.netPayable !== undefined ? round2(Number(updates.netPayable)) : calculatedNetPayable;

      if (!entry.entryData) entry.entryData = {};
      if (!entry.entryData.payrollSnapshot) entry.entryData.payrollSnapshot = {};

      if (grossSalary !== undefined) entry.entryData.payrollSnapshot.grossSalary = grossSalary;
      if (loanDeduction !== undefined) {
        entry.entryData.loanDeduction = loanDeduction;
        entry.entryData.payrollSnapshot.loanDeduction = loanDeduction;
      }
      if (lopDeduction !== undefined) entry.entryData.payrollSnapshot.lopDeduction = lopDeduction;
      if (otherDeduction !== undefined) entry.entryData.payrollSnapshot.otherDeduction = otherDeduction;
      entry.entryData.payrollSnapshot.totalDeduction = totalDed;
      entry.entryData.payrollSnapshot.netPayable = netPayable;
      entry.markModified('entryData');

      if (updates.amount !== undefined) {
        entry.amount = round2(Number(updates.amount));
      }

      // Also sync to linked Payroll document
      const payrollId = entry.entryData?.payrollId;
      const employeeId = entry.tenantId || entry.entryData?.employeeId;
      const month = entry.rentMonth || entry.entryData?.month;
      let pDoc = null;
      if (payrollId && mongoose.Types.ObjectId.isValid(payrollId)) {
        pDoc = await Payroll.findById(payrollId);
      }
      if (!pDoc && employeeId && month) {
        pDoc = await Payroll.findOne({ employeeId, payrollMonth: month });
      }
      if (pDoc) {
        if (paidFromAcc && mongoose.Types.ObjectId.isValid(paidFromAcc)) {
          const accObj = await Account.findById(paidFromAcc).select('name');
          if (accObj) {
            pDoc.paidFromAccountId = accObj._id;
            pDoc.paidFromAccountName = accObj.name;
          }
        }
        if (grossSalary !== undefined) pDoc.grossSalary = grossSalary;
        if (loanDeduction !== undefined) pDoc.loanDeduction = loanDeduction;
        if (lopDeduction !== undefined) pDoc.lopDeduction = lopDeduction;
        if (otherDeduction !== undefined) pDoc.otherDeduction = otherDeduction;
        pDoc.totalDeduction = totalDed;
        pDoc.netPayable = netPayable;
        await pDoc.save();
      }
    }

    entry.status = 'EDITED';
    entry.isEdited = true;
    entry.editedBy = req.user._id;
    entry.editedByName = req.user.name;
    entry.editedAt = new Date();
    entry.auditLog.push({
      action: 'EDITED',
      performedBy: req.user.name,
      performedById: req.user._id,
      timestamp: new Date(),
      notes: updates.editNotes || 'Information modified prior to approval',
      changes: { previous: previousSnapshot, updated: updates },
    });

    await entry.save();

    const populated = await PendingEntry.findById(entry._id)
      .populate('propertyId', 'plazaName')
      .populate('tenantId', 'fullName')
      .populate('categoryId', 'name')
      .populate('drAccountId', 'name')
      .populate('crAccountId', 'name')
      .populate('receivingAccountId', 'name')
      .lean();

    return apiSuccess(res, populated, 'Pending entry updated successfully.');
  } catch (error) {
    console.error('[Update Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to update pending entry.', 400);
  }
};

/**
 * @desc    Verify and officially post a pending entry to the Central Ledger
 * @route   POST /api/verification/:id/verify
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const verifyEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    // Strict idempotency: prevent double posting
    if (entry.status === 'VERIFIED') {
      return apiError(res, 'This entry has already been verified and posted to the central ledger.', 400);
    }

    if (entry.status === 'REJECTED') {
      return apiError(res, 'Cannot verify an entry that has already been rejected.', 400);
    }

    let postedTransaction = null;
    let postedRentReceived = null;

    if (entry.entryType === 'EXPENSE') {
      // Older pending vouchers could contain a user/category ID in drAccountId
      // because the expense form did not have a separate debit-account field.
      // Use the system clearing account only when the stored reference is not
      // an actual account; valid account references still go through normal
      // active-account validation in createTransaction.
      const debitAccount = entry.drAccountId
        ? await Account.findById(entry.drAccountId).select('_id')
        : null;
      if (!debitAccount) {
        const clearingAccount = await getOrCreateOtherIncomeClearingAccount();
        entry.drAccountId = clearingAccount._id;
        entry.auditLog.push({
          action: 'ACCOUNT_REFERENCE_NORMALIZED',
          performedBy: req.user.name,
          performedById: req.user._id,
          timestamp: new Date(),
          notes: 'Replaced a missing or invalid debit-account reference with the system clearing account during verification.',
        });
      }

      // 1. Post expense voucher transaction
      postedTransaction = await createTransaction({
        date: entry.date || new Date(),
        voucherNo: entry.voucherNo,
        detail: entry.detail || `Expense Voucher #${entry.voucherNo}`,
        categoryId: entry.categoryId,
        drAccountId: entry.drAccountId,
        crAccountId: entry.crAccountId,
        amount: entry.amount,
        transactionType: 'EXPENSE',
        propertyId: entry.propertyId,
        unitId: entry.unitId,
        expenseClassification: entry.expenseClassification,
        attachments: entry.attachments || [],
        rentMonth: entry.rentMonth,
        status: 'VERIFIED',
        checkedBy: req.user.name,
        createdBy: entry.submittedBy,
      });

      entry.postedTransactionId = postedTransaction._id;
    } else if (entry.entryType === 'RENT') {
      // 2. Post rent receipt
      const cleanMonth = entry.rentMonth || new Date().toISOString().slice(0, 7);
      const receiptNumber = entry.voucherNo || (await generateReceiptNumber(cleanMonth));

      const rentalCategory = await getOrCreateRentalIncomeCategory();
      const clearingAccount = await getOrCreateClearingAccount(entry.receivingAccountId);

      // Auto-resolve agreementId and tenantId if missing on entry
      let agreementDoc = entry.agreementId ? await RentalAgreement.findById(entry.agreementId).lean() : null;
      if (!agreementDoc && entry.unitId) {
        agreementDoc = await RentalAgreement.findOne({ unitId: entry.unitId, status: { $in: ['ACTIVE', 'PENDING_RENEWAL'] } }).sort({ createdAt: -1 }).lean()
          || await RentalAgreement.findOne({ unitId: entry.unitId }).sort({ createdAt: -1 }).lean();
      }
      let tenantDoc = entry.tenantId ? await Tenant.findById(entry.tenantId).lean() : null;
      if (!tenantDoc && agreementDoc?.tenantId) {
        tenantDoc = await Tenant.findById(agreementDoc.tenantId).lean();
      }
      const resolvedAgreementId = agreementDoc?._id || entry.agreementId || null;
      const resolvedTenantId = tenantDoc?._id || agreementDoc?.tenantId || entry.tenantId || null;
      entry.agreementId = resolvedAgreementId;
      entry.tenantId = resolvedTenantId;

      const propertyDoc = entry.propertyId ? await Property.findById(entry.propertyId).lean() : null;
      const plazaName = propertyDoc?.plazaName || 'Property';
      const tenantName = tenantDoc?.fullName || 'Tenant';

      const narration = entry.detail || `Rent Received: ${plazaName} - Unit (${tenantName}) for ${cleanMonth}. Receipt ${receiptNumber}`;

      // Create official transaction
      postedTransaction = await createTransaction({
        date: entry.date || new Date(),
        voucherNo: receiptNumber,
        detail: narration,
        categoryId: rentalCategory._id,
        drAccountId: entry.receivingAccountId,
        crAccountId: clearingAccount._id,
        amount: entry.amount,
        propertyId: entry.propertyId,
        unitId: entry.unitId,
        tenantId: resolvedTenantId,
        agreementId: resolvedAgreementId,
        attachments: entry.attachments || [],
        rentMonth: cleanMonth,
        transactionType: 'INCOME',
        reference: entry.referenceNumber || '',
        checkedBy: req.user.name,
        status: 'VERIFIED',
        createdBy: entry.submittedBy,
      });

      // Update RentDue dues allocation if agreement exists
      let allocatedCurrent = entry.amount;
      let allocatedPrior = 0;
      let allocatedAdvance = 0;

      if (resolvedAgreementId) {
        const currentRentDue = await RentDue.findOne({
          agreementId: resolvedAgreementId,
          rentMonth: cleanMonth,
        });

        if (currentRentDue) {
          const newTotalPaid = round2((currentRentDue.paidAmount || 0) + entry.amount);
          currentRentDue.paidAmount = newTotalPaid;
          currentRentDue.status = newTotalPaid >= currentRentDue.expectedRentAmount ? 'PAID' : 'PARTIAL';
          await currentRentDue.save();
        }
      }

      // Create official RentReceived document
      postedRentReceived = await RentReceived.create({
        receiptNumber,
        receiptDate: entry.date || new Date(),
        tenantId: resolvedTenantId,
        propertyId: entry.propertyId,
        unitId: entry.unitId,
        agreementId: resolvedAgreementId,
        rentMonth: cleanMonth,
        amount: entry.amount,
        allocatedCurrentMonth: allocatedCurrent,
        allocatedPreviousReceivable: allocatedPrior,
        allocatedAdvance,
        receivingAccountId: entry.receivingAccountId,
        paymentMethod: entry.paymentMethod || 'CASH',
        referenceNumber: entry.referenceNumber || '',
        description: narration,
        status: 'VERIFIED',
        transactionId: postedTransaction._id,
        attachments: entry.attachments || [],
        checkedBy: req.user.name,
        checkedAt: new Date(),
        createdBy: entry.submittedBy,
      });

      entry.postedTransactionId = postedTransaction._id;
      entry.postedRentReceivedId = postedRentReceived._id;
    } else if (entry.entryType === 'TRANSFER') {
      const transferCategory = await getOrCreateTransferCategory();
      const drAcc = entry.drAccountId || entry.receivingAccountId;
      const crAcc = entry.crAccountId;

      postedTransaction = await createTransaction({
        date: entry.date || new Date(),
        voucherNo: entry.voucherNo,
        detail: entry.detail || `Internal Transfer #${entry.voucherNo}`,
        categoryId: transferCategory._id,
        drAccountId: drAcc,
        crAccountId: crAcc,
        amount: entry.amount,
        transactionType: 'TRANSFER',
        attachments: entry.attachments || [],
        status: 'VERIFIED',
        checkedBy: req.user.name,
        createdBy: entry.submittedBy,
      });

      entry.postedTransactionId = postedTransaction._id;
    } else if (entry.entryType === 'SALARY') {
      const salariesCategory = await getOrCreateSalariesCategory();
      const salaryCategory = await getOrCreateEmployeeSalaryCategory(
        entry.salaryDetails?.employeeName || entry.entryData?.payrollSnapshot?.employeeName,
        salariesCategory
      );
      const salaryExpenseAccount = await getOrCreateSalaryExpenseAccount();
      const paidFromAccountId = entry.crAccountId;
      const netAmount = round2(entry.amount);

      const account = await Account.findById(paidFromAccountId);
      if (!account) {
        return apiError(res, 'Selected Finance Bank/Cash Account not found.', 404);
      }
      if (account.currentBalance < netAmount) {
        return apiError(
          res,
          `Insufficient balance in "${account.name}". Current Balance: Rs. ${account.currentBalance}, Required: Rs. ${netAmount}.`,
          400
        );
      }

      const payrollForValidation = entry.entryData?.payrollId
        ? await Payroll.findById(entry.entryData.payrollId)
        : null;
      if (payrollForValidation) {
        const alreadyPaid = round2(payrollForValidation.totalInstallmentsPaid || 0);
        const remainingPayable = round2(Math.max(0, payrollForValidation.netPayable - alreadyPaid));
        if (netAmount > remainingPayable) {
          return apiError(
            res,
            `This salary installment exceeds the remaining payable amount of Rs. ${remainingPayable.toFixed(2)}.`,
            400
          );
        }
      }

      // 1. Create Transaction in Central Ledger
      postedTransaction = await createTransaction({
        date: entry.date || new Date(),
        voucherNo: entry.voucherNo,
        detail: entry.detail || `Salary Payout to Employee — Month ${entry.rentMonth}`,
        categoryId: salaryCategory._id,
        drAccountId: salaryExpenseAccount._id,
        crAccountId: paidFromAccountId,
        amount: netAmount,
        transactionType: 'EXPENSE',
        expenseClassification: 'GENERAL_EXPENSE',
        reportCategory: 'Payments',
        sourceModule: 'EXPENSE',
        sourceId: entry.entryData?.payrollId || null,
        attachments: entry.attachments || [],
        status: 'VERIFIED',
        checkedBy: req.user.name,
        createdBy: entry.submittedBy,
      });

      // 2. Update Payroll document payment status & loan repayment
      const payrollId = entry.entryData?.payrollId;
      const employeeId = entry.tenantId || entry.entryData?.employeeId;
      const month = entry.rentMonth || entry.entryData?.month;

      let pDoc = payrollForValidation;
      if (!pDoc && payrollId) {
        pDoc = await Payroll.findById(payrollId);
      } else if (employeeId && month) {
        pDoc = await Payroll.findOne({ employeeId, payrollMonth: month });
      }

      if (pDoc) {
        // Sync payroll metrics from snapshot if submitted via data entry
        const snapshot = entry.entryData?.payrollSnapshot;
        if (snapshot) {
          if (snapshot.grossSalary) pDoc.grossSalary = Number(snapshot.grossSalary);
          if (snapshot.loanDeduction !== undefined) pDoc.loanDeduction = Number(snapshot.loanDeduction);
          if (snapshot.lopDeduction !== undefined) pDoc.lopDeduction = Number(snapshot.lopDeduction);
          if (snapshot.otherDeduction !== undefined) pDoc.otherDeduction = Number(snapshot.otherDeduction);
          if (snapshot.totalDeduction !== undefined) pDoc.totalDeduction = Number(snapshot.totalDeduction);
          if (snapshot.netPayable) pDoc.netPayable = Number(snapshot.netPayable);
        } else if (entry.entryData?.loanDeduction !== undefined) {
          pDoc.loanDeduction = Number(entry.entryData.loanDeduction);
        }

        const totalPaid = round2(pDoc.totalInstallmentsPaid || 0);
        const updatedTotalPaid = round2(totalPaid + netAmount);
        pDoc.totalInstallmentsPaid = updatedTotalPaid;
        pDoc.status = updatedTotalPaid >= pDoc.netPayable ? 'PAID' : 'FINALIZED';
        pDoc.paymentStatus = updatedTotalPaid >= pDoc.netPayable ? 'PAID' : 'PARTIAL_PAYMENT';
        pDoc.paidFromAccountId = account._id;
        pDoc.paidFromAccountName = account.name;
        pDoc.paymentDate = entry.date || new Date();
        pDoc.paidDate = entry.date || new Date();
        pDoc.transactionId = postedTransaction._id;
        pDoc.voucherNo = entry.voucherNo;
        pDoc.paymentMethod = entry.paymentMethod || 'BANK_TRANSFER';
        const disburseDate = entry.date || new Date();
        const dMonth = `${new Date(disburseDate).getUTCFullYear()}-${String(new Date(disburseDate).getUTCMonth() + 1).padStart(2, '0')}`;
        pDoc.salaryInstallments = pDoc.salaryInstallments || [];
        pDoc.salaryInstallments.push({
          amount: netAmount,
          paymentDate: disburseDate,
          disbursementMonth: entry.entryData?.disbursementMonth || dMonth,
          paidFromAccountId: account._id,
          paidFromAccountName: account.name,
          paymentMethod: entry.entryData?.paymentMethod || 'BANK_TRANSFER',
          voucherNo: entry.voucherNo,
          transactionId: postedTransaction._id,
          notes: entry.detail,
          paidBy: req.user?.name || 'Verifier',
        });
        await pDoc.save();

        // 3. Process Loan Deductions — decreases employee loan balance
        const loanDed = Number(pDoc.loanDeduction ?? entry.entryData?.loanDeduction ?? 0);
        if (loanDed > 0) {
          const emp = await Employee.findById(pDoc.employeeId);
          if (emp) {
            const existingLoanRec = await StaffLoan.findOne({
              employeeId: emp._id,
              payrollMonth: month,
              type: 'REPAYMENT',
            });

            if (!existingLoanRec) {
              const prevBal = emp.loanBalance || 0;
              const newBal = Math.max(0, prevBal - loanDed);
              emp.loanBalance = newBal;
              await emp.save();

              await StaffLoan.create({
                employeeId: emp._id,
                type: 'REPAYMENT',
                amount: loanDed,
                previousBalance: prevBal,
                newBalance: newBal,
                payrollMonth: month,
                description: `Salary Loan Deduction for ${month} (Verified by ${req.user.name})`,
                createdBy: req.user._id,
              });
            } else if (existingLoanRec.amount !== loanDed) {
              const diff = loanDed - (existingLoanRec.amount || 0);
              const prevBal = emp.loanBalance || 0;
              const newBal = Math.max(0, prevBal - diff);
              emp.loanBalance = newBal;
              await emp.save();

              existingLoanRec.amount = loanDed;
              existingLoanRec.newBalance = newBal;
              existingLoanRec.description = `Salary Loan Deduction for ${month} (Verified by ${req.user.name})`;
              await existingLoanRec.save();
            }
          }
        }
      }

      entry.postedTransactionId = postedTransaction._id;
    }

    entry.status = 'VERIFIED';
    entry.verifiedBy = req.user._id;
    entry.verifiedByName = req.user.name;
    entry.verifiedAt = new Date();
    entry.auditLog.push({
      action: 'VERIFIED_AND_POSTED',
      performedBy: req.user.name,
      performedById: req.user._id,
      timestamp: new Date(),
      notes: `Verified by ${req.user.name} and officially posted to central ledger.`,
    });

    await entry.save();

    return apiSuccess(
      res,
      {
        pendingEntry: entry,
        transaction: postedTransaction,
        rentReceived: postedRentReceived,
      },
      `Entry verified and successfully posted to central financial ledger.`,
      200
    );
  } catch (error) {
    console.error('[Verify Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to verify entry.', 400);
  }
};

/**
 * @desc    Reject a pending entry
 * @route   POST /api/verification/:id/reject
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const rejectEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason = 'Entry rejected by auditor' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    if (entry.status === 'VERIFIED') {
      return apiError(res, 'Cannot reject an entry that has already been verified and posted.', 400);
    }

    entry.status = 'REJECTED';
    entry.rejectedBy = req.user._id;
    entry.rejectedByName = req.user.name;
    entry.rejectedAt = new Date();
    entry.rejectionReason = rejectionReason.trim();
    entry.auditLog.push({
      action: 'REJECTED',
      performedBy: req.user.name,
      performedById: req.user._id,
      timestamp: new Date(),
      notes: `Rejected by ${req.user.name}. Reason: ${rejectionReason}`,
    });

    await entry.save();

    return apiSuccess(
      res,
      entry,
      `Entry marked as REJECTED. No financial transaction created.`
    );
  } catch (error) {
    console.error('[Reject Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to reject entry.', 400);
  }
};

/**
 * @desc    Delete a pending entry
 * @route   DELETE /api/verification/:id
 * @access  Private (VERIFICATION_MANAGER, ADMIN, ADMIN_PUBLISHER)
 */
export const deletePendingEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry ID.', 400);
    }

    const entry = await PendingEntry.findById(id);
    if (!entry) {
      return apiError(res, 'Pending entry not found.', 404);
    }

    if (entry.status === 'VERIFIED') {
      return apiError(res, 'Cannot delete an entry that has already been posted to the central ledger.', 400);
    }

    await PendingEntry.findByIdAndDelete(id);

    return apiSuccess(res, { id }, 'Pending entry deleted.');
  } catch (error) {
    console.error('[Delete Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to delete pending entry.', 500);
  }
};

/**
 * @desc    Submit a temporary/pending entry (Data Entry / Sarfraz)
 * @route   POST /api/verification/submit
 * @access  Private (DATA_ENTRY, VERIFIER, VERIFICATION_MANAGER)
 */
export const createPendingEntry = async (req, res) => {
  try {
    const {
      entryType, // 'RENT' or 'EXPENSE'
      amount,
      date,
      voucherNo,
      rentMonth,
      propertyId,
      unitId,
      tenantId,
      agreementId,
      categoryId,
      drAccountId,
      crAccountId,
      receivingAccountId,
      detail,
      paymentMethod,
      referenceNumber,
    } = req.body;

    if (!entryType || !['RENT', 'EXPENSE'].includes(entryType)) {
      return apiError(res, 'Valid entryType (RENT or EXPENSE) is required.', 400);
    }

    let finalClassification = null;
    let finalPropertyId = propertyId || null;
    let finalUnitId = unitId || null;

    if (entryType === 'EXPENSE') {
      const classificationResult = await validateExpenseClassification({
        expenseClassification: req.body.expenseClassification,
        expenseScope: req.body.expenseScope,
        propertyExpenseType: req.body.propertyExpenseType,
        propertyId,
        unitId,
      });
      finalClassification = classificationResult.expenseClassification;
      finalPropertyId = classificationResult.propertyId;
      finalUnitId = classificationResult.unitId;
    }

    const entryDate = date ? new Date(date) : new Date();
    const finalVoucherNo = voucherNo && voucherNo.trim() ? voucherNo.trim() : await suggestNextVoucherNumber(entryDate);

    const pending = await PendingEntry.create({
      entryType,
      amount: numAmount,
      date: entryDate,
      voucherNo: finalVoucherNo,
      rentMonth: rentMonth || null,
      propertyId: finalPropertyId,
      unitId: finalUnitId,
      expenseClassification: finalClassification,
      tenantId: tenantId || null,
      agreementId: agreementId || null,
      categoryId: categoryId || null,
      drAccountId: drAccountId || null,
      crAccountId: crAccountId || null,
      receivingAccountId: receivingAccountId || null,
      detail: detail ? detail.trim() : '',
      paymentMethod: paymentMethod || 'CASH',
      referenceNumber: referenceNumber ? referenceNumber.trim() : '',
      entryData: req.body,
      status: 'PENDING_VERIFICATION',
      submittedBy: req.user._id,
      submittedByName: req.user.name,
      submittedAt: new Date(),
      auditLog: [
        {
          action: 'SUBMITTED',
          performedBy: req.user.name,
          performedById: req.user._id,
          timestamp: new Date(),
          notes: `Temporary entry submitted by ${req.user.name}. Awaiting review and verification by Khurshid Anwar.`,
        },
      ],
    });

    const populated = await PendingEntry.findById(pending._id)
      .populate('propertyId', 'plazaName')
      .populate('tenantId', 'fullName')
      .populate('categoryId', 'name')
      .populate('drAccountId', 'name')
      .populate('crAccountId', 'name')
      .populate('receivingAccountId', 'name')
      .lean();

    return apiSuccess(
      res,
      populated,
      'Temporary entry submitted successfully. Awaiting review and verification by Khurshid Anwar.',
      201
    );
  } catch (error) {
    console.error('[Create Pending Entry Error]:', error);
    return apiError(res, error.message || 'Failed to submit pending entry.', 400);
  }
};

/**
 * @desc    Download Official Receipt Evidence Slip PDF
 *          Generates formatted A4 PDF containing top voucher/entry details
 *          (date, voucher no, submitter, property, accounts, amount, narration)
 *          with attached purchase / receipt picture(s) positioned below.
 * @route   GET /api/verification/:id/receipt-pdf
 * @access  Private (Authenticated)
 */
export const downloadReceiptEvidencePDF = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid entry or transaction ID.', 400);
    }

    // 1. Try finding in PendingEntry
    let entry = await PendingEntry.findById(id)
      .populate('propertyId', 'plazaName propertyName propertyCode location address units')
      .populate('tenantId', 'fullName tenantName name phone cnic')
      .populate('agreementId', 'agreementNumber monthlyRent')
      .populate('categoryId', 'name type isRentalHead')
      .populate('drAccountId', 'name type bankName accountNumber cashHolder')
      .populate('crAccountId', 'name type bankName accountNumber cashHolder')
      .populate('receivingAccountId', 'name type bankName accountNumber cashHolder')
      .populate('submittedBy', 'name email role')
      .populate('verifiedBy', 'name email role')
      .lean();

    // 2. If not found in PendingEntry, try finding in Transaction
    if (!entry) {
      entry = await Transaction.findById(id)
        .populate('propertyId', 'plazaName propertyName propertyCode location address units')
        .populate('tenantId', 'fullName tenantName name phone cnic')
        .populate('categoryId', 'name type isRentalHead')
        .populate('drAccountId', 'name type bankName accountNumber cashHolder')
        .populate('crAccountId', 'name type bankName accountNumber cashHolder')
        .populate('createdBy', 'name email role')
        .lean();
    }

    if (!entry) {
      return apiError(res, 'Transaction or Pending Entry record not found.', 404);
    }

    // Extract attachments safely
    const rawAttachments =
      (entry.attachments && entry.attachments.length > 0)
        ? entry.attachments
        : (entry.entryData?.attachments && entry.entryData.attachments.length > 0)
        ? entry.entryData.attachments
        : [];

    const attachments = rawAttachments
      .map((att, idx) => {
        const url = typeof att === 'string' ? att : att?.url;
        if (!url) return null;
        const caption = (typeof att === 'object' && att?.originalName)
          ? att.originalName
          : `Receipt Evidence Image #${idx + 1}`;
        return {
          url,
          index: idx + 1,
          caption,
        };
      })
      .filter(Boolean);

    if (attachments.length === 0) {
      return apiError(res, 'No purchase or receipt image attachments found on this record.', 404);
    }

    // Resolve property & unit
    let propertyName =
      entry.propertyId?.plazaName ||
      entry.propertyId?.propertyName ||
      entry.entryData?.property?.plazaName ||
      entry.entryData?.property?.name ||
      '';
    let unitName = '';
    if (entry.propertyId?.units && entry.unitId) {
      const u = entry.propertyId.units.find(
        (un) => un._id?.toString() === entry.unitId?.toString()
      );
      if (u) unitName = u.unitName || u.unitNumber || '';
    }
    if (!unitName && entry.entryData?.unit?.unitName) {
      unitName = entry.entryData.unit.unitName;
    }

    // Resolve tenant
    const tenantName =
      entry.tenantId?.fullName ||
      entry.tenantId?.tenantName ||
      entry.entryData?.tenant?.fullName ||
      '';

    // Resolve accounts & names
    const submittedByName =
      entry.submittedByName ||
      entry.submittedBy?.name ||
      entry.createdBy?.name ||
      'Sarfraz';

    const verifiedByName =
      entry.verifiedByName ||
      entry.verifiedBy?.name ||
      entry.checkedBy ||
      'Khurshid Anwar';

    const categoryName =
      entry.categoryId?.name ||
      entry.entryData?.category?.name ||
      'General';

    let drAccountName =
      entry.drAccountId?.name ||
      entry.receivingAccountId?.name ||
      entry.entryData?.drAccount?.name ||
      '';
    let crAccountName =
      entry.crAccountId?.name ||
      entry.entryData?.crAccount?.name ||
      '';

    if (entry.entryType === 'RENT') {
      drAccountName = drAccountName || 'Receiving Account';
      // Rent evidence should identify the credited unit, not only the
      // technical clearing account used by the ledger.
      const rentLocationName = [propertyName, unitName].filter(Boolean).join(' - ');
      crAccountName = rentLocationName || crAccountName || 'Rental Income / Clearing';
    } else {
      drAccountName = drAccountName || categoryName;
      crAccountName = crAccountName || 'Payment Account (Bank/Cash)';
    }

    const isVerified =
      entry.status === 'VERIFIED' ||
      entry.status === 'POSTED' ||
      Boolean(entry.verifiedAt);

    const isRent =
      entry.entryType === 'RENT' ||
      entry.reportCategory === 'Rent' ||
      entry.sourceModule === 'RENT_RECEIVED';

    const documentTitle = isRent
      ? 'OFFICIAL RENT RECEIPT EVIDENCE'
      : entry.entryType === 'TRANSFER'
      ? 'BANK / CASH TRANSFER EVIDENCE'
      : 'OFFICIAL PURCHASE & EXPENSE RECEIPT EVIDENCE';

    const voucherNo =
      entry.voucherNo ||
      entry.voucherNumber ||
      id.toString().slice(-6).toUpperCase();

    const evidenceData = {
      _id: entry._id,
      voucherNo,
      date: entry.date || entry.submittedAt || new Date(),
      documentTitle,
      isVerified,
      submittedByName,
      submittedAtFormatted: entry.submittedAt ? new Date(entry.submittedAt).toLocaleString('en-PK') : '',
      verifiedByName,
      propertyName,
      unitName,
      tenantName,
      rentMonth: entry.rentMonth || null,
      categoryName,
      drAccountName,
      crAccountName,
      referenceNumber: entry.referenceNumber || entry.reference || '',
      paymentMethod: entry.paymentMethod || 'CASH',
      detail: entry.detail || entry.entryData?.detail || 'Purchase / Expense Evidence',
      amount: round2(entry.amount),
      attachments,
    };

    const pdfBuffer = await generateReceiptEvidencePDF(evidenceData);
    const cleanFilename = `Receipt_Evidence_VN${voucherNo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('[Download Receipt Evidence PDF Error]:', error);
    return apiError(res, error.message || 'Failed to generate receipt evidence PDF.', 500);
  }
};

export default {
  getPendingEntries,
  getVerificationSummary,
  getMySubmissions,
  getPendingEntryById,
  updatePendingEntry,
  verifyEntry,
  rejectEntry,
  deletePendingEntry,
  createPendingEntry,
  downloadReceiptEvidencePDF,
};
