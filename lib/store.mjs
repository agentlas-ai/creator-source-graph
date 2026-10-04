import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyWorkspace, mergeInput, normalizeRecord, normalizeRelationship } from './model.mjs';

export async function openStore(dataDir,seed,{empty=false}={}) {
  const filename=path.join(dataDir,'workspace.json');let current;
  try {
    current=JSON.parse(await readFile(filename,'utf8'));
    if(current.schemaVersion!==1||!Array.isArray(current.records)||!Array.isArray(current.relationships)||!Array.isArray(current.attempts))throw new Error('작업공간 형식이 올바르지 않습니다. 기존 파일을 보존합니다.');
    // Validate persisted records too. Never silently reset corrupt user data.
    current.records=current.records.map(r=>normalizeRecord(r,{trusted:true}));
    current.relationships=current.relationships.map(normalizeRelationship);
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
