const $=selector=>document.querySelector(selector);
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name,cls='')=>'<svg class="'+e(cls)+'" aria-hidden="true"><use href="#'+e(name)+'"/></svg>';
const logo=p=>icon('logo-'+p);
const brief=(value,max=120)=>{const text=String(value??'').replace(/\s+/g,' ').trim();return text.length>max?text.slice(0,max-1).trimEnd()+'…':text;};
const day=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toISOString().slice(0,10):'?';
const host=url=>{try{return new URL(url).hostname;}catch{return '';}};
const platform=url=>{const h=host(url);return /(^|\.)youtube\.com$|^youtu\.be$/.test(h)?'youtube':/(^|\.)instagram\.com$/.test(h)?'instagram':/^(www\.)?(x|twitter)\.com$/.test(h)?'x':/(^|\.)threads\.(net|com)$/.test(h)?'threads':h==='github.com'?'github':h==='news.ycombinator.com'?'hackernews':/(^|\.)producthunt\.com$/.test(h)?'producthunt':h==='news.hada.io'?'geeknews':/(^|\.)anthropic\.com$/.test(h)||h==='platform.claude.com'?'anthropic':h==='arxiv.org'?'arxiv':/(^|\.)modelcontextprotocol\.io$/.test(h)?'mcp':'web';};
const DISCOVERY=['instagram','youtube','x','threads'];
let graph=null,active=false,selectedContent=null,selected=null,selectedStrategy=null,showInferred=true,researchRuns=[],activeRunId=null,lastSnapshot='',polling=false,closed=false,guide=null,contentPlatform='all';
let authenticated=false,authChecking=false,authGeneration=0,authUserId=null;
let draftDirty=false,startingResearch=false,hostStatuses=null,view=location.pathname==='/analysis'?'analysis':'home';
const STALE_RESPONSE='Account changed; ignored stale response.';
async function api(path,options={}){
  const generation=authGeneration,requestAccount=authUserId,accountScoped=authenticated&&requestAccount&&!['/api/auth/status','/api/shutdown'].includes(path);
  const response=await fetch(path,{...options,headers:{'content-type':'application/json',...options.headers,...(accountScoped?{'x-creator-account-id':encodeURIComponent(requestAccount)}:{})}});
  let data;try{data=await response.json();}catch{throw new Error('Could not read the server response.');}
  if(generation!==authGeneration)throw new Error(STALE_RESPONSE);
  if(response.status===401){showLogin({status:'signed-out'});throw new Error('Sign in with Agentlas to continue.');}
  if(data.accountChanged||(accountScoped&&response.headers.get('x-creator-account-id')!==encodeURIComponent(requestAccount))){showLogin();throw new Error(STALE_RESPONSE);}
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'HTTP '+response.status);
  // An external account switch can precede this tab's next auth poll.
  if(accountScoped&&path!=='/api/auth/logout'){
    let session,check;try{check=await fetch('/api/auth/status',{cache:'no-store'});session=await check.json();}catch{showLogin({status:'error',error:'Could not verify the current Agentlas account.'});throw new Error(STALE_RESPONSE);}
    if(generation!==authGeneration)throw new Error(STALE_RESPONSE);
    if(!check.ok||!session.authenticated||session.user?.id!==requestAccount){showLogin();throw new Error(STALE_RESPONSE);}
  }
  return data;
}
function status(message,ok=false){if(message===STALE_RESPONSE)return;for(const id of ['graph-status','home-status']){$('#'+id).textContent=message;$('#'+id).classList.toggle('ok',ok);}}
function currentRun(){return researchRuns.find(r=>r.id===activeRunId);}
function strategies(){return graph?.analysis?.aiStrategies??[];}
function placements(){return strategies().filter(s=>s.recommendationType==='placement'&&s.placement);}
function placementAction(s){return s.kind==='investigate'?'Check':s.placement?.venueType==='directory'?'List':'Publish';}
const actionNames={read:'Inspect',investigate:'Check',build:'Integrate',create:'Publish'};
const runLabels={ready:'Ready for your AI',searching:'Researching',complete:'Complete',partial:'Partial coverage',error:'Error',cancelled:'Stopped'};
const aiHostNames={codex:'Codex',claude:'Claude'};
function sameTarget(value,target){try{const raw=value.trim(),url=new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw)?raw:'https://'+raw);url.hash='';return url.href===target;}catch{return false;}}
function researchControls(){
  const target=publicHref(currentRun()?.url??graph?.analysis?.url),input=$('#target-input');
  if(!draftDirty&&document.activeElement!==input)input.value=target??'';
  $('#analyze-label').textContent=startingResearch?'Starting…':sameTarget(input.value,target)?'Reanalyze':'Analyze';
  $('#analyze-button').disabled=startingResearch||closed||!authenticated;
  $('#research-host').disabled=startingResearch;
  $('#home-analyze-button').disabled=startingResearch||closed||!authenticated;$('#home-host').disabled=startingResearch;
  $('#home-open-results').hidden=!currentRun();
  $('#target-url').hidden=!target;if(target)$('#target-url').href=target;else $('#target-url').removeAttribute('href');
}
async function loadHosts(){const generation=authGeneration;try{const result=await api('/api/research/hosts');if(!authenticated||generation!==authGeneration)return;hostStatuses=result;for(const select of [$('#research-host'),$('#home-host')]){select.querySelector('option[value="auto"]').textContent=result.defaultHost?'Auto · '+aiHostNames[result.defaultHost]:'Auto';for(const option of select.querySelectorAll('option'))if(option.value!=='auto'){const h=result.hosts.find(h=>h.id===option.value);option.textContent=aiHostNames[option.value]+(h?.available?'':h?.code==='HOST_VERSION_UNSUPPORTED'?' · update':h?.installed?' · sign in':' · install');}}}catch(err){if(authenticated&&generation===authGeneration)status(err.message);}}
function showView(next,{push=false,fromHome=false}={}){view=next;$('#home-view').hidden=next!=='home';$('#analysis-view').hidden=next!=='analysis';hideHover();if(push&&location.pathname!==(next==='home'?'/':'/analysis'))history.pushState({creatorView:next,fromHome},'',next==='home'?'/':'/analysis');if(next==='analysis')render();}
function contentNodes(){return (graph?.socialContents??graph?.nodes.filter(n=>n.type==='content'&&DISCOVERY.includes(platform(n.url)))??[]);}
function node(id){return graph?.nodes.find(n=>n.id===id);}
function chains(){return (graph?.traces?.chains??[]).filter(c=>(selectedContent?c.startContentId===selectedContent:contentPlatform==='all'||c.platform===contentPlatform)&&(showInferred||!c.containsInference));}
function sortedContents(){return contentNodes().filter(n=>contentPlatform==='all'||platform(n.url)===contentPlatform).sort((a,b)=>DISCOVERY.indexOf(platform(a.url))-DISCOVERY.indexOf(platform(b.url))||Number(viewValue(b)!==null)-Number(viewValue(a)!==null)||(viewValue(b)??-1)-(viewValue(a)??-1)||a.url.localeCompare(b.url));}
function viewValue(n){const d=n.document,m=d?.metrics;return !d?.synthetic&&['observed','agent-reported'].includes(m?.status)&&Number.isSafeInteger(m?.views)&&m.views>=0?m.views:null;}
function viewLabel(n){const value=viewValue(n);return value===null?'Views unknown':value.toLocaleString()+' views';}
function searchLink(p){const q=currentRun()?.tasks?.find(t=>t.platform===p)?.query??graph?.analysis?.title??'';return p==='youtube'?'https://www.youtube.com/results?search_query='+encodeURIComponent(q):p==='instagram'?'https://www.instagram.com/explore/search/keyword/?q='+encodeURIComponent(q):p==='threads'?'https://www.threads.com/search?q='+encodeURIComponent(q):'https://x.com/search?q='+encodeURIComponent(q)+'&f=top';}
function platformState(p){return currentRun()?.tasks?.find(t=>t.platform===p)?.status??graph?.analysis?.platformCoverage?.[p]??'not searched';}
function render(){
  if(!graph)return;const contents=sortedContents();
  if(selectedContent&&!contents.some(n=>n.id===selectedContent))selectedContent=null;
  const run=currentRun();$('#research-session').hidden=!run;
  if(run){const tasks=DISCOVERY.map(p=>run.tasks?.find(t=>t.platform===p));const searched=tasks.filter(t=>t?.status==='searched').length,partial=tasks.filter(t=>t?.status==='partial').length;$('#run-status').textContent=run.execution&&run.status==='ready'?'Starting':runLabels[run.status]??run.status;$('#run-status').removeAttribute('title');$('#run-progress').textContent=run.execution&&['ready','searching'].includes(run.status)?'Searching 4 platforms · tracing sources':searched+'/4 searched'+(partial?' · '+partial+' partial':'')+' · '+contentNodes().length+' social items';$('#run-mode').textContent=run.execution?(aiHostNames[run.execution.host]??'Local AI')+' · subscription':'Your AI session';$('#stop-run-button').hidden=!['ready','searching'].includes(run.status);}
  researchControls();
  $('#scope-counters').innerHTML='<span>'+icon('icon-people')+contentNodes().length+' content</span><span>'+icon('icon-link')+(graph.traces?.chains?.filter(c=>c.edges.length>0).length??0)+' paths</span>';
  for(const b of document.querySelectorAll('[data-platform]')){const selected=b.dataset.platform===contentPlatform;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));b.title=(platformNames[b.dataset.platform]??b.dataset.platform)+' · '+platformState(b.dataset.platform);}
  const keywords=graph.analysis?.keywords??[];$('#keyword-strip').hidden=!keywords.length;$('#keyword-strip').innerHTML=icon('icon-investigate')+keywords.map(k=>'<span role="listitem">'+e(k)+'</span>').join('');
  $('#inference-button').setAttribute('aria-pressed',String(showInferred));$('#overview-button').setAttribute('aria-pressed',String(!selectedContent));$('#content-count').textContent=contentNodes().length;renderStrategies();renderPlacement();renderContents(contents);drawGraph();renderOrigins();renderReferences();
}
function renderStrategies(){
  $('#strategy-list').innerHTML=placements().length?placements().map(s=>'<div role="listitem"><button class="strategy-card '+(selectedStrategy===s.id?'selected':'')+'" data-strategy="'+e(s.id)+'" aria-label="'+e('Priority '+s.priority+' · '+s.title)+'"><span class="priority-number">'+e(s.priority)+'</span><span class="strategy-logo">'+logo(platform(s.targetUrl))+'</span><span class="strategy-label"><strong>'+e(s.title)+'</strong><small>'+e(placementAction(s)+' · '+host(s.targetUrl).replace(/^www\./,''))+'</small></span>'+icon('icon-'+s.kind,'action-icon')+'</button></div>').join(''):'<div class="strategy-pending">'+icon('icon-flask')+'<span>'+(['ready','searching'].includes(currentRun()?.status)?'Finding channels…':'No channel yet')+'</span></div>';
}
function renderPlacement(){
  const s=placements().find(s=>s.id===selectedStrategy)??placements()[0],preview=$('#placement-preview');preview.hidden=!s;
  if(!s){preview.replaceChildren();return;}
  const brand=host(graph.analysis?.url).replace(/^www\./,''),venue=host(s.targetUrl).replace(/^www\./,'');
  preview.innerHTML='<span class="placement-tag">Suggested channel · #'+e(s.priority)+'</span><div class="placement-flow"><span class="placement-step">'+logo(platform(graph.analysis?.url))+'<small>'+e(brand)+'</small></span>'+icon('icon-arrow','placement-arrow')+'<button class="placement-step placement-venue" data-strategy="'+e(s.id)+'" aria-label="'+e(s.title)+'">'+logo(platform(s.targetUrl))+'<strong>'+e(placementAction(s))+'</strong><small>'+e(venue)+'</small></button>'+icon('icon-arrow','placement-arrow')+'<a class="placement-step" href="'+e(s.placement.discoveryUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="Open public discovery feed">'+icon('icon-feed')+'<small>Public feed</small></a>'+icon('icon-arrow','placement-arrow hypothesis')+'<span class="placement-step" aria-label="Possible AI discovery; not observed">'+icon('icon-flask')+'<small>AI discovery?</small></span>'+icon('icon-arrow','placement-arrow hypothesis')+'<span class="placement-creators">'+DISCOVERY.map(p=>logo(p)).join('')+'<small>Creators</small></span></div>';
}
function renderReferences(){const items=(graph?.nodes??[]).filter(n=>n.type==='source'&&n.document&&!n.document.synthetic);$('#reference-count').textContent=items.length;$('#references-panel').hidden=!items.length;$('#reference-source-list').innerHTML=items.map(n=>'<button class="reference-source" data-inspect="'+e(n.id)+'" aria-label="'+e('Reference original: '+n.title)+'">'+logo(platform(n.url))+'<span>'+e(n.title)+'</span>'+icon('icon-info')+'</button>').join('');}
function renderContents(contents){
  const platforms=contentPlatform==='all'?DISCOVERY:[contentPlatform];
  $('#content-carousel').innerHTML=platforms.map(p=>{
    const entries=contents.filter(n=>platform(n.url)===p);
    const heading='<div class="platform-group">'+logo(p)+e(platformNames[p])+'<small>'+e(platformState(p))+'</small></div>';
    if(!entries.length)return heading+'<a class="platform-empty" data-empty-platform="'+e(p)+'" role="listitem" aria-label="'+e(platformNames[p]+': no content retained; open public search')+'" href="'+e(searchLink(p))+'" target="_blank" rel="noopener noreferrer">'+icon('icon-investigate')+'<span>Not found yet</span></a>';
    return heading+entries.map((n,i)=>{const d=n.document,observed=!d?.synthetic&&['agent-browser','public-html','public-api','curated-public'].includes(d?.collection?.method),search=['agent-search','public-index'].includes(d?.collection?.method),value=viewValue(n),rank=value!==null?(n.viewRank??i+1):null;
      const provenance=observed?(value!==null?(d.metrics.status==='agent-reported'?'Views observed by your AI':'Public views observed'):'Original page opened · views unavailable'):search?'Search candidate · original page not opened':'Reported metadata · original page not verified';
      return '<div class="carousel-item" role="listitem"><button class="content-card '+(selectedContent===n.id?'selected ':'')+(!observed?'search-candidate':'')+'" data-content="'+e(n.id)+'" aria-label="'+e(platformNames[p]+': '+n.title+' · '+viewLabel(n))+'"><span class="content-logo">'+logo(p)+'</span><span class="compact-content"><strong>'+e(d?.creator?.name??n.title)+'</strong><small>'+e(n.title)+'</small></span><span class="compact-views" aria-label="'+e(provenance)+'">'+(rank?'<small>#'+rank+'</small>':'')+e(value===null?'?':value.toLocaleString())+'</span></button></div>';
    }).join('');
  }).join('');
}
function traceEdges(paths){const map=new Map();for(const path of paths){for(let i=0;i<path.edges.length;i++){const info=path.edges[i],existing=graph.edges.find(ed=>ed.id===info.edgeId)??{},from=existing.from??path.nodeIds[i],to=existing.to??path.nodeIds[i+1];map.set(from+'|'+to+'|'+info.kind,{...existing,...info,from,to});}}return [...map.values()];}
function drawGraph(){
  const svg=$('#source-graph'),paths=chains(),start=node(selectedContent),starts=selectedContent?[start].filter(Boolean):sortedContents(),hasPath=starts.length>0||(!selectedContent&&placements().some(s=>graph.nodes.some(n=>n.url===s.targetUrl&&n.document)));
  $('#trace-selection').textContent=selectedStrategy?strategies().find(s=>s.id===selectedStrategy)?.title??'All content':start?start.title:contentPlatform==='all'?'All content':platformNames[contentPlatform]+' content';
  $('#trace-count').textContent=hasPath?paths.filter(c=>c.edges.length>0).length+' paths':'No source path yet';
  const empty=$('#empty-state');empty.hidden=hasPath;
  empty.querySelector('h2').textContent=start?'No source yet.':'Find the source.';
  empty.querySelector('p').textContent=start?'':currentRun()&&['ready','searching'].includes(currentRun().status)?'Searching…':'URL → Analyze';
  let html='<defs><marker id="trace-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10" fill="#9ebba8"/></marker><marker id="inferred-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10" fill="#b3a5ca"/></marker></defs>';
  if(!hasPath){svg.innerHTML=html;svg.setAttribute('aria-label','Reverse source paths · no resolved source');return;}
  const depth=new Map(starts.map(n=>[n.id,0])),startIds=new Set(depth.keys()),roots=new Set(paths.flatMap(c=>c.earliestFoundRootIds??[]));
  for(const path of paths){const seen=new Set();path.nodeIds.forEach((id,i)=>{if(seen.has(id))return;seen.add(id);if(!startIds.has(id))depth.set(id,Math.max(depth.get(id)??0,i));});}
  const references=new Set();if(!selectedContent){for(const s of placements()){const target=graph.nodes.find(n=>n.url===s.targetUrl);if(target&&!depth.has(target.id)){depth.set(target.id,1);references.add(target.id);}}}
  const max=Math.max(2,...depth.values()),columns=Array.from({length:max+1},(_,level)=>[...depth].filter(([,d])=>d===level).map(([id])=>id)),canvasHeight=560,positions=new Map();
  svg.setAttribute('viewBox','0 0 720 '+canvasHeight);svg.classList.toggle('map-tall',false);
  columns.forEach((ids,level)=>ids.forEach((id,i)=>positions.set(id,{x:120+level*480/max,y:ids.length===1?canvasHeight/2:85+i*(canvasHeight-170)/Math.max(1,ids.length-1),r:Math.min(startIds.has(id)?27:24,(canvasHeight-170)/Math.max(1,ids.length-1)*.38)})));
  html+='<text class="lane-label" x="120" y="42">CONTENT</text><text class="lane-label" x="360" y="42">FOLLOW SOURCES</text><text class="lane-label" x="600" y="42">EARLIER SOURCES</text>';
  for(const ed of traceEdges(paths).filter(ed=>positions.has(ed.from)&&positions.has(ed.to)&&ed.from!==ed.to)){const a=positions.get(ed.from),b=positions.get(ed.to),sx=a.x+a.r,tx=b.x-b.r,bend=Math.max(30,Math.abs(tx-sx)*.45),candidate=ed.kind==='inferred'||ed.type==='inferred';html+='<path class="graph-edge '+(candidate?'inferred':'')+'" d="M '+sx+' '+a.y+' C '+(sx+bend)+' '+a.y+', '+(tx-bend)+' '+b.y+', '+tx+' '+b.y+'" marker-end="url(#'+(candidate?'inferred-arrow':'trace-arrow')+')"><title>'+e(candidate?'Estimated':'Link')+'</title></path>';}
  for(const [id,pos] of positions){const n=node(id);if(!n)continue;const title=n.title??n.name??host(n.url),caption=startIds.has(id)?n.document?.creator?.identityStatus==='domain-placeholder'?title:n.document?.creator?.name??title:title,short=caption.length>20?caption.slice(0,18)+'…':caption,glyph=Math.min(26,pos.r*1.5),compact=pos.r<20;html+='<g class="graph-node '+(startIds.has(id)?'start ':roots.has(id)?'origin ':'')+(compact?'compact ':'')+(id===selected?'focused ':'')+(references.has(id)?'reference ':'')+(!n.document?'unfetched':'')+'" data-node="'+e(id)+'" tabindex="0" role="button" aria-label="'+e(title)+'"><circle class="node-disc" cx="'+pos.x+'" cy="'+pos.y+'" r="'+pos.r+'"/><svg x="'+(pos.x-glyph/2)+'" y="'+(pos.y-glyph/2)+'" width="'+glyph+'" height="'+glyph+'"><use href="#logo-'+platform(n.url)+'"/></svg>'+(compact?'':'<text class="node-label" x="'+pos.x+'" y="'+(pos.y+pos.r+17)+'">'+e(short)+'</text><text class="node-subtitle" x="'+pos.x+'" y="'+(pos.y+pos.r+31)+'">'+e(startIds.has(id)?viewLabel(n):references.has(id)?'Reference':day(n.document?.publishedAt)==='?'?'?':day(n.document.publishedAt))+'</text>')+'</g>';}
  svg.innerHTML=html;svg.setAttribute('aria-label','Reverse source paths · '+positions.size+' nodes · '+paths.filter(c=>c.edges.length>0).length+' paths');
}
function renderOrigins(){
  const paths=chains().filter(c=>c.nodeIds.length>1),items=new Map(),openDetails=new Set([...$('#origin-results').querySelectorAll('details[open]')].map(el=>el.dataset.originDetail));
  for(const path of paths){const ids=path.earliestFoundRootIds?.length?path.earliestFoundRootIds:path.furthestSourceId?[path.furthestSourceId]:[];for(const id of ids){const n=node(id);if(!n||n.id===selectedContent)continue;if(!items.has(id))items.set(id,{n,paths:[]});items.get(id).paths.push(path);}}
  if(!items.size){$('#origin-results').innerHTML='<p class="rail-empty">'+icon('icon-link')+' No sources yet</p>';return;}
  const resolved=item=>item.paths.some(p=>(p.earliestFoundRootIds??[]).includes(item.n.id));
  const originDate=item=>{const value=Date.parse(item.n.document?.publishedAt);return Number.isFinite(value)?value:Infinity;};
  $('#origin-results').innerHTML=[...items.values()].sort((a,b)=>Number(resolved(b))-Number(resolved(a))||originDate(a)-originDate(b)||a.n.url.localeCompare(b.n.url)).map(({n,paths})=>{
    const candidate=paths.every(p=>p.containsInference),d=n.document,url=publicHref(n.url),path=paths.find(p=>!p.containsInference&&(p.earliestFoundRootIds??[]).includes(n.id))??paths[0];
    const details=(type,label,html)=>'<details class="origin-detail" data-origin-detail="'+e(n.id+':'+type)+'"'+(openDetails.has(n.id+':'+type)?' open':'')+'><summary>'+label+'</summary>'+html+'</details>';
    return '<article class="origin-card '+(candidate?'estimated':'')+'" role="listitem"><div class="origin-icon">'+logo(platform(n.url))+'</div><h3>'+e(n.title)+'</h3>'+(url?'<a class="origin-url" href="'+e(url)+'" target="_blank" rel="noopener noreferrer">'+e(host(url).replace(/^www\./,''))+' ↗</a>':'')+(d?.summary?details('summary',icon('icon-info')+' Summary','<p>'+e(brief(d.summary))+'</p>'):'')+details('path',icon('icon-link')+' '+paths.length,'<div class="compact-path">'+path.nodeIds.map(id=>{const item=node(id);return item?'<button class="icon-button" data-inspect="'+e(id)+'" aria-label="'+e(item.title)+'">'+logo(platform(item.url))+'</button>':'';}).join(icon('icon-arrow'))+'</div>')+'<button class="icon-button inspect-origin" data-inspect="'+e(n.id)+'" type="button" aria-label="'+e('Open '+n.title)+'" title="Open source">'+icon('icon-arrow')+'</button></article>';
  }).join('');
}
function openInspector(html){$('#inspector-body').innerHTML=html;$('#inspector').showModal();}
function inspectNode(id){const n=node(id);if(!n)return;selected=id;const d=n.document,url=publicHref(n.url),related=[...new Set(traceEdges(chains()).filter(ed=>ed.from===id||ed.to===id).map(ed=>ed.from===id?ed.to:ed.from))].map(node).filter(Boolean);const html='<div class="inspect-heading">'+logo(platform(n.url))+'<div class="inspect-title">'+e(n.title??n.name)+'</div></div>'+(d?.summary?'<p class="inspect-summary">'+e(brief(d.summary))+'</p>':'')+(url?'<a class="inspect-url compact-original" href="'+e(url)+'" target="_blank" rel="noopener noreferrer">'+icon('icon-arrow')+e(host(url).replace(/^www\./,''))+'</a>':'')+(related.length?'<div class="inspect-connections">'+related.map(item=>'<button class="source-chip" data-inspect="'+e(item.id)+'" aria-label="'+e(item.title)+'">'+logo(platform(item.url))+'<span>'+e(brief(item.title,32))+'</span></button>').join('')+'</div>':'');if($('#inspector').open)$('#inspector-body').innerHTML=html;else openInspector(html);}
function coverage(){openInspector('<h2>Platforms</h2><div class="coverage-list">'+DISCOVERY.map(p=>'<div class="coverage-item">'+logo(p)+'<strong>'+e(platformNames[p])+'</strong><span>'+e(platformState(p))+'</span></div>').join('')+'</div>');}
async function help(){const generation=authGeneration;try{guide=guide??await api('/api/agent/guide');if(!authenticated||generation!==authGeneration)return;openInspector('<h2>URL → Analyze</h2><p>Codex / Claude subscription</p><p><a href="https://github.com/agentlas-ai/creator-source-graph" target="_blank" rel="noopener noreferrer">Install ↗</a></p><details class="origin-detail"><summary>AI chat</summary>'+guide.hosts.map(h=>'<p>'+e(h.name)+': <code>'+e(h.command)+' URL</code></p>').join('')+'</details><div class="dialog-actions"><button class="icon-button" data-import type="button" aria-label="Import JSON">'+icon('icon-upload')+'</button><button class="icon-button" data-close type="button" aria-label="Done">'+icon('icon-close')+'</button></div>');}catch(err){if(authenticated&&generation===authGeneration)status(err.message);}}
function showHistory(){openInspector('<h2>History</h2><div class="run-history">'+(researchRuns.length?[...researchRuns].reverse().map(r=>'<article><strong>'+e(runLabels[r.status]??r.status)+'</strong><time>'+day(r.createdAt)+'</time><p>'+e(host(r.url))+'</p></article>').join(''):'<p>No analysis yet</p>')+'</div>');}
function acceptWorkspace(data,{reset=false,syncTarget=false}={}){if(!authenticated)return;const snapshot=JSON.stringify(data);if(!reset&&snapshot===lastSnapshot)return;const previousRun=currentRun(),previousId=activeRunId;lastSnapshot=snapshot;graph=data;researchRuns=data.researchRuns??researchRuns;activeRunId=Object.hasOwn(data,'activeResearchRunId')?data.activeResearchRunId:activeRunId;active=contentNodes().length>0;if(reset||previousId!==activeRunId){selected=null;selectedContent=null;selectedStrategy=null;contentPlatform='all';hideHover();}if(syncTarget){draftDirty=false;$('#target-input').value=currentRun()?.url??graph.analysis?.url??'';}if(selectedStrategy&&!strategies().some(s=>s.id===selectedStrategy)){selectedStrategy=null;selected=null;}const rail=$('#content-carousel'),scroll=rail.scrollTop;render();rail.scrollTop=reset||previousId!==activeRunId?0:scroll;const run=currentRun();if(run?.status==='error'&&(previousRun?.id!==run.id||previousRun?.status!==run.status))status(run.note||'Analysis could not finish. Reanalyze to try again.');else if(run?.execution&&['complete','partial'].includes(run.status)&&previousRun?.id===run.id&&['ready','searching'].includes(previousRun.status))status(run.status==='partial'?'Results updated · some platforms have limited coverage.':'Results updated.',true);}
async function refresh({quiet=false}={}){if(polling||closed||!authenticated)return;const generation=authGeneration;polling=true;try{const data=await api('/api/workspace');if(!authenticated||generation!==authGeneration)return;acceptWorkspace(data);if(!quiet)status('');}catch(err){if(!quiet&&authenticated&&generation===authGeneration)status(err.message);}finally{polling=false;}}
const hoverSelector='[data-hover-node],[data-node],[data-content],[data-strategy],[data-platform],[data-empty-platform],[data-inspect],[data-focus]';
let hoverTimer=null,hoverCloseTimer=null,hoverAnchor=null;
const platformNames={all:'All platforms',youtube:'YouTube',instagram:'Instagram',x:'X',threads:'Threads',hackernews:'Hacker News',web:'Public web',github:'GitHub',anthropic:'Anthropic',arxiv:'arXiv',mcp:'Model Context Protocol'};
const platformUrls={youtube:'https://www.youtube.com/',instagram:'https://www.instagram.com/',x:'https://x.com/',threads:'https://www.threads.com/',hackernews:'https://news.ycombinator.com/',web:'https://agentlas.cloud',github:'https://github.com/',anthropic:'https://www.anthropic.com/',arxiv:'https://arxiv.org/',mcp:'https://modelcontextprotocol.io/'};
function publicHref(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function previewData(anchor){
  const id=anchor.dataset.hoverNode??anchor.dataset.node??anchor.dataset.content??anchor.dataset.inspect??anchor.dataset.focus;
  const n=graph?.nodes.find(n=>n.id===id),s=anchor.dataset.strategy?strategies().find(s=>s.id===anchor.dataset.strategy):null;
  if(s)return {title:s.priority+'. '+s.title,url:s.targetUrl,summary:brief(s.summary),placement:s.placement};
  if(n||s){const doc=n?.document??graph?.nodes.find(n=>n.id===s?.sourceId)?.document;
    const aiSummary=typeof doc?.summary==='string'&&doc.summary.trim()?doc.summary.trim():null;
    const summary=aiSummary||doc?.topics?.slice(0,3).join(' · ')||'';
    return {title:n?.title??n?.name??s?.action??'Source',url:n?.url??s?.url,summary:brief(summary)};
  }
  const p=anchor.dataset.platform??anchor.dataset.emptyPlatform;if(p){const count=contentNodes().filter(n=>p==='all'||platform(n.url)===p).length;return {title:platformNames[p]??p,url:p==='all'?null:platformUrls[p],summary:count+' items'};}
  return null;
}
function hideHover(){clearTimeout(hoverTimer);clearTimeout(hoverCloseTimer);$('#hover-card').hidden=true;hoverAnchor=null;}
function placeHover(){const card=$('#hover-card');if(card.hidden||!hoverAnchor?.isConnected){hideHover();return;}const a=hoverAnchor.getBoundingClientRect(),r=card.getBoundingClientRect(),pad=12;let left=Math.min(Math.max(pad,a.left+a.width/2-r.width/2),Math.max(pad,innerWidth-r.width-pad)),top=a.bottom+9;if(top+r.height>innerHeight-pad)top=Math.max(pad,a.top-r.height-9);card.style.left=`${left}px`;card.style.top=`${Math.min(top,Math.max(pad,innerHeight-r.height-pad))}px`;}
function showHover(anchor){if(!authenticated)return;const data=previewData(anchor);if(!data)return;clearTimeout(hoverCloseTimer);hoverAnchor=anchor;const url=publicHref(data.url),card=$('#hover-card'),links=data.placement?[['submissionUrl','Submit','icon-upload'],['discoveryUrl','Feed','icon-feed'],['rulesUrl','Rules','icon-info']].flatMap(([key,label,name])=>{const href=publicHref(data.placement[key]);return href?['<a href="'+e(href)+'" target="_blank" rel="noopener noreferrer" aria-label="'+label+'" title="'+label+'">'+icon(name)+'</a>']:[]}).join(''):'';card.innerHTML=`<strong class="hover-title">${e(brief(data.title,70))}</strong>${data.summary?'<p>'+e(data.summary)+'</p>':''}${url?`<a class="hover-url" href="${e(url)}" target="_blank" rel="noopener noreferrer">${icon('icon-arrow')}${e(host(url).replace(/^www\./,''))}</a>`:''}${links?'<div class="placement-links">'+links+'</div>':''}`;card.hidden=false;placeHover();}
function queueHover(anchor,immediate=false){clearTimeout(hoverTimer);clearTimeout(hoverCloseTimer);if(anchor===hoverAnchor&&!$('#hover-card').hidden)return;hoverTimer=setTimeout(()=>showHover(anchor),immediate?0:160);}
function queueHoverClose(){clearTimeout(hoverTimer);clearTimeout(hoverCloseTimer);hoverCloseTimer=setTimeout(()=>{if(!$('#hover-card').matches(':hover')&&!$('#hover-card').contains(document.activeElement))hideHover();},260);}
document.addEventListener('pointerover',ev=>{if(ev.pointerType==='touch')return;const anchor=ev.target.closest(hoverSelector);if(anchor){anchor.removeAttribute('title');queueHover(anchor);}});
document.addEventListener('pointerout',ev=>{const anchor=ev.target.closest(hoverSelector);if(anchor&&!anchor.contains(ev.relatedTarget)&&!$('#hover-card').contains(ev.relatedTarget))queueHoverClose();});
document.addEventListener('focusin',ev=>{const anchor=ev.target.closest(hoverSelector);if(anchor){anchor.removeAttribute('title');queueHover(anchor,true);}});
document.addEventListener('focusout',ev=>{if(!$('#hover-card').contains(ev.relatedTarget)&&!ev.target.closest(hoverSelector)?.contains(ev.relatedTarget))queueHoverClose();});
$('#hover-card').addEventListener('pointerenter',()=>{clearTimeout(hoverCloseTimer);clearTimeout(hoverTimer);});
$('#hover-card').addEventListener('pointerleave',queueHoverClose);
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')hideHover();});
document.addEventListener('click',ev=>{if(!$('#hover-card').contains(ev.target)){const anchor=ev.target.closest(hoverSelector);if(anchor&&ev.pointerType==='touch')showHover(anchor);else hideHover();}});
addEventListener('resize',placeHover);document.addEventListener('scroll',()=>hideHover(),true);


$('#help-button').addEventListener('click',help);
$('#home-help-button').addEventListener('click',help);
$('#home-url').addEventListener('input',()=>{if(!startingResearch)status('');});
$('#target-input').addEventListener('input',()=>{draftDirty=true;researchControls();});
async function startAnalysis(url,host,fromHome=false){
  if(startingResearch||closed||!authenticated)return;const generation=authGeneration;
  url=url.trim();if(!url)return;
  startingResearch=true;researchControls();status('Checking your local AI subscription…',true);
  try{const result=await api('/api/research',{method:'POST',body:JSON.stringify({url,host})});if(!authenticated||generation!==authGeneration)return;acceptWorkspace(result.graph,{reset:true,syncTarget:true});showView('analysis',{push:fromHome,fromHome});status((aiHostNames[result.host]??'Local AI')+' research started.',true);}
  catch(err){if(authenticated&&generation===authGeneration){status(err.message);void loadHosts();}}
  finally{if(authenticated&&generation===authGeneration){startingResearch=false;researchControls();}}
}
$('#research-form').addEventListener('submit',ev=>{ev.preventDefault();void startAnalysis($('#target-input').value,$('#research-host').value);});
$('#home-form').addEventListener('submit',ev=>{ev.preventDefault();void startAnalysis($('#home-url').value,$('#home-host').value,true);});
$('#back-home-button').addEventListener('click',()=>{for(const d of document.querySelectorAll('dialog'))if(d.open)d.close();$('#home-url').value='';status('');if(history.state?.creatorView==='analysis'&&history.state?.fromHome)history.back();else showView('home',{push:true});});
$('#home-open-results').addEventListener('click',()=>showView('analysis',{push:true,fromHome:true}));
for(const link of document.querySelectorAll('.wordmark'))link.addEventListener('click',ev=>{ev.preventDefault();showView('home',{push:true});});
addEventListener('popstate',()=>showView(location.pathname==='/analysis'?'analysis':'home'));
$('#research-host').addEventListener('change',()=>{$('#home-host').value=$('#research-host').value;});
$('#home-host').addEventListener('change',()=>{$('#research-host').value=$('#home-host').value;});
$('#history-button').addEventListener('click',showHistory);
$('#refresh-button').addEventListener('click',()=>refresh());
$('#coverage-button').addEventListener('click',coverage);
$('#inference-button').addEventListener('click',()=>{showInferred=!showInferred;render();});
$('#overview-button').addEventListener('click',()=>{selectedContent=null;selected=null;selectedStrategy=null;contentPlatform='all';hideHover();render();});
$('#stop-run-button').addEventListener('click',async()=>{const generation=authGeneration,run=currentRun();if(!run)return;try{const result=await api('/api/agent/runs/'+encodeURIComponent(run.id)+'/cancel',{method:'POST',body:JSON.stringify({note:'Stopped from the local app.'})});if(!authenticated||generation!==authGeneration)return;acceptWorkspace(result.graph);status('Research stopped.',true);}catch(err){if(authenticated&&generation===authGeneration)status(err.message);}});
function confirmQuit(){openInspector('<h2>Quit local app?</h2><p>This stops the local server. Your saved workspace stays on disk.</p><div class="dialog-actions"><button class="text-button" data-close>Keep open</button><button class="text-button stop-button" data-shutdown>Quit app</button></div>');}
$('#quit-button').addEventListener('click',confirmQuit);$('#login-quit-button').addEventListener('click',confirmQuit);$('#home-quit-button').addEventListener('click',confirmQuit);
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-node],[data-inspect],[data-content],[data-platform],[data-strategy],[data-close],[data-shutdown],[data-import]');if(!b)return;if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}if(b.hasAttribute('data-import')){$('#inspector').close();$('#import-dialog').showModal();return;}if(b.hasAttribute('data-shutdown')){try{await api('/api/shutdown',{method:'POST',body:'{}'});closed=true;$('#inspector').close();if(authenticated)status('Local app stopped. You may close this tab.',true);else $('#login-status').textContent='Local app stopped. You may close this tab.';}catch(err){if(authenticated)status(err.message);else $('#login-status').textContent=err.message;}return;}if(b.dataset.strategy){const s=strategies().find(s=>s.id===b.dataset.strategy);if(!s)return;selectedStrategy=s.id;selectedContent=null;selected=graph.nodes.find(n=>n.url===s.targetUrl)?.id??null;contentPlatform='all';hideHover();render();return;}if(b.dataset.platform){contentPlatform=contentPlatform===b.dataset.platform?'all':b.dataset.platform;selectedContent=null;selected=null;selectedStrategy=null;hideHover();render();return;}if(b.dataset.content){selectedContent=b.dataset.content;selected=null;selectedStrategy=null;hideHover();render();return;}if(b.dataset.node||b.dataset.inspect)inspectNode(b.dataset.node??b.dataset.inspect);});
$('#source-graph').addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.dataset.node){ev.preventDefault();inspectNode(ev.target.dataset.node);}});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',ev=>{if(ev.target===dialog)dialog.close();});
$('#import-form').addEventListener('submit',async ev=>{ev.preventDefault();const generation=authGeneration;try{let data;try{data=JSON.parse($('#import-json').value);}catch{throw new Error('Invalid JSON syntax.');}const result=await api('/api/import',{method:'POST',body:JSON.stringify(data)});if(!authenticated||generation!==authGeneration)return;acceptWorkspace(result.graph);$('#import-status').textContent='+'+result.report.added+' added · '+result.report.duplicates+' duplicates · reported metadata';}catch(err){if(authenticated&&generation===authGeneration)$('#import-status').textContent=err.message;}});
function showLogin(session={}){
  const wasAuthenticated=authenticated;authenticated=false;authUserId=null;authGeneration++;graph=null;active=false;selected=null;selectedContent=null;selectedStrategy=null;researchRuns=[];activeRunId=null;lastSnapshot='';guide=null;contentPlatform='all';showInferred=true;draftDirty=false;startingResearch=false;hostStatuses=null;hideHover();
  $('#authenticated-app').hidden=true;$('#login-gate').hidden=false;$('#account-name').textContent='';$('#home-account-name').textContent='';$('#target-input').value='';$('#home-url').value='';$('#target-url').hidden=true;$('#target-url').removeAttribute('href');$('#research-host').value='auto';$('#home-host').value='auto';status('');
  for(const id of ['source-graph','content-carousel','origin-results','scope-counters','strategy-list','content-count','keyword-strip','placement-preview','reference-source-list','reference-count'])$('#'+id).replaceChildren();
  $('#keyword-strip').hidden=true;$('#placement-preview').hidden=true;
  $('#references-panel').hidden=true;$('#references-panel').open=false;
  if(wasAuthenticated){for(const dialog of document.querySelectorAll('dialog'))if(dialog.open)dialog.close();$('#inspector-body').replaceChildren();}
  $('#import-json').value='';$('#import-status').textContent='';
  $('#login-status').textContent=closed?'Local app stopped. You may close this tab.':session.error?String(session.error).slice(0,180):session.status==='pending'?'Waiting for Agentlas sign-in…':session.status==='error'?'Sign-in could not be completed. Try again.':'';
}
async function checkAuth(){
  if(authChecking||closed)return;authChecking=true;
  try{const session=await api('/api/auth/status');if(session.authenticated===true&&session.user?.id){if(authUserId&&authUserId!==session.user.id)showLogin();const first=!authenticated;authenticated=true;authUserId=session.user.id;$('#login-gate').hidden=true;$('#authenticated-app').hidden=false;$('#account-name').textContent=session.user.displayName||'Agentlas account';$('#home-account-name').textContent=session.user.displayName||'Agentlas account';if(first){await refresh({quiet:true});showView(view);void loadHosts();}}else if(authenticated||!$('#login-gate').hidden)showLogin(session);}
  catch(err){if(err.message!==STALE_RESPONSE)showLogin({status:'error',error:err.message});}finally{authChecking=false;}
}
async function logout(){try{await api('/api/auth/logout',{method:'POST',body:'{}'});view='home';history.replaceState({creatorView:'home'},'','/');showLogin({status:'signed-out'});}catch(err){status(err.message);}}
$('#logout-button').addEventListener('click',logout);$('#home-logout-button').addEventListener('click',logout);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkAuth().then(()=>refresh({quiet:true}));});
setInterval(()=>{if(!document.hidden)checkAuth().then(()=>refresh({quiet:true}));},2000);
checkAuth();
