import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import handlebars from 'handlebars';
import JSZip from 'jszip';
import { generateBulkReceiptEvidenceZIP } from '../services/pdfReportService.js';

test('verified queue evidence pages render an unbroken, searchable voucher number', () => {
  const templatePath = fileURLToPath(
    new URL('../templates/bulkReceiptEvidenceTemplate.html', import.meta.url)
  );
  const templateSource = fs.readFileSync(path.resolve(templatePath), 'utf8');
  const template = handlebars.compile(templateSource);
  handlebars.registerHelper('formatPKR', (amount) => String(amount));

  const html = template({
    vouchers: [{ voucherNo: 'PT-163-10-26', attachments: [] }],
  });

  assert.match(html, /white-space:\s*nowrap/);
  assert.match(html, /Voucher No: PT-163-10-26/);
});

test('bulk receipt evidence ZIP streams a merged PDF and receipt images', async () => {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S54AAAAASUVORK5CYII=',
    'base64'
  );
  const vouchers = [{
    voucherNo: 'STREAM-TEST',
    date: '2026-09-01',
    documentTitle: 'TEST EVIDENCE',
    detail: 'Stream validation',
    amount: 1,
    attachments: [{
      url: `data:image/png;base64,${image.toString('base64')}`,
      caption: 'test.png',
      index: 1,
    }],
  }];
  const chunks = [];
  const sink = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await pipeline(await generateBulkReceiptEvidenceZIP(vouchers, 'stream-test'), sink);

  const archive = await JSZip.loadAsync(Buffer.concat(chunks));
  const pdfEntry = Object.values(archive.files).find((entry) => !entry.dir && entry.name.endsWith('.pdf'));
  const imageEntry = Object.values(archive.files).find(
    (entry) => !entry.dir && entry.name.includes('Receipt_Images/')
  );
  assert.ok(pdfEntry);
  assert.ok(imageEntry);
  assert.equal((await pdfEntry.async('nodebuffer')).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(await imageEntry.async('nodebuffer'), image);
});
