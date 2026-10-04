# Host evidence import

Submit one JSON object to the exact run ID returned by `start`:

```json
{
  "records": [],
  "coverage": [
    {"platform":"youtube","status":"unavailable","query":"site:youtube.com TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"},
    {"platform":"instagram","status":"unavailable","query":"site:instagram.com TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"},
    {"platform":"x","status":"unavailable","query":"site:x.com TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"},
    {"platform":"web","status":"unavailable","query":"TARGET_TOPIC sources references","note":"Planned query not executed: no host search/browser tool available"},
    {"platform":"hackernews","status":"unavailable","query":"site:news.ycombinator.com TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"}
  ],
  "status":"partial",
  "note":"Research could not run in this host session."
}
```

Use actual researched records and truthful coverage when tools are available. Replace TARGET_TOPIC with the run's planned query/target topic. The example above documents unavailable tools and contains no research evidence.

Each record accepts:

| Field | Meaning |
| --- | --- |
| `url` | Exact public HTTP/HTTPS content/source URL. No credentials or local/private hosts. |
| `role` | `content` for creator posts; `source` for linked papers, repositories or original documents. |
| `title` | Observed short title; no invented title from a URL. |
| `creator` | `{name, url?, identityStatus}`. Required for content. `identityStatus` is `page-metadata` for visible author/channel, `domain-placeholder` if only a domain is known, or `provided` if supplied by the user. Domain placeholders are not verified creator identities. |
| `observedAt` | Required actual ISO observation time for this record. |
| `publishedAt` | Optional observed publication date; omit/null when unknown. |
| `links` | Explicit observed links: `{url, anchor?, kind, scope, evidenceUrl?}`. `kind`: `hyperlink` or `citation`; `scope`: `article`, `main`, `document` or `readme`. Optional link evidenceUrl equals its parent record's normalized URL. Avoid navigation/footer/profile links as source evidence. |
| `metrics` | Optional `{platform, views?, likes?, comments?, points?, stars?, basis?}`. Only actual page-observed counts; `basis` describes their visible public basis. Unknown values absent/null. Counts stay host-reported. |
| `collection` | Required `{method, evidenceUrl, provenance, note?}`. `method`: `agent-browser` or `agent-search`. `provenance` is the actual host tool name, at most 160 characters, such as `Claude Code WebFetch` or `Codex web.open`; keep URLs in `evidenceUrl`, explanations in `note` (at most 500 characters). Browser evidenceUrl matches the record's normalized URL. Search evidenceUrl may be the actual search result URL, and search-only records have `links: []`, `mentions: []` and no measured metrics. |

Coverage requires `platform` (`youtube`, `instagram`, `x`, `web`, `hackernews`), `status` (`searched`, `partial`, `unavailable`), a nonempty `query` (maximum 300 characters), and short `note` (maximum 500 characters). Use the executed query when searched; for unavailable tools, preserve the run's planned query and explicitly say it was not executed in the note. `searched` means the query actually ran; zero results are valid. `partial` means restricted/incomplete research. Use `unavailable` when no usable tool or access exists. Include one entry per platform, with queries joined when multiple searches ran.

`status: "complete"` requires nonempty records and all five platforms represented with `status: "searched"`. Otherwise use `partial`, with a reason for partial/unavailable coverage. Complete means the declared bounded investigation finished, not exhaustive platform coverage. Maximum 100 records and 20 coverage entries per request, with one coverage entry per platform; target a smaller useful sample. Browser imports have `collection.trust: "agent-observed"` and `metrics.status: "agent-reported"`; search-only imports have `discovered` trust/metrics. These are host-reported evidence and remain distinct from app-collected, server-verified observations.

The CLI uses bounded JSON and loopback HTTP only. Error output is on stderr; successful stdout is JSON. Check status/export before retrying an uncertain submit. `export` without an ID returns the portable raw workspace from `/api/export`. `export <runId>` returns `{run, workspace, graph}`: exact run status, raw workspace from `/api/export`, and the rendered graph from `/api/workspace`. Both workspace and graph cover the whole local workspace, so match the submitted record URLs and do not attribute every old graph node to this run. Inspect `graph.nodes`/`graph.edges` to verify explicit source paths. `workspace.relationships` is the optional inferred-relationship list, not the source edge list; zero inferred relationships can coexist with observed explicit links.
