const { spawn } = require('node:child_process');
const path = require('node:path');

const expoCli = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli');
const existingNodeOptions = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
const nodeOptions = `${existingNodeOptions}--max-old-space-size=4096`;

const child = spawn(process.execPath, [expoCli, ...process.argv.slice(2)], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});

child.on('error', (error) => {
  console.error('Failed to start Expo:', error.message);
  process.exit(1);
});
