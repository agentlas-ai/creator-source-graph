import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ISSUER = 'https://agentlas.cloud';
const AUTH_PATH = '/api/apps/creator-source-graph/oauth';
const CLIENT_ID = 'creator-source-graph';
const SESSION_SECONDS = 604800;
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const nonce = () => randomBytes(32).toString('base64url');
const clean = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const LOGIN_MESSAGES = Object.freeze({
  LOGIN_NOT_STARTED: 'The app was restarted or this sign-in link is no longer active. Return to Creator Graph and sign in again.',
  LOGIN_EXPIRED: 'This sign-in link expired. Return to Creator Graph and sign in again.',
  LOGIN_STATE_MISMATCH: 'This sign-in link is no longer active. Return to Creator Graph and sign in again.',
  LOGIN_INVALID_CALLBACK: 'The sign-in return link is incomplete. Return to Creator Graph and sign in again.',
  LOGIN_CANCELLED: 'Sign-in was cancelled. You can try again.',
  LOGIN_IN_PROGRESS: 'Sign-in is finishing. Return to Creator Graph and wait a moment.',
  LOGIN_CONNECTION_FAILED: 'Could not reach Agentlas. Check your connection, then sign in again.',
  LOGIN_NOT_ACCEPTED: 'Agentlas did not accept this sign-in. Return to Creator Graph and sign in again.',
  LOGIN_INVALID_RESPONSE: 'Agentlas could not complete this sign-in. Return to Creator Graph and try again.',
  LOGIN_SAVE_FAILED: 'Could not save sign-in on this computer. Check free space and app folder access, then try again.',
  LOGIN_RESTORED_SESSION_INVALID: 'Your saved sign-in could not be restored. Sign in with Agentlas again.',
  LOGIN_FAILED: 'Sign-in could not finish. Return to Creator Graph and try again.',
});
export function loginErrorMessage(code) { return typeof code === 'string' && Object.hasOwn(LOGIN_MESSAGES, code) ? LOGIN_MESSAGES[code] : null; }
const loginError = (code, extra = {}) => Object.assign(new Error(loginErrorMessage(code) || LOGIN_MESSAGES.LOGIN_FAILED), { code, ...extra });

