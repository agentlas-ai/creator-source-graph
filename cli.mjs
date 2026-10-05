#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.7.1';
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
    if (response.status === 401) throw Object.assign(new Error('Agentlas sign-in is required.'), { loginRequired: true });
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
  if (major === 0 && minor < Number(VERSION.split('.')[1])) throw new Error('This CLI requires Creator Source Graph ' + VERSION + ' or newer. Upgrade the app, close the older app and run start again.');
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

async function authStatus(origin) {
  let raw;
  try { raw = await request(origin, '/api/auth/status'); }
  catch { throw new Error('Could not read local Agentlas sign-in status. Check the app and sign-in page.'); }
  if (!raw || typeof raw.authenticated !== 'boolean') throw new Error('The local app returned invalid authentication status.');
  // Never forward arbitrary auth fields, errors, provider replies or tokens.
  const result = { authenticated: raw.authenticated, loginRequired: !raw.authenticated,
    status: raw.authenticated ? 'signed-in' : ['signed-out', 'pending', 'error'].includes(raw.status) ? raw.status : 'signed-out' };
  if (raw.authenticated && raw.user && typeof raw.user === 'object') {
    result.user = {};
    if (typeof raw.user.id === 'string') result.user.id = raw.user.id.slice(0, 160);
    if (typeof raw.user.displayName === 'string') result.user.displayName = raw.user.displayName.slice(0, 160);
  }
  if (typeof raw.expiresAt === 'string' && Number.isFinite(Date.parse(raw.expiresAt))) result.expiresAt = new Date(raw.expiresAt).toISOString();
  if (raw.status === 'error') result.error = 'Agentlas sign-in did not complete. Check the sign-in page and retry login when ready.';
  return result;
}

function loginReceipt(origin, auth, extras = {}) {
  return { ...auth, loginUrl: origin + '/auth/login?returnTo=/', researchPerformed: false, run: null, ...extras };
}

function waitOptions(args, defaultSeconds) {
  let seconds = defaultSeconds; const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--wait-seconds') {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value) || Number(value) > 300) throw new Error('--wait-seconds must be an integer from 0 to 300.');
      seconds = Number(value);
    } else if (args[i].startsWith('--')) throw new Error('Unknown login/start option: ' + args[i]);
    else positional.push(args[i]);
  }
  return { seconds, positional };
}

async function waitForLogin(origin, seconds, initial) {
  let auth = initial;
  const deadline = Date.now() + seconds * 1000;
  while (!auth.authenticated && Date.now() < deadline) {
    await new Promise(done => setTimeout(done, Math.min(2000, deadline - Date.now())));
    auth = await authStatus(origin);
  }
  return auth;
}

async function loginFlow(origin, seconds, extras = {}) {
  const initial = await authStatus(origin);
  if (initial.authenticated) return initial;
  let browser = initial.status === 'pending' ? 'already-pending' : 'opened';
  if (initial.status !== 'pending') {
    try { await openBrowser(origin + '/auth/login?returnTo=/'); }
    catch { browser = 'manual'; }
  }
  if (seconds > 0) process.stderr.write('Sign in on the Agentlas page to continue. Waiting up to ' + seconds + ' seconds; no research has run.\n');
  const auth = await waitForLogin(origin, seconds, initial);
  return auth.authenticated ? { ...auth, browser } : loginReceipt(origin, auth, {
    browser, waitedSeconds: seconds, ...extras,
    note: 'Sign in on the Agentlas page, then check login status and resume the same requested target. No research run was created.',
  });
}

function help() {
  return {
    product: 'creator-source-graph', version: VERSION,
    commands: {
      'start [url] [--wait-seconds N]': 'Start/reuse app; first opens Agentlas sign-in and waits up to 90 seconds, then creates a research run only when signed in.',
      'login [--wait-seconds N]': 'Open Agentlas sign-in if needed; default wait is 0, optional wait is 0–300 seconds. Never reads credentials.',
      'login status / auth-status': 'Read current Agentlas sign-in status without opening another browser page.',
      logout: 'Sign out the local app session and reread status.',
      'status [runId]': 'Get a run, or list runs.',
      'progress <runId> [note]': 'Record that host research is underway.',
      'submit <runId> <json-file|->': 'Import bounded JSON with records, coverage, status and note. Use - for stdin.',
      'export [runId]': 'Without ID, export portable raw workspace. With ID, return exact run, raw workspace and rendered graph nodes/edges.',
      'stop <runId> / cancel <runId>': 'Cancel this research run; does not shut down the app.',
      open: 'Start/reuse app and open local graph, or Agentlas sign-in when signed out.',
      'skill-prompt [url]': 'Print a prompt to invoke the installed skill in an existing AI host.',
      'install --host codex|claude|both [--skills-dir path] [--force]': 'Install local host skills. Custom directory requires one host.',
      'setup [target-url] --host codex|claude|both [--skills-dir path] [--force] [--wait-seconds N]': 'Install/reuse matching host skill, launch app and open Agentlas login/graph. Optional target resumes in this AI host after login.',
      'help / version': 'Print machine-readable help or version.',
    },
    localUrl: 'http://127.0.0.1:4327',
    configuration: 'CREATOR_GRAPH_URL overrides the loopback HTTP origin.',
    research: 'Sign in to Agentlas, then use the existing Codex/Claude Code session and its web/browser tools. The app makes no LLM calls and needs no paid provider API keys.',
    evidence: 'Read skills/creator-source-graph/references/import-schema.md before collecting; agent records are reported host evidence, not server-verified observations.',
  };
}

