import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import JSZip from 'jszip';

// Import all models
import User from '../models/User.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import RentDue from '../models/RentDue.js';
import RentReceived from '../models/RentReceived.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import Voucher from '../models/Voucher.js';
import OtherIncomeHead from '../models/OtherIncomeHead.js';
import OtherIncome from '../models/OtherIncome.js';
import MonthlyReport from '../models/MonthlyReport.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Payroll from '../models/Payroll.js';
import StaffLoan from '../models/StaffLoan.js';
import StaffLeave from '../models/StaffLeave.js';
import StaffDesignation from '../models/StaffDesignation.js';
import StaffLocation from '../models/StaffLocation.js';
import StaffSetting from '../models/StaffSetting.js';
import StaffAuditLog from '../models/StaffAuditLog.js';
import CommunicationMessage from '../models/CommunicationMessage.js';
import CommunicationAttachment from '../models/CommunicationAttachment.js';
import CommunicationCall from '../models/CommunicationCall.js';
import CommunicationRateLimit from '../models/CommunicationRateLimit.js';
import BackupRecord from '../models/BackupRecord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'pixxtech-expense-tracker-backups')
  : path.join(__dirname, '..', 'backups');

/**
 * Definition of all database collections in the system.
 * category: 'master' (all documents up to and including the month)
 * category: 'monthly' (filtered to the selected month, or historical transactions for balance)
 */
export const COLLECTION_DEFINITIONS = [
  { name: 'users', model: User, file: 'users.json', type: 'master' },
  { name: 'properties', model: Property, file: 'properties.json', type: 'master' },
  { name: 'tenants', model: Tenant, file: 'tenants.json', type: 'master' },
  { name: 'rentalagreements', model: RentalAgreement, file: 'rentalagreements.json', type: 'master' },
  { name: 'accounts', model: Account, file: 'accounts.json', type: 'master' },
  { name: 'categories', model: Category, file: 'categories.json', type: 'master' },
  { name: 'otherincomeheads', model: OtherIncomeHead, file: 'otherincomeheads.json', type: 'master' },
  { name: 'employees', model: Employee, file: 'employees.json', type: 'master' },
  { name: 'staffdesignations', model: StaffDesignation, file: 'staffdesignations.json', type: 'master' },
  { name: 'stafflocations', model: StaffLocation, file: 'stafflocations.json', type: 'master' },
  { name: 'staffsettings', model: StaffSetting, file: 'staffsettings.json', type: 'master' },
  
  // Transactional / Monthly collections
  { name: 'transactions', model: Transaction, file: 'transactions.json', type: 'transactional' },
  { name: 'pendingentries', model: PendingEntry, file: 'pendingentries.json', type: 'transactional' },
  { name: 'vouchers', model: Voucher, file: 'vouchers.json', type: 'transactional' },
  { name: 'rentdues', model: RentDue, file: 'rentdues.json', type: 'transactional' },
  { name: 'rentreceiveds', model: RentReceived, file: 'rentreceiveds.json', type: 'transactional' },
  { name: 'otherincomes', model: OtherIncome, file: 'otherincomes.json', type: 'transactional' },
  { name: 'monthlyreports', model: MonthlyReport, file: 'monthlyreports.json', type: 'transactional' },
  { name: 'payrolls', model: Payroll, file: 'payrolls.json', type: 'transactional' },
  { name: 'attendances', model: Attendance, file: 'attendances.json', type: 'transactional' },
  { name: 'staffloans', model: StaffLoan, file: 'staffloans.json', type: 'transactional' },
  { name: 'staffleaves', model: StaffLeave, file: 'staffleaves.json', type: 'transactional' },
  { name: 'staffauditlogs', model: StaffAuditLog, file: 'staffauditlogs.json', type: 'transactional' },
  { name: 'communicationmessages', model: CommunicationMessage, file: 'communicationmessages.json', type: 'transactional' },
  { name: 'communicationattachments', model: CommunicationAttachment, file: 'communicationattachments.json', type: 'transactional' },
  { name: 'communicationcalls', model: CommunicationCall, file: 'communicationcalls.json', type: 'transactional' },
  { name: 'communicationratelimits', model: CommunicationRateLimit, file: 'communicationratelimits.json', type: 'transactional' },
];

