import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import connectDB from '../config/db.js';
import { generateMonthlyFundsReport } from '../services/pdfReportService.js';

async function testPdf() {
  await connectDB();
  console.log('Generating multi-page PDF report for August 2026...');
  const start = Date.now();
  const pdfBuffer = await generateMonthlyFundsReport('2026-08');
  const elapsed = (Date.now() - start) / 1000;
  console.log(`✓ PDF successfully generated in ${elapsed.toFixed(2)}s! Buffer size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  
  const outputPath = path.join(process.cwd(), 'scratch', 'August-2026-Generated-Report.pdf');
  const scratchDir = path.join(process.cwd(), 'scratch');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`✓ Saved test PDF to: ${outputPath}`);
  process.exit(0);
}

testPdf().catch(err => {
  console.error('PDF Generation failed:', err);
  process.exit(1);
});