export async function openAuth(dataDir, { issuer = ISSUER, fetcher = fetch, now = Date.now } = {}) {
  const authority = new URL(issuer);
  if (authority.origin !== issuer || authority.username || authority.password || (authority.protocol !== 'https:' && !(authority.protocol === 'http:' && authority.hostname === '127.0.0.1'))) throw new Error('Invalid Agentlas identity origin.');
  const filename = path.join(dataDir, 'agentlas-session.json');
  const pendingFile = path.join(dataDir, 'agentlas-login.json');
  let session = null, pending = null, exchange = null, lastError = '', lastErrorCode = '', verifiedAt = 0, retryAfter = 0, validation = null, generation = 0, persistence = Promise.resolve(), controller = new AbortController();
  function persist(fn) { const job = persistence.then(fn); persistence = job.catch(() => {}); return job; }
  function failure(code) { lastErrorCode = code; lastError = loginErrorMessage(code) || LOGIN_MESSAGES.LOGIN_FAILED; return loginError(code); }
  function clearError() { lastError = ''; lastErrorCode = ''; }
  function cancelNetwork() { controller.abort(); controller = new AbortController(); }
  async function privateJson(file, limit) {
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit) throw loginError('LOGIN_RESTORED_SESSION_INVALID');
      const bytes = await handle.readFile();
      if (bytes.length > limit) throw loginError('LOGIN_RESTORED_SESSION_INVALID');
      await chmod(file, 0o600);
      return JSON.parse(bytes.toString('utf8'));
    } finally { await handle.close(); }
  }

  function validStored(value) {
    return value?.version === 1 && value.issuer === issuer && clean(value.accessToken, 16000) && clean(value.user?.id, 256) && clean(value.user?.displayName, 100) && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > now();
  }
  try {
    const value = await privateJson(filename, 20000);
    if (validStored(value)) session = value;
    else failure('LOGIN_RESTORED_SESSION_INVALID');
  } catch (error) {
    session = null;
    if (error.code !== 'ENOENT') failure(['EACCES', 'EPERM'].includes(error.code) ? 'LOGIN_SAVE_FAILED' : 'LOGIN_RESTORED_SESSION_INVALID');
  }
  try {
    const value = await privateJson(pendingFile, 4096);
    if (value?.version !== 1 || value.issuer !== issuer || !/^[A-Za-z0-9_-]{43}$/.test(value.state || '') || !/^[A-Za-z0-9_-]{43}$/.test(value.verifier || '') || !/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/auth\/callback$/.test(value.redirectUri || '') || Number(new URL(value.redirectUri).port || 80) > 65535 || !Number.isFinite(value.expiresAt) || value.expiresAt <= now() || value.expiresAt > now() + 10 * 60 * 1000) throw loginError('LOGIN_EXPIRED');
    pending = { state: value.state, verifier: value.verifier, redirectUri: value.redirectUri, expiresAt: value.expiresAt }; clearError();
  } catch (error) {
    if (error.code !== 'ENOENT' && !session) failure(loginErrorMessage(error.code) ? error.code : 'LOGIN_RESTORED_SESSION_INVALID');
  }

  async function responseJson(endpoint, { method = 'GET', token, form, signal = controller.signal } = {}) {
    const requestController = new AbortController(), abort = () => requestController.abort();
    if (signal.aborted) abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 12000);
    try {
    let response;
    try { response = await fetcher(issuer + AUTH_PATH + endpoint, {
      method, redirect: 'error', signal: requestController.signal,
      headers: { accept: 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    }); } catch { throw loginError('LOGIN_CONNECTION_FAILED'); }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* Status remains authoritative even if the error body cannot be read. */ }
      throw loginError('LOGIN_NOT_ACCEPTED', { denied: response.status === 401 || response.status === 400 });
    }
    if (Number(response.headers.get('content-length')) > 20000) { await response.body?.cancel(); throw loginError('LOGIN_INVALID_RESPONSE'); }
    let bytes = 0; const parts = [];
    try { for await (const chunk of response.body || []) { bytes += chunk.length; if (bytes > 20000) throw loginError('LOGIN_INVALID_RESPONSE'); parts.push(Buffer.from(chunk)); } }
    catch (error) { throw loginErrorMessage(error.code) ? error : loginError('LOGIN_CONNECTION_FAILED'); }
    let value; try { value = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw loginError('LOGIN_INVALID_RESPONSE'); }
    return value;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  function identity(value) {
    const expires = Date.parse(value?.expiresAt);
    if (!clean(value?.user?.id, 256) || !clean(value?.user?.displayName, 100) || !Number.isFinite(expires) || expires <= now() || expires > now() + (SESSION_SECONDS + 120) * 1000) throw loginError('LOGIN_INVALID_RESPONSE');
    return { user: { id: value.user.id, displayName: value.user.displayName }, expiresAt: new Date(expires).toISOString() };
  }
  async function saveFile(target, value) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temporary = path.join(dataDir, 'identity-' + nonce() + '.tmp');
    try { await writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  async function removeFile(file) { await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  const remove = () => removeFile(filename);
  const removePending = () => removeFile(pendingFile);
  function receipt(authenticated = false) {
    if (authenticated) return { authenticated: true, loginRequired: false, status: 'signed-in', user: session.user, expiresAt: session.expiresAt };
    return { authenticated: false, loginRequired: true, status: lastError ? 'error' : pending ? 'pending' : 'signed-out', ...(pending ? { loginStage: exchange?.pending === pending ? 'finishing' : 'waiting', loginExpiresAt: new Date(pending.expiresAt).toISOString() } : {}), ...(lastError ? { error: lastError, ...(lastErrorCode ? { errorCode: lastErrorCode } : {}) } : {}) };
  }
  async function status() {
    if (pending?.expiresAt <= now() && exchange?.pending !== pending) { pending = null; failure('LOGIN_EXPIRED'); await persist(removePending).catch(() => {}); }
    if (!session || Date.parse(session.expiresAt) <= now()) { session = null; return receipt(); }
    if (verifiedAt && now() - verifiedAt < 60 * 1000) return receipt(true);
    if (retryAfter > now()) return receipt();
    if (!validation) {
      const expectedGeneration = generation, candidate = session;
      validation = (async () => {
        try {
          const verified = identity(await responseJson('/userinfo', { token: candidate.accessToken }));
          if (generation !== expectedGeneration || session !== candidate) return receipt();
          if (verified.user.id !== candidate.user.id) throw loginError('LOGIN_INVALID_RESPONSE');
          session = { ...candidate, ...verified }; verifiedAt = now(); clearError(); retryAfter = 0;
          return receipt(true);
        } catch (error) {
          if (generation !== expectedGeneration) return receipt();
          verifiedAt = 0; failure(error.denied ? 'LOGIN_NOT_ACCEPTED' : loginErrorMessage(error.code) ? error.code : 'LOGIN_CONNECTION_FAILED');
          retryAfter = now() + 10000;
          if (error.denied) { session = null; await persist(remove); }
          return receipt();
        }
      })().finally(() => { validation = null; });
    }
    return validation;
  }
  async function begin(origin) {
    const local = new URL(origin);
    const port = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.exec(origin)?.[1];
    if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || !port || Number(port) > 65535) throw new Error('Sign in from the local app address.');
    const redirectUri = origin + '/auth/callback';
    // Reopening the same live sign-in must not invalidate the first tab.
    if (!pending || pending.expiresAt <= now() || pending.redirectUri !== redirectUri) {
      if (exchange?.pending !== pending || pending?.redirectUri !== redirectUri) {
        generation++; cancelNetwork(); pending = { state: nonce(), verifier: nonce(), redirectUri, expiresAt: now() + 10 * 60 * 1000 };
      }
    }
    const expected = pending, expectedGeneration = generation;
    try { await persist(async () => { if (generation !== expectedGeneration || pending !== expected) throw loginError('LOGIN_CANCELLED'); await saveFile(pendingFile, { version: 1, issuer, ...expected }); }); }
    catch (error) { if (generation === expectedGeneration) { pending = null; throw failure('LOGIN_SAVE_FAILED'); } throw loginError('LOGIN_CANCELLED'); }
    if (generation !== expectedGeneration || pending !== expected) throw loginError('LOGIN_CANCELLED');
    clearError();
    const { state, verifier } = pending;
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const target = new URL(issuer + AUTH_PATH + '/authorize');
    target.search = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', scope: 'app_identity', redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    return target.toString();
  }
  async function callback(url) {
    const expected = pending;
    if (!expected) throw failure('LOGIN_NOT_STARTED');
    if (expected.expiresAt <= now() && exchange?.pending !== expected) { pending = null; await persist(removePending); throw failure('LOGIN_EXPIRED'); }
    const redirect = new URL(expected.redirectUri);
    if (url.origin + url.pathname !== redirect.origin + redirect.pathname || url.searchParams.getAll('state').length !== 1 || !same(url.searchParams.get('state'), expected.state)) throw failure('LOGIN_STATE_MISMATCH');
    if (url.searchParams.get('error')) { generation++; cancelNetwork(); pending = null; await persist(removePending); failure('LOGIN_CANCELLED'); return receipt(); }
    const code = url.searchParams.get('code');
    if (!clean(code, 16000) || url.searchParams.getAll('code').length !== 1) throw failure('LOGIN_INVALID_CALLBACK');
    if (exchange?.pending === expected) {
      if (same(exchange.code, code)) return exchange.promise;
      throw failure('LOGIN_IN_PROGRESS');
    }
    const expectedGeneration = generation, job = { pending: expected, code, promise: null }, signal = controller.signal;
    exchange = job;
    job.promise = (async () => { let stage = 'exchange'; try {
      const grant = await responseJson('/token', { method: 'POST', signal, form: { grant_type: 'authorization_code', client_id: CLIENT_ID, code, redirect_uri: expected.redirectUri, code_verifier: expected.verifier } });
      if (!clean(grant.access_token, 16000) || grant.token_type !== 'Bearer' || grant.scope !== 'app_identity' || !Number.isInteger(grant.expires_in) || grant.expires_in < 1 || grant.expires_in > SESSION_SECONDS) throw loginError('LOGIN_INVALID_RESPONSE');
      let verified;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { verified = identity(await responseJson('/userinfo', { token: grant.access_token, signal })); break; }
        catch (error) { if (error.code !== 'LOGIN_CONNECTION_FAILED' || attempt > 0 || signal.aborted || generation !== expectedGeneration) throw error; }
      }
      if (generation !== expectedGeneration) throw loginError('LOGIN_CANCELLED');
      const value = { version: 1, issuer, accessToken: grant.access_token, ...verified };
      stage = 'storage';
      await persist(async () => {
        if (generation !== expectedGeneration) throw loginError('LOGIN_CANCELLED');
        await saveFile(filename, value);
        if (generation !== expectedGeneration) { await remove(); throw loginError('LOGIN_CANCELLED'); }
        await removePending();
        session = value; if (pending === expected) pending = null; verifiedAt = now(); retryAfter = 0; clearError();
      });
      return receipt(true);
    } catch (error) {
      const code = loginErrorMessage(error.code) ? error.code : stage === 'storage' ? 'LOGIN_SAVE_FAILED' : 'LOGIN_FAILED';
      if (generation === expectedGeneration) { if (pending === expected) pending = null; await persist(removePending).catch(() => {}); throw failure(code); }
      throw loginError('LOGIN_CANCELLED');
    } finally { if (exchange === job) exchange = null; } })();
    return job.promise;
  }
  async function logout() {
    generation++; cancelNetwork(); const token = session?.accessToken; session = null; pending = null; verifiedAt = 0; clearError(); retryAfter = 0;
    try { await persist(async () => { await remove(); await removePending(); }); }
    catch { throw failure('LOGIN_SAVE_FAILED'); }
    if (token) void responseJson('/revoke', { method: 'POST', token, form: { client_id: CLIENT_ID, token } }).catch(() => {});
    return receipt();
  }
  function accountDirectory(user) { return path.join(dataDir, 'accounts', createHash('sha256').update(user.id).digest('hex')); }
  return { status, begin, callback, logout, accountDirectory, accountId: () => session?.user.id || null, close: cancelNetwork };
}
