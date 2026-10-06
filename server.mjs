import http from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openAccountStore } from './lib/account-store.mjs';
import { mergeInput } from './lib/model.mjs';
import { normalizeUrl } from './lib/urls.mjs';
import { sourceDetail } from './lib/graph.mjs';
import { collectBatch } from './lib/collector.mjs';
import { inputUrl, researchGraph } from './lib/audience.mjs';
import { platformConnections, collectSocialUrl, socialPlatform } from './lib/social.mjs';
import { RESEARCH_PLATFORMS, createResearchRun, startResearchRun, importResearchRun, transitionResearchRun } from './lib/research.mjs';
import { detectHosts, runResearch } from './lib/host-runner.mjs';
import { dataDirectory } from './lib/runtime.mjs';
import { openAuth } from './lib/auth.mjs';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = '0.7.3';
const STATIC = new Map([['/', 'graph.html'], ['/analysis', 'graph.html'], ['/index.html', 'graph.html'], ['/app.js', 'graph.js'], ['/style.css', 'graph.css']]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}
function bindAccount(req, res, identity) {
  const account = identity.authenticated ? encodeURIComponent(identity.user.id) : null;
  if (account !== null) res.setHeader('x-creator-account-id', account);
  const requested = req.headers['x-creator-account-id'];
  if (requested !== undefined && requested !== account) {
    json(res, 409, { accountChanged: true, error: 'The Agentlas account changed. Refresh sign-in status before continuing.' });
    return false;
  }
  return true;
}
async function body(req) {
  let text = '', bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1_000_000) throw new Error('Request exceeds 1 MB.');
    text += chunk.toString('utf8');
  }
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Send a JSON object.');
  return value;
}
function runFrom(workspace, id) {
  const run = (workspace.researchRuns || []).find(item => item.id === id);
  if (!run) throw Object.assign(new Error('Research run not found.'), { httpStatus: 404 });
  return run;
}