async function dispatch(argv) {
  const [command = 'help', ...args] = argv;
  if (command === 'help' || command === '--help' || command === '-h') return help();
  if (command === 'version' || command === '--version') return { product: 'creator-source-graph', version: VERSION };
  if (command === 'install') {
    const { installFromArgs } = await import('./install.mjs');
    return installFromArgs(args, APP_ROOT);
  }
  if (command === 'setup') {
    const installationArgs = [], startArgs = []; let host, waitSpecified = false;
    for (let i = 0; i < args.length; i++) {
      if (['--host', '--skills-dir', '--wait-seconds'].includes(args[i])) {
        const option = args[i], value = args[++i];
        if (!value) throw new Error('Missing value for ' + option);
        if (option === '--wait-seconds') { startArgs.push(option, value); waitSpecified = true; }
        else { installationArgs.push(option, value); if (option === '--host') host = value; }
      } else if (args[i] === '--force') installationArgs.push(args[i]);
      else if (args[i].startsWith('--')) throw new Error('Unknown setup option: ' + args[i]);
      else startArgs.unshift(args[i]);
    }
    const parsed = waitOptions(startArgs, 90);
    if (parsed.positional.length > 1) throw new Error('setup accepts at most one target URL.');
    if (!host) throw new Error('setup needs --host codex or --host claude for the AI host performing this installation; both is also supported.');
    if (!parsed.positional.length && !waitSpecified) startArgs.push('--wait-seconds', '0');
    const origin = localOrigin();
    const { installFromArgs } = await import('./install.mjs');
    const installation = await installFromArgs(installationArgs, APP_ROOT);
    await ensureApp(origin);
    const before = await authStatus(origin);
    const started = await dispatch(['start', ...startArgs]);
    let graphBrowser = 'waiting-for-login';
    if (!started.loginRequired) {
      if (before.authenticated) {
        try { await openBrowser(origin); graphBrowser = 'opened'; }
        catch { graphBrowser = 'manual'; }
      } else graphBrowser = 'login-return';
    }
    return { ...started, installation, graphBrowser,
      hostAction: {
        skillFiles: installation.installed.map(entry => resolve(entry.path, 'SKILL.md')),
        action: started.loginRequired ? 'Wait for Agentlas sign-in; poll login status without opening another page, then resume this same target.' :
          started.run ? 'Read the installed SKILL.md now and perform research in this current AI session, reusing the exact returned run ID.' :
          'The app is open. Read the installed SKILL.md and continue when the user supplies a product/repository target URL.',
        startsAnotherModelSession: false,
      },
    };
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
  if (command === 'login' || command === 'auth-status') {
    const { seconds, positional } = waitOptions(args, 0);
    if (command === 'auth-status' || positional[0] === 'status') {
      if (positional.length > (command === 'auth-status' ? 0 : 1) || (command === 'auth-status' ? args.length : args.length !== 1)) throw new Error('login status/auth-status accepts no additional arguments.');
      await health(origin);
      const auth = await authStatus(origin);
      return auth.authenticated ? auth : loginReceipt(origin, auth);
    }
    if (positional.length) throw new Error('login accepts only --wait-seconds N or status.');
    await ensureApp(origin);
    return loginFlow(origin, seconds);
  }
  if (command === 'logout') {
    if (args.length) throw new Error('logout accepts no arguments.');
    await health(origin);
    try { await request(origin, '/api/auth/logout', 'POST', {}); }
    catch { throw new Error('Local sign-out could not be confirmed. Check login status before retrying.'); }
    const auth = await authStatus(origin);
    return auth.authenticated ? { ...auth, loggedOut: false } : { ...loginReceipt(origin, auth), loggedOut: true };
  }
  if (command === 'start') {
    const { seconds, positional } = waitOptions(args, 90);
    if (positional.length > 1) throw new Error('start accepts at most one URL.');
    const intendedProductUrl = positional[0] || null;
    const app = await ensureApp(origin);
    const auth = await loginFlow(origin, seconds, { intendedProductUrl });
    if (!auth.authenticated) return { url: origin, ...auth };
    if (!intendedProductUrl) return { url: origin, health: app, auth };
    try {
      const started = await request(origin, '/api/agent/runs', 'POST', { url: intendedProductUrl });
      return { url: origin, run: started.run || started };
    } catch (error) {
      if (error.loginRequired) return loginReceipt(origin, await authStatus(origin), {
        intendedProductUrl, authenticated: false, loginRequired: true,
        note: 'Sign-in was required when creating this run. Check login status before resuming the same target; no run was created.',
      });
      throw error;
    }
  }
  if (command === 'open') {
    if (args.length) throw new Error('open accepts no arguments.');
    await ensureApp(origin);
    const auth = await authStatus(origin);
    if (!auth.authenticated) return loginFlow(origin, 0);
    await openBrowser(origin); return { url: origin, opened: true };
  }
  if (!['status', 'progress', 'submit', 'export', 'stop', 'cancel'].includes(command)) throw new Error(`Unknown command: ${command}. Run help.`);
  await health(origin);
  const auth = await authStatus(origin);
  if (!auth.authenticated) return loginReceipt(origin, auth, { requestedCommand: command, requestedRunId: args[0] || null });
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

export async function main(argv = process.argv.slice(2)) {
  try { return await dispatch(argv); }
  catch (error) {
    if (!error.loginRequired) throw error;
    const origin = localOrigin();
    const auth = await authStatus(origin);
    return loginReceipt(origin, auth, {
      authenticated: false, loginRequired: true,
      requestedCommand: argv[0] || null, requestedRunId: argv[1] || null,
      note: 'The app rejected this request because sign-in is required. Check login status before resuming; no browser page was reopened.',
    });
  }
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
