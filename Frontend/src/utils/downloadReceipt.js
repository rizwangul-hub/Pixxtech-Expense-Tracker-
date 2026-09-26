import { verificationAPI } from '../services/api.js';
import { formatPKR, formatDate } from './formatters.js';

/**
 * Utility to reliably download purchase / receipt evidence images in the browser.
 * Tries direct Blob fetch first with cross-origin support,
 * and falls back to Cloudinary fl_attachment header transformation or direct anchor download.
 */
export async function downloadReceiptImage(url, preferredFilename) {
  if (!url) return false;

  const cleanFilename = (preferredFilename || 'receipt.jpg').replace(/[/\\?%*:|"<>]/g, '-');

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = cleanFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
    return true;
  } catch (error) {
    console.warn('Direct blob download failed, trying Cloudinary attachment URL fallback:', error);

    // If Cloudinary URL, inject fl_attachment transformation to force browser download
    let directUrl = url;
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
      const sanitizedName = cleanFilename.replace(/\.[^/.]+$/, '');
      directUrl = url.replace('/upload/', `/upload/fl_attachment:${encodeURIComponent(sanitizedName)}/`);
    }

    const link = document.createElement('a');
    link.href = directUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = cleanFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }
}

/**
 * Downloads multiple raw receipt images sequentially with a short interval.
 */
