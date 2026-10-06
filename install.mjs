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
const wrappers = () => ({
  'scripts/run.sh': '#!/bin/sh\nset -eu\nbridge_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec ' + shellQuote(process.execPath) + ' "$bridge_dir/run.mjs" "$@"\n',
  'scripts/run.cmd': '@echo off\r\nsetlocal DisableDelayedExpansion\r\n' + cmdQuote(process.execPath) + ' "%~dp0run.mjs" %*\r\nexit /b %errorlevel%\r\n',
});

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

async function reusable(target, source, appRoot) {
  try {
    const marker = join(target, '.bridge.json');
    const info = await lstat(marker);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) return false;
    const config = JSON.parse(await readFile(marker, 'utf8'));
    if (config.schema !== 'creator-source-graph.bridge.v1' || config.appRoot !== appRoot || config.nodeExecutable !== process.execPath) return false;
    for (const file of SKILL_FILES) {
      const installed = join(target, file), entry = await lstat(installed);
      if (!entry.isFile() || entry.isSymbolicLink() || !(await readFile(installed)).equals(await readFile(join(source, file)))) return false;
    }
    for (const [file, expected] of Object.entries(wrappers())) {
      const entry = await lstat(join(target, file));
      if (!entry.isFile() || entry.isSymbolicLink() || await readFile(join(target, file), 'utf8') !== expected) return false;
      if (file.endsWith('.sh') && process.platform !== 'win32' && !(entry.mode & 0o111)) return false;
    }
    return true;
  } catch { return false; }
}

export async function installFromArgs(args, appRoot = SOURCE_ROOT) {
  let host, skillsDir, scope, force = false, skip = false;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--host' && args[i + 1] && !args[i + 1].startsWith('--')) { if (host) throw new Error('--host was repeated.'); host = args[++i]; }
    else if (option === '--skills-dir' && args[i + 1] && !args[i + 1].startsWith('--')) { if (skillsDir) throw new Error('--skills-dir was repeated.'); skillsDir = args[++i]; }
    else if (option === '--skill-scope' && args[i + 1] && !args[i + 1].startsWith('--')) { if (scope) throw new Error('--skill-scope was repeated.'); scope = args[++i]; }
    else if (option === '--skip-skills') { if (skip) throw new Error('--skip-skills was repeated.'); skip = true; }
    else if (option === '--force') { if (force) throw new Error('--force was repeated.'); force = true; }
    else throw new Error(`Unknown or incomplete install option: ${option}`);
  }
  if (!['codex', 'claude', 'both'].includes(host)) throw new Error('Use --host codex, --host claude, or --host both.');
  if (scope && !['app', 'user'].includes(scope)) throw new Error('Use --skill-scope app or --skill-scope user.');
  if (scope && skillsDir) throw new Error('--skill-scope and --skills-dir cannot be combined.');
  if (skip && (scope || skillsDir || force)) throw new Error('--skip-skills cannot be combined with installation options.');
  if (skillsDir && /[\r\n\0]/.test(skillsDir)) throw new Error('--skills-dir must be a valid directory path.');
  const mode = skillsDir ? 'custom' : scope ?? 'app';
  if (force && mode === 'app') throw new Error('--force requires --skill-scope user or --skills-dir.');
  if (skillsDir && host === 'both') throw new Error('--skills-dir requires a single host.');
  appRoot = resolve(appRoot);
  await access(join(appRoot, 'cli.mjs'));
  await access(join(appRoot, 'launch.mjs'));
  const source = join(appRoot, 'skills', NAME);
  for (const file of SKILL_FILES) await access(join(source, file));
  const bridge = { commandPrefix: [process.execPath, join(appRoot, 'cli.mjs')], appRoot, nodeExecutable: process.execPath };
  if (mode === 'app') return { installed: [], scope: 'app', skipped: skip, permanentInstallation: false, version: '0.7.4', skillFiles: [join(source, 'SKILL.md')], bridge, note: 'No personal skill directory was changed. Read the bundled SKILL.md and use bridge.commandPrefix for local CLI commands in this same AI session. Explicit --skill-scope user or --skills-dir opts into persistent installation.' };
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
    if (present && !force) {
      target.reused = await reusable(target.path, source, appRoot);
      if (!target.reused) throw new Error(`A different or modified skill already exists at ${target.path}. Review it first; --force replaces this skill folder.`);
    }
  }
  const installed = [];
  for (const target of targets) {
    if (target.reused) {
      if (!await reusable(target.path, source, appRoot)) throw new Error('The installed skill changed during setup. Review it before retrying.');
      installed.push({ host: target.host, path: target.path, helper: join(target.path, 'scripts', process.platform === 'win32' ? 'run.cmd' : 'run.sh'), reused: true });
      continue;
    }
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
      for (const [file, content] of Object.entries(wrappers())) await writeFile(join(temp, file), content, { mode: file.endsWith('.sh') ? 0o755 : 0o644 });
      // Recheck after staging so a concurrent installation cannot silently overwrite a new skill.
      await rejectSymlinkParents(target.path);
      if (await exists(target.path)) {
        if (!force) {
          if (await reusable(target.path, source, appRoot)) {
            installed.push({ host: target.host, path: target.path, helper: join(target.path, 'scripts', process.platform === 'win32' ? 'run.cmd' : 'run.sh'), reused: true });
            continue;
          }
          throw new Error(`Target appeared during installation: ${target.path}`);
        }
        backup = temp + '-previous';
        await rename(target.path, backup);
      }
      try { await rename(temp, target.path); }
      catch (error) {
        if (!backup && ['EEXIST', 'ENOTEMPTY'].includes(error.code) && await reusable(target.path, source, appRoot)) {
          installed.push({ host: target.host, path: target.path, helper: join(target.path, 'scripts', process.platform === 'win32' ? 'run.cmd' : 'run.sh'), reused: true });
          continue;
        }
        if (backup) await rename(backup, target.path);
        throw error;
      }
      if (backup) await rm(backup, { recursive: true });
      const receipt = JSON.parse(await readFile(join(target.path, '.bridge.json'), 'utf8'));
      if (receipt.appRoot !== appRoot) throw new Error('Installed bridge verification failed.');
      installed.push({ host: target.host, path: target.path, helper: join(target.path, 'scripts', process.platform === 'win32' ? 'run.cmd' : 'run.sh'), reused: false });
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
  return {
    installed, scope: mode, skipped: false, permanentInstallation: true, skillFiles: installed.map(entry => join(entry.path, 'SKILL.md')), bridge, version: '0.7.4',
    invocation: { codex: '$creator-source-graph <url>', claude: '/creator-source-graph <url>' },
    note: 'The current AI host can read the installed SKILL.md now and continue in this session. New sessions can discover the personal skill normally. The bridge uses this app folder and Node runtime; reinstall if either moves. No account settings or provider credentials were changed.',
  };
}

const entryPath = (() => { try { return process.argv[1] ? realpathSync(process.argv[1]) : ''; } catch { return ''; } })();
if (entryPath === fileURLToPath(import.meta.url)) {
  installFromArgs(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
    process.stderr.write(JSON.stringify({ error: error.message }) + '\n'); process.exitCode = 1;
  });
}
