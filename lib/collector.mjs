import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { normalizeUrl } from './urls.mjs';
import { normalizeRecord, detectMentions, TOPICS, detectTopicSignals } from './model.mjs';

export const ALLOWED_HOSTS = new Set(['lilianweng.github.io','huyenchip.com','simonwillison.net','www.anthropic.com','anthropic.com','modelcontextprotocol.io','arxiv.org','github.com','docs.langchain.com','blog.langchain.com']);
export const AGENT = 'CreatorSourceGraph/0.3';
const MAX_BYTES=500_000, TIMEOUT=10_000;

export function validatePublicTarget(input,{additionalHosts=[]}={}) {
  const url=normalizeUrl(input), u=new URL(url);
  if(u.protocol!=='https:' || u.port || !ALLOWED_HOSTS.has(u.hostname)&&!additionalHosts.includes(u.hostname)) throw new Error('수집은 허용한 공개 HTTPS 웹페이지에서만 가능합니다. 수동 JSON 가져오기를 이용할 수 있습니다.');
  return url;
}

export function isPublicAddress(address) {
  if(isIP(address)===4) {
    const [a,b]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===192&&b===0)||(a===198&&(b===18||b===19)));
  }
  if(isIP(address)===6) {
    const v=address.toLowerCase();
    if(v.startsWith('::ffff:')) return isPublicAddress(v.slice(7));
    return !(/^(::|fc|fd|fe[89ab]|ff)/.test(v) || v==='::1');
  }
  return false;
}

export async function requestPublic(input,{maxBytes=MAX_BYTES,timeout=TIMEOUT,resolve=lookup,redirects=0,canVisit,additionalHosts=[],headers={}}={}) {
  validatePublicTarget(input,{additionalHosts});
  // Identity normalization strips trailing slashes; transport URLs must retain
  // them or slash-adding websites redirect forever.
  const u=new URL(input.trim()),url=u.href;
  if(canVisit&&!canVisit(url))throw new Error('robots.txt가 이동 대상 경로 수집을 허용하지 않습니다.');
  const addresses=await resolve(u.hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address))) throw new Error('공개 IP 주소만 수집할 수 있습니다.');
  const address=addresses[0];
  const response=await new Promise((resolveResult,reject)=>{
    const transport=u.protocol==='https:'?https:http;
    const req=transport.get(u,{
      headers:{'user-agent':AGENT,'accept':'application/json,text/html,text/plain;q=0.8','accept-encoding':'identity',...headers},
      lookup:(_host,opts,cb)=>opts?.all?cb(null,[address]):cb(null,address.address,address.family)
    },res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error(`문서 크기가 ${maxBytes.toLocaleString()}바이트 제한을 넘었습니다.`));return;}chunks.push(chunk);});
      res.on('end',()=>resolveResult({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),url}));
      res.on('error',reject);
    });
    req.on('error',reject);
    const timer=setTimeout(()=>req.destroy(new Error('공개 페이지 요청 시간이 초과됐습니다.')),timeout);
    req.on('close',()=>clearTimeout(timer));
  });
  if([301,302,303,307,308].includes(response.status)) {
    if(redirects>=3||!response.headers.location) throw new Error('리다이렉트 제한을 넘었습니다.');
    const target=new URL(response.headers.location,url).href;
    validatePublicTarget(target,{additionalHosts});
    // A cross-origin redirect requires its own access policy; do not follow automatically.
    if(new URL(target).origin!==u.origin) throw new Error(`다른 호스트로 이동합니다. 이동 대상 URL을 직접 수집하세요: ${target}`);
    return requestPublic(target,{maxBytes,timeout,resolve,redirects:redirects+1,canVisit,additionalHosts,headers});
  }
  return response;
}

