import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedLogoBase64 = null;

/**
 * Get Base64 encoded data URI of Pixx Technologies Logo
 */
export const getLogoBase64 = () => {
  if (cachedLogoBase64) return cachedLogoBase64;

  const candidatePaths = [
    path.resolve(__dirname, '../../Frontend/src/assets/image/logo.png'),
    'd:/Web development/Expense Tracker/Frontend/src/assets/image/logo.png',
    path.resolve(__dirname, '../assets/logo.png'),
  ];

  for (const logoPath of candidatePaths) {
    if (fs.existsSync(logoPath)) {
      try {
        const fileBuffer = fs.readFileSync(logoPath);
        cachedLogoBase64 = `data:image/png;base64,${fileBuffer.toString('base64')}`;
        return cachedLogoBase64;
      } catch (err) {
        console.error(`[Logo Helper Error] Failed reading logo at ${logoPath}:`, err);
      }
    }
  }

  console.warn('[Logo Helper Warning] Logo file not found in candidate paths.');
  return '';
};

export default getLogoBase64;
