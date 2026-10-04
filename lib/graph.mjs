import { idFor, creatorKey } from './urls.mjs';
import { BRANDS, TOPICS } from './model.mjs';

const observed = r=>!r.synthetic && ['public-html','public-api','curated-public','agent-browser'].includes(r.collection.method);
const knownCreator = r=>observed(r)&&r.creator&&r.creator.identityStatus!=='domain-placeholder';
const quality = (r, link)=>!observed(r) ? 0 : r.collection.method==='agent-browser' ? .7 : r.collection.method==='curated-public' ? .9 : link.scope==='document' ? .45 : .8;
const mean = xs=>xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const rounded = x=>Math.round(x*10)/10;

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
  }
  const realCreators=[...creators.values()].filter(c=>c.observed), denominator=realCreators.length;
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
    const text=[s.title,...(s.document?.topics??[]),...supportingEdges.filter(e=>e.evidence.quality>0).map(e=>e.evidence.anchor)].join(' ');
    const topics=TOPICS.filter(t=>t.pattern.test(text) || s.document?.topics?.includes(t.name)).map(t=>t.name);
    const relevance=topics.length/TOPICS.length;
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
  return {nodes:[...creators.values(),...contents,...sources.values()],edges,rankings,mentions,coverage,analysis:workspace.analysis??null,formula:'45 × direct unique creators / observed creators + 25 × additional second-hop unique creators / observed creators + 20 × topic matches / 4 + 10 × mean best path evidence quality. No observed creator path → score 0. Inferences, reported imports and synthetic evidence never contribute.',updatedAt:workspace.updatedAt};
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