export async function downloadAllReceipts(attachments, baseName = 'Voucher_Receipt') {
  if (!Array.isArray(attachments) || attachments.length === 0) return;

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const url = typeof att === 'string' ? att : att?.url;
    if (!url) continue;

    const originalName = typeof att === 'object' && att?.originalName ? att.originalName : '';
    const ext = url.split('.').pop().split(/[?#]/)[0] || 'jpg';
    const cleanExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'].includes(ext.toLowerCase()) ? ext : 'jpg';

    const filename = originalName && originalName.includes('.')
      ? originalName
      : `${baseName}_${i + 1}.${cleanExt}`;

    await downloadReceiptImage(url, filename);

    if (i < attachments.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
}

/**
 * Normalizes entry data fields for receipt evidence rendering
 */
export function extractReceiptMetadata(entry) {
  if (!entry) return {};

  const vNo = entry.voucherNo || entry.voucherNumber || (entry._id ? entry._id.slice(-6).toUpperCase() : 'N/A');
  const dateStr = entry.date ? formatDate(entry.date) : formatDate(entry.submittedAt || new Date());
  const submitter =
    entry.submittedByName ||
    entry.submittedBy?.name ||
    entry.createdBy?.name ||
    'Sarfraz Khan';
  const verifier =
    entry.verifiedByName ||
    entry.verifiedBy?.name ||
    entry.checkedBy ||
    'Khurshid Anwar';

  const propertyName =
    entry.propertyId?.plazaName ||
    entry.propertyId?.propertyName ||
    entry.entryData?.property?.plazaName ||
    entry.entryData?.property?.name ||
    '';

  let unitName = '';
  if (entry.propertyId?.units && entry.unitId) {
    const u = entry.propertyId.units.find((un) => un._id?.toString() === entry.unitId?.toString());
    if (u) unitName = u.unitName || u.unitNumber || '';
  }
  if (!unitName && entry.entryData?.unit?.unitName) {
    unitName = entry.entryData.unit.unitName;
  }

  const tenantName =
    entry.tenantId?.fullName ||
    entry.tenantId?.tenantName ||
    entry.entryData?.tenant?.fullName ||
    '';

  const categoryName =
    entry.categoryId?.name ||
    entry.entryData?.category?.name ||
    'General Expense';

  const isRent =
    entry.entryType === 'RENT' ||
    entry.reportCategory === 'Rent' ||
    entry.sourceModule === 'RENT_RECEIVED';
  const isOtherIncome =
    entry.entryType === 'OTHER_INCOME' ||
    entry.reportCategory === 'Other Income' ||
    entry.sourceModule === 'OTHER_INCOME';
  const isTransfer = entry.entryType === 'TRANSFER' || entry.transactionType === 'TRANSFER';

  let drAccount =
    entry.drAccountId?.name ||
    entry.receivingAccountId?.name ||
    entry.entryData?.drAccount?.name ||
    '';

  let crAccount =
    entry.crAccountId?.name ||
    entry.entryData?.crAccount?.name ||
    '';

  if (isRent) {
    drAccount = drAccount || 'Cash in Hand (Receiving Account)';
    const rentLocationName = [propertyName, unitName].filter(Boolean).join(' - ');
    crAccount = rentLocationName || categoryName || 'Rental Income';
  } else if (isOtherIncome) {
    drAccount = drAccount || entry.receivingAccountId?.name || 'Receiving Account (Bank/Cash)';
    crAccount = categoryName;
  } else if (isTransfer) {
    drAccount = drAccount || 'Destination Account';
    crAccount = crAccount || 'Source Account';
  } else if (entry.entryType === 'SALARY') {
    const empName = entry.salaryDetails?.employeeName || entry.entryData?.payrollSnapshot?.employeeName;
    drAccount = drAccount || (empName ? `Salary Expense (${empName})` : 'Salary Expense');
    crAccount = crAccount || 'Paid From (Bank / Cash)';
  } else {
    drAccount = drAccount || categoryName;
    crAccount = crAccount || 'Paid From (Bank / Cash)';
  }

  const narration = entry.detail || entry.entryData?.detail || 'No detailed narration provided.';
  const amountStr = formatPKR(entry.amount);
  const isVerified = entry.status === 'VERIFIED' || entry.status === 'POSTED';
  const statusLabel = isVerified ? 'Verified & Posted' : 'Pending Verification';

  const rawList =
    entry.attachments && entry.attachments.length > 0
      ? entry.attachments
      : entry.entryData?.attachments && entry.entryData.attachments.length > 0
      ? entry.entryData.attachments
      : [];

  const attachments = rawList
    .map((att, idx) => {
      const url = typeof att === 'string' ? att : att?.url;
      if (!url) return null;
      return {
        url,
        originalName: (typeof att === 'object' && att?.originalName) ? att.originalName : `Receipt_${idx + 1}.jpg`,
      };
    })
    .filter(Boolean);

  return {
    vNo,
    dateStr,
    submitter,
    verifier,
    propertyName,
    unitName,
    tenantName,
    categoryName,
    drAccount,
    crAccount,
    narration,
    amountStr,
    amountNum: entry.amount,
    isRent,
    isVerified,
    statusLabel,
    rentMonth: entry.rentMonth || null,
    referenceNumber: entry.referenceNumber || entry.reference || '',
    attachments,
  };
}

/**
 * Downloads the official combined Receipt Evidence Document (A4 PDF) from backend.
 * Falls back to Client-Side Canvas Image generation if the PDF endpoint fails.
 */
export async function downloadReceiptEvidenceDocument(entry) {
  if (!entry) return false;

  const vNo = entry.voucherNo || entry.voucherNumber || (entry._id ? entry._id.slice(-6).toUpperCase() : 'Receipt');

  // 1. Try Backend Puppeteer PDF generation
  if (entry._id) {
    try {
      await verificationAPI.downloadReceiptEvidencePDF(entry._id, vNo);
      return true;
    } catch (err) {
      console.warn('Backend receipt PDF generation failed, falling back to client-side image slip:', err);
    }
  }

  // 2. Fallback to Client-Side Canvas Image Slip
  return await downloadReceiptEvidenceImage(entry);
}

/**
 * Generates a high-resolution formatted image (.jpg) using HTML5 Canvas:
 * Features top header & metadata cards (Voucher No, Date, Submitter, Property/Unit,
 * Accounts Involved, Amount, Narration) with the receipt picture placed at the bottom.
 */
export async function downloadReceiptEvidenceImage(entry, attachmentIndex = 0) {
  const meta = extractReceiptMetadata(entry);
  if (!meta.attachments || meta.attachments.length === 0) {
    alert('No receipt image available to download.');
    return false;
  }

  const targetAtt = meta.attachments[attachmentIndex] || meta.attachments[0];
  const imageUrl = targetAtt.url;

  // Load receipt image
  const img = new Image();
  img.crossOrigin = 'anonymous';

  const imageLoaded = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => {
      console.warn('Failed to load image with CORS, fallback to direct download');
      resolve(false);
    };
    img.src = imageUrl;
  });

  if (!imageLoaded) {
    // If CORS prevented canvas loading, download raw image as safe fallback
    return await downloadReceiptImage(imageUrl, `Voucher_${meta.vNo}_Receipt.jpg`);
  }

  // Setup Canvas Dimensions (Clean 1000px width for high readability)
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = 1000;

  // Calculate scaled image size to maintain aspect ratio
  const imgPadding = 40;
  const maxImgWidth = width - imgPadding * 2;
  const scale = Math.min(maxImgWidth / img.width, 1);
  const imgRenderWidth = Math.round(img.width * scale);
  const imgRenderHeight = Math.round(img.height * scale);

  // Compute total canvas height
  const headerHeight = 490;
  const footerHeight = 120;
  const totalHeight = headerHeight + imgRenderHeight + footerHeight + 60;

  canvas.width = width;
  canvas.height = totalHeight;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Outer border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(15, 15, width - 30, totalHeight - 30);

  // 1. Company Brand Header
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText('PIXX TECHNOLOGIES', 40, 58);

  ctx.fillStyle = '#475569';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('Basement Office 4C, Chanbeli Block, Bahria Town Lahore | Phone: 0345 9028996', 40, 80);

  // Voucher Badge on Top Right
  ctx.fillStyle = '#eff6ff';
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(width - 240, 36, 200, 48, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 18px Consolas, monospace';
  ctx.fillText(`VN: #${meta.vNo}`, width - 225, 66);

  // Horizontal divider
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 98);
  ctx.lineTo(width - 40, 98);
  ctx.stroke();

  // 2. Title & Status Banner
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(40, 112, width - 80, 42);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 112, width - 80, 42);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('OFFICIAL PURCHASE & RECEIPT EVIDENCE SLIP', 55, 138);

  ctx.fillStyle = meta.isVerified ? '#065f46' : '#92400e';
  ctx.font = 'bold 13px Arial, sans-serif';
  const statusBadgeText = meta.isVerified ? '✓ Verified & Posted' : '● Pending Verification';
  ctx.fillText(statusBadgeText, width - 230, 138);

  // 3. Left Card: Date & Location Info
  const cardY = 168;
  const cardW = (width - 100) / 2;
  const cardH = 145;

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, cardY, cardW, cardH);
  ctx.strokeRect(40 + cardW + 20, cardY, cardW, cardH);

  // Left Card Content
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('SUBMISSION & LOCATION DETAILS', 55, cardY + 24);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Transaction Date:', 55, cardY + 52);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(meta.dateStr, 190, cardY + 52);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Submitted By:', 55, cardY + 76);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(meta.submitter, 190, cardY + 76);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Property / Plaza:', 55, cardY + 100);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  const propDisplay = meta.propertyName || 'N/A (General)';
  ctx.fillText(propDisplay.length > 24 ? propDisplay.slice(0, 24) + '...' : propDisplay, 190, cardY + 100);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Unit / Shop:', 55, cardY + 124);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(meta.unitName || 'All Units / Building', 190, cardY + 124);

  // Right Card Content: Accounts & Category
  const rX = 40 + cardW + 20;
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('ACCOUNTS INVOLVED & HEAD', rX + 15, cardY + 24);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Category Head:', rX + 15, cardY + 52);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(meta.categoryName, rX + 160, cardY + 52);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Debit Account (Dr):', rX + 15, cardY + 76);
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 13px Arial, sans-serif';
  const drDisp = meta.drAccount || 'Expense Head';
  ctx.fillText(drDisp.length > 22 ? drDisp.slice(0, 22) + '...' : drDisp, rX + 160, cardY + 76);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Credit Account (Cr):', rX + 15, cardY + 100);
  ctx.fillStyle = '#991b1b';
  ctx.font = 'bold 13px Arial, sans-serif';
  const crDisp = meta.crAccount || 'Bank / Cash Account';
  ctx.fillText(crDisp.length > 22 ? crDisp.slice(0, 22) + '...' : crDisp, rX + 160, cardY + 100);

  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Cheque / Reference:', rX + 15, cardY + 124);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(meta.referenceNumber || 'N/A', rX + 160, cardY + 124);

  // 4. Narration Box
  const narY = 325;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(40, narY, width - 80, 54);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, narY, width - 80, 54);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('NARRATION / TRANSACTION DETAILS', 55, narY + 18);

  ctx.fillStyle = '#0f172a';
  ctx.font = '13px Arial, sans-serif';
  const narText = meta.narration.length > 110 ? meta.narration.slice(0, 107) + '...' : meta.narration;
  ctx.fillText(narText, 55, narY + 38);

  // 5. Prominent Total Amount Banner
  const totY = 392;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(40, totY, width - 80, 48);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('TOTAL TRANSACTION AMOUNT (PKR):', 60, totY + 31);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 24px Consolas, monospace';
  ctx.fillText(meta.amountStr, width - 260, totY + 33);

  // 6. Section Header for Receipt Image
  const imgSecY = 455;
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(`ATTACHED PURCHASE / RECEIPT EVIDENCE (1 of ${meta.attachments.length})`, 40, imgSecY);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, imgSecY + 8);
  ctx.lineTo(width - 40, imgSecY + 8);
  ctx.stroke();

  // 7. Draw Scaled Receipt Image Centered
  const imgY = imgSecY + 18;
  const imgX = Math.round((width - imgRenderWidth) / 2);

  // Background frame for image
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(imgX - 8, imgY - 8, imgRenderWidth + 16, imgRenderHeight + 16);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(imgX - 8, imgY - 8, imgRenderWidth + 16, imgRenderHeight + 16);

  ctx.drawImage(img, imgX, imgY, imgRenderWidth, imgRenderHeight);

  // 8. Signatures & Bottom Footer
  const footY = imgY + imgRenderHeight + 25;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, footY);
  ctx.lineTo(width - 40, footY);
  ctx.stroke();

  // Prepared By (Sarfraz)
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Prepared By: ' + meta.submitter, 60, footY + 28);
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText('Data Entry & Operations', 60, footY + 44);

  // Verified By (Khurshid Anwar)
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Verified By: ' + meta.verifier, width - 260, footY + 28);
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText('Financial Auditor & Manager', width - 260, footY + 44);

  // Watermark Note
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText(
    `Pixx Technologies Financial Systems • Generated on ${new Date().toLocaleString('en-PK')}`,
    width / 2 - 190,
    footY + 68
  );

  // Export Canvas to Blob & Trigger Download
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Voucher_${meta.vNo}_Receipt_Evidence.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        resolve(true);
      },
      'image/jpeg',
      0.95
    );
  });
}

