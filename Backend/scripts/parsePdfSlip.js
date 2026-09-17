import fs from 'fs';

const buf = fs.readFileSync('C:\\Users\\HP\\Pictures\\Salary  Slip.pdf');
const str = buf.toString('latin1');

// Extract text inside PDF literal strings (Tj or TJ)
const textMatches = str.match(/\(([^)]+)\)/g) || [];
console.log('PDF Extracted Strings:\n');
textMatches.forEach(s => {
  const clean = s.slice(1, -1);
  if (clean.length > 1 && !clean.includes('obj') && !clean.includes('Font')) {
    console.log(clean);
  }
});
