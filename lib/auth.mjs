import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ISSUER = 'https://agentlas.cloud';
const AUTH_PATH = '/api/apps/creator-source-graph/oauth';
const CLIENT_ID = 'creator-source-graph';
const SESSION_SECONDS = 604800;
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const nonce = () => randomBytes(32).toString('base64url');
const clean = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);

export async function openAuth(dataDir, { issuer = ISSUER, fetcher = fetch, now = Date.now } = {}) {
  const authority = new URL(issuer);
  if (authority.origin !== issuer || authority.username || authority.password || (authority.protocol !== 'https:' && !(authority.protocol === 'http:' && authority.hostname === '127.0.0.1'))) throw new Error('Invalid Agentlas identity origin.');
  const filename = path.join(dataDir, 'agentlas-session.json');
  let session = null, pending = null, lastError = '', verifiedAt = 0, retryAfter = 0, validation = null, generation = 0, persistence = Promise.resolve();
  function persist(fn) { const job = persistence.then(fn); persistence = job.catch(() => {}); return job; }

  function validStored(value) {
    return value?.version === 1 && value.issuer === issuer && clean(value.accessToken, 16000) && clean(value.user?.id, 256) && clean(value.user?.displayName, 100) && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > now();
  }
  try {
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 20000) throw new Error('Invalid local identity file.');
    const value = JSON.parse(await readFile(filename, 'utf8'));
    if (validStored(value)) { session = value; await chmod(filename, 0o600); }
  } catch (error) {
    if (error.code !== 'ENOENT') lastError = 'Sign in again to reconnect your Agentlas account.';
  }

  async function responseJson(endpoint, { method = 'GET', token, form } = {}) {
    const response = await fetcher(issuer + AUTH_PATH + endpoint, {
      method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { accept: 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    if (Number(response.headers.get('content-length')) > 20000) { await response.body?.cancel(); throw new Error('Invalid identity response.'); }
    let bytes = 0; const parts = [];
    for await (const chunk of response.body || []) { bytes += chunk.length; if (bytes > 20000) throw new Error('Invalid identity response.'); parts.push(Buffer.from(chunk)); }
    let value; try { value = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new Error('Invalid identity response.'); }
    if (!response.ok) throw Object.assign(new Error('Agentlas sign-in was not accepted.'), { denied: response.status === 401 || response.status === 400 });
    return value;
  }
  function identity(value) {
    const expires = Date.parse(value?.expiresAt);
    if (!clean(value?.user?.id, 256) || !clean(value?.user?.displayName, 100) || !Number.isFinite(expires) || expires <= now() || expires > now() + (SESSION_SECONDS + 120) * 1000) throw new Error('Invalid Agentlas identity response.');
    return { user: { id: value.user.id, displayName: value.user.displayName }, expiresAt: new Date(expires).toISOString() };
  }
  async function save(value) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temporary = path.join(dataDir, 'identity-' + nonce() + '.tmp');
    try { await writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, filename); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  async function remove() { await unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  function receipt(authenticated = false) {
    if (authenticated) return { authenticated: true, loginRequired: false, status: 'signed-in', user: session.user, expiresAt: session.expiresAt };
    return { authenticated: false, loginRequired: true, status: pending ? 'pending' : lastError ? 'error' : 'signed-out', ...(lastError ? { error: lastError } : {}) };
  }
  async function status() {
    if (pending?.expiresAt <= now()) { pending = null; lastError = 'This login link expired. Sign in with Agentlas again.'; }
    if (!session || Date.parse(session.expiresAt) <= now()) { session = null; return receipt(); }
    if (verifiedAt && now() - verifiedAt < 60 * 1000) return receipt(true);
    if (retryAfter > now()) return receipt();
    if (!validation) {
      const expectedGeneration = generation, candidate = session;
      validation = (async () => {
        try {
          const verified = identity(await responseJson('/userinfo', { token: candidate.accessToken }));
          if (generation !== expectedGeneration || session !== candidate) return receipt();
          if (verified.user.id !== candidate.user.id) throw new Error('Agentlas account changed.');
          session = { ...candidate, ...verified }; verifiedAt = now(); lastError = ''; retryAfter = 0;
          return receipt(true);
        } catch (error) {
          if (generation !== expectedGeneration) return receipt();
          verifiedAt = 0; lastError = error.denied ? 'Your sign-in expired. Sign in with Agentlas again.' : 'Could not reach Agentlas. Try again shortly.';
          retryAfter = now() + 10000;
          if (error.denied) { session = null; await persist(remove); }
          return receipt();
        }
      })().finally(() => { validation = null; });
    }
    return validation;
  }
  function begin(origin) {
    const local = new URL(origin);
    if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || !local.port || local.username || local.password || local.origin !== origin) throw new Error('Sign in from the local app address.');
    const state = nonce(), verifier = nonce(), redirectUri = origin + '/auth/callback';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    generation++; pending = { state, verifier, redirectUri, expiresAt: now() + 10 * 60 * 1000 }; lastError = '';
    const target = new URL(issuer + AUTH_PATH + '/authorize');
    target.search = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', scope: 'app_identity', redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    return target.toString();
  }
  async function callback(url) {
    const expected = pending;
    if (!expected || expected.expiresAt <= now() || url.origin + url.pathname !== expected.redirectUri || url.searchParams.getAll('state').length !== 1 || !same(url.searchParams.get('state'), expected.state)) throw new Error('This login link expired. Return to Creator Graph and sign in again.');
    if (url.searchParams.get('error')) { pending = null; lastError = 'Sign-in was cancelled. You can try again.'; return receipt(); }
    const code = url.searchParams.get('code');
    if (!clean(code, 16000) || url.searchParams.getAll('code').length !== 1) throw new Error('Invalid sign-in callback.');
    pending = null; const expectedGeneration = generation;
    try {
      const grant = await responseJson('/token', { method: 'POST', form: { grant_type: 'authorization_code', client_id: CLIENT_ID, code, redirect_uri: expected.redirectUri, code_verifier: expected.verifier } });
      if (!clean(grant.access_token, 16000) || grant.token_type !== 'Bearer' || grant.scope !== 'app_identity' || !Number.isInteger(grant.expires_in) || grant.expires_in < 1 || grant.expires_in > SESSION_SECONDS) throw new Error('Invalid sign-in grant.');
      const verified = identity(await responseJson('/userinfo', { token: grant.access_token }));
      if (generation !== expectedGeneration) throw new Error('Sign-in was cancelled.');
      const value = { version: 1, issuer, accessToken: grant.access_token, ...verified };
      await persist(async () => {
        if (generation !== expectedGeneration) throw new Error('Sign-in was cancelled.');
        await save(value);
        if (generation !== expectedGeneration) { await remove(); throw new Error('Sign-in was cancelled.'); }
        session = value; verifiedAt = now(); retryAfter = 0; lastError = '';
      });
      return receipt(true);
    } catch { lastError = 'Sign-in could not finish. Return to Creator Graph and try again.'; throw new Error(lastError); }
  }
  async function logout() {
    generation++; const token = session?.accessToken; session = null; pending = null; verifiedAt = 0; lastError = ''; retryAfter = 0;
    await persist(remove);
    if (token) { try { await responseJson('/revoke', { method: 'POST', token, form: { client_id: CLIENT_ID, token } }); } catch { /* Local sign-out completes even if the network is unavailable. */ } }
    return receipt();
  }
  function accountDirectory(user) { return path.join(dataDir, 'accounts', createHash('sha256').update(user.id).digest('hex')); }
  return { status, begin, callback, logout, accountDirectory };
}