export async function createApp({ dataDir = dataDirectory(), seed = { records: [] }, empty = false, collect = collectBatch, authOptions, researchRunner = { detectHosts, runResearch } } = {}) {
  const auth = await openAuth(dataDir, authOptions);
  const stores = new Map(), jobs = new Map(), starts = new Map();
  let closing = false, hostCache = null;
  const abortAccount = id => {
    starts.get(id)?.abort(); starts.delete(id);
    const job = jobs.get(id); job?.controller.abort(); jobs.delete(id);
    if (job) return job.store.update(workspace => {
      const run = workspace.researchRuns?.find(item => item.id === job.runId);
      if (!run || !['ready', 'searching'].includes(run.status) || workspace.activeResearchRunId !== job.runId) return { workspace, report: { unchanged: true } };
      return execution(transitionResearchRun(workspace, job.runId, 'cancelled', { note: 'Local research stopped.' }), {
        state: 'cancelled', endedAt: new Date().toISOString()
      });
    }).catch(() => {});
  };
  const abortAll = () => { for (const id of new Set([...jobs.keys(), ...starts.keys()])) abortAccount(id); };
  const accountStore = async user => {
    if (!stores.has(user.id)) {
      const pending = openAccountStore(dataDir, auth.accountDirectory(user), user, seed, { empty }).then(async store => {
        const active = store.get().researchRuns?.find(run => run.id === store.get().activeResearchRunId);
        if (active?.execution && ['ready', 'searching'].includes(active.status)) {
          await store.update(workspace => {
            const result = transitionResearchRun(workspace, active.id, 'error', { note: 'The previous local analysis was interrupted. Reanalyze to start again.' });
            return execution(result, { state: 'error', errorCode: 'INTERRUPTED', endedAt: new Date().toISOString() });
          });
        }
        return store;
      });
      stores.set(user.id, pending);
      pending.catch(() => { if (stores.get(user.id) === pending) stores.delete(user.id); });
    }
    return stores.get(user.id);
  };
  let collecting = false;
  const graphData = store => {
    const workspace = store.get();
    return { ...researchGraph(workspace), researchRuns: workspace.researchRuns || [], activeResearchRunId: workspace.activeResearchRunId || null };
  };
  const execution = (result, value) => {
    const run = { ...result.report.run, execution: { ...result.report.run.execution, ...value } };
    return { workspace: { ...result.workspace, researchRuns: result.workspace.researchRuns.map(item => item.id === run.id ? run : item) }, report: { ...result.report, run } };
  };
  const availableHosts = async ({ signal, fresh = false } = {}) => {
    if (!fresh && hostCache && Date.now() - hostCache.at < 8000) return hostCache.value;
    const value = await researchRunner.detectHosts({ signal });
    hostCache = { at: Date.now(), value }; return value;
  };
  const begin = async (store, value, launch) => {
    const url = inputUrl(value);
    const analysis = {
      mode: 'audience', url, title: new URL(url).hostname, topics: [], labels: ['Social content → source origins'],
      contentUrls: [], sourceUrls: [], queries: [], observedAt: new Date().toISOString(),
      platformCoverage: Object.fromEntries(RESEARCH_PLATFORMS.map(key => [key, 'waiting-for-agent'])),
      searchStatus: 'waiting-for-agent', matches: 0,
      queryBasis: 'Your AI host finds content on four social platforms, compares observed views, and traces intermediate and earliest found sources.'
    };
    const report = await store.update(workspace => {
      if (launch?.controller.signal.aborted || closing) throw new Error('Research start was cancelled.');
      const result = startResearchRun(workspace, url, { analysis });
      return launch ? execution(result, { host: launch.host, state: 'queued', startedAt: result.report.run.createdAt }) : result;
    });
    return { ...report, run: report.run, graph: graphData(store), attempts: [] };
  };
  const jobActive = job => !closing && !job.controller.signal.aborted && jobs.get(job.accountId) === job &&
    job.store.get().activeResearchRunId === job.runId && ['ready', 'searching'].includes(runFrom(job.store.get(), job.runId).status);
  const jobUpdate = async (job, fn) => {
    if (!jobActive(job)) return;
    const identity = await auth.status();
    if (!identity.authenticated || identity.user.id !== job.accountId) { abortAccount(job.accountId); return; }
    if (!jobActive(job)) return;
    return job.store.update(workspace => {
      if (!jobActive(job)) throw new Error('Research run is stale.');
      return fn(workspace);
    });
  };
  const launchResearch = async job => {
    let progress = Promise.resolve();
    try {
      await jobUpdate(job, workspace => execution(transitionResearchRun(workspace, job.runId, 'searching', {
        note: 'Searching domestic and global content and tracing source candidates.'
      }), { state: 'running', phase: 'researching' }));
      if (!jobActive(job)) return;
      const result = await researchRunner.runResearch({ host: job.host, url: job.url, runId: job.runId, signal: job.controller.signal,
        onProgress: value => {
          if (!jobActive(job) || !['starting', 'searching', 'researching', 'validating'].includes(value.phase)) return;
          progress = progress.then(() => jobUpdate(job, workspace => execution(transitionResearchRun(workspace, job.runId, 'searching', {
            note: value.phase === 'validating' ? 'Validating the collected evidence.' : 'Searching domestic and global content and tracing source candidates.'
          }), { phase: value.phase }))).catch(() => {});
        }
      });
      await progress;
      if (result.host !== job.host || result.runId !== job.runId || result.url !== job.url) throw Object.assign(new Error('Invalid research result.'), { code: 'OUTPUT_INVALID' });
      const proof = result.webResearch;
      if (!proof || proof.version !== 1 || proof.host !== job.host || proof.proof !== 'local-cli-events' ||
          !Number.isSafeInteger(proof.searchesCompleted) || proof.searchesCompleted < 1 ||
          !Number.isSafeInteger(proof.opensCompleted) || proof.opensCompleted < 1) throw Object.assign(new Error('Unverified web research.'), { code: 'WEB_RESEARCH_UNVERIFIED' });
      await jobUpdate(job, workspace => execution(importResearchRun(workspace, job.runId, result.batch), {
        state: 'finished', phase: 'finished', endedAt: new Date().toISOString(),
        webResearch: { version: 1, host: job.host, searchesCompleted: proof.searchesCompleted, opensCompleted: proof.opensCompleted, proof: 'local-cli-events' }
      }));
    } catch (error) {
      await progress;
      if (jobActive(job)) {
        const code = ['HOST_UNAVAILABLE', 'HOST_AUTH_REQUIRED', 'HOST_VERSION_UNSUPPORTED', 'TIMEOUT', 'OUTPUT_INVALID', 'OUTPUT_TOO_LARGE', 'HOST_FAILED', 'WEB_RESEARCH_UNVERIFIED'].includes(error.code) ? error.code : 'OUTPUT_INVALID';
        const notes = { HOST_UNAVAILABLE: 'Install or check your local AI CLI, then reanalyze.', HOST_VERSION_UNSUPPORTED: 'Update your local AI CLI, then reanalyze.', WEB_RESEARCH_UNVERIFIED: 'The local AI host did not complete web search and page opening. Check its web tools or try another host.', TIMEOUT: 'Analysis timed out. Reanalyze to try again.', HOST_AUTH_REQUIRED: 'Sign in to your local AI subscription, then reanalyze. If using Claude setup-token, renew an expired or invalid token and restart this app.', HOST_FAILED: 'The local AI host could not finish. Check its sign-in and plan limits, then reanalyze.' };
        await jobUpdate(job, workspace => execution(transitionResearchRun(workspace, job.runId, 'error', {
          note: notes[code] || 'The local AI host did not return valid evidence. Reanalyze to try again.'
        }), { state: 'error', errorCode: code, endedAt: new Date().toISOString() })).catch(() => {});
      }
    } finally { if (jobs.get(job.accountId) === job) jobs.delete(job.accountId); }
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) return json(res, 403, { error: 'Local hosts only.' });
      const url = new URL(req.url, 'http://' + host);
      if (req.headers.origin && req.headers.origin !== url.origin) return json(res, 403, { error: 'Cross-origin requests are not allowed.' });
      if (req.method === 'POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Use application/json.' });
      if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && STATIC.has(url.pathname)) {
        const filename = STATIC.get(url.pathname);
        const content = await readFile(path.join(ROOT, 'ui', filename));
        res.writeHead(200, { 'content-type': MIME[path.extname(filename)], 'cache-control': 'no-cache' });
        return res.end(content);
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', product: 'creator-source-graph', app: 'creator-source-graph', id: 'creator-source-graph', version: VERSION, collecting, mode: 'subscription-ai-web-research', apiKeysRequired: false });
      if (req.method === 'GET' && url.pathname === '/api/auth/status') {
        const identity = await auth.status();
        for (const id of new Set([...jobs.keys(), ...starts.keys()])) if (!identity.authenticated || identity.user.id !== id) abortAccount(id);
        return json(res, 200, identity);
      }
      if (req.method === 'GET' && url.pathname === '/auth/login') {
        if ((await auth.status()).authenticated) { res.writeHead(303, { location: '/', 'cache-control': 'no-store' }); return res.end(); }
        const origin = 'http://127.0.0.1:' + server.address().port;
        res.writeHead(303, { location: auth.begin(origin), 'cache-control': 'no-store' }); return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/auth/callback') {
        try {
          const identity = await auth.callback(url);
          for (const id of new Set([...jobs.keys(), ...starts.keys()])) if (!identity.authenticated || identity.user.id !== id) abortAccount(id);
          if (identity.authenticated) await accountStore(identity.user);
        } catch { /* The local gate shows a safe retry message; graph files remain preserved. */ }
        res.writeHead(303, { location: '/', 'cache-control': 'no-store' }); return res.end();
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        await body(req);
        const previousIdentity = await auth.status();
        if (!bindAccount(req, res, previousIdentity)) return;
        if (previousIdentity.authenticated) await abortAccount(previousIdentity.user.id);
        return json(res, 200, await auth.logout());
      }
      if (req.method === 'POST' && url.pathname === '/api/shutdown') {
        closing = true; abortAll();
        json(res, 200, { status: 'stopping' });
        setTimeout(shutdown, 100).unref();
        return;
      }
      const identity = await auth.status();
      if (!identity.authenticated) return json(res, 401, { error: 'Sign in with Agentlas to open your graph.', loginRequired: true, authenticated: false, loginUrl: '/auth/login?returnTo=/' });
      if (!bindAccount(req, res, identity)) return;
      const store = await accountStore(identity.user);
      if (req.method === 'GET' && url.pathname === '/api/workspace') return json(res, 200, graphData(store));
      if (req.method === 'GET' && url.pathname === '/api/research/hosts') return json(res, 200, await availableHosts());
      if (req.method === 'POST' && url.pathname === '/api/research') {
        const input = await body(req), target = createResearchRun(input.url).url, requested = input.host ?? 'auto';
        if (!['auto', 'codex', 'claude'].includes(requested)) throw new Error('Choose Auto, Codex, or Claude.');
        const accountId = identity.user.id;
        if (closing) return json(res, 503, { error: 'The local app is stopping.' });
        if (starts.has(accountId)) return json(res, 409, { error: 'The AI host is being checked. Try again in a moment.' });
        const controller = new AbortController(); starts.set(accountId, controller);
        try {
          const detected = await availableHosts({ signal: controller.signal, fresh: true });
          const chosen = detected.hosts.find(host => host.id === (requested === 'auto' ? detected.defaultHost : requested) && host.available && host.authMode === 'subscription');
          if (!chosen) {
            const candidate = requested === 'auto' ? detected.hosts.find(host => host.installed) ?? detected.hosts[0] : detected.hosts.find(host => host.id === requested);
            return json(res, 409, { error: candidate?.reason || 'Install Codex CLI or Claude Code and sign in with your subscription. Then select that host and analyze again.', code: candidate?.code || 'HOST_AUTH_REQUIRED', hosts: detected.hosts });
          }
          const latest = await auth.status();
          if (!latest.authenticated || latest.user.id !== accountId || controller.signal.aborted) return json(res, 409, { accountChanged: true, error: 'Research start was cancelled or the Agentlas account changed.' });
          // Abort the previous process only after URL and subscription checks pass.
          jobs.get(accountId)?.controller.abort(); jobs.delete(accountId);
          const report = await begin(store, target, { host: chosen.id, controller });
          const job = { accountId, store, host: chosen.id, url: target, runId: report.run.id, controller };
          jobs.set(accountId, job);
          json(res, 202, { ...report, host: chosen.id });
          void launchResearch(job);
          return;
        } finally { if (starts.get(accountId) === controller) starts.delete(accountId); }
      }
      if (req.method === 'GET' && url.pathname === '/api/platforms') return json(res, 200, { platforms: platformConnections(), provider: 'your-ai-host', apiKeysRequired: false, readOnly: true });
      if (req.method === 'GET' && url.pathname === '/api/agent/guide') return json(res, 200, {
        name: 'creator-source-graph', version: VERSION,
        hosts: [
          { name: 'Claude Code', command: '/creator-source-graph', install: 'node cli.mjs install --host claude --skill-scope user' },
          { name: 'Codex', command: '$creator-source-graph', install: 'node cli.mjs install --host codex --skill-scope user' }
        ],
        install: 'node cli.mjs setup --host both',
        packagedInstall: process.platform === 'win32' ? 'Install-Skills.bat' : process.platform === 'darwin' ? 'Install-Skills.command' : './install-skills.sh',
        requirement: 'A local AI host with web search/browser tools and shell access. Setup uses the bundled skill by default; slash/dollar discovery needs explicit personal installation. Existing subscription limits apply.',
        apiKeysRequired: false
      });
      if (req.method === 'GET' && url.pathname === '/api/agent/runs') {
        const workspace = store.get();
        return json(res, 200, { runs: workspace.researchRuns || [], activeResearchRunId: workspace.activeResearchRunId || null });
      }
      if (req.method === 'POST' && ['/api/agent/runs', '/api/analyze'].includes(url.pathname)) {
        const target = createResearchRun((await body(req)).url).url;
        abortAccount(identity.user.id);
        return json(res, 201, await begin(store, target));
      }
      const runMatch = /^\/api\/agent\/runs\/([a-f0-9-]{36})(?:\/(import|progress|cancel))?$/.exec(url.pathname);
      if (runMatch) {
        const [, id, action] = runMatch;
        if (req.method === 'GET' && !action) return json(res, 200, { run: runFrom(store.get(), id) });
        if (req.method === 'POST' && action === 'import') {
          const input = await body(req);
          const report = await store.update(workspace => importResearchRun(workspace, id, input));
          if (jobs.get(identity.user.id)?.runId === id) abortAccount(identity.user.id);
          return json(res, 200, { report, run: report.run, graph: graphData(store) });
        }
        if (req.method === 'POST' && (action === 'progress' || action === 'cancel')) {
          const input = await body(req);
          if (action === 'cancel' && store.get().activeResearchRunId === id) abortAccount(identity.user.id);
          const report = await store.update(workspace => {
            const result = transitionResearchRun(workspace, id, action === 'cancel' ? 'cancelled' : 'searching', { note: input.note });
            return action === 'cancel' && result.report.run.execution && !result.report.unchanged ? execution(result, { state: 'cancelled', endedAt: new Date().toISOString() }) : result;
          });
          return json(res, 200, { ...report, graph: graphData(store) });
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/source') {
        const detail = sourceDetail(graphData(store), url.searchParams.get('id'));
        return json(res, detail ? 200 : 404, detail || { error: 'Source not found.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/export') {
        res.setHeader('content-disposition', 'attachment; filename="creator-source-graph.json"');
        return json(res, 200, store.get());
      }
      if (req.method === 'GET' && url.pathname === '/api/drafts') {
        const graph = graphData(store);
        const text = ['# Creator Source Graph — research drafts', '', ...graph.strategies.flatMap(item => ['## ' + item.action, 'Source: ' + item.url, item.caveat, ''])].join('\n');
        res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="creator-source-graph-drafts.md"', 'cache-control': 'no-store' });
        return res.end(text);
      }
      if (req.method === 'POST' && url.pathname === '/api/import') {
        const input = await body(req);
        const report = await store.update(workspace => {
          const result = mergeInput(workspace, input);
          if (result.workspace.analysis?.mode === 'audience') result.workspace.analysis.reportedUrls = [...new Set([...(workspace.analysis.reportedUrls || []), ...input.records.map(record => normalizeUrl(record.url))])].slice(-200);
          return result;
        });
        return json(res, 200, { report, graph: graphData(store) });
      }
      if (req.method === 'POST' && url.pathname === '/api/collect') {
        if (collecting) return json(res, 409, { error: 'A collection is already running.' });
        const input = await body(req);
        if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 6) throw new Error('Collect between one and six URLs.');
        collecting = true;
        try {
          const records = [], attempts = [];
          for (const item of input.items) {
            const sourceUrl = normalizeUrl(typeof item === 'string' ? item : item.url);
            if (socialPlatform(sourceUrl)) {
              try { const record = await collectSocialUrl(sourceUrl); records.push(record); attempts.push({ url: sourceUrl, status: 'ok', observedAt: record.observedAt, message: 'Public page metadata.' }); }
              catch (error) { attempts.push({ url: sourceUrl, status: 'error', observedAt: new Date().toISOString(), message: error.message }); }
            } else {
              const result = await collect([typeof item === 'string' ? { url: item } : item], { additionalHosts: [new URL(sourceUrl).hostname] });
              records.push(...result.records); attempts.push(...result.attempts);
            }
          }
          const report = await store.update(workspace => {
            const merged = mergeInput(workspace, { records }, { trusted: true });
            merged.workspace.attempts = [...workspace.attempts, ...attempts].slice(-200);
            if (merged.workspace.analysis) merged.workspace.analysis.sourceUrls = [...new Set([...(merged.workspace.analysis.sourceUrls || []), ...records.map(record => record.url)])];
            return merged;
          });
          return json(res, 200, { report, attempts, graph: graphData(store) });
        } finally { collecting = false; }
      }
      return json(res, 404, { error: 'Route not found.' });
    } catch (error) {
      json(res, error.httpStatus || (/not active|terminal|cancelled|stale/i.test(error.message) ? 409 : 400), { error: error.message });
    }
  });
  server.on('close', () => { closing = true; abortAll(); });
  const shutdown = () => { closing = true; abortAll(); server.close(); server.closeIdleConnections(); };
  return { server, auth, shutdown };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4327);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const { server, shutdown } = await createApp();
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  server.on('error', error => { console.error('Cannot start Creator Source Graph: ' + error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('Creator Source Graph v' + VERSION + ' → http://127.0.0.1:' + port));
}
