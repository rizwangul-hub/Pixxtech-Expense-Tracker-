import fs from 'fs';
import xlsx from 'xlsx';

const pdfPath = 'C:\\Users\\HP\\Pictures\\Salary  Slip.pdf';
const excelPath = 'C:\\Users\\HP\\Pictures\\Salary sheet.xlsx';

console.log('--- CHECKING SALARY SAMPLE FILES ---');
console.log('PDF exists:', fs.existsSync(pdfPath), pdfPath);
console.log('Excel exists:', fs.existsSync(excelPath), excelPath);

if (fs.existsSync(excelPath)) {
  try {
    const workbook = xlsx.readFile(excelPath);
    console.log('\nExcel Sheet Names:', workbook.SheetNames);
    for (const sName of workbook.SheetNames) {
      console.log(`\n--- Sheet: ${sName} ---`);
      const worksheet = workbook.Sheets[sName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
      console.log(data.slice(0, 25));
    }
  } catch (err) {
    console.error('Error reading Excel file:', err);
  }
}
