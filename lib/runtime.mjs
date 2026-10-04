import os from 'node:os';
import path from 'node:path';

export function dataDirectory(env = process.env) {
  if (env.GRAPH_DATA_DIR) return path.resolve(env.GRAPH_DATA_DIR);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Creator Source Graph');
  if (process.platform === 'win32') return path.join(env.LOCALAPPDATA || env.APPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Creator Source Graph');
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'creator-source-graph');
}

export function localOrigin(value = 'http://127.0.0.1:4327') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use a local HTTP origin, such as http://127.0.0.1:4327.');
  return url.origin;
}
