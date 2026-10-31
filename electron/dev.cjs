// `npm run desktop`: sobe o Vite e abre o Electron apontando para ele.
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const root = path.join(__dirname, '..');
const PORT = 5173;
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
});

function waitPort(cb) {
  const s = net.connect(PORT, '127.0.0.1');
  s.on('connect', () => {
    s.destroy();
    cb();
  });
  s.on('error', () => setTimeout(() => waitPort(cb), 300));
}

waitPort(() => {
  const electronPath = require('electron');
  const el = spawn(electronPath, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BOSSKEY_DEV_URL: `http://localhost:${PORT}` },
  });
  el.on('exit', () => {
    vite.kill();
    process.exit(0);
  });
});
vite.on('exit', () => process.exit(0));