/**
 * Helper to compute month boundaries: [startOfMonth, endOfMonth]
 */
export const getMonthDateRange = (monthStr) => {
  if (!monthStr || monthStr === 'ALL') return { start: null, end: null };
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, m - 1, daysInMonth, 23, 59, 59, 999));
  return { start, end };
};

/**
 * Build MongoDB query for a specific collection and target month
 */
export const buildQueryForCollection = (collectionDef, monthStr) => {
  if (!monthStr || monthStr === 'ALL') {
    return {};
  }
  const { start, end } = getMonthDateRange(monthStr);

  switch (collectionDef.name) {
    // Master collections: ALWAYS include all master/reference data so relationships remain intact and accounts/properties/employees are present
    case 'users':
    case 'properties':
    case 'tenants':
    case 'rentalagreements':
    case 'accounts':
    case 'categories':
    case 'otherincomeheads':
    case 'employees':
    case 'staffdesignations':
    case 'stafflocations':
    case 'staffsettings':
      return {};

    // Transactions: Include ALL transactions up to end of month so opening balances & running balances can be computed
    case 'transactions':
      return { date: { $lte: end } };

    // Vouchers: include all vouchers or up to end of month
    case 'vouchers':
      return {};

    // Pending Entries: date up to end of month
    case 'pendingentries':
      return { date: { $lte: end } };

    // Rent Due: rentMonth === monthStr OR dueDate <= end
    case 'rentdues':
      return {
        $or: [
          { rentMonth: monthStr },
          { dueDate: { $gte: start, $lte: end } },
        ],
      };

    // Rent Received: receiptDate in month OR rentMonth === monthStr
    case 'rentreceiveds':
      return {
        $or: [
          { receiptDate: { $gte: start, $lte: end } },
          { rentMonth: monthStr },
        ],
      };

    // Other Income: receiptDate in month
    case 'otherincomes':
      return {
        receiptDate: { $gte: start, $lte: end },
      };

    // Monthly Report: target month specifically
    case 'monthlyreports':
      return { month: monthStr };

    // Payroll: payrollMonth === monthStr OR paymentDate in month
    case 'payrolls':
      return {
        $or: [
          { payrollMonth: monthStr },
          { paymentDate: { $gte: start, $lte: end } },
        ],
      };

    // Attendance: date in month OR dateStr starting with monthStr
    case 'attendances':
      return {
        $or: [
          { date: { $gte: start, $lte: end } },
          { dateStr: { $regex: `^${monthStr}` } },
        ],
      };

    // Staff Loans: date in month OR payrollMonth === monthStr
    case 'staffloans':
      return {
        $or: [
          { date: { $gte: start, $lte: end } },
          { payrollMonth: monthStr },
        ],
      };

    // Staff Leaves: startDate or endDate overlapping month
    case 'staffleaves':
      return {
        $or: [
          { startDate: { $lte: end }, endDate: { $gte: start } },
          { createdAt: { $gte: start, $lte: end } },
        ],
      };

    // Staff Audit Log: timestamp in month
    case 'staffauditlogs':
      return {
        createdAt: { $gte: start, $lte: end },
      };

    // Communications
    case 'communicationmessages':
    case 'communicationattachments':
    case 'communicationcalls':
    case 'communicationratelimits':
      return {
        createdAt: { $gte: start, $lte: end },
      };

    default:
      return { createdAt: { $lte: end } };
  }
};

/**
 * Generate a complete, self-contained monthly backup ZIP file buffer.
 * Preserves all MongoDB types, relations, ObjectIds, and Dates via BSON EJSON.
 */
