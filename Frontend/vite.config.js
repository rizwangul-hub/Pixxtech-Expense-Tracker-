import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatic Build Version Generation Plugin for Vercel & Production
function systemVersionPlugin() {
  let pkgVersion = '2.6.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
    if (pkg.version) pkgVersion = pkg.version;
  } catch {
    // fallback
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
  const buildId = commitSha ? commitSha.slice(0, 9) : `bld_${Date.now()}`;
  const buildTime = new Date().toISOString();

  const versionPayload = {
    version: pkgVersion,
    buildId,
    buildTime,
    updateType: 'NORMAL',
    title: '🚀 System Update Available!',
    description: [
      'New system features and performance enhancements',
      'Stability improvements and user experience updates'
    ],
    criticalDeadline: null
  };

  return {
    name: 'vite-plugin-system-version',
    config(config) {
      config.define = {
        ...(config.define || {}),
        __APP_VERSION__: JSON.stringify(pkgVersion),
        __BUILD_ID__: JSON.stringify(buildId),
        __BUILD_TIME__: JSON.stringify(buildTime),
      };
    },
    buildStart() {
      const publicDir = path.resolve(__dirname, 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(publicDir, 'version.json'),
        JSON.stringify(versionPayload, null, 2),
        'utf8'
      );
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(versionPayload, null, 2)
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), systemVersionPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
});
