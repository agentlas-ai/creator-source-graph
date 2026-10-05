import { idFor, creatorKey } from './urls.mjs';
import { BRANDS, TOPICS } from './model.mjs';
import { socialPlatform, SOCIAL_PLATFORMS } from './social.mjs';

const observed = r=>!!r&&!r.synthetic && ['public-html','public-api','curated-public','agent-browser'].includes(r.collection?.method);
const knownCreator = r=>observed(r)&&r.creator&&r.creator.identityStatus!=='domain-placeholder';
const quality = (r, link)=>!observed(r) ? 0 : r.collection.method==='agent-browser' ? .7 : r.collection.method==='curated-public' ? .9 : link.scope==='document' ? .45 : .8;
const mean = xs=>xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const rounded = x=>Math.round(x*10)/10;
const topicLabels = values=>{
  const labels=new Map();
  for(const value of Array.isArray(values)?values:[]){
    if(typeof value!=='string')continue;
    const label=value.replace(/\s+/g,' ').trim(),key=label.normalize('NFKC').toLowerCase();
    if(label&&!labels.has(key))labels.set(key,label);
  }
  return labels;
};

function socialContents(contents) {
  const result=contents.flatMap(content=>{
    const platform=socialPlatform(content.url);if(!platform||content.document.synthetic)return [];
    const r=content.document,m=r.metrics??{},known=observed(r)&&['observed','agent-reported'].includes(m.status)&&Number.isSafeInteger(m.views)&&m.views>=0;
    return [{...content,platform,views:known?m.views:null,viewStatus:known?(r.collection.method==='agent-browser'?'agent-reported':'app-observed'):'unknown',viewBasis:known?m.basis??'':''}];
  }).sort((a,b)=>SOCIAL_PLATFORMS.indexOf(a.platform)-SOCIAL_PLATFORMS.indexOf(b.platform)||(a.views==null)-(b.views==null)||(b.views??0)-(a.views??0)||a.url.localeCompare(b.url));
  const ranks=new Map();return result.map(content=>{const rank=(ranks.get(content.platform)??0)+1;ranks.set(content.platform,rank);return {...content,viewRank:rank};});
}
function traceableDestination(edge,node) {
  if(!node)return false;
  const u=new URL(node.url),path=u.pathname.toLowerCase(),anchor=(edge.evidence?.anchor??'').trim().toLowerCase();
  // Navigation is retained in the raw graph, but is not source provenance.
  if(path==='/'||/^\/(?:privacy|terms|policies|policy|login|signin|signup|account|settings|contact|about)(?:\/|$)/.test(path))return false;
  if(/^(?:home|about|contact|privacy(?: policy)?|terms(?: of (?:service|use))?|sign (?:in|up)|log in|menu|subscribe|follow)$/.test(anchor))return false;
  if(/^(www\.)?(?:youtube\.com|instagram\.com|x\.com|twitter\.com|threads\.(?:net|com))$/.test(u.hostname)&&!socialPlatform(node.url))return false;
  return true;
}
export function buildTraces(nodes,edges,starts,{maxDepth=6,maxChains=1000,maxPathsPerStart=16}={}) {
  maxDepth=Number.isInteger(maxDepth)?Math.max(3,Math.min(8,maxDepth)):6;
  maxChains=Number.isInteger(maxChains)?Math.max(1,Math.min(1000,maxChains)):1000;
  maxPathsPerStart=Number.isInteger(maxPathsPerStart)?Math.max(1,Math.min(32,maxPathsPerStart)):16;
  const nodeMap=new Map(nodes.map(n=>[n.id,n])),adjacency=new Map();
  const usable=edges.filter(e=>!e.synthetic&&e.to.startsWith('source-')&&traceableDestination(e,nodeMap.get(e.to))&&
    (e.type==='explicit'&&e.evidence?.quality>0||e.type==='inferred'&&e.status==='agent-inferred'&&e.evidence?.length&&observed(nodeMap.get(e.from)?.document??{})&&observed(nodeMap.get(e.to)?.document??{})));
  for(const edge of usable){if(!adjacency.has(edge.from))adjacency.set(edge.from,[]);adjacency.get(edge.from).push(edge);}
  const edgeInfo=e=>{
    const from=nodeMap.get(e.from)?.document,to=nodeMap.get(e.to)?.document;
    const chronology=from?.publishedAt&&to?.publishedAt?(Date.parse(to.publishedAt)<=Date.parse(from.publishedAt)?'consistent':'conflict'):'unknown';
    return {edgeId:e.id,from:e.from,to:e.to,kind:e.type==='inferred'?'inferred':'href',confidence:e.type==='inferred'?e.confidence??'low':e.evidence.status==='agent-observed'?'medium':'high',evidence:e.evidence,rationale:e.rationale??'',assumption:e.assumption??'',chronology,fromPublishedAt:from?.publishedAt??null,toPublishedAt:to?.publishedAt??null,claim:e.type==='inferred'?'Evidence-supported candidate; similarity does not prove provenance.':'The opened page links to this destination; derivation is not proven.'};
  };
  const chains=[];let truncatedStarts=0;
  const add=(start,path,pathEdges,termination)=>{
    if(chains.length>=maxChains)return;
    const sourceIds=[...new Set(path.slice(1))],terminalId=sourceIds.length?path.at(-1):null;
    const dated=sourceIds.filter(id=>nodeMap.get(id)?.document?.publishedAt),earliest=dated.length?Math.min(...dated.map(id=>Date.parse(nodeMap.get(id).document.publishedAt))):null;
    const earliestDatedSourceIds=dated.filter(id=>Date.parse(nodeMap.get(id).document.publishedAt)===earliest);
    const details=pathEdges.map(edgeInfo),containsInference=details.some(e=>e.kind==='inferred'),chronology=details.some(e=>e.chronology==='conflict')?'conflict':details.some(e=>e.chronology==='unknown')?'unknown':'consistent';
    const unknownDateSourceIds=sourceIds.filter(id=>!nodeMap.get(id)?.document?.publishedAt);
    // A link observed today may point to work published after the content.
    // Keep dates informative without presenting that path as an earlier origin.
    const resolved=termination==='leaf'&&chronology!=='conflict'&&!!nodeMap.get(terminalId)?.document?.publishedAt;
    const earliestFoundRootIds=resolved?earliestDatedSourceIds:[];
    const rootStatus=!sourceIds.length?'no-source':!resolved?'unresolved':unknownDateSourceIds.length?'earliest-dated-found-with-unknown-dates':'earliest-dated-found';
    const rootCandidates=(earliestFoundRootIds.length?earliestFoundRootIds:terminalId?[terminalId]:[]).map(sourceId=>({sourceId,publishedAt:nodeMap.get(sourceId)?.document?.publishedAt??null,status:rootStatus,confidence:!resolved?'unknown':containsInference||chronology!=='consistent'?'low':'medium'}));
    chains.push({id:idFor('trace',`${start.id}|${pathEdges.map(e=>e.id).join('|')}|${termination}`),startContentId:start.id,platform:start.platform,nodeIds:path,middleSourceIds:sourceIds.filter(id=>!earliestFoundRootIds.includes(id)&&(resolved||id!==terminalId)),earliestFoundRootIds,earliestDatedSourceIds,furthestSourceId:terminalId,rootCandidates,rootStatus,unknownDateSourceIds,edges:details,termination,containsInference,chronology,globallyFirstOrigin:false});
  };
  for(const start of starts){
    if(chains.length>=maxChains){truncatedStarts++;continue;}
    const queue=[{path:[start.id],edges:[]}];let emitted=0;
    while(queue.length&&emitted<maxPathsPerStart&&chains.length<maxChains){
      const current=queue.shift(),last=current.path.at(-1),next=adjacency.get(last)??[];
      if(!next.length){add(start,current.path,current.edges,current.edges.length?'leaf':'no-source');emitted++;continue;}
      if(current.edges.length>=maxDepth){add(start,current.path,current.edges,'depth-limit');emitted++;continue;}
      for(const edge of next.slice(0,maxPathsPerStart)){
        const path=[...current.path,edge.to],pathEdges=[...current.edges,edge];
        if(current.path.includes(edge.to)){add(start,path,pathEdges,'cycle');emitted++;if(emitted>=maxPathsPerStart)break;}
        else if(queue.length<maxPathsPerStart*maxDepth)queue.push({path,edges:pathEdges});
      }
    }
    if(queue.length||emitted>=maxPathsPerStart)truncatedStarts++;
  }
  return {maxDepth,platforms:[...SOCIAL_PLATFORMS],starts:starts.map(s=>({contentId:s.id,platform:s.platform,views:s.views,viewStatus:s.viewStatus,viewRank:s.viewRank})),chains,earliestFoundRootIds:[...new Set(chains.flatMap(c=>c.earliestFoundRootIds))],truncatedStarts,limitations:['Earliest found means the earliest dated source on a bounded collected path, never the globally first origin.','Unknown dates, cycles and depth limits leave the earliest root unresolved.','An href is an observed page connection, not proof of derivation or copying.','AI-assisted source discovery is a research assumption; inferred paths remain candidates.','Navigation and policy links are excluded from source tracing.']};
}

