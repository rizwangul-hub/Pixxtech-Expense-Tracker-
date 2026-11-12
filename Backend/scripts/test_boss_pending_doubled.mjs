import fs from 'fs';
import path from 'path';

// Format PKR with commas
const formatPKR = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Number(val).toLocaleString('en-PK', { maximumFractionDigits: 0 });
};

const departmentGroups = {
  'ADMIN RIDER': [
    { name: 'Majid Javed', designation: 'Admin Rider', remainingSalary: 61313, accountTitle: 'Majid Javed', ibanNumber: 'PK80ABPA0020117346700014', bankName: 'Allied Bank' }
  ],
  'BAHRIA TOWN OFFICE': [
    { name: 'Fahad Rashid', designation: 'Manager Accounts', remainingSalary: 5000, accountTitle: 'Fahad Rashid', ibanNumber: 'PK13ABPA0020007134700014', bankName: 'Allied Bank' },
    { name: 'Khurshid Anwar', designation: 'Assistant Manager', remainingSalary: 110000, accountTitle: 'Khushid Anwar', ibanNumber: 'PK95BKIP0204500059910001', bankName: 'Bank Islami' },
    { name: 'Rizwan Ullah', designation: 'Software Developer', remainingSalary: 40000, accountTitle: 'Sabir Nawaz', ibanNumber: 'PK07ABPA0020102502200016', bankName: 'Allied Bank' },
    { name: 'Sarfraz Khan', designation: 'Accountant', remainingSalary: 35000, accountTitle: 'Muhammad Rafey Khan', ibanNumber: 'PK11ALFH0046001008112613', bankName: 'Bank Alfalah' }
  ],
  'IT OFFICE': [
    { name: 'Abdul Rafey', designation: 'Software Engineer', remainingSalary: 25000, accountTitle: 'Muhammad Rafey Khan', ibanNumber: 'PK11ALFH0046001008112613', bankName: 'Bank Alfalah' },
    { name: 'Armaghan', designation: 'Software Engineer', remainingSalary: 35000, accountTitle: 'Armghan Saeed', ibanNumber: 'PK11ABPA0010091045790016', bankName: 'Allied Bank' },
    { name: 'Faiz Mujahid', designation: 'Officer', remainingSalary: 50000, accountTitle: 'Faiz Mujahid', ibanNumber: 'PK50MEZN0002390110541808', bankName: 'Meezan Bank' },
    { name: 'Gulzaib Hamid', designation: 'Intern', remainingSalary: 7000, accountTitle: 'Noreen Hamid', ibanNumber: '03284492513', bankName: 'Eazy Paissa' },
    { name: 'Miss Nausheen', designation: 'IT Manager', remainingSalary: 30968, accountTitle: 'Nosheen Mustafa', ibanNumber: 'PK53UNIL0110002010819485', bankName: 'United Bank Limited' },
    { name: 'Saeed Sb', designation: 'Officer', remainingSalary: 40000, accountTitle: 'Armghan Saeed', ibanNumber: 'PK11ABPA0010091045790016', bankName: 'Allied Bank' },
    { name: 'Zulaikha Afzaal', designation: 'Software Engineer', remainingSalary: 9032, accountTitle: 'Zulaikha Afzaal', ibanNumber: '0302 4358263', bankName: 'Jazz Cash' }
  ],
  'SECURITY GUARD': [
    { name: 'Afzal', designation: 'Guard', remainingSalary: 20000, accountTitle: 'Muhammed Hassnain', ibanNumber: 'PK76ALFH0682001010482430', bankName: 'Bank Alfalah' },
    { name: 'Akram', designation: 'Guard', remainingSalary: 10000, accountTitle: 'Muhammad Akram', ibanNumber: 'PK55UNIL0109000226647768', bankName: 'United Bank Limited' }
  ]
};

const grandRemainingSalary = 478313;
const totalStaff = 14;
const totalOffices = 4;
const formattedTitleDate = 'October 2026';

const getBrowserExecutablePath = () => {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
};

