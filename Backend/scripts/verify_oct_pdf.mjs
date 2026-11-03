import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const { generateMonthlyFundsReport } = await import('../services/pdfReportService.js');

try {
  console.log('Generating PDF for 2026-10...');
  const pdfBuf = await generateMonthlyFundsReport('2026-10');
  console.log('PDF Generated Successfully! Size bytes:', pdfBuf.length);
} catch (err) {
  console.error('PDF Generation Failed:', err);
}

process.exit(0);