export function robotsAllowed(body,input,agent=AGENT) {
  const u=new URL(input),target=u.pathname+u.search;
  const groups=[];let group=null,hasRules=false;
  for(const original of body.split(/\r?\n/)) {
    const line=original.replace(/#.*$/,'').trim();const match=/^([\w-]+)\s*:\s*(.*)$/.exec(line);if(!match)continue;
    const key=match[1].toLowerCase(),value=match[2].trim();
    if(key==='user-agent') {if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}group.agents.push(value.toLowerCase());}
    else if(group&&['allow','disallow'].includes(key)){hasRules=true;if(value)group.rules.push({allow:key==='allow',path:value});}
  }
  const matched=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.toLowerCase().includes(a)));
  const selected=matched.length?matched:groups.filter(g=>g.agents.includes('*'));
  const rules=selected.flatMap(g=>g.rules).filter(r=>{
    const escaped=r.path.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*').replace(/\\\$$/,'$');
    return new RegExp(`^${escaped}`).test(target);
  }).sort((a,b)=>b.path.replaceAll('*','').length-a.path.replaceAll('*','').length || Number(b.allow)-Number(a.allow));
  return !rules.length||rules[0].allow;
}

const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,entity=>{
  const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
  const n=entity.startsWith('&#x')?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);
  return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
});
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
const plain=html=>decode(html.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();

function editorialDiv(html) {
  const start=/<div\b[^>]*class\s*=\s*["'][^"']*\b(?:entry|entry-content|post-content)\b[^"']*["'][^>]*>/i.exec(html);
  if(!start)return null;
  const begin=start.index+start[0].length;let depth=1;
  const tail=html.slice(begin);
  for(const tag of tail.matchAll(/<\/?div\b[^>]*>/gi)) {
    depth+=tag[0].startsWith('</')?-1:1;
    if(depth===0)return tail.slice(0,tag.index);
  }
  return null;
}

export function extractHtml(html,url,{creator,role='content',observedAt=new Date().toISOString(),selectedTargets,maxLinks=40,publishedAt:reviewedDate}={}) {
  const metadata=new Map();for(const tag of html.match(/<meta\b[^>]*>/gi)??[]) {const a=attrs(tag);if(a.property||a.name)metadata.set((a.property||a.name).toLowerCase(),a.content??'');}
  const title=(metadata.get('og:title') || plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]??'') || new URL(url).hostname).slice(0,300);
  let cleaned=html.replace(/<(script|style|svg|nav|header|footer|form|noscript|template|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const article=/<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned), main=/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned);
  const editorial=editorialDiv(cleaned);
  const scope=article||editorial?'article':main?'main':'document';
  const region=article?.[1]??main?.[1]??editorial??/<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(cleaned)?.[1]??cleaned;
  const visibleText=plain(region);
  const allLinks=new Map();
  for(const match of region.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a=attrs(match[1]);if(!a.href || /^(#|mailto:|tel:|javascript:)/i.test(a.href))continue;
    try {
      const target=normalizeUrl(a.href,url),u=new URL(target);
      if(target===normalizeUrl(url)||/\.(png|jpe?g|gif|svg|webp|ico|mp4|zip)$/i.test(u.pathname))continue;
      if(!allLinks.has(target))allLinks.set(target,{url:target,anchor:plain(match[2]).slice(0,80),kind:'hyperlink',scope});
    }catch { /* invalid links are not evidence */ }
  }
  const selected=selectedTargets?new Set(selectedTargets.map(x=>normalizeUrl(x))):null;
  const links=[...allLinks.values()].filter(l=>!selected||selected.has(l.url)).slice(0,maxLinks);
  const missing=selected?[...selected].filter(t=>!allLinks.has(t)):[];
  let publishedAt=metadata.get('article:published_time')||metadata.get('date')||metadata.get('dc.date.issued');
  if(!publishedAt) {const time=/<time\b([^>]*)>/i.exec(html);if(time)publishedAt=attrs(time[1]).datetime;}
  if(!publishedAt)publishedAt=/"datePublished"\s*:\s*"([^"\\]+)"/.exec(html)?.[1];
  const reviewedDateUsed=!publishedAt&&!!reviewedDate;
  if(reviewedDateUsed)publishedAt=reviewedDate;
  // Dates may be absent or malformed; never invent a publication date.
  if(publishedAt&&!Number.isFinite(Date.parse(publishedAt)))publishedAt=null;
  if(publishedAt)publishedAt=new Date(publishedAt).toISOString();
  const resolvedCreator=creator?{...creator,identityStatus:'provided'}:metadata.get('author')?{name:metadata.get('author'),identityStatus:'page-metadata'}:{name:new URL(url).hostname,identityStatus:'domain-placeholder'};
  const topicText=`${title} ${metadata.get('description')??metadata.get('og:description')??''} ${visibleText}`;
  return normalizeRecord({url,role,title,creator:role==='content'?resolvedCreator:null,observedAt,publishedAt:publishedAt||null,links,mentions:detectMentions(visibleText,observedAt,url),topics:TOPICS.filter(t=>t.pattern.test(topicText)).map(t=>t.name),collection:{method:'public-html',topicSignals:detectTopicSignals(topicText),scope,linksFound:allLinks.size,status:missing.length||allLinks.size>links.length?'partial':'ok',dateBasis:reviewedDateUsed?'reviewed-public-seed':publishedAt?'page-metadata':'unknown',contentHash:createHash('sha256').update(html).digest('hex'),note:`${scope} 영역에서 공개 href만 추출. ${selected?'씨드의 선택 링크만 보존. ':''}${missing.length?`예상 링크 ${missing.length}개 미확인. `:''}HTML·본문은 저장하지 않음.`}}, {trusted:true});
}