export const createMonthlyBackupZip = async ({
  month = '2026-08',
  description = '',
  user = null,
}) => {
  const isAll = !month || month === 'ALL';
  const backupMonth = isAll ? 'ALL' : month;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const zip = new JSZip();

  const manifest = {
    application: 'Pixx Technologies Property Finance & Expense Management System',
    backupType: isAll ? 'full' : 'monthly',
    backupMonth,
    backupVersion: '1.0.0',
    schemaVersion: '1.0.0',
    createdAt: now.toISOString(),
    createdBy: user?.name || 'Administrator',
    createdById: user?._id?.toString() || null,
    createdByRole: user?.role || 'ADMIN',
    description: description || `Database backup for ${backupMonth}`,
    database: 'MongoDB',
    serializationFormat: 'BSON-EJSON-v2',
    collections: [],
    documentCounts: {},
    totalDocuments: 0,
    fileStorageNotice: 'Database records and Cloudinary file metadata/URLs are preserved in full. Binary assets hosted on Cloudinary are referenced by original secure URL and publicId.',
    accountingNotice: 'Financial month follows Pakistan business practice. All historical transactions up to the period end are preserved to guarantee 100% accurate opening & running ledger balances.',
  };

  const folder = zip.folder('backup');

  for (const colDef of COLLECTION_DEFINITIONS) {
    const query = buildQueryForCollection(colDef, backupMonth);
    // Fetch raw documents using lean()
    const docs = await colDef.model.find(query).lean().exec();

    manifest.collections.push(colDef.name);
    manifest.documentCounts[colDef.name] = docs.length;
    manifest.totalDocuments += docs.length;

    // Serialize using BSON Extended JSON (preserves ObjectId, Date, Long, Decimal128)
    const serializedJson = EJSON.stringify(docs, null, 2, { relaxed: false });
    folder.file(colDef.file, serializedJson);
  }

  // Put preliminary manifest
  const manifestJsonWithoutChecksum = JSON.stringify(manifest, null, 2);
  folder.file('manifest.json', manifestJsonWithoutChecksum);

  // Generate ZIP Buffer
  const rawZipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  // Calculate SHA-256 checksum of the generated ZIP
  const checksum = crypto.createHash('sha256').update(rawZipBuffer).digest('hex');
  manifest.checksum = checksum;

  // Update manifest inside ZIP with checksum
  folder.file('manifest.json', JSON.stringify(manifest, null, 2));

  const finalZipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const finalChecksum = crypto.createHash('sha256').update(finalZipBuffer).digest('hex');
  manifest.checksum = finalChecksum;

  const filename = `PixxTechnologies_Backup_${backupMonth}_${dateStamp}.zip`;
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const storagePath = path.join(BACKUPS_DIR, filename);

  // Save to disk for download & backup history
  fs.writeFileSync(storagePath, finalZipBuffer);

  // Record in BackupRecord
  const backupRecord = await BackupRecord.create({
    backupMonth,
    filename,
    storagePath,
    description: manifest.description,
    backupVersion: manifest.backupVersion,
    schemaVersion: manifest.schemaVersion,
    checksum: finalChecksum,
    sizeBytes: finalZipBuffer.length,
    collectionsCount: manifest.collections.length,
    totalDocuments: manifest.totalDocuments,
    documentCounts: manifest.documentCounts,
    collectionsList: manifest.collections,
    status: 'COMPLETED',
    createdBy: user?._id || null,
    createdByName: user?.name || 'Administrator',
    notes: `Generated ${manifest.totalDocuments} records across ${manifest.collections.length} collections.`,
  });

  return {
    filename,
    buffer: finalZipBuffer,
    checksum: finalChecksum,
    manifest,
    record: backupRecord,
  };
};

/**
 * Validate a backup ZIP buffer or file without modifying the database.
 * Checks ZIP structure, manifest, JSON syntax, document counts, and ObjectIds.
 */
