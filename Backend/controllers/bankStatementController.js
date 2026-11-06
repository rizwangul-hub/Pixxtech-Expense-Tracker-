import Account from '../models/Account.js';
import MonthlyReport from '../models/MonthlyReport.js';
import BankStatementAttachment from '../models/BankStatementAttachment.js';
import { isCloudinaryConfigured, configureCloudinary } from '../config/cloudinary.js';
import cloudinary from 'cloudinary';
import { Readable } from 'stream';

const uploadToCloudinary = (fileBuffer, originalname, mimetype) =>
  new Promise((resolve, reject) => {
    if (!configureCloudinary()) {
      return resolve(null);
    }
    const isPdf = mimetype === 'application/pdf';
    const stream = cloudinary.v2.uploader.upload_stream(
      {
        folder: 'pixx-expense-tracker/bank-statements',
        resource_type: isPdf ? 'raw' : 'image',
        public_id: `${Date.now()}-${originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      },
      (err, result) => {
        if (err) resolve(null);
        else resolve(result?.secure_url || null);
      }
    );
    Readable.from(fileBuffer).pipe(stream);
  });

/**
 * Get all bank statement attachments for a given month
 */
export const getMonthlyBankStatements = async (req, res) => {
  try {
    const { month } = req.params;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month in YYYY-MM format required.' });
    }

    const [statements, accounts] = await Promise.all([
      BankStatementAttachment.find({ month }).lean(),
      Account.find({ isActive: true, isClearing: { $ne: true } })
        .sort({ type: 1, name: 1 })
        .select('_id name type accountNumber currentBalance')
        .lean(),
    ]);

    const statementMap = new Map(statements.map((s) => [s.accountId.toString(), s]));

    const accountsWithStatements = accounts.map((acc) => {
      const stmt = statementMap.get(acc._id.toString());
      return {
        ...acc,
        attachmentId: stmt?._id || null,
        files: (stmt?.files || []).map((f) => ({
          _id: f._id,
          fileName: f.fileName,
          originalName: f.originalName,
          mimeType: f.mimeType,
          fileType: f.fileType,
          size: f.size,
          url: f.url,
          uploadedAt: f.uploadedAt,
          hasBase64: Boolean(f.dataBase64),
        })),
        fileCount: stmt?.files?.length || 0,
        pdfCount: stmt?.files?.filter((f) => f.fileType === 'PDF').length || 0,
        imageCount: stmt?.files?.filter((f) => f.fileType === 'IMAGE').length || 0,
        notes: stmt?.notes || '',
      };
    });

    return res.status(200).json({
      success: true,
      month,
      accounts: accountsWithStatements,
      totalStatementsAttached: statements.reduce((sum, s) => sum + (s.files?.length || 0), 0),
    });
  } catch (error) {
    console.error('getMonthlyBankStatements error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve bank statements.' });
  }
};

/**
 * Upload bank statement document(s) for a specific account and month
 */
export const uploadBankStatement = async (req, res) => {
  try {
    const { month } = req.params;
    const { accountId, notes } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month in YYYY-MM format required.' });
    }
    if (!accountId) {
      return res.status(400).json({ success: false, message: 'Account ID is required.' });
    }

    const account = await Account.findById(accountId).lean();
    if (!account) {
      return res.status(404).json({ success: false, message: 'Bank or Cash Account not found.' });
    }

    // Check lock
    const isLocked = await MonthlyReport.findOne({ month, status: 'PUBLISHED' }).lean();
    if (isLocked && req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: `Monthly report for ${month} is published and locked. Admin privileges required.`,
      });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one statement file (PDF or Image).' });
    }

    const allowedMimeTypes = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);

    const preparedFiles = [];

    for (const file of files) {
      if (!allowedMimeTypes.has(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file format for "${file.originalname}". Only PDF, JPG, PNG, and WEBP files are supported.`,
        });
      }

      const isPdf = file.mimetype === 'application/pdf';
      const fileType = isPdf ? 'PDF' : 'IMAGE';
      const base64Data = file.buffer.toString('base64');

      let cloudUrl = null;
      try {
        cloudUrl = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
      } catch (err) {
        console.warn('Cloudinary upload warning (fallback to base64):', err.message);
      }

      preparedFiles.push({
        fileName: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileType,
        size: file.size,
        url: cloudUrl || '',
        dataBase64: base64Data,
        uploadedAt: new Date(),
      });
    }

    let statementAttachment = await BankStatementAttachment.findOne({ month, accountId });

    if (!statementAttachment) {
      statementAttachment = new BankStatementAttachment({
        month,
        accountId: account._id,
        accountName: account.name,
        accountNumber: account.accountNumber || '',
        files: preparedFiles,
        uploadedBy: req.user?._id || null,
        uploadedByName: req.user?.name || 'System Operator',
        notes: notes || '',
      });
    } else {
      statementAttachment.files.push(...preparedFiles);
      if (notes) statementAttachment.notes = notes;
      statementAttachment.uploadedBy = req.user?._id || statementAttachment.uploadedBy;
      statementAttachment.uploadedByName = req.user?.name || statementAttachment.uploadedByName;
    }

    await statementAttachment.save();

    return res.status(200).json({
      success: true,
      message: `Successfully attached ${preparedFiles.length} statement file(s) to ${account.name}.`,
      attachment: {
        _id: statementAttachment._id,
        month: statementAttachment.month,
        accountId: statementAttachment.accountId,
        accountName: statementAttachment.accountName,
        files: statementAttachment.files.map((f) => ({
          _id: f._id,
          fileName: f.fileName,
          originalName: f.originalName,
          mimeType: f.mimeType,
          fileType: f.fileType,
          size: f.size,
          url: f.url,
          uploadedAt: f.uploadedAt,
        })),
      },
    });
  } catch (error) {
    console.error('uploadBankStatement error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to upload bank statement.' });
  }
};

