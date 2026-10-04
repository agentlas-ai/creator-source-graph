import {createHash} from 'node:crypto';
import {normalizeUrl} from './urls.mjs';
import {normalizeRecord,TOPICS,detectMentions,detectTopicSignals} from './model.mjs';
import {requestPublic,robotsAllowed} from './collector.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const number=v=>/^[\d]+$/.test(String(v))&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const brief=s=>String(s??'').replace(/\s+/g,' ').trim().slice(0,160);
const topicsFor=s=>TOPICS.filter(t=>t.pattern.test(s)).map(t=>t.name);
export const SOCIAL_PLATFORMS=['youtube','instagram','x'];
export function socialPlatform(input){const u=new URL(normalizeUrl(input)),h=u.hostname;return /^(www\.)?youtube\.com$/.test(h)&&(/^\/watch$/.test(u.pathname)||/^\/shorts\//.test(u.pathname))||h==='youtu.be'?'youtube':/^(www\.)?instagram\.com$/.test(h)&&/^\/(p|reel|tv)\/[\w-]+$/.test(u.pathname)?'instagram':/^(www\.)?(x|twitter)\.com$/.test(h)&&/^\/[^/]+\/status\/\d+$/.test(u.pathname)?'x':null;}
export function platformConnections(){
  return SOCIAL_PLATFORMS.map(platform=>({platform,discovery:false,metrics:platform==='youtube',mode:'local-ai-host',required:[],capability:platform==='youtube'?'Your subscribed AI host performs search and browsing. Direct public watch URLs can also supply app-verified metadata.':'Your subscribed AI host performs search and browsing. Original-page observations remain agent reported; restricted pages may be unavailable.'}));
}
function citations(text,scope='main'){
  const result=new Map();
  for(const m of String(text??'').matchAll(/https?:\/\/[^\s<>"'\]\)]+/g)){
    try{const url=normalizeUrl(m[0].replace(/[.,;!?]+$/,''));if(new URL(url).hostname==='t.co')continue;result.set(url,{url,anchor:'Explicit URL in public description/caption',kind:'citation',scope});}catch{}
  }
  return [...result.values()].slice(0,20);
}
function contentRecord({url,title,creator,publishedAt,text='',links=[],metrics={},method='public-api',observedAt,note='',evidenceUrl=url}){
  return normalizeRecord({url,role:'content',title:brief(title),creator:creator??{name:'Unknown creator',url,identityStatus:'domain-placeholder'},publishedAt,observedAt,topics:topicsFor(`${title} ${text}`),links,mentions:['public-index','agent-search'].includes(method)?[]:detectMentions(`${title} ${text}`,observedAt,url),metrics,collection:{method,scope:method==='public-html'?'main':'api',status:method==='public-index'?'partial':'ok',linksFound:links.length,contentHash:hash(`${title}|${JSON.stringify(links)}|${JSON.stringify(metrics)}`),evidenceUrl,topicSignals:detectTopicSignals(`${title} ${text}`),dateBasis:publishedAt?'public platform metadata':'unknown',note:`${note} Public titles/metrics/URL citations only; no caption, transcript, comments or media copied.`}},{trusted:true});
}
// Read one bounded JSON object embedded in a public HTML page. No script executes.
export function embeddedObject(html,name){
  const m=new RegExp(`(?:var\\s+)?${name}\\s*=\\s*\\{`).exec(html);if(!m)return null;
  const start=m.index+m[0].length-1;let depth=0,string=false,escape=false;
  for(let i=start;i<html.length;i++){const c=html[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{return JSON.parse(html.slice(start,i+1));}catch{return null;}}}
  return null;
}
export function parseYouTubeWatch(html,input,observedAt=new Date().toISOString()){
  const p=embeddedObject(html,'ytInitialPlayerResponse'),v=p?.videoDetails,m=p?.microformat?.playerMicroformatRenderer;
  if(!v?.videoId||!v.title||!v.author||!v.channelId||p.playabilityStatus?.status!=='OK')throw new Error('Public video metadata unavailable. Login, age, and access restrictions are not bypassed.');
  const parsed=new URL(normalizeUrl(input));const requested=parsed.searchParams.get('v')??parsed.pathname.split('/').at(-1);
  if(v.videoId!==requested)throw new Error('The returned video ID does not match the requested URL.');
  return contentRecord({url:`https://www.youtube.com/watch?v=${v.videoId}`,title:v.title,creator:{name:v.author,url:`https://www.youtube.com/channel/${v.channelId}`,identityStatus:'page-metadata'},publishedAt:m?.publishDate??m?.uploadDate??null,text:v.shortDescription,links:citations(v.shortDescription,'main'),metrics:{platform:'youtube',views:number(v.viewCount),basis:'page-metadata'},method:'public-html',observedAt,note:'Public watch-page player metadata; description text discarded.'});
}
export async function collectYouTubeUrl(input,{request=requestPublic,now=()=>new Date().toISOString()}={}){
  if(socialPlatform(input)!=='youtube')throw new Error('Enter a public YouTube video URL.');
  const u=new URL(normalizeUrl(input));const id=u.searchParams.get('v')??u.pathname.split('/').at(-1);
  if(!/^[\w-]{11}$/.test(id))throw new Error('Invalid YouTube video ID.');
  const url=`https://www.youtube.com/watch?v=${id}`,options={additionalHosts:['www.youtube.com']};
  const robots=await request('https://www.youtube.com/robots.txt',{...options,maxBytes:128_000});
  if(robots.status!==200&&robots.status!==404)throw new Error(`YouTube access-policy check failed: HTTP ${robots.status}`);
  const policy=robots.status===404?'':robots.body;
  if(!robotsAllowed(policy,url))throw new Error('YouTube robots.txt does not allow this video path.');
  const response=await request(url,{...options,maxBytes:1_500_000,canVisit:target=>robotsAllowed(policy,target)});
  if(response.status!==200||!/text\/html/i.test(response.headers['content-type']??''))throw new Error(`Public YouTube page unavailable: HTTP ${response.status}`);
  return parseYouTubeWatch(response.body,url,now());
}
export async function discoverSocial(query,{platforms=SOCIAL_PLATFORMS}={}){
  const requested=SOCIAL_PLATFORMS.filter(p=>platforms.includes(p));
  return {records:[],attempts:[],coverage:Object.fromEntries(requested.map(p=>[p,'ready'])),connections:platformConnections(),tasks:requested.map(platform=>({platform,query:`site:${platform==='youtube'?'youtube.com/watch':platform==='instagram'?'instagram.com/reel':'x.com'} ${brief(query)}`,status:'ready'}))};
}

export async function collectSocialUrl(input,{request=requestPublic,now=()=>new Date().toISOString()}={}){
  const platform=socialPlatform(input);
  if(!platform)throw new Error('Enter a public YouTube video, Instagram post/Reel, or X post URL.');
  if(platform==='youtube')return collectYouTubeUrl(input,{request,now});
  throw new Error(`${platform}: Open the original public post with your AI host's browser skill and submit an agent-browser observation. Login and access restrictions must be respected.`);
}