async function generate() {
  const puppeteer = (await import('puppeteer-core')).default;
  const executablePath = getBrowserExecutablePath();

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Pending Salary Payout Details - ${formattedTitleDate}</title>
      <style>
        @page { size: A4 portrait; margin: 8mm 8mm 8mm 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #0f172a;
          background: #fff;
          font-size: 15px;
          line-height: 1.35;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2.5px solid #0f172a;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .header-logo img {
          height: 48px;
          width: auto;
          object-fit: contain;
        }
        .header-company {
          text-align: right;
        }
        .header-company h1 {
          font-size: 20px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: 0.5px;
        }
        .header-company p {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }
        .title-banner {
          background: #0f172a;
          color: #fff;
          padding: 10px 14px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .title-banner h2 {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .title-banner .meta {
          font-size: 12px;
          color: #cbd5e1;
          font-weight: 600;
        }
        .summary-cards {
          display: flex;
          gap: 10px;
          margin-bottom: 14px;
        }
        .summary-card {
          flex: 1;
          border: 1.5px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 10px;
          background: #f8fafc;
          text-align: center;
        }
        .summary-card.highlight {
          background: #fff7ed;
          border-color: #fdba74;
        }
        .summary-card .lbl {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .summary-card .val {
          font-size: 20px;
          font-weight: 900;
          color: #0f172a;
          margin-top: 2px;
          font-family: 'Courier New', monospace;
        }
        .summary-card.highlight .val {
          color: #c2410c;
        }
        .section-block {
          margin-bottom: 14px;
          page-break-inside: avoid;
        }
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f1f5f9;
          border-left: 5px solid #4f46e5;
          padding: 6px 12px;
          border-radius: 4px;
          margin-bottom: 5px;
        }
        .section-header h3 {
          font-size: 14px;
          font-weight: 800;
          color: #1e1b4b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .section-header .badge {
          font-size: 12px;
          font-weight: 700;
          background: #e0e7ff;
          color: #3730a3;
          padding: 3px 9px;
          border-radius: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5px;
          font-size: 13px;
        }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th {
          background: #1e293b;
          color: #fff;
          font-weight: 700;
          padding: 7px 6px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          border: 1px solid #334155;
        }
        th.center, td.center { text-align: center; }
        th.right, td.right { text-align: right; }
        td {
          padding: 6px 6px;
          border: 1px solid #cbd5e1;
          color: #1e293b;
          vertical-align: middle;
          font-size: 13px;
        }
        tbody tr:nth-child(even) td { background: #f8fafc; }
        .dept-total-row td {
          background: #f1f5f9 !important;
          font-weight: 800 !important;
          border-top: 1.5px solid #94a3b8;
          color: #0f172a;
          font-size: 13px;
        }
        .grand-total-box {
          margin-top: 14px;
          padding: 10px 14px;
          background: #0f172a;
          color: #fff;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          page-break-inside: avoid;
        }
        .grand-total-box .title {
          font-size: 14px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .grand-total-box .amount {
          font-size: 22px;
          font-weight: 900;
          font-family: 'Courier New', monospace;
          color: #38bdf8;
        }
        .footer-note {
          margin-top: 12px;
          font-size: 11px;
          color: #64748b;
          text-align: center;
          border-top: 1px dashed #cbd5e1;
          padding-top: 6px;
          line-height: 1.5;
        }
        .nowrap { white-space: nowrap; }
        .mono { font-family: 'Courier New', monospace; font-weight: 700; }
        .iban-text {
          font-family: 'Courier New', monospace;
          font-weight: 700;
          font-size: 11.5px;
          letter-spacing: -0.3px;
          white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <!-- HEADER -->
      <div class="header">
        <div class="header-logo">
          <div style="font-size:20px;font-weight:900;color:#0f172a;">PIXX TECHNOLOGIES</div>
        </div>
        <div class="header-company">
          <h1>PIXX TECHNOLOGIES PAKISTAN</h1>
          <p>Office 4C Chanbeli Block, Bahria Town Lahore &bull; Standalone Staff HR &amp; Payroll</p>
        </div>
      </div>

      <!-- TITLE BANNER -->
      <div class="title-banner">
        <div>
          <h2>Executive Pending Salary Payout Statement</h2>
          <div class="meta">Month: ${formattedTitleDate} &bull; Filter: Strictly Pending Salaries (Paid / Verified Excluded)</div>
        </div>
        <div class="meta" style="text-align:right;">
          Date Generated: 12/11/2026<br/>
          Boss Transfer Order
        </div>
      </div>

      <!-- SUMMARY CARDS -->
      <div class="summary-cards">
        <div class="summary-card">
          <div class="lbl">Total Pending Staff</div>
          <div class="val">${totalStaff}</div>
        </div>
        <div class="summary-card">
          <div class="lbl">Workplace Offices</div>
          <div class="val">${totalOffices}</div>
        </div>
        <div class="summary-card highlight">
          <div class="lbl">Total Pending Net Payout</div>
          <div class="val">Rs. ${formatPKR(grandRemainingSalary)}</div>
        </div>
      </div>

      <!-- SECTIONS PER WORKPLACE / DEPARTMENT -->
      ${Object.entries(departmentGroups).map(([deptName, emps]) => {
        const subtotal = emps.reduce((sum, e) => sum + e.remainingSalary, 0);
        return `
          <div class="section-block">
            <div class="section-header">
              <h3>Office / Location: ${deptName}</h3>
              <span class="badge">${emps.length} Staff Member${emps.length === 1 ? '' : 's'} &bull; Subtotal: Rs. ${formatPKR(subtotal)}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th class="center" style="width: 4%;">#</th>
                  <th style="width: 19%;">Employee Name</th>
                  <th style="width: 15%;">Designation</th>
                  <th class="right" style="width: 14%;">Final Salary</th>
                  <th style="width: 16%;">Account Title</th>
                  <th style="width: 22%;">IBAN / Account No</th>
                  <th style="width: 10%;">Bank Name</th>
                </tr>
              </thead>
              <tbody>
                ${emps.map((emp, idx) => `
                  <tr>
                    <td class="center font-bold">${idx + 1}</td>
                    <td><strong>${emp.name}</strong></td>
                    <td style="color:#475569;">${emp.designation}</td>
                    <td class="right mono nowrap" style="color:#0f172a;font-weight:800;">Rs. ${formatPKR(emp.remainingSalary)}</td>
                    <td>${emp.accountTitle || emp.name}</td>
                    <td class="iban-text">${emp.ibanNumber || '—'}</td>
                    <td>${emp.bankName || 'Cash'}</td>
                  </tr>
                `).join('')}
                <tr class="dept-total-row">
                  <td colspan="3" class="right" style="text-transform:uppercase;letter-spacing:0.5px;">Subtotal for ${deptName}:</td>
                  <td class="right mono nowrap" style="color:#1e1b4b;font-size:14px;">Rs. ${formatPKR(subtotal)}</td>
                  <td colspan="3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      <!-- GRAND TOTAL BANNER -->
      <div class="grand-total-box">
        <div class="title">Grand Total Pending Payout (All Workplace Branches)</div>
        <div class="amount">Rs. ${formatPKR(grandRemainingSalary)}</div>
      </div>

      <!-- FOOTER NOTE -->
      <div class="footer-note">
        This document contains strictly unverified and pending staff salaries awaiting disbursement approval. Paid and settled salaries are excluded.<br/>
        Confidential Management Document &bull; Pixx Technologies Pakistan
      </div>

    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    landscape: false,
    margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
    printBackground: true,
  });

  const outPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\b67d6b70-8d7f-4d5b-84ce-cea022f0e6d6\\scratch\\test_boss_pending_doubled.pdf';
  fs.writeFileSync(outPath, pdfBuffer);
  console.log('PDF written successfully to', outPath, 'Bytes:', pdfBuffer.length);

  await browser.close();
}

generate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
