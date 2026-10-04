#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.4.0';
const MAX_BYTES = 8 * 1024 * 1024;
const APP_ROOT = resolve(process.env.CREATOR_GRAPH_APP_ROOT || dirname(fileURLToPath(import.meta.url)));

export function localOrigin(value = process.env.CREATOR_GRAPH_URL || 'http://127.0.0.1:4327') {
  let url;
  try { url = new URL(value); } catch { throw new Error('CREATOR_GRAPH_URL must be a loopback HTTP URL.'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CREATOR_GRAPH_URL must be http://localhost, http://127.0.0.1, or http://[::1], optionally with a port; credentials, paths and remote hosts are rejected.');
  }
  // Pin localhost to an IP so a DNS override cannot route local submissions elsewhere.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.origin;
}

async function readBounded(stream, limit = MAX_BYTES) {
  const parts = []; let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error(`JSON exceeds ${limit} bytes.`);
    parts.push(bytes);
  }
  return Buffer.concat(parts).toString('utf8');
}

async function request(origin, path, method = 'GET', payload) {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  if (body && Buffer.byteLength(body) > MAX_BYTES) throw new Error('Request JSON is too large.');
  let response;
  try {
    response = await fetch(origin + path, {
      method, body, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}) },
    });
  } catch (error) {
    throw new Error(`Local app request failed (${error.name}). Run start to launch the app.`, { cause: error });
  }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel(); throw new Error('Local app response is too large.');
  }
  const raw = await readBounded(response.body || []);
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`Local app returned non-JSON (HTTP ${response.status}).`); }
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : typeof data.error?.message === 'string' ? data.error.message : 'Request rejected';
    throw new Error(`HTTP ${response.status}: ${message.slice(0, 500)}`);
  }
  return data;
}

async function health(origin) {
  const result = await request(origin, '/api/health');
  if (![result.product, result.app, result.id].includes('creator-source-graph')) throw new Error('The local port belongs to another app.');
  if (typeof result.version !== 'string' || !/^\d+\.\d+\.\d+/.test(result.version)) throw new Error('The local app has no compatible version metadata.');
  const [major, minor] = result.version.split('.').map(Number);
  if (major === 0 && minor < 4) throw new Error('This CLI requires Creator Source Graph 0.4.0 or newer. Close the older app and run start again.');
  return result;
}

function runId(value) {
  if (!value || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error('A valid run ID is required.');
  return encodeURIComponent(value);
}

async function launch(origin) {
  const url = new URL(origin);
  if (url.hostname === '[::1]') throw new Error('Automatic launch uses IPv4. Start the app manually for an IPv6 URL.');
  const entry = resolve(APP_ROOT, 'launch.mjs');
  try { await stat(entry); } catch { throw new Error('App launch.mjs is missing. If the app moved, reinstall the skill from its new folder.'); }
  await new Promise((resolveDone, reject) => {
    const child = spawn(process.execPath, [entry, '--headless', '--port', url.port || '80'], {
      cwd: APP_ROOT, env: { ...process.env, PORT: url.port || '80' }, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    });
    let outputBytes = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error('App launcher timed out after 30 seconds. Check local app status before retrying.')); }, 30000);
    const relay = chunk => { outputBytes += chunk.length; if (outputBytes < 65536) process.stderr.write(chunk); };
    child.stdout.on('data', relay); child.stderr.on('data', relay);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolveDone() : reject(new Error(`App launcher exited ${code}.`)); });
  });
  return health(origin);
}

async function ensureApp(origin) {
  // A listening but incompatible app must never be replaced or receive imports.
  try { return await health(origin); }
  catch (error) {
    if (!error.cause) throw error;
    return launch(origin);
  }
}

async function openBrowser(origin) {
  const [program, args] = process.platform === 'darwin' ? ['open', [origin]] :
    process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', origin]] : ['xdg-open', [origin]];
  await new Promise((done, reject) => {
    const child = spawn(program, args, { stdio: 'ignore', shell: false });
    child.once('error', reject); child.once('exit', code => code === 0 ? done() : reject(new Error(`Browser opener exited ${code}.`)));
  });
}