export async function collectBatch(items,{request=requestPublic,now=()=>new Date().toISOString(),additionalHosts=[]}={}) {
  if(!Array.isArray(items)||!items.length||items.length>6) throw new Error('한 번에 1~6개 URL을 수집할 수 있습니다.');
  const records=[],attempts=[],seen=new Set(),robotsCache=new Map();
  for(const item of items) {
    const original=typeof item==='string'?{url:item}:item;
    let url=String(original?.url??'');const startedAt=now();
    try {
      url=validatePublicTarget(url,{additionalHosts});
      if(seen.has(url)){attempts.push({url,status:'duplicate',observedAt:startedAt,message:'이 요청의 중복 URL을 건너뛰었습니다.'});continue;}seen.add(url);
      const origin=new URL(url).origin;
      if(!robotsCache.has(origin)) {
        const r=await request(`${origin}/robots.txt`,{maxBytes:128_000,additionalHosts});
        if(r.status===404)robotsCache.set(origin,'');
        else if(r.status===200)robotsCache.set(origin,r.body);
        else throw new Error(`robots.txt 확인 실패 (HTTP ${r.status}). 접근 제한을 우회하지 않습니다.`);
      }
      if(!robotsAllowed(robotsCache.get(origin),original.url))throw new Error('robots.txt가 이 경로 수집을 허용하지 않습니다.');
      const response=await request(original.url,{additionalHosts,canVisit:target=>robotsAllowed(robotsCache.get(origin),target)});
      if(response.status!==200)throw new Error(`HTTP ${response.status}: 공개 페이지를 수집하지 못했습니다.`);
      if(!/^text\/html(?:;|$)/i.test(response.headers['content-type']??''))throw new Error('MVP 수집기는 공개 HTML만 지원합니다.');
      if(!robotsAllowed(robotsCache.get(origin),response.url))throw new Error('이동 대상의 robots.txt 규칙이 수집을 허용하지 않습니다.');
      let record=extractHtml(response.body,response.url,{...original,observedAt:now()});
      record=normalizeRecord({...record,aliases:url!==record.url?[url]:[]},{trusted:true});records.push(record);
      attempts.push({url,status:'ok',observedAt:record.observedAt,message:`${record.links.length}개 링크 보존; ${record.collection.omittedLinks}개 생략`,retainedLinks:record.links.length,contentHash:record.collection.contentHash});
    }catch(e) {attempts.push({url,status:'error',observedAt:startedAt,message:e.message});}
  }
  return {records,attempts};
}