export const validateBackupZip = async (zipBuffer) => {
  const result = {
    isValid: false,
    errors: [],
    warnings: [],
    manifest: null,
    summary: {
      collectionsCount: 0,
      totalDocuments: 0,
      documentCounts: {},
      collectionsFound: [],
    },
    parsedData: {},
  };

  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(zip.files);

    // Look for manifest.json (either in root or in /backup/)
    let manifestFile = zip.file('backup/manifest.json') || zip.file('manifest.json');
    if (!manifestFile) {
      result.errors.push('Archive does not contain manifest.json or backup/manifest.json.');
      return result;
    }

    const manifestText = await manifestFile.async('string');
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
      result.manifest = manifest;
    } catch (e) {
      result.errors.push(`manifest.json is not valid JSON: ${e.message}`);
      return result;
    }

    // Verify basic manifest schema
    if (!manifest.backupMonth || !manifest.collections) {
      result.errors.push('manifest.json is missing required fields (backupMonth or collections).');
      return result;
    }

    // Validate each collection JSON file
    for (const colDef of COLLECTION_DEFINITIONS) {
      const zipPath = zip.file(`backup/${colDef.file}`)
        ? `backup/${colDef.file}`
        : zip.file(colDef.file)
        ? colDef.file
        : null;

      if (!zipPath) {
        result.warnings.push(`Collection file '${colDef.file}' not found in archive (counts as 0).`);
        continue;
      }

      const fileContent = await zip.file(zipPath).async('string');
      let docs;
      try {
        docs = EJSON.parse(fileContent);
      } catch (err) {
        result.errors.push(`Failed to parse EJSON in '${colDef.file}': ${err.message}`);
        continue;
      }

      if (!Array.isArray(docs)) {
        result.errors.push(`Content of '${colDef.file}' is not a JSON Array.`);
        continue;
      }

      // Check document count against manifest if specified
      const expectedCount = manifest.documentCounts ? manifest.documentCounts[colDef.name] : null;
      if (expectedCount !== null && expectedCount !== undefined && expectedCount !== docs.length) {
        result.warnings.push(
          `Document count mismatch for '${colDef.name}': manifest says ${expectedCount}, found ${docs.length}.`
        );
      }

      result.parsedData[colDef.name] = docs;
      result.summary.collectionsFound.push(colDef.name);
      result.summary.documentCounts[colDef.name] = docs.length;
      result.summary.totalDocuments += docs.length;
    }

    result.summary.collectionsCount = result.summary.collectionsFound.length;

    // Verify relations & ObjectIds in parsed data
    const accounts = result.parsedData.accounts || [];
    const properties = result.parsedData.properties || [];
    const tenants = result.parsedData.tenants || [];
    const transactions = result.parsedData.transactions || [];

    const accountIds = new Set(accounts.map((a) => a._id?.toString()));
    const propertyIds = new Set(properties.map((p) => p._id?.toString()));
    const tenantIds = new Set(tenants.map((t) => t._id?.toString()));

    let missingAccountRefs = 0;
    let missingPropertyRefs = 0;

    for (const tx of transactions) {
      if (tx.drAccountId && !accountIds.has(tx.drAccountId.toString())) {
        missingAccountRefs++;
      }
      if (tx.crAccountId && !accountIds.has(tx.crAccountId.toString())) {
        missingAccountRefs++;
      }
      if (tx.propertyId && !propertyIds.has(tx.propertyId.toString())) {
        missingPropertyRefs++;
      }
    }

    if (missingAccountRefs > 0) {
      result.warnings.push(
        `${missingAccountRefs} transaction account references point to accounts not in this backup archive.`
      );
    }
    if (missingPropertyRefs > 0) {
      result.warnings.push(
        `${missingPropertyRefs} transaction property references point to properties not in this backup archive.`
      );
    }

    result.isValid = result.errors.length === 0;
    return result;
  } catch (err) {
    result.errors.push(`Failed to read ZIP file: ${err.message}`);
    return result;
  }
};

/**
 * Execute Safe Import / Restore into MongoDB.
 * 
 * Supports two safe modes:
 * - 'merge' (default): Upserts missing documents, preserves existing matching documents unless updateExisting is true.
 * - 'clean_month': Removes transactional data strictly for the specified month first, then restores documents.
 * 
 * NEVER drops the entire database.
 */