function help() {
  return {
    product: 'creator-source-graph', version: VERSION,
    commands: {
      'start [url]': 'Start/reuse the local app; URL creates a host-agent research run.',
      'status [runId]': 'Get a run, or list runs.',
      'progress <runId> [note]': 'Record that host research is underway.',
      'submit <runId> <json-file|->': 'Import bounded JSON with records, coverage, status and note. Use - for stdin.',
      'export [runId]': 'Without ID, export portable raw workspace. With ID, return exact run, raw workspace and rendered graph nodes/edges.',
      'stop <runId> / cancel <runId>': 'Cancel this research run; does not shut down the app.',
      open: 'Start/reuse the app and open its local graph.',
      'skill-prompt [url]': 'Print a prompt to invoke the installed skill in an existing AI host.',
      'install --host codex|claude|both [--skills-dir path] [--force]': 'Install local host skills. Custom directory requires one host.',
      'help / version': 'Print machine-readable help or version.',
    },
    localUrl: 'http://127.0.0.1:4327',
    configuration: 'CREATOR_GRAPH_URL overrides the loopback HTTP origin.',
    research: 'Use the existing Codex/Claude Code session and its web/browser tools. The app makes no LLM calls and needs no paid provider API keys.',
    evidence: 'Read skills/creator-source-graph/references/import-schema.md before collecting; agent records are reported host evidence, not server-verified observations.',
  };
}

export async function main(argv = process.argv.slice(2)) {
  const [command = 'help', ...args] = argv;
  if (command === 'help' || command === '--help' || command === '-h') return help();
  if (command === 'version' || command === '--version') return { product: 'creator-source-graph', version: VERSION };
  if (command === 'install') {
    const { installFromArgs } = await import('./install.mjs');
    return installFromArgs(args, APP_ROOT);
  }
  if (command === 'skill-prompt') {
    if (args.length > 1) throw new Error('skill-prompt accepts at most one URL.');
    return {
      codex: `$creator-source-graph ${args[0] || '<product-or-repository-url>'}`,
      claude: `/creator-source-graph ${args[0] || '<product-or-repository-url>'}`,
      note: 'Paste into an existing signed-in local host session. Tool availability and usage follow your host subscription; the app does not start a new model session.',
    };
  }
  const origin = localOrigin();
  if (command === 'start') {
    if (args.length > 1) throw new Error('start accepts at most one URL.');
    const app = await ensureApp(origin);
    if (!args[0]) return { url: origin, health: app };
    const started = await request(origin, '/api/agent/runs', 'POST', { url: args[0] });
    return { url: origin, run: started.run || started };
  }
  if (command === 'open') {
    if (args.length) throw new Error('open accepts no arguments.');
    await ensureApp(origin); await openBrowser(origin); return { url: origin, opened: true };
  }
  if (!['status', 'progress', 'submit', 'export', 'stop', 'cancel'].includes(command)) throw new Error(`Unknown command: ${command}. Run help.`);
  await health(origin);
  if (command === 'status') {
    if (args.length > 1) throw new Error('status accepts at most one run ID.');
    return request(origin, args[0] ? `/api/agent/runs/${runId(args[0])}` : '/api/agent/runs');
  }
  if (command === 'progress') {
    if (args.length < 1 || args.length > 2) throw new Error('progress needs a run ID and optional quoted note.');
    return request(origin, `/api/agent/runs/${runId(args[0])}/progress`, 'POST', { note: (args[1] || '').slice(0, 500) });
  }
  if (command === 'submit') {
    if (args.length !== 2) throw new Error('submit needs an exact run ID and JSON file or -.');
    const id = runId(args[0]); let raw;
    if (args[1] === '-') raw = await readBounded(process.stdin);
    else {
      if ((await stat(args[1])).size > MAX_BYTES) throw new Error('Input JSON is too large.');
      raw = await readFile(args[1], 'utf8');
      if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('Input JSON is too large.');
    }
    let payload; try { payload = JSON.parse(raw); } catch { throw new Error('Input is not valid JSON.'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.records) || !Array.isArray(payload.coverage)) throw new Error('Input requires records and coverage arrays.');
    return request(origin, `/api/agent/runs/${id}/import`, 'POST', payload);
  }
  if (command === 'export') {
    if (args.length > 1) throw new Error('export accepts at most one run ID.');
    const selected = args[0] ? await request(origin, `/api/agent/runs/${runId(args[0])}`) : undefined;
    const run = selected?.run || selected;
    if (run === undefined) return request(origin, '/api/export');
    const [workspace, graph] = await Promise.all([
      request(origin, '/api/export'), request(origin, '/api/workspace'),
    ]);
    return { run, workspace, graph };
  }
  if (args.length !== 1) throw new Error('stop/cancel needs exactly one run ID.');
  return request(origin, `/api/agent/runs/${runId(args[0])}/cancel`, 'POST', {});
}

const entryPath = (() => { try { return process.argv[1] ? realpathSync(process.argv[1]) : ''; } catch { return ''; } })();
if (entryPath === fileURLToPath(import.meta.url)) {
  main().then(result => {
    const output = JSON.stringify(result);
    if (Buffer.byteLength(output) > MAX_BYTES * 3) throw new Error('Output JSON is too large.');
    process.stdout.write(output + '\n');
  }).catch(error => {
    process.stderr.write(JSON.stringify({ error: error.message, product: 'creator-source-graph' }) + '\n');
    process.exitCode = 1;
  });
}
