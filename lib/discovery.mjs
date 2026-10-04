export function strategyTargets(graph,focusUrl=null) {
  const targets=[];
  const relevant=graph.rankings.filter(s=>s.eligible&&new URL(s.url).hostname==='github.com');
  if(focusUrl&&new URL(focusUrl).hostname==='github.com') {
    const s=graph.rankings.find(s=>s.url===focusUrl);
    if(s)targets.push({id:'github-focus',platform:'github',url:focusUrl,sourceId:s.id,score:s.score,action:'Integration example or evaluation draft',status:s.eligible?'observed-path':'format-hypothesis',evidenceIds:s.supportingEdges.map(e=>e.id),caveat:'Review contribution rules before submitting a draft.'});
  }else for(const s of relevant.slice(0,3))targets.push({id:s.id,platform:'github',url:s.url,sourceId:s.id,score:s.score,action:'Integration example or documentation draft',status:'observed-path',evidenceIds:s.supportingEdges.map(e=>e.id),caveat:'Observed links in this sample. Placement availability and conversion are unverified.'});
  const hn=graph.nodes.filter(n=>n.type==='content'&&n.document.metrics?.platform==='hackernews'&&n.document.metrics.status==='observed'&&(!focusUrl||n.document.links.some(l=>l.url===focusUrl||graph.rankings.find(s=>s.url===focusUrl)?.document?.aliases?.includes(l.url))));
  if(hn.length)targets.push({id:'hackernews',platform:'hackernews',url:'https://news.ycombinator.com/showhn.html',score:null,action:'Show HN: working product demo draft',status:'observed-format-opportunity',evidenceIds:hn.map(n=>n.id),caveat:'Prepare a working demo people can try before considering a Show HN submission.'});
  // Papers and publisher articles remain graph evidence, never advertising targets.
  return targets.slice(0,5);
}
