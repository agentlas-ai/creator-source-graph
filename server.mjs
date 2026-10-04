import http from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore } from './lib/store.mjs';
import { mergeInput } from './lib/model.mjs';
import { normalizeUrl } from './lib/urls.mjs';
import { sourceDetail } from './lib/graph.mjs';
import { collectBatch } from './lib/collector.mjs';
import { inputUrl, researchGraph } from './lib/audience.mjs';
import { platformConnections, collectSocialUrl, socialPlatform } from './lib/social.mjs';
import { startResearchRun, importResearchRun, transitionResearchRun } from './lib/research.mjs';
import { dataDirectory } from './lib/runtime.mjs';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = '0.4.0';
const STATIC = new Map([['/', 'graph.html'], ['/index.html', 'graph.html'], ['/app.js', 'graph.js'], ['/style.css', 'graph.css']]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
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

export async function createApp({ dataDir = dataDirectory(), seed = { records: [] }, empty = false, collect = collectBatch } = {}) {
  const store = await openStore(dataDir, seed, { empty });
  let collecting = false;
  const graphData = () => {
    const workspace = store.get();
    return { ...researchGraph(workspace), researchRuns: workspace.researchRuns || [], activeResearchRunId: workspace.activeResearchRunId || null };
  };
  const begin = async value => {
    const url = inputUrl(value);
    const analysis = {
      mode: 'audience', url, title: new URL(url).hostname, topics: [], labels: ['Web research'],
      contentUrls: [], sourceUrls: [], queries: [], observedAt: new Date().toISOString(),
      platformCoverage: Object.fromEntries(['youtube', 'instagram', 'x', 'web', 'hackernews'].map(key => [key, 'waiting-for-agent'])),
      searchStatus: 'waiting-for-agent', matches: 0,
      queryBasis: 'Your AI host reads the product page, searches the web, and checks original sources.'
    };
    const report = await store.update(workspace => startResearchRun(workspace, url, { analysis }));
    return { ...report, run: report.run, graph: graphData(), attempts: [] };
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
      if (req.method === 'GET' && url.pathname === '/api/workspace') return json(res, 200, graphData());
      if (req.method === 'GET' && url.pathname === '/api/platforms') return json(res, 200, { platforms: platformConnections(), provider: 'your-ai-host', apiKeysRequired: false, readOnly: true });
      if (req.method === 'GET' && url.pathname === '/api/agent/guide') return json(res, 200, {
        name: 'creator-source-graph', version: VERSION,
        hosts: [
          { name: 'Claude Code', command: '/creator-source-graph', install: 'node cli.mjs install --host claude' },
          { name: 'Codex', command: '$creator-source-graph', install: 'node cli.mjs install --host codex' }
        ],
        install: 'node cli.mjs install --host both',
        packagedInstall: process.platform === 'win32' ? 'Install-Skills.bat' : process.platform === 'darwin' ? 'Install-Skills.command' : './install-skills.sh',
        requirement: 'A local AI host with web search or browser tools and shell access. Your existing plan and its limits apply.',
        apiKeysRequired: false
      });
      if (req.method === 'GET' && url.pathname === '/api/agent/runs') {
        const workspace = store.get();
        return json(res, 200, { runs: workspace.researchRuns || [], activeResearchRunId: workspace.activeResearchRunId || null });
      }
      if (req.method === 'POST' && ['/api/agent/runs', '/api/analyze'].includes(url.pathname)) return json(res, 201, await begin((await body(req)).url));
      const runMatch = /^\/api\/agent\/runs\/([a-f0-9-]{36})(?:\/(import|progress|cancel))?$/.exec(url.pathname);
      if (runMatch) {
        const [, id, action] = runMatch;
        if (req.method === 'GET' && !action) return json(res, 200, { run: runFrom(store.get(), id) });
        if (req.method === 'POST' && action === 'import') {
          const input = await body(req);
          const report = await store.update(workspace => importResearchRun(workspace, id, input));
          return json(res, 200, { report, run: report.run, graph: graphData() });
        }
        if (req.method === 'POST' && (action === 'progress' || action === 'cancel')) {
          const input = await body(req);
          const report = await store.update(workspace => transitionResearchRun(workspace, id, action === 'cancel' ? 'cancelled' : 'searching', { note: input.note }));
          return json(res, 200, { ...report, graph: graphData() });
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/source') {
        const detail = sourceDetail(graphData(), url.searchParams.get('id'));
        return json(res, detail ? 200 : 404, detail || { error: 'Source not found.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/export') {
        res.setHeader('content-disposition', 'attachment; filename="creator-source-graph.json"');
        return json(res, 200, store.get());
      }
      if (req.method === 'GET' && url.pathname === '/api/drafts') {
        const graph = graphData();
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
        return json(res, 200, { report, graph: graphData() });
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
          return json(res, 200, { report, attempts, graph: graphData() });
        } finally { collecting = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/shutdown') {
        json(res, 200, { status: 'stopping' });
        setTimeout(() => { server.close(); server.closeIdleConnections(); }, 100).unref();
        return;
      }
      return json(res, 404, { error: 'Route not found.' });
    } catch (error) {
      json(res, error.httpStatus || (/not active|terminal|cancelled|stale/i.test(error.message) ? 409 : 400), { error: error.message });
    }
  });
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4327);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const { server } = await createApp();
  server.on('error', error => { console.error('Cannot start Creator Source Graph: ' + error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('Creator Source Graph v' + VERSION + ' → http://127.0.0.1:' + port));
}
