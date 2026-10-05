import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {inputUrl,researchQueries} from './audience.mjs';
import {normalizeUrl,idFor} from './urls.mjs';
import {normalizeRecord,normalizeRelationship,mergeInput} from './model.mjs';
import {SOCIAL_PLATFORMS,SOCIAL_SEARCH_SITES} from './social.mjs';
import {isPublicAddress} from './collector.mjs';

export const RESEARCH_PLATFORMS=[...SOCIAL_PLATFORMS];
export const RESEARCH_STATUSES=['ready','searching','complete','partial','error','cancelled'];
const OPEN=new Set(['ready','searching']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const STRATEGY_FIELDS=new Set(['priority','kind','title','summary','targetUrl','evidenceUrls','placement']);
const PLACEMENT_FIELDS=['channelUrl','submissionUrl','discoveryUrl','rulesUrl','venueType'];
function bounded(value,name,max,{required=false}={}){
  if(value==null&&!required)return '';
  if(typeof value!=='string'||value.length>max||required&&!value.trim())throw new Error(`${name} must be a ${required?'nonempty ':''}string of at most ${max} characters.`);
  return value.trim();
}
function timestamp(now){const value=typeof now==='function'?now():now??new Date().toISOString();if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Invalid research timestamp.');return new Date(value).toISOString();}
function productKeywords(input){
  if(input===undefined)return [];
  if(!object(input)||Object.keys(input).some(field=>field!=='keywords'))throw new Error('product must be an object containing only optional keywords.');
  if(input.keywords===undefined)return [];
  if(!Array.isArray(input.keywords)||input.keywords.length>16)throw new Error('Product keywords must be an array of at most 16 strings.');
  const keywords=Array.from(input.keywords,value=>bounded(value,'product keyword',80,{required:true}).replace(/\s+/g,' '));
  if(new Set(keywords.map(value=>value.toLowerCase())).size!==keywords.length)throw new Error('Product keywords must be unique after case and whitespace normalization.');
  return keywords;
}
function publicUrl(value){
  const url=normalizeUrl(value),u=new URL(url),host=u.hostname.replace(/^\[|\]$/g,'');
  if(u.port||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||!host.includes('.')&&!isIP(host)||isIP(host)&&!isPublicAddress(host))throw new Error('Research evidence must use a public URL without a custom port.');
  return url;
}
function strategyPlacement(raw,{kind,targetUrl,evidenceUrls,opened,currentOpened}){
  if(raw===undefined||raw===null)return null;
  if(!object(raw)||Object.keys(raw).length!==PLACEMENT_FIELDS.length||Object.keys(raw).some(field=>!PLACEMENT_FIELDS.includes(field)))throw new Error('Placement requires channelUrl, submissionUrl, discoveryUrl, rulesUrl, and venueType only.');
  if(!['create','investigate'].includes(kind))throw new Error('Publication placement suggestions must use create or investigate.');
  if(!['community','directory','newsletter','newsfeed','blog','chat'].includes(raw.venueType))throw new Error('Placement venueType must be community, directory, newsletter, newsfeed, blog, or chat.');
  const placement=Object.fromEntries(PLACEMENT_FIELDS.map(field=>[field,field==='venueType'?raw[field]:field!=='channelUrl'&&raw[field]==null?null:publicUrl(raw[field])]));
  if(placement.channelUrl!==targetUrl)throw new Error('Placement channelUrl must match its strategy targetUrl.');
  for(const field of ['channelUrl','discoveryUrl','rulesUrl'])if(placement[field]&&(!opened.has(placement[field])||!evidenceUrls.includes(placement[field])))throw new Error('Supplied channel, discovery, and rules URLs must be opened records included in strategy evidence.');
  if(placement.submissionUrl){
    const routeObserved=['channelUrl','discoveryUrl','rulesUrl'].some(field=>placement[field]&&opened.get(placement[field])?.links.some(link=>link.kind==='hyperlink'&&link.url===placement.submissionUrl));
    if(!routeObserved)throw new Error('A supplied submissionUrl requires an observed hyperlink from the opened channel, discovery, or rules record.');
    if(currentOpened.has(placement.submissionUrl)&&!evidenceUrls.includes(placement.submissionUrl))throw new Error('An opened placement submission page in this import must be included in strategy evidence.');
  }
  const complete=['submissionUrl','discoveryUrl','rulesUrl'].every(field=>placement[field])&&placement.venueType!=='chat';
  const rulesRoute=complete&&opened.get(placement.rulesUrl)?.links.some(link=>link.kind==='hyperlink'&&link.url===placement.submissionUrl);
  if(kind==='create'&&(!complete||!rulesRoute))throw new Error('Create requires an opened public discovery surface and current rules containing the observed submission hyperlink. Use investigate with null unknown routes for a channel candidate.');
  // A public chat landing page can support fit investigation, never public indexing or creator sourcing.
  return {placement,recommendationType:kind==='create'?'placement':'channel-candidate'};
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
  const productQuery=queries[0];
  const tasks=RESEARCH_PLATFORMS.map(platform=>({platform,query:`${platform==='threads'?'(site:threads.com OR site:threads.net)':`site:${SOCIAL_SEARCH_SITES[platform]}`} ${productQuery}`,status:'ready',note:'Rank opened related posts by visible views within this platform; unknown views last. Then trace linked sources and labelled inferred candidates.'}));
  return {id:randomUUID(),url,title:bounded(analysis.title??new URL(url).hostname,'title',300),status:'ready',queries,tasks,platformTasks:tasks,keywords:[],strategies:[],discoveryPlatforms:[...RESEARCH_PLATFORMS],tracePlan:{maxDepth:6,ranking:'views-within-platform',assumption:'Creators may discover sources with AI; this is a search hypothesis, not observed provenance.',rootMeaning:'Earliest dated source found within the collected path; never a globally first origin.'},progress:{total:tasks.length,completed:0,searched:0,partial:0,unavailable:0,records:0},createdAt,updatedAt:createdAt,notes:[],coverage:[],collectionMode:'local-ai-host',note:'Plan ready. Your subscribed AI host must execute its own search and browser skills; no keyword search has run.'};
}
export function startResearchRun(workspace,value,options={}){
  const run=createResearchRun(value,options);
  const prior=(workspace.researchRuns??[]).map(r=>OPEN.has(r.status)?{...r,status:'cancelled',updatedAt:run.createdAt,note:'Superseded by a new research run.',notes:[...(r.notes??[]),'Superseded by a new research run.'].slice(-20)}:r);
  const supplied=options.analysis??{};
  const analysis={...supplied,mode:'audience',url:run.url,title:run.title,topics:supplied.topics??[],labels:supplied.labels??[],queries:run.queries,keywords:[],contentUrls:[],sourceUrls:[],reportedUrls:[],aiStrategies:[],runId:run.id,matches:0,searchStatus:'ready',platformCoverage:Object.fromEntries(RESEARCH_PLATFORMS.map(p=>[p,'ready']))};
  const next={...workspace,analysis,researchRuns:[...prior,run].slice(-30),activeResearchRunId:run.id,updatedAt:run.createdAt};
  return {workspace:next,report:{run}};
}
export function transitionResearchRun(workspace,runId,status,{note='',now}={}){
  if(status==='cancelled'||status==='error'){
    const terminal=(workspace.researchRuns??[]).find(r=>r.id===runId);
    if(terminal&&(status==='cancelled'&&!OPEN.has(terminal.status)||status==='error'&&terminal.status==='error'))return {workspace,report:{run:terminal,unchanged:true}};
  }
  const existing=currentRun(workspace,runId);
  if(!['searching','cancelled','error'].includes(status))throw new Error('Progress transitions support searching, cancelled, or error; completion requires a validated evidence import.');
  const updatedAt=timestamp(now),message=bounded(note,'note',500);
  const run={...existing,status,updatedAt,note:message||existing.note,notes:message?[...(existing.notes??[]),message].slice(-20):existing.notes??[]};
  const analysis=workspace.analysis?{...workspace.analysis,searchStatus:status}:workspace.analysis;
  return {workspace:withRun({...workspace,analysis},run),report:{run}};
}
function validateRecord(raw){
  if(!object(raw)||!object(raw.collection)||!['agent-browser','agent-search'].includes(raw.collection.method))throw new Error('Agent imports require agent-browser or agent-search collection methods.');
  for(const key of ['body','html','text','content','rawText','transcript','caption','description','comments'])if(raw[key]!=null)throw new Error('Store bounded public metadata, not article text, captions, comments, or transcripts.');
  publicUrl(raw.url);publicUrl(raw.collection.evidenceUrl);
  if(raw.creator?.url)publicUrl(raw.creator.url);
  bounded(raw.observedAt,'observedAt',64,{required:true});
  bounded(raw.publishedAt,'publishedAt',64);
  bounded(raw.title,'record title',300,{required:true});
  bounded(raw.summary,'summary',280);
  if(raw.creator)bounded(raw.creator.name,'creator name',100,{required:true});
  for(const [field,max] of [['note',500],['provenance',160],['scope',100],['dateBasis',100]])bounded(raw.collection[field],`collection.${field}`,max);
  bounded(raw.collection.provenance,'collection.provenance',160,{required:true});
  if(raw.links!=null&&(!Array.isArray(raw.links)||raw.links.length>80))throw new Error('Each record supports at most 80 observed links.');
  if(raw.collection.method==='agent-search'&&(raw.links?.length||raw.mentions?.length||raw.summary?.trim()))throw new Error('Search candidates cannot assert original-page hrefs, mentions, or summaries. Open the source page first.');
  for(const link of raw.links??[]){if(!object(link))throw new Error('Each link must be an object.');publicUrl(normalizeUrl(link.url,raw.url));bounded(link.anchor,'link anchor',80);if(link.evidenceUrl)publicUrl(link.evidenceUrl);}
  if(raw.metrics!=null&&!object(raw.metrics))throw new Error('metrics must be an object.');
  bounded(raw.metrics?.basis,'metrics basis',160);bounded(raw.metrics?.platform,'metrics platform',50);
  if(raw.collection.method==='agent-browser'&&raw.metrics?.views!=null)bounded(raw.metrics.basis,'metrics basis for visible views',160,{required:true});
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
  if(input.relationships!=null&&(!Array.isArray(input.relationships)||input.relationships.length>100))throw new Error('Inferred relationships must be an array of at most 100 items.');
  if(input.strategies!==undefined&&(!Array.isArray(input.strategies)||input.strategies.length>6))throw new Error('AI strategies must be an array of at most six suggestions.');
  const keywords=productKeywords(input.product);
  const note=bounded(input.note,'note',500);
  // Validate the entire batch before changing records, coverage, progress, or run state.
  const records=input.records.map(validateRecord),seen=new Set();
  const opened=new Map([...workspace.records,...records].filter(r=>!r.synthetic&&['agent-browser','public-html','public-api','curated-public'].includes(r.collection?.method)).map(r=>[r.url,r]));
  const currentOpened=new Set(records.filter(r=>!r.synthetic&&['agent-browser','public-html','public-api','curated-public'].includes(r.collection?.method)).map(r=>r.url));
  const relationships=(input.relationships??[]).map(raw=>{
    if(!object(raw))throw new Error('Each inferred relationship must be an object.');
    publicUrl(raw.from);publicUrl(raw.to);
    bounded(raw.rationale,'inference rationale',500,{required:true});bounded(raw.observedAt,'inference observedAt',64,{required:true});
    if(!['low','medium'].includes(raw.confidence))throw new Error('An inferred candidate requires low or medium confidence.');
    if(raw.assumption!=='ai-assisted-source-discovery')throw new Error('Inferred candidates must explicitly label the AI-assisted source-discovery assumption.');
    if(!Array.isArray(raw.evidence)||raw.evidence.length<1||raw.evidence.length>5)throw new Error('Each inferred candidate requires one to five opened-page evidence items.');
    for(const item of raw.evidence){if(!object(item))throw new Error('Each inference evidence item must be an object.');publicUrl(item.url);bounded(item.note,'inference evidence note',280,{required:true});if(!opened.has(normalizeUrl(item.url)))throw new Error('Inference evidence must reference an opened record, not a search snippet.');}
    const relationship=normalizeRelationship(raw,{trusted:true}),from=opened.get(relationship.from),to=opened.get(relationship.to);
    if(!from||!to)throw new Error('Both inferred relationship endpoints must be opened records.');
    const chronology=from.publishedAt&&to.publishedAt?(Date.parse(to.publishedAt)<=Date.parse(from.publishedAt)?'consistent':'conflict'):'unknown';
    return {...relationship,chronology,fromPublishedAt:from.publishedAt,toPublishedAt:to.publishedAt,confidence:chronology==='conflict'?'low':relationship.confidence};
  });
  const priorities=new Set();
  const strategies=(input.strategies??[]).map(raw=>{
    if(!object(raw)||Object.keys(raw).some(field=>!STRATEGY_FIELDS.has(field)))throw new Error('AI strategies support bounded suggestion metadata only; execution or status fields are not accepted.');
    if(!Number.isInteger(raw.priority)||raw.priority<1||raw.priority>6||priorities.has(raw.priority))throw new Error('AI strategy priorities must be unique integers from one to six.');
    priorities.add(raw.priority);
    if(!['read','build','create','investigate'].includes(raw.kind))throw new Error('AI strategy kind must be read, build, create, or investigate.');
    const title=bounded(raw.title,'strategy title',60,{required:true}),summary=bounded(raw.summary,'strategy summary',280,{required:true}),targetUrl=publicUrl(raw.targetUrl);
    if(!opened.has(targetUrl))throw new Error('AI strategy targets must reference an opened public record.');
    if(!Array.isArray(raw.evidenceUrls)||raw.evidenceUrls.length<1||raw.evidenceUrls.length>5)throw new Error('AI strategies require one to five opened public evidence URLs.');
    const evidenceUrls=raw.evidenceUrls.map(publicUrl);
    if(new Set(evidenceUrls).size!==evidenceUrls.length)throw new Error('AI strategy evidence URLs must be unique after normalization.');
    if(!evidenceUrls.includes(targetUrl)||evidenceUrls.some(url=>!opened.has(url)))throw new Error('AI strategy evidence must include its target and reference only opened public records.');
    const validated=strategyPlacement(raw.placement,{kind:raw.kind,targetUrl,evidenceUrls,opened,currentOpened});
    return {id:idFor('strategy',`${runId}|${raw.priority}|${raw.kind}|${targetUrl}|${title}`),priority:raw.priority,kind:raw.kind,title,summary,targetUrl,evidenceUrls,placement:validated?.placement??null,recommendationType:validated?.recommendationType??'reference',status:'suggested',judgment:'ai-recommendation',executed:false};
  }).sort((a,b)=>a.priority-b.priority);
  const coverage=input.coverage.map(entry=>{
    if(!object(entry)||!RESEARCH_PLATFORMS.includes(entry.platform)||!['searched','partial','unavailable'].includes(entry.status))throw new Error('Coverage requires a supported platform and searched, partial, or unavailable status.');
    if(seen.has(entry.platform))throw new Error('Coverage must have one entry per platform.');seen.add(entry.platform);
    const query=bounded(entry.query,'coverage query',300,{required:true}),message=bounded(entry.note,'coverage note',500);
    if(entry.status!=='searched'&&!message)throw new Error('Partial or unavailable coverage requires a reason.');
    return {platform:entry.platform,status:entry.status,query,note:message};
  });
  const searched=coverage.filter(c=>c.status==='searched').length;
  const status=input.status==='complete'&&records.length>0&&coverage.length===RESEARCH_PLATFORMS.length&&searched===coverage.length?'complete':'partial';
  const updatedAt=timestamp(now),tasks=RESEARCH_PLATFORMS.map(platform=>{const task=existing.tasks.find(t=>t.platform===platform)??createResearchRun(existing.url).tasks.find(t=>t.platform===platform);const result=coverage.find(c=>c.platform===platform);return result?{...task,...result}:{...task,status:'unavailable',note:'No coverage submitted.'};});
  const summary=note||(records.length?`${records.length} public metadata records submitted; ${searched} platform searches reported.`:'No records submitted. Coverage is partial; no content findings are claimed.');
  const run={...existing,status,tasks,platformTasks:tasks,keywords,strategies,coverage,updatedAt,note:summary,notes:[...(existing.notes??[]),summary].slice(-20),progress:{total:tasks.length,completed:coverage.length,searched,partial:coverage.filter(c=>c.status==='partial').length,unavailable:tasks.filter(t=>t.status==='unavailable').length,records:records.length}};
  const merged=mergeInput(workspace,{records,relationships},{trusted:true});
  const product=records.find(r=>r.url===existing.url),topics=product?.topics??workspace.analysis?.topics??[];
  const names={'AI agents':'AI · Agents','Tools / MCP':'Tools · MCP','Developer workflow':'Dev tools','Orchestration / evaluation':'Workflows'};
  const analysis={...(workspace.analysis??{}),mode:'audience',url:existing.url,title:product?.title??existing.title,topics,labels:topics.length?topics.map(t=>names[t]??t):workspace.analysis?.labels??[],keywords,aiStrategies:strategies,queries:[...new Set(coverage.map(c=>c.query))],queryBasis:'Executed queries and bounded original-page evidence reported by the existing local AI host. Agent observations are separate from app verification.',searchStatus:status,matches:records.filter(r=>r.role==='content').length,contentUrls:[...new Set([...(workspace.analysis?.contentUrls??[]),...records.filter(r=>r.role==='content').map(r=>r.url)])],sourceUrls:[...new Set([existing.url,...(workspace.analysis?.sourceUrls??[]),...records.filter(r=>r.role==='source').map(r=>r.url),...relationships.flatMap(h=>[h.from,h.to,...h.evidence.map(e=>e.url)]),...strategies.flatMap(s=>[s.targetUrl,...s.evidenceUrls])])],platformCoverage:Object.fromEntries(tasks.map(t=>[t.platform,t.status])),runId,observedAt:updatedAt};
  return {workspace:withRun({...merged.workspace,analysis},run),report:{...merged.report,run,coverage,status}};
}
