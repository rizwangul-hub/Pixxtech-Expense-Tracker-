import mongoose from 'mongoose';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import PendingEntry from '../models/PendingEntry.js';
import { createTransaction, round2 } from '../services/ledgerService.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

/**
 * Get or create the internal funds transfer category
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
 * @desc    Execute an atomic transfer between two accounts (Bank <-> Cash, Cash <-> Cash, Bank <-> Bank)
 * @route   POST /api/transfers
 * @access  Private (Admin, Admin Publisher, Data Entry)
 */
export const executeTransfer = async (req, res) => {
  try {
    const { fromAccountId, toAccountId, date, reference, voucherNo, attachments = [] } = req.body;
    const amount = req.transferAmount;
    const detail = req.transferNarration;

    // 1. Resolve Transfer Category
    const transferCategory = await getOrCreateTransferCategory();

    // 2. Generate sequential or timestamped voucher number if omitted
    const transferDate = date ? new Date(date) : new Date();
    const dateStr = transferDate.toISOString().slice(0, 10).replace(/-/g, '');
    const vNo =
      voucherNo ||
      reference ||
      `TRF-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. If submitted by DATA_ENTRY (Sarfraz), stage as PendingEntry awaiting Khurshid / Admin verification
    if (req.user?.role === 'DATA_ENTRY') {
      const validAttachments = Array.isArray(attachments)
        ? attachments.filter((a) => a && typeof a.url === 'string' && a.url && typeof a.publicId === 'string' && a.publicId)
        : [];

      const pending = await PendingEntry.create({
        entryType: 'TRANSFER',
        amount,
        date: transferDate,
        voucherNo: vNo,
        detail,
        categoryId: transferCategory._id,
        drAccountId: toAccountId,
        crAccountId: fromAccountId,
        receivingAccountId: toAccountId,
        attachments: validAttachments,
        referenceNumber: reference || '',
        entryData: {
          ...req.body,
          amount,
          detail,
          fromAccountId,
          toAccountId,
          voucherNo: vNo,
        },
        status: 'PENDING_VERIFICATION',
        submittedBy: req.user._id,
        submittedByName: req.user.name || 'Sarfraz Khan',
        submittedAt: new Date(),
        auditLog: [
          {
            action: 'SUBMITTED',
            performedBy: req.user.name || 'Sarfraz Khan',
            performedById: req.user._id,
            timestamp: new Date(),
            notes: `Internal funds transfer of Rs. ${amount.toLocaleString('en-PK')} submitted by Data Entry Operator. Awaiting review and verification by Admin before funds move.`,
          },
        ],
      });

      return apiSuccess(
        res,
        {
          pendingEntry: pending,
          isPending: true,
          status: 'PENDING_VERIFICATION',
        },
        `Transfer #${vNo} (Rs. ${amount.toLocaleString('en-PK')}) submitted to Verification Queue. Account balances will update upon Admin approval.`,
        201
      );
    }

    // 4. Double-entry transaction for ADMIN / VERIFIER roles:
    // Debit (drAccountId) increases receiving account (toAccountId)
    // Credit (crAccountId) decreases disbursing account (fromAccountId)
    const transaction = await createTransaction({
      date: transferDate,
      voucherNo: vNo,
      detail,
      categoryId: transferCategory._id,
      drAccountId: toAccountId,
      crAccountId: fromAccountId,
      amount,
      transactionType: 'TRANSFER',
      reference: reference || '',
      status: 'VERIFIED',
      createdBy: req.user?._id,
    });

    // 5. Fetch updated balances for both accounts
    const [updatedSource, updatedDest] = await Promise.all([
      Account.findById(fromAccountId).lean(),
      Account.findById(toAccountId).lean(),
    ]);

    return apiSuccess(
      res,
      {
        transaction,
        sourceAccount: {
          _id: updatedSource._id,
          name: updatedSource.name,
          accountName: updatedSource.accountName,
          type: updatedSource.type,
          previousBalance: round2((updatedSource.currentBalance || 0) + amount),
          currentBalance: round2(updatedSource.currentBalance || 0),
        },
        destinationAccount: {
          _id: updatedDest._id,
          name: updatedDest.name,
          accountName: updatedDest.accountName,
          type: updatedDest.type,
          previousBalance: round2((updatedDest.currentBalance || 0) - amount),
          currentBalance: round2(updatedDest.currentBalance || 0),
        },
      },
      'Funds transfer executed successfully.',
      201
    );
  } catch (error) {
    console.error('[Execute Transfer Error]:', error);
    return apiError(
      res,
      error.message || 'Failed to execute internal transfer.',
      error.status || 500
    );
  }
};

/**
 * @desc    Get all internal fund transfers with filtering, search & pagination
 * @route   GET /api/transfers
 * @access  Private (Authenticated)
 */
export const getTransfers = async (req, res) => {
  try {
    const {
      accountId,
      month,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 30,
    } = req.query;

    const transferCategory = await getOrCreateTransferCategory();

    const query = {
      $or: [
        { transactionType: 'TRANSFER' },
        { categoryId: transferCategory._id },
      ],
    };

    // Filter by specific account involved (either source or destination)
    if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
      const accObjId = new mongoose.Types.ObjectId(accountId);
      query.$and = [
        {
          $or: [{ drAccountId: accObjId }, { crAccountId: accObjId }],
        },
      ];
    }

    // Filter by month (YYYY-MM)
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, m] = month.split('-').map(Number);
      const start = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      query.date = { $gte: start, $lte: end };
    } else if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    // Search filter
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      const searchConditions = [{ detail: regex }, { voucherNo: regex }, { reference: regex }];
      if (query.$and) {
        query.$and.push({ $or: searchConditions });
      } else {
        query.$and = [{ $or: searchConditions }];
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 30));
    const skip = (pageNum - 1) * limitNum;

    const [totalCount, transfers, stats] = await Promise.all([
      Transaction.countDocuments(query),
      Transaction.find(query)
        .populate('drAccountId', 'name accountName type bankName cashHolder accountNumber')
        .populate('crAccountId', 'name accountName type bankName cashHolder accountNumber')
        .populate('categoryId', 'name type')
        .populate('createdBy', 'name email role')
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalVolume: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalVolume = stats.length > 0 ? round2(stats[0].totalVolume) : 0;

    return apiSuccess(
      res,
      {
        transfers,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum) || 1,
          limit: limitNum,
          totalCount,
        },
        summary: {
          totalTransfers: totalCount,
          totalVolumePKR: totalVolume,
        },
      },
      'Transfers retrieved successfully.'
    );
  } catch (error) {
    console.error('[Get Transfers Error]:', error);
    return apiError(res, 'Failed to retrieve transfers.', 500);
  }
};

/**
 * @desc    Get single transfer transaction by ID
 * @route   GET /api/transfers/:id
 * @access  Private (Authenticated)
 */
export const getTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, 'Invalid transfer transaction ID.', 400);
    }

    const transfer = await Transaction.findById(id)
      .populate('drAccountId', 'name accountName type bankName cashHolder accountNumber')
      .populate('crAccountId', 'name accountName type bankName cashHolder accountNumber')
      .populate('categoryId', 'name type')
      .populate('createdBy', 'name email role')
      .lean();

    if (!transfer) {
      return apiError(res, 'Transfer transaction not found.', 404);
    }

    return apiSuccess(res, transfer, 'Transfer details retrieved.');
  } catch (error) {
    console.error('[Get Transfer By ID Error]:', error);
    return apiError(res, 'Failed to retrieve transfer details.', 500);
  }
};

export default {
  executeTransfer,
  getTransfers,
  getTransferById,
};
