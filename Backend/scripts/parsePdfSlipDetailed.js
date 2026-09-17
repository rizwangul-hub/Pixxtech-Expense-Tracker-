import fs from 'fs';

const buf = fs.readFileSync('C:\\Users\\HP\\Pictures\\Salary  Slip.pdf');
const content = buf.toString('binary');

// Find all text blocks inside Parentheses in PDF stream
const regex = /\((.*?)\)/g;
let match;
const lines = [];
while ((match = regex.exec(content)) !== null) {
  const str = match[1];
  if (str && !str.includes('Font') && !str.includes('MediaBox') && !str.includes('ProcSet')) {
    lines.push(str);
  }
}

console.log('PDF Text Lines Count:', lines.length);
console.log('Sample PDF Lines:');
console.log(lines.join('\n'));
