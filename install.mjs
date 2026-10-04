#!/usr/bin/env node
import { access, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'creator-source-graph';
const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const SKILL_FILES = ['SKILL.md', 'scripts/run.mjs', 'references/import-schema.md'];
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path));
};
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const cmdQuote = value => {
  if (/["\r\n]/.test(value)) throw new Error('Windows bridge paths cannot contain quotes or line breaks.');
  return '"' + value.replaceAll('%', '%%') + '"';
};

async function exists(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function rejectSymlinkParents(path) {
  // Guard the destination and selected skills root. OS aliases such as macOS
  // /tmp and /var are valid ancestors of a caller-selected custom directory.
  for (const current of [resolve(path), dirname(resolve(path))]) {
    const entry = await exists(current);
    if (entry?.isSymbolicLink()) throw new Error(`Refusing installation through a symlink: ${current}`);
  }
}

export async function installFromArgs(args, appRoot = SOURCE_ROOT) {
  let host, skillsDir, force = false;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--host' && args[i + 1]) { if (host) throw new Error('--host was repeated.'); host = args[++i]; }
    else if (option === '--skills-dir' && args[i + 1]) { if (skillsDir) throw new Error('--skills-dir was repeated.'); skillsDir = args[++i]; }
    else if (option === '--force') force = true;
    else throw new Error(`Unknown or incomplete install option: ${option}`);
  }
  if (!['codex', 'claude', 'both'].includes(host)) throw new Error('Use --host codex, --host claude, or --host both.');
  if (skillsDir && host === 'both') throw new Error('--skills-dir requires a single host.');
  appRoot = resolve(appRoot);
  await access(join(appRoot, 'cli.mjs'));
  await access(join(appRoot, 'launch.mjs'));
  const source = join(appRoot, 'skills', NAME);
  for (const file of SKILL_FILES) await access(join(source, file));
  const hosts = host === 'both' ? ['codex', 'claude'] : [host];
  const targets = hosts.map(kind => ({
    host: kind,
    path: join(skillsDir ? resolve(skillsDir) : join(homedir(), kind === 'codex' ? '.agents' : '.claude', 'skills'), NAME),
  }));
  for (const target of targets) {
    if (inside(target.path, source) || inside(source, target.path)) throw new Error('The install target overlaps the source skill.');
    await rejectSymlinkParents(target.path);
    const present = await exists(target.path);
    if (present && !present.isDirectory()) throw new Error(`Target is not a skill directory: ${target.path}`);
    if (present && !force) throw new Error(`Skill already exists at ${target.path}. Review it first; --force replaces this skill folder.`);
  }
  const installed = [];
  for (const target of targets) {
    const parent = dirname(target.path);
    await mkdir(parent, { recursive: true });
    const temp = await mkdtemp(join(parent, '.creator-source-graph-install-'));
    let backup;
    try {
      for (const file of SKILL_FILES) {
        await mkdir(dirname(join(temp, file)), { recursive: true });
        await copyFile(join(source, file), join(temp, file));
      }
      await writeFile(join(temp, '.bridge.json'), JSON.stringify({
        schema: 'creator-source-graph.bridge.v1', appRoot, nodeExecutable: process.execPath,
      }, null, 2) + '\n', { mode: 0o600 });
      await writeFile(join(temp, 'scripts', 'run.sh'),
        '#!/bin/sh\nset -eu\nbridge_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec ' + shellQuote(process.execPath) + ' "$bridge_dir/run.mjs" "$@"\n', { mode: 0o755 });
      await writeFile(join(temp, 'scripts', 'run.cmd'),
        '@echo off\r\nsetlocal DisableDelayedExpansion\r\n' + cmdQuote(process.execPath) + ' "%~dp0run.mjs" %*\r\nexit /b %errorlevel%\r\n');
      // Recheck after staging so a concurrent installation cannot silently overwrite a new skill.
      await rejectSymlinkParents(target.path);
      if (await exists(target.path)) {
        if (!force) throw new Error(`Target appeared during installation: ${target.path}`);
        backup = temp + '-previous';
        await rename(target.path, backup);
      }
      try { await rename(temp, target.path); }
      catch (error) { if (backup) await rename(backup, target.path); throw error; }
      if (backup) await rm(backup, { recursive: true });
      const receipt = JSON.parse(await readFile(join(target.path, '.bridge.json'), 'utf8'));
      if (receipt.appRoot !== appRoot) throw new Error('Installed bridge verification failed.');
      installed.push({ host: target.host, path: target.path, helper: join(target.path, 'scripts', process.platform === 'win32' ? 'run.cmd' : 'run.sh') });
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
  return {
    installed, version: '0.4.0',
    invocation: { codex: '$creator-source-graph <url>', claude: '/creator-source-graph <url>' },
    note: 'Open or reload the local host session to discover the skill. The bridge uses this app folder and Node runtime; reinstall if either moves. No account settings or provider credentials were changed.',
  };
}

const entryPath = (() => { try { return process.argv[1] ? realpathSync(process.argv[1]) : ''; } catch { return ''; } })();
if (entryPath === fileURLToPath(import.meta.url)) {
  installFromArgs(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: error.message }) + '\n'); process.exitCode = 1;
  });
}
