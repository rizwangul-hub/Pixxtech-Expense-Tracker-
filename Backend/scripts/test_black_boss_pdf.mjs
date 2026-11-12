import fs from 'fs';

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
        @page { size: A4 portrait; margin: 5mm 6mm 4mm 6mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #000000;
          background: #ffffff;
          font-size: 13.5px;
          line-height: 1.25;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2.5px solid #000000;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }
        .header-logo img {
          height: 36px;
          width: auto;
          object-fit: contain;
        }
        .header-company {
          text-align: right;
        }
        .header-company h1 {
          font-size: 18px;
          font-weight: 900;
          color: #000000;
          letter-spacing: 0.5px;
          line-height: 1.1;
        }
        .header-company p {
          font-size: 11px;
          color: #000000;
          font-weight: 600;
          margin-top: 1px;
        }
        .title-banner {
          background: #000000;
          color: #ffffff;
          padding: 6px 10px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .title-banner h2 {
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          line-height: 1.15;
          color: #ffffff;
        }
        .title-banner .meta {
          font-size: 11px;
          color: #ffffff;
          font-weight: 700;
        }
        .summary-cards {
          display: flex;
          gap: 8px;
          margin-bottom: 6px;
        }
        .summary-card {
          flex: 1;
          border: 1.5px solid #000000;
          border-radius: 5px;
          padding: 4px 8px;
          background: #ffffff;
          text-align: center;
        }
        .summary-card.highlight {
          background: #ffffff;
          border: 2px solid #000000;
        }
        .summary-card .lbl {
          font-size: 10px;
          font-weight: 800;
          color: #000000;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .summary-card .val {
          font-size: 17px;
          font-weight: 900;
          color: #000000;
          line-height: 1.15;
          margin-top: 1px;
          font-family: 'Courier New', monospace;
        }
        .summary-card.highlight .val {
          color: #000000;
        }
        .section-block {
          margin-bottom: 6px;
          page-break-inside: avoid;
        }
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
          border: 1px solid #000000;
          border-left: 5px solid #000000;
          padding: 3px 8px;
          border-radius: 4px;
          margin-bottom: 3px;
        }
        .section-header h3 {
          font-size: 12.5px;
          font-weight: 900;
          color: #000000;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .section-header .badge {
          font-size: 11px;
          font-weight: 800;
          background: #000000;
          color: #ffffff;
          padding: 1px 8px;
          border-radius: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 2px;
          font-size: 12.5px;
        }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th {
          background: #000000;
          color: #ffffff;
          font-weight: 800;
          padding: 3.5px 5px;
          text-align: left;
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          border: 1px solid #000000;
        }
        th.center, td.center { text-align: center; }
        th.right, td.right { text-align: right; }
        td {
          padding: 2.5px 5px;
          border: 1px solid #000000;
          color: #000000;
          vertical-align: middle;
          font-size: 12.5px;
          line-height: 1.2;
        }
        tbody tr:nth-child(even) td { background: #fdfdfd; }
        .dept-total-row td {
          background: #f4f4f4 !important;
          font-weight: 900 !important;
          border-top: 2px solid #000000;
          border-bottom: 1.5px solid #000000;
          color: #000000;
          padding: 2.5px 5px;
          font-size: 12px;
        }
        .grand-total-box {
          margin-top: 6px;
          padding: 5px 12px;
          background: #000000;
          color: #ffffff;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          page-break-inside: avoid;
        }
        .grand-total-box .title {
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: #ffffff;
        }
        .grand-total-box .amount {
          font-size: 19px;
          font-weight: 900;
          font-family: 'Courier New', monospace;
          color: #ffffff;
        }
        .footer-note {
          margin-top: 5px;
          font-size: 9.5px;
          color: #000000;
          font-weight: 600;
          text-align: center;
          border-top: 1px solid #000000;
          padding-top: 3px;
          line-height: 1.3;
        }
        .nowrap { white-space: nowrap; }
        .mono { font-family: 'Courier New', monospace; font-weight: 800; }
        .iban-text {
          font-family: 'Courier New', monospace;
          font-weight: 800;
          font-size: 11.5px;
          letter-spacing: -0.2px;
          white-space: nowrap;
          color: #000000;
        }
      </style>
    </head>
    <body>
      <!-- HEADER -->
      <div class="header">
        <div class="header-logo">
          <div style="font-size:18px;font-weight:900;color:#000000;">PIXX TECHNOLOGIES</div>
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
                    <td style="color:#000000;font-weight:600;">${emp.designation}</td>
                    <td class="right mono nowrap" style="color:#000000;font-weight:900;">Rs. ${formatPKR(emp.remainingSalary)}</td>
                    <td style="color:#000000;">${emp.accountTitle || emp.name}</td>
                    <td class="iban-text">${emp.ibanNumber || '—'}</td>
                    <td style="color:#000000;">${emp.bankName || 'Cash'}</td>
                  </tr>
                `).join('')}
                <tr class="dept-total-row">
                  <td colspan="3" class="right" style="text-transform:uppercase;letter-spacing:0.5px;color:#000000;">Subtotal for ${deptName}:</td>
                  <td class="right mono nowrap" style="color:#000000;font-size:13px;font-weight:900;">Rs. ${formatPKR(subtotal)}</td>
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
    margin: { top: '5mm', right: '6mm', bottom: '4mm', left: '6mm' },
    printBackground: true,
  });

  const outPath = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\b67d6b70-8d7f-4d5b-84ce-cea022f0e6d6\\scratch\\test_boss_pending_black.pdf';
  fs.writeFileSync(outPath, pdfBuffer);
  console.log('PDF written successfully to', outPath, 'Bytes:', pdfBuffer.length);

  await browser.close();
}

generate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
