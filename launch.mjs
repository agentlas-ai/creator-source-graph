import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dataDirectory } from './lib/runtime.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '0.5.0';
export async function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Open ' + url + ' in your browser.')));
  });
}
async function health(url) {
  try {
    const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1500), redirect: 'error' });
    if (!response.ok) return { occupied: true };
    const text = await response.text();
    if (text.length > 8000) return { occupied: true };
    const value = JSON.parse(text);
    return value.product === 'creator-source-graph' && value.status === 'ok' ? value : { occupied: true };
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return null;
    return error.name === 'SyntaxError' ? { occupied: true } : null;
  }
}
export async function launch({ headless = false, port = Number(process.env.PORT || 4327) } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.');
  const url = 'http://127.0.0.1:' + port;
  const existing = await health(url);
  if (existing?.occupied) throw new Error('Port ' + port + ' belongs to another app. Choose a different PORT.');
  if (existing && existing.version !== VERSION) throw new Error('An older Creator Source Graph is running. Quit it before opening this version.');
  let pid = null, started = false;
  if (!existing) {
    const directory = dataDirectory();
    await mkdir(directory, { recursive: true });
    const logfile = await open(path.join(directory, 'server.log'), 'a', 0o600);
    let child;
    try {
      child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
        cwd: ROOT, detached: true, windowsHide: true,
        env: { ...process.env, PORT: String(port), GRAPH_DATA_DIR: directory },
        stdio: ['ignore', logfile.fd, logfile.fd]
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      pid = child.pid; child.unref();
    } finally { await logfile.close(); }
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const ready = await health(url);
      if (ready?.product === 'creator-source-graph' && ready.version === VERSION) { started = true; break; }
    }
    if (!started) throw new Error('The app did not start. Check the local server log or choose a different PORT.');
  }
  let browser = headless ? 'skipped' : 'opened';
  if (!headless) { try { await openBrowser(url); } catch { browser = 'manual'; } }
  return { url, started, pid, browser };
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2); const portIndex = args.indexOf('--port');
    const result = await launch({ headless: args.includes('--headless'), port: portIndex >= 0 ? Number(args[portIndex + 1]) : undefined });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