export function buildGraph(workspace) {
  const documents = new Map(workspace.records.map(r=>[r.url,r]));
  for(const r of workspace.records)for(const alias of r.aliases??[])documents.set(alias,r);
  const canonical=url=>documents.get(url)?.url??url;
  const creators = new Map(), contents = [], sources = new Map(), edges = [];
  const ensureSource = (input, anchor='', synthetic=false)=>{
    const url=canonical(input);
    if (!sources.has(url)) {
      const doc=documents.get(url);
      sources.set(url,{id:idFor('source',url),type:'source',url,title:doc?.title || anchor || new URL(url).hostname, document:doc ?? null, fetched:!!doc, synthetic:doc?.synthetic ?? synthetic});
    }
    else if(!synthetic)sources.get(url).synthetic=false;
    if(!sources.get(url).document && /\bet al\b/i.test(sources.get(url).title) && anchor && !/\bet al\b/i.test(anchor))sources.get(url).title=anchor;
    return sources.get(url);
  };
  for (const r of workspace.records) if (r.role==='source') ensureSource(r.url,'',r.synthetic);
  for (const r of workspace.records) {
    if (r.role==='content') {
      const key=creatorKey(r.creator), creatorId=idFor('creator',key), contentId=idFor('content',r.url);
      if (!creators.has(creatorId)) creators.set(creatorId,{id:creatorId,type:'creator',name:r.creator.name,url:r.creator.url,contentIds:[],observed:false,synthetic:true});
      const c=creators.get(creatorId);c.contentIds.push(contentId);c.observed ||= knownCreator(r);c.synthetic &&= r.synthetic;
      contents.push({id:contentId,type:'content',url:r.url,title:r.title,creatorId,document:r});
      edges.push({id:idFor('publishes',`${creatorId}|${contentId}`),from:creatorId,to:contentId,type:'publishes',synthetic:r.synthetic});
    }
    for (const link of r.links) ensureSource(link.url,link.anchor,r.synthetic);
  }
  // Related social posts can appear as intermediate source nodes as well as
  // discovery content. Prepare these nodes before attaching their own hrefs.
  for(const h of workspace.relationships??[]){ensureSource(h.from,'',h.synthetic);ensureSource(h.to,'',h.synthetic);}
  for (const r of workspace.records) {
    // When a creator's article is cited by another article, its source node also
    // carries outbound references, without conflating content and source roles.
    const fromIds=[...(r.role==='content'?[idFor('content',r.url)]:[]), ...(sources.has(r.url)?[idFor('source',r.url)]:[])];
    for (const link of r.links) for (const from of fromIds) edges.push({
      id:idFor('link',`${from}|${canonical(link.url)}`),from,to:idFor('source',canonical(link.url)),type:'explicit',kind:link.kind,
      evidence:{url:r.url,targetUrl:link.url,resolvedTargetUrl:canonical(link.url),anchor:link.anchor,scope:link.scope,publishedAt:r.publishedAt,observedAt:r.observedAt,method:r.collection.method,quality:quality(r,link),status:r.collection.method==='agent-browser'?'agent-observed':observed(r)?'observed':r.synthetic?'synthetic':['public-index','agent-search'].includes(r.collection.method)?'discovered':'reported'},synthetic:r.synthetic
    });
  }
  for (const h of workspace.relationships ?? []) {
    ensureSource(h.from,'',h.synthetic);ensureSource(h.to,'',h.synthetic);
    edges.push({...h,from:idFor('source',canonical(h.from)),to:idFor('source',canonical(h.to)),fromUrl:h.from,toUrl:h.to,type:'inferred',quality:0});
    if(documents.get(h.from)?.role==='content')edges.push({...h,id:idFor('inferred-content',h.id),from:idFor('content',canonical(h.from)),to:idFor('source',canonical(h.to)),fromUrl:h.from,toUrl:h.to,type:'inferred',quality:0});
  }
  const realCreators=[...creators.values()].filter(c=>c.observed), denominator=realCreators.length;
  const productTopics=topicLabels(workspace.analysis?.topics);
  const direct=new Map([...sources.values()].map(s=>[s.id,new Map()]));
  const contentMap=new Map(contents.map(c=>[c.id,c]));
  for (const e of edges) if (e.type==='explicit' && e.evidence.quality>0 && contentMap.has(e.from)) {
    const c=contentMap.get(e.from); const m=direct.get(e.to);
    if(!knownCreator(c.document))continue;
    m.set(c.creatorId,Math.max(m.get(c.creatorId)??0,e.evidence.quality));
  }
  const rankings=[...sources.values()].map(s=>{
    const directCreators=direct.get(s.id), second=new Map(), paths=[];
    for (const upstream of edges.filter(e=>e.type==='explicit' && e.to===s.id && e.from.startsWith('source-') && e.evidence.quality>0 && e.from!==s.id)) {
      for (const [creatorId,q] of direct.get(upstream.from) ?? []) {
        if (directCreators.has(creatorId)) continue; // unique incremental second hop, no double count.
        second.set(creatorId,Math.max(second.get(creatorId)??0,Math.min(q,upstream.evidence.quality)));
        paths.push({creatorId,via:upstream.from,to:s.id,quality:Math.min(q,upstream.evidence.quality),evidenceUrl:upstream.evidence.url});
      }
    }
    const supportingEdges=edges.filter(e=>e.type==='explicit' && e.to===s.id);
    let topics;
    if(productTopics.size){
      // Subject overlap is metadata relevance, never evidence of provenance.
      const sourceTopics=topicLabels(observed(s.document)?s.document.topics:[]);
      topics=[...productTopics].filter(([key])=>sourceTopics.has(key)).map(([,label])=>label);
    }else{
      // Workspaces without product subjects retain the legacy topic heuristic.
      const text=[s.title,...(s.document?.topics??[]),...supportingEdges.filter(e=>e.evidence.quality>0).map(e=>e.evidence.anchor)].join(' ');
      topics=TOPICS.filter(t=>t.pattern.test(text) || s.document?.topics?.includes(t.name)).map(t=>t.name);
    }
    const relevance=topics.length/(productTopics.size||TOPICS.length);
    const q=mean([...directCreators.values(),...second.values()]);
    const supported=directCreators.size+second.size>0;
    const components={direct:denominator?45*directCreators.size/denominator:0,secondHop:denominator?25*second.size/denominator:0,relevance:supported?20*relevance:0,evidence:supported?10*q:0};
    return {...s,score:rounded(Object.values(components).reduce((a,b)=>a+b,0)),components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,rounded(v)])),directCreatorCount:directCreators.size,secondHopCreatorCount:second.size,directCreatorIds:[...directCreators.keys()],secondHopCreatorIds:[...second.keys()],secondHopPaths:paths,denominator,relevance:rounded(100*relevance),relevanceReasons:topics,evidenceQuality:rounded(100*q),supportingEdges,reportedLinks:supportingEdges.filter(e=>e.evidence.status==='reported').length,syntheticLinks:supportingEdges.filter(e=>e.synthetic).length,observedLinks:supportingEdges.filter(e=>e.evidence.quality>0).length,eligible:supported};
  }).sort((a,b)=>b.score-a.score || b.directCreatorCount-a.directCreatorCount || a.url.localeCompare(b.url));
  const realDocs=workspace.records.filter(r=>!r.synthetic), contentDocs=realDocs.filter(r=>r.role==='content');
  const mentions=BRANDS.map(brand=>{
    const observedDocs=realDocs.filter(r=>observed(r)&&r.mentions.some(m=>m.brand===brand));
    const reportedDocs=realDocs.filter(r=>!observed(r)&&r.mentions.some(m=>m.brand===brand));
    return {brand,observedDocuments:observedDocs.length,reportedDocuments:reportedDocs.length,uniqueCreators:new Set(observedDocs.filter(r=>r.creator).map(r=>creatorKey(r.creator))).size,evidence:observedDocs.flatMap(r=>r.mentions.filter(m=>m.brand===brand).map(m=>({...m,title:r.title,publishedAt:r.publishedAt,role:r.role}))),note:'Literal public-page mention; not sentiment, recommendation, usage or a measured market share.'};
  });
  const coverage={
    documents:realDocs.length,content:contentDocs.length,observedContent:contentDocs.filter(observed).length,creators:creators.size,observedCreators:denominator,
    observedDocuments:realDocs.filter(observed).length,appObservedDocuments:realDocs.filter(r=>observed(r)&&r.collection.method!=='agent-browser').length,agentObservedDocuments:realDocs.filter(r=>r.collection.method==='agent-browser').length,reportedDocuments:realDocs.filter(r=>!observed(r)&&!['public-index','agent-search'].includes(r.collection.method)).length,discoveredDocuments:realDocs.filter(r=>['public-index','agent-search'].includes(r.collection.method)).length,syntheticDocuments:workspace.records.filter(r=>r.synthetic).length,
    sources:sources.size,fetchedSources:[...sources.values()].filter(s=>s.fetched&&!s.synthetic).length,unfetchedSources:[...sources.values()].filter(s=>!s.fetched).length,
    explicitEdges:edges.filter(e=>e.type==='explicit'&&!e.synthetic).length,inferredEdges:edges.filter(e=>e.type==='inferred').length,
    missingDates:realDocs.filter(r=>!r.publishedAt).length,missingCreatorIdentity:contentDocs.filter(r=>r.creator?.identityStatus==='domain-placeholder').length,partialDocuments:realDocs.filter(r=>r.collection.status==='partial').length,omittedLinks:realDocs.reduce((n,r)=>n+r.collection.omittedLinks,0),
    failedAttempts:(workspace.attempts??[]).filter(a=>a.status==='error').length,attempts:workspace.attempts??[],
    publishedRange:contentDocs.map(r=>r.publishedAt).filter(Boolean).sort().filter((_,i,a)=>i===0||i===a.length-1),
    limitations:['A bounded public sample, not a complete market or creator census.','Explicit links show a visible connection, not influence, endorsement, or readership.','Links reflect the observation date, not necessarily the publication date.','Private conversations, communities, and research cannot be observed.','Topic relevance and path scores are heuristics within the collected sample.','Manual, synthetic, and search-only candidates do not contribute to source scores.','Unknown creator identity is excluded from creator counts.','AI-reported source observations are distinct from app-collected HTTP evidence.']
  };
  const nodes=[...creators.values(),...contents,...sources.values()],social=socialContents(contents),traces=buildTraces(nodes,edges,social);
  return {nodes,edges,rankings,mentions,coverage,socialContents:social,traces,analysis:workspace.analysis??null,formula:'45 × direct unique creators / observed creators + 25 × additional second-hop unique creators / observed creators + 20 × '+(productTopics.size?'opened source topic matches / unique product topics':'legacy topic matches / 4')+' + 10 × mean best path evidence quality. Topic overlap is not provenance. No observed creator path → score 0. Inferences, reported imports and synthetic evidence never contribute.',updatedAt:workspace.updatedAt};
}