export const restoreBackupData = async ({
  zipBuffer,
  mode = 'merge', // 'merge' | 'clean_month'
  updateExisting = false,
  user = null,
}) => {
  const validation = await validateBackupZip(zipBuffer);
  if (!validation.isValid) {
    throw new Error(`Backup validation failed: ${validation.errors.join('; ')}`);
  }

  const { parsedData, manifest } = validation;
  const backupMonth = manifest.backupMonth;
  const stats = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    byCollection: {},
  };

  // If clean_month mode is chosen and a specific month is targeted, delete only the month's operational records first
  if (mode === 'clean_month' && backupMonth && backupMonth !== 'ALL') {
    const { start, end } = getMonthDateRange(backupMonth);
    // Delete month operational records safely
    await Transaction.deleteMany({ date: { $gte: start, $lte: end } });
    await PendingEntry.deleteMany({ date: { $gte: start, $lte: end } });
    await RentDue.deleteMany({ rentMonth: backupMonth });
    await RentReceived.deleteMany({ rentMonth: backupMonth });
    await OtherIncome.deleteMany({ receiptDate: { $gte: start, $lte: end } });
    await Payroll.deleteMany({ payrollMonth: backupMonth });
    await Attendance.deleteMany({
      $or: [
        { date: { $gte: start, $lte: end } },
        { dateStr: { $regex: `^${backupMonth}` } },
      ],
    });
    await MonthlyReport.deleteMany({ month: backupMonth });
  }

  // Iterate collections in dependency order: Master data first, then transactions
  for (const colDef of COLLECTION_DEFINITIONS) {
    const docs = parsedData[colDef.name];
    if (!docs || docs.length === 0) continue;

    const colStats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
    stats.byCollection[colDef.name] = colStats;

    const model = colDef.model;
    const bulkOps = [];

    for (const rawDoc of docs) {
      if (!rawDoc._id) {
        rawDoc._id = new mongoose.Types.ObjectId();
      }

      const docId = rawDoc._id;

      if (updateExisting) {
        bulkOps.push({
          replaceOne: {
            filter: { _id: docId },
            replacement: rawDoc,
            upsert: true,
          },
        });
      } else {
        // Upsert only if not existing ($setOnInsert)
        // Note: remove _id from $setOnInsert to avoid "Performing an update on the path '_id' would modify the immutable field '_id'"
        const docWithoutId = { ...rawDoc };
        delete docWithoutId._id;

        bulkOps.push({
          updateOne: {
            filter: { _id: docId },
            update: { $setOnInsert: docWithoutId },
            upsert: true,
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      try {
        // Use native MongoDB collection to avoid Mongoose schema timestamp conflicts
        const res = await model.collection.bulkWrite(bulkOps, { ordered: false });
        colStats.inserted = (res.upsertedCount || 0) + (res.insertedCount || 0);
        colStats.updated = res.modifiedCount || 0;
        colStats.skipped = bulkOps.length - (colStats.inserted + colStats.updated);
        
        stats.inserted += colStats.inserted;
        stats.updated += colStats.updated;
        stats.skipped += colStats.skipped;
      } catch (err) {
        colStats.errors++;
        stats.errors++;
        console.error(`[BulkWrite Error on ${colDef.name}]:`, err.message);
      }
    }
  }

  // Record restoration in BackupRecord history
  await BackupRecord.create({
    backupMonth: manifest.backupMonth || 'RESTORED',
    filename: `Restored_${manifest.backupMonth}_${Date.now()}.zip`,
    description: `Restored by ${user?.name || 'Administrator'} in ${mode} mode.`,
    backupVersion: manifest.backupVersion || '1.0.0',
    schemaVersion: manifest.schemaVersion || '1.0.0',
    checksum: manifest.checksum || '',
    sizeBytes: zipBuffer.length,
    collectionsCount: Object.keys(parsedData).length,
    totalDocuments: validation.summary.totalDocuments,
    status: 'RESTORED',
    createdBy: user?._id || null,
    createdByName: user?.name || 'Administrator',
    notes: `Inserted: ${stats.inserted}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`,
  });

  return {
    success: true,
    stats,
    manifest,
  };
};

export default {
  COLLECTION_DEFINITIONS,
  createMonthlyBackupZip,
  validateBackupZip,
  restoreBackupData,
};