/**
 * Delete a specific file from an attachment or the whole attachment
 */
export const deleteBankStatement = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileId } = req.query;

    const attachment = await BankStatementAttachment.findById(id);
    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Bank statement attachment not found.' });
    }

    // Check lock
    const isLocked = await MonthlyReport.findOne({ month: attachment.month, status: 'PUBLISHED' }).lean();
    if (isLocked && req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: `Monthly report for ${attachment.month} is published and locked. Admin privileges required.`,
      });
    }

    if (fileId) {
      attachment.files = attachment.files.filter((f) => f._id.toString() !== fileId.toString());
      if (attachment.files.length === 0) {
        await BankStatementAttachment.findByIdAndDelete(id);
        return res.status(200).json({ success: true, message: 'All files removed; attachment deleted.' });
      } else {
        await attachment.save();
        return res.status(200).json({ success: true, message: 'Statement file deleted successfully.' });
      }
    } else {
      await BankStatementAttachment.findByIdAndDelete(id);
      return res.status(200).json({ success: true, message: 'Statement attachment deleted successfully.' });
    }
  } catch (error) {
    console.error('deleteBankStatement error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to delete bank statement.' });
  }
};

/**
 * Preview/Stream a specific uploaded bank statement file
 */
export const getBankStatementFileStream = async (req, res) => {
  try {
    const { id, fileId } = req.params;

    const attachment = await BankStatementAttachment.findById(id).lean();
    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment record not found.' });
    }

    const file = attachment.files?.find((f) => f._id.toString() === fileId.toString());
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found in attachment.' });
    }

    if (file.dataBase64) {
      const buffer = Buffer.from(file.dataBase64, 'base64');
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
      return res.send(buffer);
    }

    if (file.url) {
      return res.redirect(file.url);
    }

    return res.status(404).json({ success: false, message: 'File data is not available.' });
  } catch (error) {
    console.error('getBankStatementFileStream error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve file.' });
  }
};
