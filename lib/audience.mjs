import {normalizeUrl,idFor,creatorKey} from './urls.mjs';
import {collectBatch,requestPublic} from './collector.mjs';
import {strategyTargets} from './discovery.mjs';
import {buildGraph} from './graph.mjs';
import {platformConnections,collectSocialUrl,socialPlatform} from './social.mjs';

const colors=['#7556d8','#e08030','#12977e','#447bcb'];
const topicNames={'AI agents':'AI · Agents','Tools / MCP':'Tools · MCP','Developer workflow':'Dev tools','Orchestration / evaluation':'Workflows'};
export function inputUrl(value){
  if(typeof value!=='string'||!value.trim())throw new Error('Enter a public product URL.');
  const raw=value.trim();
  return normalizeUrl(/^[a-z][a-z\d+.-]*:\/\//i.test(raw)?raw:`https://${raw}`);
}
export async function repositorySource(value,{request=requestPublic,observedAt=new Date().toISOString()}={}){
  const url=normalizeUrl(value),u=new URL(url);
  if(u.hostname!=='github.com'||u.pathname.split('/').filter(Boolean).length!==2)throw new Error('Enter a public GitHub repository root URL.');
  const result=await collectBatch([{url,role:'source'}],{request,now:()=>observedAt,additionalHosts:['github.com']});
  if(!result.records.length)throw new Error(result.attempts[0]?.message||'Public repository page metadata unavailable.');
  return {record:result.records[0],attempts:result.attempts};
}
export function researchQueries(url,{title='',topics=[]}={}){
  const u=new URL(url),name=(title||u.hostname.replace(/^www\./,'')).replace(/[\n\r\"\\]/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
  const topic=topics.includes('AI agents')?'AI agents':topics.includes('Tools / MCP')?'MCP tools':topics.includes('Developer workflow')?'developer tools':topics.includes('Orchestration / evaluation')?'workflow automation':'';
  return [...new Set([`"${name}"`,...(topic?[`${topic} original sources references`]:[])])];
}
export async function analyzeProduct(value,{request=requestPublic,now=()=>new Date().toISOString()}={}){
  const url=inputUrl(value),u=new URL(url),observedAt=now(),records=[],attempts=[];
  let product;
  try{
    if(socialPlatform(url)){product=await collectSocialUrl(url,{request,now});attempts.push({url:product.url,status:'ok',observedAt,message:'Direct public original-page metadata collected.'});}
    else {const result=await collectBatch([{url,role:'source'}],{request,now,additionalHosts:[u.hostname]});product=result.records[0];attempts.push(...result.attempts);}
  }catch(e){attempts.push({url,status:'error',observedAt,message:e.message});}
  if(product)records.push(product);
  const topics=(product?.topics??[]).filter(t=>t!=='AI agents'||product.collection.topicSignals.includes('ai'));
  const queries=researchQueries(product?.url??url,{title:product?.title,topics});
  return {records,attempts,analysis:{mode:'audience',url:product?.url??url,title:product?.title??u.hostname,observedAt,topics,labels:topics.map(t=>topicNames[t]),queries,searchStatus:'ready',matches:0,contentUrls:product?.role==='content'?[product.url]:[],sourceUrls:product?.role==='source'?[product.url]:[],platformCoverage:{youtube:'ready',instagram:'ready',x:'ready',web:'ready',hackernews:'ready'},connections:platformConnections(),queryBasis:product?'Queries planned from public product metadata; no keyword search has run.':'Queries planned from the supplied URL; product metadata is unavailable. No keyword search has run.',limits:'Your existing subscribed AI host must execute its own search/browser skill and return bounded public metadata. Search snippets are discovery candidates. Original pages and actual hrefs require separate browser evidence. App verification and agent reports remain separate.'}};
}

export function researchGraph(workspace){
  let scoped=workspace;
  if(workspace.analysis?.mode==='audience'){
    const urls=new Set([workspace.analysis.url,...(workspace.analysis.contentUrls??[]),...(workspace.analysis.sourceUrls??[]),...(workspace.analysis.reportedUrls??[])]);
    const records=workspace.records.filter(r=>urls.has(r.url)||(r.aliases??[]).some(a=>urls.has(a)));
    // Cached, already fetched upstream documents may be reused only on an actual href path.
    for(let depth=0;depth<2;depth++){const destinations=new Set(records.flatMap(r=>r.links.map(l=>l.url)));for(const r of workspace.records)if(!records.includes(r)&&(destinations.has(r.url)||(r.aliases??[]).some(a=>destinations.has(a))))records.push(r);}
    scoped={...workspace,records,relationships:workspace.relationships.filter(h=>urls.has(h.from)||urls.has(h.to))};
  }
  const graph=buildGraph(scoped);
  graph.scope={documents:scoped.records.length,totalWorkspaceDocuments:workspace.records.length,mode:workspace.analysis?.mode??'url-citations'};
  graph.mentions=graph.mentions.map(m=>({...m,externalContentDocuments:m.evidence.filter(e=>e.role==='content').length,inputProductDocuments:m.evidence.filter(e=>e.evidenceUrl===workspace.analysis?.url).length}));
  if(workspace.analysis?.mode==='audience')graph.coverage.limitations[0]='A bounded public sample planned for this product. Coverage reflects submitted search/browser evidence; it does not measure viewer overlap, influence, or the whole market.';
  const hn=graph.nodes.filter(n=>n.type==='content'&&n.document.metrics?.platform==='hackernews'&&(n.document.metrics.status==='observed'||n.document.collection.method==='agent-browser'));
  const channels=[];
  if(hn.length){const node={id:'channel-hackernews',type:'channel',platform:'hackernews',title:'Hacker News',url:'https://news.ycombinator.com/showhn.html',contentIds:hn.map(n=>n.id),creatorCount:new Set(hn.map(n=>creatorKey(n.document.creator))).size};graph.nodes.push(node);channels.push(node);for(const n of hn)graph.edges.push({id:idFor('hosted',n.id),from:n.id,to:node.id,type:'published-on',evidence:{url:n.url,observedAt:n.document.observedAt,status:n.document.collection.method==='agent-browser'?'agent-observed':'observed',basis:'Public story URL platform membership; not citation or influence.'}});}
  let targets;
  if(workspace.analysis?.mode==='audience'){
    targets=graph.rankings.filter(s=>s.eligible&&new URL(s.url).hostname==='github.com'&&new URL(s.url).pathname.split('/').filter(Boolean).length===2&&s.document?.collection.topicSignals?.includes('ai')).slice(0,3).map(s=>({id:s.id,sourceId:s.id,platform:'github',url:s.url,score:s.score,status:'observed-path',action:'Integration example or documentation draft',evidenceIds:s.supportingEdges.filter(e=>['observed','agent-observed'].includes(e.evidence.status)).map(e=>e.id),caveat:`${s.directCreatorCount} direct creators and ${s.secondHopCreatorCount} additional second-hop creators in this sample. Contribution rules and placement availability are unverified.`}));
    if(channels.length)targets.push({id:'hackernews',sourceId:channels[0].id,platform:'hackernews',url:channels[0].url,score:null,status:'observed-platform-candidate',action:'Show HN: working product demo draft',evidenceIds:hn.map(n=>n.id),caveat:'Related public stories exist in this sample. Viewer overlap and placement effects are unverified. Prepare a working demo draft before considering submission.'});
  }else {targets=strategyTargets(graph,graph.analysis?.url).map(t=>t.platform==='hackernews'?{...t,sourceId:'channel-hackernews'}:t);}
  graph.strategies=targets.slice(0,4).map((t,i)=>({...t,color:colors[i],rank:i+1}));
  return graph;
}