export function sourceDetail(graph,id) {
  const source=graph.rankings.find(s=>s.id===id);
  if (!source) return null;
  const nodeMap=new Map(graph.nodes.map(n=>[n.id,n]));
  const outgoing=graph.edges.filter(e=>e.from===id && e.type==='explicit').map(e=>({...e,target:nodeMap.get(e.to)}));
  const incoming=source.supportingEdges.map(e=>({...e,origin:nodeMap.get(e.from)}));
  const inferred=graph.edges.filter(e=>e.type==='inferred'&&(e.from===id||e.to===id));
  const queue=[{id,path:[]}],seen=new Set([id]),traversal=[];
  while(queue.length&&traversal.length<60) {
    const current=queue.shift();if(current.path.length>=3)continue;
    for(const e of graph.edges.filter(e=>e.type==='explicit'&&!e.synthetic&&['observed','agent-observed'].includes(e.evidence.status)&&e.from===current.id&&e.to.startsWith('source-'))) {
      if(seen.has(e.to))continue;seen.add(e.to);
      const path=[...current.path,e];traversal.push({node:nodeMap.get(e.to),depth:path.length,path});queue.push({id:e.to,path});
    }
  }
  const creators=source.directCreatorIds.map(c=>nodeMap.get(c));
  return {source,incoming,outgoing,inferred,traversal,creators,secondHopCreators:source.secondHopCreatorIds.map(c=>nodeMap.get(c)),recommendation:placementDraft(source)};
}

export function placementDraft(s) {
  let action = 'Inspect the source', angle = 'Review the page and its explicit links before preparing a relevant contribution.';
  const host = new URL(s.url).hostname;
  if (s.eligible) {
    if (host === 'arxiv.org') { action = 'Research reproduction draft'; angle = 'Prepare a reproducible example related to the paper and your product.'; }
    else if (host === 'github.com') { action = 'Documentation / integration draft'; angle = 'Read the contribution rules and prepare an integration example for your product.'; }
    else if (host === 'news.ycombinator.com') { action = 'Working demo draft'; angle = 'Prepare a working demo and review the community submission rules.'; }
    else { action = 'Practical guide draft'; angle = 'Connect the source topic to a useful, verifiable example from your product.'; }
  }
  return {status:'draft',action,angle,why:'This sample contains ' + s.directCreatorCount + ' direct creators and ' + s.secondHopCreatorCount + ' additional two-hop creator paths.',nextSteps:['Read the supporting pages','Prepare a useful example with verifiable claims','Review the destination policies before publishing'],caveat:'A sample path score does not predict influence, views, conversion, or placement availability.'};
}
