import { normalizeUrl, idFor, creatorKey } from './urls.mjs';

export const BRANDS = ['Agentlas', 'AutoGPT', 'LangChain', 'CrewAI', 'Cursor', 'Claude Code', 'OpenAI Codex'];
export const TOPICS = [
  { name: 'AI agents', pattern: /\b(agents?|autonomous|react)\b/i },
  { name: 'Tools / MCP', pattern: /\b(tools?|tool use|mcp|model context protocol|function calling)\b/i },
  { name: 'Developer workflow', pattern: /\b(developer|coding|code|sdk|framework|repository|github)\b/i },
  { name: 'Orchestration / evaluation', pattern: /\b(orchestrat\w*|workflow|evaluat\w*|planning|memory|multi-agent)\b/i }
];
const METHODS = new Set(['public-html', 'public-api', 'public-index', 'curated-public', 'agent-browser', 'agent-search', 'manual', 'synthetic']);
const recordStrength = x=>x.synthetic ? 0 : x.collection?.method==='manual' ? 1 : ['public-index','agent-search'].includes(x.collection?.method)?1.5:x.collection?.method==='agent-browser'?1.75:2;
const text = (value, max = 300) => typeof value === 'string' ? value.trim().slice(0,max) : '';
export const detectTopicSignals=value=>[['ai',/\b(ai|artificial intelligence|llms?|gpt[\s-]?\d?|claude)\b/i],['agents',/\b(agents?|agentic)\b/i],['mcp',/\b(mcp|model context protocol)\b/i],['workflow',/\b(workflows?|orchestrat\w*|handoffs?|automation)\b/i],['developer',/\b(developers?|coding|code|sdk)\b/i]].filter(([,pattern])=>pattern.test(value)).map(([key])=>key);
function date(value, field, required = false) {
  if (value == null || value === '') { if (required) throw new Error(`${field} is required.`); return null; }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${field} is not a valid date.`);
  const iso = new Date(value).toISOString();
  if (value.length === 10 && iso.slice(0,10) !== value) throw new Error(`${field} is not a real date.`);
  return value.length === 10 ? iso.slice(0,10) : iso;
}

export function normalizeRecord(raw, { trusted = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each record must be an object.');
  const url = normalizeUrl(raw.url);
  const role = raw.role ?? 'content';
  if (!['content','source'].includes(role)) throw new Error('role must be content or source.');
  const title = text(raw.title);
  if (!title) throw new Error('A document title is required.');
  const synthetic = raw.synthetic === true || raw.collection?.method === 'synthetic';
  const method = synthetic ? 'synthetic' : trusted && METHODS.has(raw.collection?.method) ? raw.collection.method : 'manual';
  const agentBrowser = method === 'agent-browser', agentSearch = method === 'agent-search';
  if (raw.summary != null && (typeof raw.summary !== 'string' || raw.summary.length > 280 || /[\x00-\x1f\x7f]/.test(raw.summary))) throw new Error('summary must be a single line of at most 280 characters.');
  if ((agentSearch || method === 'public-index') && raw.summary?.trim()) throw new Error('Open the original page before adding a summary.');
  if (agentBrowser || agentSearch) {
    if (!raw.collection?.evidenceUrl || !raw.observedAt) throw new Error('Agent records require collection.evidenceUrl and observedAt.');
    const evidenceUrl = normalizeUrl(raw.collection.evidenceUrl);
    if (agentBrowser && evidenceUrl !== url) throw new Error('Browser evidence must identify the exact opened record URL.');
    if (typeof raw.collection?.provenance !== 'string' || !raw.collection.provenance.trim() || raw.collection.provenance.length > 160) throw new Error('Agent provenance must identify the actual host search or browser tool in at most 160 characters.');
  }
  const creator = raw.creator && text(raw.creator.name,100) ? { name: text(raw.creator.name,100), url: raw.creator.url ? normalizeUrl(raw.creator.url) : null, identityStatus:trusted&&['provided','page-metadata','domain-placeholder'].includes(raw.creator.identityStatus)?raw.creator.identityStatus:'provided' } : null;
  if (role === 'content' && !creator) throw new Error('Content records require creator.name.');
  if(raw.topics!=null&&(!Array.isArray(raw.topics)||raw.topics.length>10||raw.topics.some(t=>typeof t!=='string'||!t.trim()||t.length>100)))throw new Error('topics must contain at most ten nonempty strings of at most 100 characters.');
  const suppliedTopics=(raw.topics??[]).map(t=>t.replace(/\s+/g,' ').trim());
  const links = new Map();
  if (raw.links != null && (!Array.isArray(raw.links) || raw.links.length > 80)) throw new Error('links must be an array with at most 80 items.');
  for (const link of raw.links ?? []) {
    const target = normalizeUrl(link.url, url);
    if (target === url) continue;
    if (link.kind && !['hyperlink','citation'].includes(link.kind)) throw new Error('Explicit link kind must be hyperlink or citation. Keep inferred relationships separate.');
    const scope = ['article','main','document','manual','readme','api'].includes(link.scope) ? link.scope : 'manual';
    if (agentBrowser && link.evidenceUrl && normalizeUrl(link.evidenceUrl) !== url) throw new Error('Each browser link must have evidence from its opened parent page.');
    const current = { url: target, anchor: text(link.anchor,80), kind: link.kind ?? 'hyperlink', scope, evidenceUrl: url };
    if (!links.has(target)) links.set(target,current);
  }
  const observedAt = date(raw.observedAt ?? new Date().toISOString(),'observedAt',true);
  const mentions = [];
  if (raw.mentions != null && (!Array.isArray(raw.mentions) || raw.mentions.length > BRANDS.length)) throw new Error('The mentions array is too large.');
  for (const m of raw.mentions ?? []) if (BRANDS.includes(m.brand) && !mentions.some(n=>n.brand===m.brand)) {
    mentions.push({brand:m.brand, excerpt:text(m.excerpt,100) || m.brand, evidenceUrl:url, observedAt, status:method==='manual'?'reported':synthetic?'synthetic':agentBrowser?'agent-observed':method==='public-index'||agentSearch?'discovered':'observed', basis:text(m.basis,100) || 'visible-text'});
  }
  const collectedLinks = Number.isInteger(raw.collection?.linksFound) ? Math.max(links.size, raw.collection.linksFound) : links.size;
  const metrics={status:agentBrowser?'agent-reported':trusted&&!synthetic&&(method==='public-api'||method==='public-html'&&raw.metrics?.basis==='page-metadata')?'observed':synthetic?'synthetic':method==='public-index'||agentSearch?'discovered':'reported',platform:text(raw.metrics?.platform,50),basis:trusted?text(raw.metrics?.basis,160):'reported'};
  for(const key of ['points','comments','views','likes','stars'])metrics[key]=Number.isSafeInteger(raw.metrics?.[key])&&raw.metrics[key]>=0?raw.metrics[key]:null;
  return {
    url, aliases:trusted?[...new Set((Array.isArray(raw.aliases)?raw.aliases:[]).slice(0,8).map(x=>normalizeUrl(x)))].filter(x=>x!==url):[], role, title, summary:text(raw.summary,280), creator, synthetic, publishedAt: date(raw.publishedAt,'publishedAt'), observedAt,
    topics: [...new Set([...suppliedTopics,...TOPICS.filter(t=>t.pattern.test(title)).map(t=>t.name)])].slice(0,10),
    links: [...links.values()], mentions, metrics,
    collection: { method, status: raw.collection?.status === 'partial' ? 'partial' : 'ok', scope: text(raw.collection?.scope,100) || 'selected links', linksFound:collectedLinks, linksRetained:links.size, omittedLinks:Math.max(0,collectedLinks-links.size), note:text(raw.collection?.note,500), dateBasis:text(raw.collection?.dateBasis,100)||'provided or unknown', contentHash:trusted?text(raw.collection?.contentHash,64):'', evidenceUrl:trusted&&raw.collection?.evidenceUrl?normalizeUrl(raw.collection.evidenceUrl):url, topicSignals:trusted?(Array.isArray(raw.collection?.topicSignals)?raw.collection.topicSignals:[]).filter(x=>['ai','agents','mcp','workflow','developer'].includes(x)):[], provenance:agentBrowser||agentSearch?text(raw.collection?.provenance,160):'', trust:agentBrowser?'agent-observed':agentSearch||method==='public-index'?'discovered':synthetic?'synthetic':method==='manual'?'reported':'app-collected', metadataOnly:true }
  };
}

export function normalizeRelationship(raw, {trusted=false} = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('A relationship object is required.');
  if (raw.type && raw.type !== 'inferred') throw new Error('relationships supports inferred relationships only.');
  const from = normalizeUrl(raw.from), to = normalizeUrl(raw.to);
  if (from === to) throw new Error('Inferred relationships cannot connect a document to itself.');
  const rationale = text(raw.rationale,500);
  if (!rationale) throw new Error('An inferred relationship requires a rationale.');
  if(raw.evidence!=null&&(!Array.isArray(raw.evidence)||raw.evidence.length>5))throw new Error('An inference supports at most five evidence items.');
  const evidence=(raw.evidence??[]).map(item=>{
    if(!item||typeof item!=='object'||typeof item.note!=='string'||!item.note.trim()||item.note.length>280)throw new Error('Inference evidence requires a URL and a bounded supporting note.');
    return {url:normalizeUrl(item.url),note:item.note.trim()};
  });
  if(raw.confidence!=null&&!['low','medium'].includes(raw.confidence))throw new Error('Inference confidence must be low or medium.');
  const evidenceBasis=trusted&&['opened-pages','search-discovery'].includes(raw.evidenceBasis)?raw.evidenceBasis:trusted&&evidence.length?'opened-pages':null;
  return { id:idFor('hypothesis',`${from}|${to}`), from, to, type:'inferred', rationale, observedAt:date(raw.observedAt ?? new Date().toISOString(),'observedAt',true), synthetic:raw.synthetic===true,
    evidence,evidenceBasis,confidence:evidenceBasis==='search-discovery'?'low':raw.confidence??'low',assumption:text(raw.assumption,100),status:trusted&&evidence.length?'agent-inferred':'reported',chronology:trusted&&['consistent','conflict','unknown'].includes(raw.chronology)?raw.chronology:'unknown',fromPublishedAt:trusted?date(raw.fromPublishedAt,'fromPublishedAt'):null,toPublishedAt:trusted?date(raw.toPublishedAt,'toPublishedAt'):null };
}

// Callers retain their public-URL policy. Status or a supplied basis alone is never evidence.
export function validateInferenceEvidence(raw, records) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.synthetic===true||raw.assumption!=='ai-assisted-source-discovery'||
    typeof raw.observedAt!=='string'||!raw.observedAt||typeof raw.rationale!=='string'||raw.rationale.length>500||
    !['low','medium'].includes(raw.confidence)||!Array.isArray(raw.evidence)||!raw.evidence.length)throw new Error('Inference requires bounded dated evidence and the source-discovery assumption.');
  const relationship=normalizeRelationship({...raw,evidenceBasis:undefined},{trusted:true}),recordMap=records instanceof Map?records:new Map();
  for(const record of records instanceof Map?[]:Array.isArray(records)?records:[]){
    const old=recordMap.get(record.url);
    if(!old||recordStrength(record)>=recordStrength(old))recordMap.set(record.url,record);
  }
  const supported=[relationship.from,relationship.to,...relationship.evidence.map(item=>item.url)].map(url=>{
    const record=recordMap.get(url);
    if(!record||record.synthetic||!['agent-search','agent-browser','public-html','public-api','curated-public'].includes(record.collection?.method))throw new Error('Inference endpoints and evidence must reference stored search discoveries or opened public records.');
    return record;
  });
  const search=supported.filter(record=>record.collection.method==='agent-search');
  if(search.length){
    if(search.some(record=>typeof record.collection.note!=='string'||!record.collection.note.trim()||record.collection.note.length>500))throw new Error('Search-discovery inference requires actual search context and original-access limitations in collection.note.');
    if(![relationship.from,relationship.to].every(url=>relationship.evidence.some(item=>item.url===url)))throw new Error('Search-discovery inference requires separate comparison evidence for both endpoint URLs.');
  }
  const [from,to]=supported,openedDate=record=>record.collection.method==='agent-search'?null:record.publishedAt??null;
  const fromPublishedAt=openedDate(from),toPublishedAt=openedDate(to),chronology=fromPublishedAt&&toPublishedAt?(Date.parse(toPublishedAt)<=Date.parse(fromPublishedAt)?'consistent':'conflict'):'unknown';
  return {...relationship,evidenceBasis:search.length?'search-discovery':'opened-pages',confidence:search.length||chronology==='conflict'?'low':relationship.confidence,chronology,fromPublishedAt,toPublishedAt};
}

export function mergeInput(workspace, input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter a JSON object containing a records array.');
  if (!Array.isArray(input.records) || input.records.length > 100) throw new Error('records must be an array with at most 100 items.');
  if (input.relationships != null && (!Array.isArray(input.relationships) || input.relationships.length > 100)) throw new Error('relationships must be an array with at most 100 items.');
  // Validate the whole import before mutation: malformed batches are atomic.
  const incoming = input.records.map(r=>normalizeRecord(r,options));
  const hypotheses = (input.relationships ?? []).map(r=>normalizeRelationship(r,options));
  const records = new Map(workspace.records.map(r=>[r.url,r]));
  const report = { added:0, updated:0, duplicates:0, relationshipsAdded:0, warnings:[] };
  for (let r of incoming) {
    const old = records.get(r.url) ?? [...records.values()].find(x=>(x.aliases??[]).includes(r.url) || r.aliases.includes(x.url) || r.aliases.some(a=>(x.aliases??[]).includes(a)));
    if (!old) { records.set(r.url,r); report.added++; continue; }
    // A manual or synthetic re-import cannot downgrade/poison observed evidence.
    if (recordStrength(r)<recordStrength(old)) { report.duplicates++; report.warnings.push(`${r.url}: Existing stronger evidence retained.`); continue; }
    if(old.role==='content'&&r.role==='source')r={...r,role:'content',creator:old.creator};
    r.aliases=[...new Set([...r.aliases,...(old.aliases??[]),old.url])].filter(x=>x!==r.url);
    const comparable = x=>JSON.stringify({...x, observedAt:null, mentions:x.mentions.map(m=>({...m,observedAt:null}))});
    if (comparable(old)===comparable(r)) { report.duplicates++; continue; }
    // Higher/latest observation replaces the snapshot; backups preserve prior snapshots.
    records.delete(old.url); records.set(r.url,r); report.updated++;
  }
  const relationships = new Map((workspace.relationships ?? []).map(r=>[r.id,r]));
  for (const r of hypotheses) {
    const old=relationships.get(r.id);
    if(old?.status==='agent-inferred'&&r.status!=='agent-inferred'){report.warnings.push(`${r.from}: Existing evidence-supported inference retained.`);continue;}
    if (!old) report.relationshipsAdded++; relationships.set(r.id,r);
  }
  if (records.size > 1000 || relationships.size > 1000) throw new Error('The workspace supports at most 1000 documents and 1000 inferred relationships.');
  return { workspace:{ ...workspace, records:[...records.values()], relationships:[...relationships.values()], updatedAt:new Date().toISOString() }, report };
}

export function detectMentions(visibleText, observedAt, url) {
  return BRANDS.flatMap(brand=>{
    const pattern = brand==='AutoGPT' ? /\bauto-?gpt\b/i : new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i');
    const match = pattern.exec(visibleText);
    // Store only the matched name, never an article paragraph.
    return match ? [{ brand, excerpt:match[0], evidenceUrl:url, observedAt, basis:'visible-text literal match' }] : [];
  });
}

export const emptyWorkspace = () => ({schemaVersion:1, project:'Creator Source Graph', records:[], relationships:[], attempts:[], researchRuns:[], activeResearchRunId:null, updatedAt:null});
