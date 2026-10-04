import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {inputUrl,researchQueries} from './audience.mjs';
import {normalizeUrl} from './urls.mjs';
import {normalizeRecord,mergeInput} from './model.mjs';
import {isPublicAddress} from './collector.mjs';

export const RESEARCH_PLATFORMS=['youtube','instagram','x','web','hackernews'];
export const RESEARCH_STATUSES=['ready','searching','complete','partial','error','cancelled'];
const OPEN=new Set(['ready','searching']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function bounded(value,name,max,{required=false}={}){
  if(value==null&&!required)return '';
  if(typeof value!=='string'||value.length>max||required&&!value.trim())throw new Error(`${name} must be a ${required?'nonempty ':''}string of at most ${max} characters.`);
  return value.trim();
}
function timestamp(now){const value=typeof now==='function'?now():now??new Date().toISOString();if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid research timestamp.');return new Date(value).toISOString();}
function publicUrl(value){
  const url=normalizeUrl(value),u=new URL(url),host=u.hostname.replace(/^\[|\]$/g,'');
  if(u.port||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')&&!isIP(host)||isIP(host)&&!isPublicAddress(host))throw new Error('Research evidence must use a public URL without a custom port.');
  return url;
}
function currentRun(workspace,runId){
  const run=(workspace.researchRuns??[]).find(r=>r.id===runId);
  if(!run)throw new Error('Research run not found.');
  if(workspace.activeResearchRunId!==runId)throw new Error('Research run is stale; submit only to the active run.');
  if(!OPEN.has(run.status))throw new Error(`Research run is ${run.status}; start a new run before submitting more evidence.`);
  return run;
}
function withRun(workspace,run){
  return {...workspace,researchRuns:(workspace.researchRuns??[]).map(r=>r.id===run.id?run:r),updatedAt:run.updatedAt};
}
export function createResearchRun(value,{analysis={},now}={}){
  const url=publicUrl(inputUrl(value)),createdAt=timestamp(now);
  const queries=researchQueries(url,{title:analysis.title,topics:analysis.topics??[]});
  const productQuery=queries[0],topicQuery=queries[1]??`${productQuery} sources references`;
  const tasks=RESEARCH_PLATFORMS.map(platform=>({platform,query:platform==='web'?topicQuery:`site:${{youtube:'youtube.com/watch',instagram:'instagram.com/reel',x:'x.com',hackernews:'news.ycombinator.com/item'}[platform]} ${productQuery}`,status:'ready',note:''}));
  return {id:randomUUID(),url,title:bounded(analysis.title??new URL(url).hostname,'title',300),status:'ready',queries,tasks,platformTasks:tasks,progress:{total:tasks.length,completed:0,searched:0,partial:0,unavailable:0,records:0},createdAt,updatedAt:createdAt,notes:[],coverage:[],collectionMode:'local-ai-host',note:'Plan ready. Your subscribed AI host must execute its own search and browser skills; no keyword search has run.'};
}
export function startResearchRun(workspace,value,options={}){
  const run=createResearchRun(value,options);
  const prior=(workspace.researchRuns??[]).map(r=>OPEN.has(r.status)?{...r,status:'cancelled',updatedAt:run.createdAt,note:'Superseded by a new research run.',notes:[...(r.notes??[]),'Superseded by a new research run.'].slice(-20)}:r);
  const supplied=options.analysis??{};
  const analysis={...supplied,mode:'audience',url:run.url,title:run.title,topics:supplied.topics??[],labels:supplied.labels??[],queries:run.queries,contentUrls:[],sourceUrls:[],reportedUrls:[],runId:run.id,matches:0,searchStatus:'ready',platformCoverage:Object.fromEntries(RESEARCH_PLATFORMS.map(p=>[p,'ready']))};
  const next={...workspace,analysis,researchRuns:[...prior,run].slice(-30),activeResearchRunId:run.id,updatedAt:run.createdAt};
  return {workspace:next,report:{run}};
}
export function transitionResearchRun(workspace,runId,status,{note='',now}={}){
  if(status==='cancelled'){
    const terminal=(workspace.researchRuns??[]).find(r=>r.id===runId);
    if(terminal&&!OPEN.has(terminal.status))return {workspace,report:{run:terminal,unchanged:true}};
  }
  const existing=currentRun(workspace,runId);
  if(!['searching','cancelled','error'].includes(status))throw new Error('Progress transitions support searching, cancelled, or error; completion requires a validated evidence import.');
  const updatedAt=timestamp(now),message=bounded(note,'note',500);
  const run={...existing,status,updatedAt,note:message||existing.note,notes:message?[...(existing.notes??[]),message].slice(-20):existing.notes??[]};
  return {workspace:withRun(workspace,run),report:{run}};
}
function validateRecord(raw){
  if(!object(raw)||!object(raw.collection)||!['agent-browser','agent-search'].includes(raw.collection.method))throw new Error('Agent imports require agent-browser or agent-search collection methods.');
  for(const key of ['body','html','text','content','rawText','transcript','caption','description','comments'])if(raw[key]!=null)throw new Error('Store bounded public metadata, not article text, captions, comments, or transcripts.');
  publicUrl(raw.url);publicUrl(raw.collection.evidenceUrl);
  if(raw.creator?.url)publicUrl(raw.creator.url);
  bounded(raw.observedAt,'observedAt',64,{required:true});
  bounded(raw.publishedAt,'publishedAt',64);
  bounded(raw.title,'record title',300,{required:true});
  if(raw.creator)bounded(raw.creator.name,'creator name',100,{required:true});
  for(const [field,max] of [['note',500],['provenance',160],['scope',100],['dateBasis',100]])bounded(raw.collection[field],`collection.${field}`,max);
  bounded(raw.collection.provenance,'collection.provenance',160,{required:true});
  if(raw.links!=null&&(!Array.isArray(raw.links)||raw.links.length>80))throw new Error('Each record supports at most 80 observed links.');
  if(raw.collection.method==='agent-search'&&(raw.links?.length||raw.mentions?.length))throw new Error('Search candidates cannot assert original-page hrefs or mentions. Open the source page first.');
  for(const link of raw.links??[]){if(!object(link))throw new Error('Each link must be an object.');publicUrl(normalizeUrl(link.url,raw.url));bounded(link.anchor,'link anchor',80);if(link.evidenceUrl)publicUrl(link.evidenceUrl);}
  if(raw.metrics!=null&&!object(raw.metrics))throw new Error('metrics must be an object.');
  bounded(raw.metrics?.basis,'metrics basis',160);bounded(raw.metrics?.platform,'metrics platform',50);
  for(const field of ['views','likes','comments','points','stars'])if(raw.metrics?.[field]!=null&&(!Number.isSafeInteger(raw.metrics[field])||raw.metrics[field]<0))throw new Error(`${field} must be a nonnegative safe integer or null.`);
  if(raw.collection.method==='agent-search'&&['views','likes','comments','points','stars'].some(field=>raw.metrics?.[field]!=null))throw new Error('Search candidates cannot assert measured metrics. Open the original page first.');
  if(raw.collection.linksFound!=null&&(!Number.isSafeInteger(raw.collection.linksFound)||raw.collection.linksFound<0||raw.collection.linksFound>10_000))throw new Error('linksFound must be a nonnegative integer no greater than 10000.');
  if(raw.topics!=null&&(!Array.isArray(raw.topics)||raw.topics.length>10||raw.topics.some(t=>typeof t!=='string'||t.length>100)))throw new Error('topics must be a short array of strings.');
  if(raw.collection.topicSignals!=null&&(!Array.isArray(raw.collection.topicSignals)||raw.collection.topicSignals.length>10))throw new Error('topicSignals must be a short array.');
  if(raw.aliases?.length)throw new Error('Agent imports must use the opened source URL rather than asserting aliases.');
  return normalizeRecord(raw,{trusted:true});
}
export function importResearchRun(workspace,runId,input,{now}={}){
  const existing=currentRun(workspace,runId);
  if(!object(input)||!Array.isArray(input.records)||input.records.length>100)throw new Error('Import records must be an array of at most 100 items.');
  if(!['complete','partial'].includes(input.status))throw new Error('Import status must be complete or partial.');
  if(!Array.isArray(input.coverage)||input.coverage.length>20)throw new Error('Import coverage must be an array of at most 20 items.');
  if(input.relationships?.length)throw new Error('Agent research imports cannot assert inferred relationships.');
  const note=bounded(input.note,'note',500);
  // Validate the entire batch before changing records, coverage, progress, or run state.
  const records=input.records.map(validateRecord),seen=new Set();
  const coverage=input.coverage.map(entry=>{
    if(!object(entry)||!RESEARCH_PLATFORMS.includes(entry.platform)||!['searched','partial','unavailable'].includes(entry.status))throw new Error('Coverage requires a supported platform and searched, partial, or unavailable status.');
    if(seen.has(entry.platform))throw new Error('Coverage must have one entry per platform.');seen.add(entry.platform);
    const query=bounded(entry.query,'coverage query',300,{required:true}),message=bounded(entry.note,'coverage note',500);
    if(entry.status!=='searched'&&!message)throw new Error('Partial or unavailable coverage requires a reason.');
    return {platform:entry.platform,status:entry.status,query,note:message};
  });
  const searched=coverage.filter(c=>c.status==='searched').length;
  const status=input.status==='complete'&&records.length>0&&coverage.length===RESEARCH_PLATFORMS.length&&searched===coverage.length?'complete':'partial';
  const updatedAt=timestamp(now),tasks=existing.tasks.map(task=>{const result=coverage.find(c=>c.platform===task.platform);return result?{...task,...result}:{...task,status:'unavailable',note:'No coverage submitted.'};});
  const summary=note||(records.length?`${records.length} public metadata records submitted; ${searched} platform searches reported.`:'No records submitted. Coverage is partial; no content findings are claimed.');
  const run={...existing,status,tasks,platformTasks:tasks,coverage,updatedAt,note:summary,notes:[...(existing.notes??[]),summary].slice(-20),progress:{total:tasks.length,completed:coverage.length,searched,partial:coverage.filter(c=>c.status==='partial').length,unavailable:tasks.filter(t=>t.status==='unavailable').length,records:records.length}};
  const merged=mergeInput(workspace,{records},{trusted:true});
  const product=records.find(r=>r.url===existing.url),topics=product?.topics??workspace.analysis?.topics??[];
  const names={'AI agents':'AI · Agents','Tools / MCP':'Tools · MCP','Developer workflow':'Dev tools','Orchestration / evaluation':'Workflows'};
  const analysis={...(workspace.analysis??{}),mode:'audience',url:existing.url,title:product?.title??existing.title,topics,labels:topics.length?topics.map(t=>names[t]??t):workspace.analysis?.labels??[],queries:[...new Set(coverage.map(c=>c.query))],queryBasis:'Executed queries and bounded original-page evidence reported by the existing local AI host. Agent observations are separate from app verification.',searchStatus:status,matches:records.filter(r=>r.role==='content').length,contentUrls:[...new Set([...(workspace.analysis?.contentUrls??[]),...records.filter(r=>r.role==='content').map(r=>r.url)])],sourceUrls:[...new Set([existing.url,...(workspace.analysis?.sourceUrls??[]),...records.filter(r=>r.role==='source').map(r=>r.url)])],platformCoverage:Object.fromEntries(tasks.map(t=>[t.platform,t.status])),runId,observedAt:updatedAt};
  return {workspace:withRun({...merged.workspace,analysis},run),report:{...merged.report,run,coverage,status}};
}