/**
 * Opens a dedicated printable window with top details and bottom receipt image,
 * triggering the browser print / Save as PDF dialog immediately.
 */
export function printReceiptEvidenceSlip(entry, attachmentIndex = 0) {
  const meta = extractReceiptMetadata(entry);
  if (!meta.attachments || meta.attachments.length === 0) {
    alert('No receipt image available to print.');
    return;
  }

  const targetAtt = meta.attachments[attachmentIndex] || meta.attachments[0];
  const printWindow = window.open('', '_blank', 'width=900,height=950');
  if (!printWindow) {
    alert('Pop-up was blocked. Please allow pop-ups for this site to print.');
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Receipt Evidence - Voucher #${meta.vNo}</title>
      <style>
        @page { size: A4 portrait; margin: 4mm 6mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        html, body { height: 100%; font-family: Arial, sans-serif; font-size: 8.5pt; color: #0f172a; margin: 0; padding: 0; background: #fff; overflow: hidden; }
        .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; height: 283mm; max-height: 283mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-inside: avoid; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 6px; }
        .title { font-size: 13pt; font-weight: 900; margin: 0; }
        .sub { font-size: 7pt; color: #475569; margin-top: 1px; }
        .vn { font-family: monospace; font-size: 10pt; font-weight: 900; background: #eff6ff; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 4px; }
        .banner { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 5px; padding: 4px 8px; display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: bold; font-size: 8.5pt; }
        .grid { display: flex; gap: 8px; margin-bottom: 6px; }
        .card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px 8px; font-size: 7.5pt; }
        .card-t { font-size: 6.5pt; text-transform: uppercase; font-weight: 800; color: #64748b; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 4px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .row span:first-child { color: #64748b; font-weight: 600; }
        .row span:last-child { color: #0f172a; font-weight: 700; }
        .narration { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 5px; padding: 5px 8px; font-size: 7.5pt; margin-bottom: 6px; max-height: 32px; overflow: hidden; }
        .narration-label { font-size: 6.5pt; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
        .total-box { background: #0f172a; color: #fff; padding: 5px 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-weight: 900; }
        .total-amt { font-family: monospace; font-size: 13pt; color: #34d399; }
        .img-container { flex: 1; min-height: 0; text-align: center; border: 1px solid #cbd5e1; border-radius: 5px; background: #f8fafc; padding: 6px; margin-bottom: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
        .receipt-photo { max-width: 100%; max-height: 108mm; object-fit: contain; border-radius: 3px; border: 1px solid #cbd5e1; }
        .sigs-wrap { flex-shrink: 0; page-break-inside: avoid; }
        .sigs { display: flex; justify-content: space-between; border-top: 1px solid #cbd5e1; padding-top: 5px; font-size: 7.5pt; color: #475569; }
      </style>
    </head>
    <body>
      <div class="box">
        <div>
          <div class="header">
            <div>
              <div class="title">PIXX TECHNOLOGIES</div>
              <div class="sub">Basement Office 4C, Chanbeli Block, Bahria Town Lahore | Phone: 0345 9028996</div>
            </div>
            <div class="vn">VN: #${meta.vNo}</div>
          </div>

          <div class="banner">
            <span>OFFICIAL PURCHASE &amp; RECEIPT EVIDENCE SLIP</span>
            <span>${meta.statusLabel}</span>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-t">Submission &amp; Location</div>
              <div class="row"><span>Date:</span><span>${meta.dateStr}</span></div>
              <div class="row"><span>Submitted By:</span><span>${meta.submitter}</span></div>
              <div class="row"><span>Property / Plaza:</span><span>${meta.propertyName || 'N/A'}</span></div>
              <div class="row"><span>Unit / Shop:</span><span>${meta.unitName || 'All Units'}</span></div>
              ${meta.tenantName ? `<div class="row"><span>Tenant:</span><span>${meta.tenantName}</span></div>` : ''}
            </div>

            <div class="card">
              <div class="card-t">Accounts Involved</div>
              <div class="row"><span>Category Head:</span><span>${meta.categoryName}</span></div>
              <div class="row"><span>Debit (Dr.):</span><span>${meta.drAccount}</span></div>
              <div class="row"><span>Credit (Cr.):</span><span>${meta.crAccount}</span></div>
              ${meta.referenceNumber ? `<div class="row"><span>Cheque/Ref:</span><span>${meta.referenceNumber}</span></div>` : ''}
            </div>
          </div>

          <div class="narration">
            <div class="narration-label">Narration / Details</div>
            <div>${meta.narration}</div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 7.5pt; border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; background: #fff;">
            <thead>
              <tr style="background: #f1f5f9; text-transform: uppercase; font-weight: 800; font-size: 6.5pt; color: #475569; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 4px 8px; text-align: left;">Account / Bank or Cash</th>
                <th style="padding: 4px 8px; text-align: right; width: 110px;">Debit (Dr.)</th>
                <th style="padding: 4px 8px; text-align: right; width: 110px;">Credit (Cr.)</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0; font-weight: 600;">
                <td style="padding: 4px 8px; color: #0f172a;">${meta.drAccount}</td>
                <td style="padding: 4px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #059669;">${meta.amountStr}</td>
                <td style="padding: 4px 8px; text-align: right; font-family: monospace; color: #94a3b8;">-</td>
              </tr>
              <tr style="font-weight: 600;">
                <td style="padding: 4px 8px; color: #0f172a;">${meta.crAccount}</td>
                <td style="padding: 4px 8px; text-align: right; font-family: monospace; color: #94a3b8;">-</td>
                <td style="padding: 4px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #e11d48;">${meta.amountStr}</td>
              </tr>
            </tbody>
          </table>

          <div class="total-box">
            <span>TOTAL VOUCHER AMOUNT (PKR)</span>
            <span class="total-amt">${meta.amountStr}</span>
          </div>
        </div>

        <div class="img-container">
          <div style="font-size: 8pt; font-weight: 800; text-transform: uppercase; color: #1e3a8a; margin-bottom: 8px;">
            Attached Purchase / Receipt Picture
          </div>
          <img src="${targetAtt.url}" alt="Receipt Evidence" class="receipt-photo" />
        </div>

        <div class="sigs-wrap">
          <div class="sigs">
            <div><strong>Prepared By:</strong> ${meta.submitter}</div>
            <div><strong>Audited &amp; Approved By:</strong> ${meta.verifier}</div>
          </div>
          <div style="text-align: center; font-size: 6.5pt; color: #94a3b8; margin-top: 3px;">
            Pixx Technologies Financial Systems &bull; Printed on ${new Date().toLocaleString('en-PK')}
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
