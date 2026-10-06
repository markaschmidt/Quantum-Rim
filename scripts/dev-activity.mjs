import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readEnv(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = {
  ...process.env,
  ...readEnv(resolve('.env')),
  ...readEnv(resolve('.env.local')),
};
const vite = resolve('node_modules/vite/bin/vite.js');
const children = [
  spawn(process.execPath, ['server/devServer.js'], { stdio: 'inherit', env }),
  spawn(process.execPath, [vite], { stdio: 'inherit', env }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!stopping) stop(signal ? 1 : (code || 0));
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
