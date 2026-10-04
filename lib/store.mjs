import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { emptyWorkspace, mergeInput, normalizeRecord, normalizeRelationship } from './model.mjs';
import { isPublicAddress } from './collector.mjs';

function publicEvidence(value) {
  const url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,'');
  return !url.port&&host!=='localhost'&&!host.endsWith('.localhost')&&!host.endsWith('.local')&&
    (host.includes('.')||isIP(host))&&(!isIP(host)||isPublicAddress(host));
}
function persistedRelationship(raw,opened) {
  // A status string alone cannot promote an imported manual hypothesis.
  const reported=normalizeRelationship(raw);
  if(raw.status!=='agent-inferred'||raw.synthetic===true||raw.assumption!=='ai-assisted-source-discovery'||
    !['low','medium'].includes(raw.confidence)||typeof raw.observedAt!=='string'||!raw.observedAt||
    typeof raw.rationale!=='string'||raw.rationale.length>500||!Array.isArray(raw.evidence)||!raw.evidence.length||
    ![reported.from,reported.to,...reported.evidence.map(item=>item.url)].every(url=>opened.has(url)&&publicEvidence(url)))return reported;
  const from=opened.get(reported.from),to=opened.get(reported.to);
  const chronology=from.publishedAt&&to.publishedAt?(Date.parse(to.publishedAt)<=Date.parse(from.publishedAt)?'consistent':'conflict'):'unknown';
  return normalizeRelationship({...raw,chronology,fromPublishedAt:from.publishedAt,toPublishedAt:to.publishedAt,confidence:chronology==='conflict'?'low':raw.confidence},{trusted:true});
}

export async function openStore(dataDir,seed,{empty=false}={}) {
  const filename=path.join(dataDir,'workspace.json');let current;
  try {
    current=JSON.parse(await readFile(filename,'utf8'));
    if(current.schemaVersion!==1||!Array.isArray(current.records)||!Array.isArray(current.relationships)||!Array.isArray(current.attempts))throw new Error('작업공간 형식이 올바르지 않습니다. 기존 파일을 보존합니다.');
    // Validate persisted records too. Never silently reset corrupt user data.
    current.records=current.records.map(r=>normalizeRecord(r,{trusted:true}));
    const opened=new Map(current.records.filter(r=>!r.synthetic&&['agent-browser','public-html','public-api','curated-public'].includes(r.collection.method)).map(r=>[r.url,r]));
    current.relationships=current.relationships.map(raw=>persistedRelationship(raw,opened));
  }catch(e) {
    if(e.code!=='ENOENT')throw new Error(`작업공간을 읽지 못했습니다: ${e.message}`);
    current=empty?emptyWorkspace():mergeInput(emptyWorkspace(),seed,{trusted:true}).workspace;
    current.attempts=empty?[]:(seed.attempts??[]);
  }
  let queue=Promise.resolve();
  return {
    get:()=>structuredClone(current),
    update(fn) {
      const job=queue.then(async()=>{
        const {workspace,report}=await fn(structuredClone(current));
        await mkdir(path.join(dataDir,'history'),{recursive:true});
        const stamp=`${Date.now()}-${randomUUID()}`;
        await writeFile(path.join(dataDir,'history',`${stamp}.json`),JSON.stringify(current,null,2)+'\n',{flag:'wx'});
        const temp=path.join(dataDir,`workspace-${stamp}.tmp`);
        await writeFile(temp,JSON.stringify(workspace,null,2)+'\n',{flag:'wx'});
        await rename(temp,filename);current=workspace;
        return report;
      });
      queue=job.catch(()=>{});return job;
    }
  };
}
