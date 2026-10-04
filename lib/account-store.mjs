import { constants } from 'node:fs';
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeRecord, normalizeRelationship } from './model.mjs';
import { openStore } from './store.mjs';

const RECEIPT = 'legacy-workspace-owner.json';
const SCHEMA = 'creator-source-graph.legacy-owner.v1';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const invalid = () => new Error('Existing local graph could not be upgraded safely. Original files are preserved. Repair the local graph or ownership record, then retry.');

async function existing(filename) {
  try { return await lstat(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function readPrivate(filename, maximum) {
  const entry = await existing(filename);
  if (!entry?.isFile() || entry.isSymbolicLink()) throw invalid();
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum) throw invalid();
    const bytes = await handle.readFile();
    if (bytes.length > maximum) throw invalid();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally { await handle.close(); }
}

async function receiptAt(filename) {
  if (!await existing(filename)) return null;
  const value = JSON.parse(await readPrivate(filename, 4096));
  if (value.schema !== SCHEMA || !/^[a-f0-9]{64}$/.test(value.ownerHash) || !/^[a-f0-9]{64}$/.test(value.workspaceSha256) ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw invalid();
  return value;
}

function validateWorkspace(raw) {
  const value = JSON.parse(raw);
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > 1000 ||
      !Array.isArray(value.relationships) || value.relationships.length > 1000 || !Array.isArray(value.attempts) ||
      (value.researchRuns != null && (!Array.isArray(value.researchRuns) || value.researchRuns.length > 30))) throw invalid();
  value.records.forEach(record => normalizeRecord(record, { trusted: true }));
  value.relationships.forEach(normalizeRelationship);
  return value;
}

async function safeDirectory(directory) {
  const info = await existing(directory);
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw invalid();
  await mkdir(directory, { recursive: true, mode: 0o700 });
}

// Publish only a complete file. Hard-link creation is atomic and fails if another
// process has already claimed the same destination; no existing file is replaced.
async function publishExclusive(filename, raw) {
  const temporary = path.join(path.dirname(filename), '.upgrade-' + randomUUID() + '.tmp');
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(raw); await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, filename); return true; }
    catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  } finally {
    if (handle) await handle.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function migrateLegacyWorkspace(dataDir, accountDir, user) {
  try {
    if (!user || typeof user.id !== 'string' || !user.id) throw invalid();
    const ownerHash = sha256(user.id), receiptFile = path.join(dataDir, RECEIPT);
    const legacyFile = path.join(dataDir, 'workspace.json'), destination = path.join(accountDir, 'workspace.json');
    let receipt = await receiptAt(receiptFile);
    if (receipt && receipt.ownerHash !== ownerHash) return { migrated: false };
    // A previously migrated or already populated account is never overwritten.
    const target = await existing(destination);
    if (target && (!target.isFile() || target.isSymbolicLink())) throw invalid();
    if (receipt && target) return { migrated: false };
    if (!await existing(legacyFile)) {
      if (receipt) throw invalid();
      return { migrated: false };
    }
    const raw = await readPrivate(legacyFile, 8 * 1024 * 1024);
    validateWorkspace(raw);
    const workspaceSha256 = sha256(raw);
    if (receipt && receipt.workspaceSha256 !== workspaceSha256) throw invalid();
    if (!receipt) {
      await safeDirectory(dataDir);
      const candidate = { schema: SCHEMA, ownerHash, workspaceSha256, createdAt: new Date().toISOString() };
      await publishExclusive(receiptFile, JSON.stringify(candidate) + '\n');
      receipt = await receiptAt(receiptFile);
      if (receipt.ownerHash !== ownerHash) return { migrated: false };
      if (receipt.workspaceSha256 !== workspaceSha256) throw invalid();
    }
    if (target) return { migrated: false };
    await safeDirectory(path.join(dataDir, 'accounts'));
    await safeDirectory(accountDir);
    return { migrated: await publishExclusive(destination, raw) };
  } catch { throw invalid(); }
}

export async function openAccountStore(dataDir, accountDir, user, seed, options) {
  await migrateLegacyWorkspace(dataDir, accountDir, user);
  try {
    await safeDirectory(path.join(dataDir, 'accounts'));
    await safeDirectory(accountDir);
    const target = await existing(path.join(accountDir, 'workspace.json'));
    if (target && (!target.isFile() || target.isSymbolicLink())) throw invalid();
    return await openStore(accountDir, seed, options);
  }
  catch { throw new Error('The account graph could not be opened. Existing files are preserved.'); }
}
