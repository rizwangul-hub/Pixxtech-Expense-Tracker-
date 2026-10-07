import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createMonthlyBackupZip,
  validateBackupZip,
  restoreBackupData,
  COLLECTION_DEFINITIONS,
} from '../services/backupService.js';
import BackupRecord from '../models/BackupRecord.js';
import { apiSuccess, apiError } from '../utils/apiResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

/**
 * @desc    Create a new database backup for a given month or all data
 * @route   POST /api/admin/backups/create
 * @access  Private (ADMIN / ADMIN_PUBLISHER only)
 */
export const createBackup = async (req, res) => {
  try {
    const { month = '2026-08', description = '' } = req.body;

    const result = await createMonthlyBackupZip({
      month,
      description,
      user: req.user,
    });

    return apiSuccess(
      res,
      {
        backupId: result.record._id,
        filename: result.filename,
        checksum: result.checksum,
        sizeBytes: result.buffer.length,
        manifest: result.manifest,
        downloadUrl: `/api/admin/backups/download/${result.record._id}`,
      },
      `Backup for ${result.manifest.backupMonth} created successfully.`
    );
  } catch (error) {
    console.error('[Create Backup Error]:', error);
    return apiError(res, `Failed to create backup: ${error.message}`, 500);
  }
};

/**
 * @desc    Download backup ZIP by record ID or direct filename
 * @route   GET /api/admin/backups/download/:id
 * @access  Private (ADMIN / ADMIN_PUBLISHER only)
 */
export const downloadBackup = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await BackupRecord.findById(id);
    if (!record) {
      return apiError(res, 'Backup record not found.', 404);
    }

    const filePath = record.storagePath || path.join(BACKUPS_DIR, record.filename);
    if (!fs.existsSync(filePath)) {
      return apiError(res, 'Backup archive file not found on server.', 404);
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`);
    res.setHeader('Content-Length', fs.statSync(filePath).size);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (error) {
    console.error('[Download Backup Error]:', error);
    return apiError(res, `Failed to download backup: ${error.message}`, 500);
  }
};

/**
 * @desc    Get backup history records
 * @route   GET /api/admin/backups/history
 * @access  Private (ADMIN / ADMIN_PUBLISHER only)
 */
export const getBackupHistory = async (req, res) => {
  try {
    const backups = await BackupRecord.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Check file availability on disk for each
    const list = backups.map((b) => {
      const filePath = b.storagePath || path.join(BACKUPS_DIR, b.filename);
      return {
        ...b,
        fileExists: fs.existsSync(filePath),
      };
    });

    return apiSuccess(res, { backups: list }, 'Backup history loaded successfully.');
  } catch (error) {
    console.error('[Get Backup History Error]:', error);
    return apiError(res, `Failed to load backup history: ${error.message}`, 500);
  }
};

/**
 * @desc    Validate an uploaded backup ZIP file without modifying database
 * @route   POST /api/admin/backups/validate
 * @access  Private (ADMIN / ADMIN_PUBLISHER only)
 */
export const validateBackupFile = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return apiError(res, 'Please upload a valid ZIP backup file.', 400);
    }

    const validation = await validateBackupZip(req.file.buffer);

    return apiSuccess(
      res,
      {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        manifest: validation.manifest,
        summary: validation.summary,
      },
      validation.isValid
        ? 'Backup archive is valid and ready for restoration.'
        : 'Backup archive failed validation.'
    );
  } catch (error) {
    console.error('[Validate Backup Error]:', error);
    return apiError(res, `Backup validation error: ${error.message}`, 500);
  }
};

/**
 * @desc    Restore / Import a validated backup ZIP file into MongoDB
 * @route   POST /api/admin/backups/restore
 * @access  Private (ADMIN / ADMIN_PUBLISHER only)
 */
export const restoreBackupFile = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return apiError(res, 'Please upload a valid ZIP backup file.', 400);
    }

    const {
      mode = 'merge', // 'merge' | 'clean_month'
      updateExisting = 'false',
      confirmation = '',
    } = req.body;

    if (confirmation !== 'CONFIRM_RESTORE') {
      return apiError(
        res,
        'Explicit confirmation is required. Please type CONFIRM_RESTORE to proceed.',
        400
      );
    }

    const shouldUpdate = updateExisting === true || updateExisting === 'true';

    const result = await restoreBackupData({
      zipBuffer: req.file.buffer,
      mode,
      updateExisting: shouldUpdate,
      user: req.user,
    });

    return apiSuccess(
      res,
      result,
      `Data successfully restored. Inserted: ${result.stats.inserted}, Updated: ${result.stats.updated}, Skipped: ${result.stats.skipped}.`
    );
  } catch (error) {
    console.error('[Restore Backup Error]:', error);
    return apiError(res, `Restore failed: ${error.message}`, 500);
  }
};

export default {
  createBackup,
  downloadBackup,
  getBackupHistory,
  validateBackupFile,
  restoreBackupFile,
};
