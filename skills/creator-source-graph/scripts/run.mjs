#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Installed by the local installer. This file contains no user-specific paths.
try {
  const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const raw = await readFile(join(skillRoot, '.bridge.json'), 'utf8');
  if (Buffer.byteLength(raw) > 16384) throw new Error('Bridge configuration is too large.');
  const config = JSON.parse(raw);
  if (config.schema !== 'creator-source-graph.bridge.v1' || typeof config.appRoot !== 'string' ||
      typeof config.nodeExecutable !== 'string' || !isAbsolute(config.appRoot) || !isAbsolute(config.nodeExecutable)) {
    throw new Error('Invalid installed bridge configuration.');
  }
  const cli = join(config.appRoot, 'cli.mjs');
  await access(cli); await access(config.nodeExecutable);
  const child = spawn(config.nodeExecutable, [cli, ...process.argv.slice(2)], {
    cwd: config.appRoot, env: { ...process.env, CREATOR_GRAPH_APP_ROOT: config.appRoot }, stdio: 'inherit', shell: false,
  });
  child.once('error', error => {
    process.stderr.write(JSON.stringify({ error: error.message, recovery: 'Reinstall the skill from the current app folder.' }) + '\n');
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.message, recovery: 'Reinstall the skill from the current app folder. The installed helper needs its app and bundled Node runtime to remain in place.' }) + '\n');
  process.exitCode = 1;
}
