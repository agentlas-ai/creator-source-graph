import { createHash } from 'node:crypto';

const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;

export function normalizeUrl(input, base) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) throw new Error('URL은 2,048자 이내의 http(s) 주소여야 합니다.');
  if (/\s/.test(input.trim())) throw new Error('URL에 공백이 있습니다.');
  let u;
  try { u = new URL(input.trim(), base); } catch { throw new Error('올바른 URL을 입력하세요.'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('인증정보 없는 http(s) URL만 허용합니다.');
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, '');
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  // Meaningful query parameters and HTTP/HTTPS identity are deliberately retained.
  u.searchParams.sort();
  if (u.hostname === 'youtu.be' && /^\/[\w-]+\/?$/.test(u.pathname)) {
    const id = u.pathname.replaceAll('/', '');
    u.hostname = 'www.youtube.com'; u.pathname = '/watch'; u.search = ''; u.searchParams.set('v', id);
  }
  if (u.hostname === 'github.com') u.pathname = u.pathname.replace(/^\/([^/]+)\/([^/]+)/, (_, owner, repo) => `/${owner.toLowerCase()}/${repo.toLowerCase()}`);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.href;
}

export const idFor = (type, value) => `${type}-${createHash('sha256').update(value).digest('hex').slice(0,18)}`;
export function creatorKey(creator) {
  return creator.url ? normalizeUrl(creator.url) : `name:${creator.name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}
