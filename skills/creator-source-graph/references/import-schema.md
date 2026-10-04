# Host evidence import

Submit one JSON object to the exact run ID returned by `start`:

```json
{
  "records": [],
  "coverage": [
    {"platform":"instagram","status":"unavailable","query":"site:instagram.com TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"},
    {"platform":"youtube","status":"unavailable","query":"site:youtube.com TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"},
    {"platform":"x","status":"unavailable","query":"site:x.com TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"},
    {"platform":"threads","status":"unavailable","query":"site:threads.net TARGET_TOPIC","note":"Planned query not executed: no host search/browser tool available"}
  ],
  "strategies": [],
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
| `summary` | Optional one-sentence AI paraphrase of an original page actually opened, at most 280 characters on one line. Leave absent for search-only candidates. Never copy article paragraphs. |
| `creator` | `{name, url?, identityStatus}`. Required for content. `identityStatus` is `page-metadata` for visible author/channel, `domain-placeholder` if only a domain is known, or `provided` if supplied by the user. Domain placeholders are not verified creator identities. |
| `observedAt` | Required actual ISO observation time for this record. |
| `publishedAt` | Optional observed publication date; omit/null when unknown. |
| `links` | Explicit observed links: `{url, anchor?, kind, scope, evidenceUrl?}`. `kind`: `hyperlink` or `citation`; `scope`: `article`, `main`, `document` or `readme`. Optional link evidenceUrl equals its parent record's normalized URL. Avoid navigation/footer/profile links as source evidence. |
| `metrics` | Optional `{platform, views?, likes?, comments?, points?, stars?, basis?}`. Discovery platforms are `instagram`, `youtube`, `x`, `threads`. Views must be a nonnegative safe integer actually observed on the original opened page, with a nonempty `basis` (at most 160 characters) describing the visible count. Hidden/unverifiable views remain absent/null; likes/comments/reposts never substitute. Other metric types remain separate. Counts stay host-reported. |
| `collection` | Required `{method, evidenceUrl, provenance, note?}`. `method`: `agent-browser` or `agent-search`. `provenance` is the actual host tool name, at most 160 characters, such as `Claude Code WebFetch` or `Codex web.open`; keep URLs in `evidenceUrl`, explanations in `note` (at most 500 characters). Browser evidenceUrl matches the record's normalized URL. Search evidenceUrl may be the actual search result URL, and search-only records have `links: []`, `mentions: []` and no measured metrics. |

Coverage requires exactly these discovery keys: `instagram`, `youtube`, `x`, `threads`; `status` (`searched`, `partial`, `unavailable`); a nonempty `query` (maximum 300 characters); and short `note` (maximum 500 characters). Web and Hacker News are not discovery tasks. Arbitrary public web pages remain valid reverse-traced source records and evidence destinations. Use the executed query when searched; for unavailable tools preserve the planned query and say it was not executed. `searched` means the query actually ran; zero results are valid. `partial` means restricted/incomplete research. Include one entry per platform, joining multiple executed queries if needed.

`status: "complete"` requires nonempty records and all four platforms represented with `status: "searched"`. Otherwise use `partial`, with a reason for partial/unavailable coverage. Complete means the declared bounded investigation finished, not exhaustive platform coverage. Maximum 100 records and 20 coverage entries per request, with one entry per platform; target a smaller useful sample. Browser imports have `collection.trust: "agent-observed"` and `metrics.status: "agent-reported"`; search-only imports have `discovered` trust/metrics. These remain distinct from app-collected, server-verified observations.

Optional `relationships` holds evidence-supported candidates, separate from explicit `links`. Each item requires:

```json
{
  "from":"https://example.com/opened-content",
  "to":"https://example.org/opened-source",
  "type":"inferred",
  "rationale":"Specific source candidate explanation, not proven provenance",
  "observedAt":"2026-10-05T00:00:00Z",
  "confidence":"low",
  "evidence":[{"url":"https://example.com/opened-content","note":"Specific short supporting original-page observation"}],
  "assumption":"ai-assisted-source-discovery"
}
```

Replace example URLs/time/text with actual observations; do not submit this as live evidence. Both endpoints and every evidence URL must match an opened `agent-browser` or app-collected record in the submitted batch or stored workspace; search-only records cannot support candidates. `rationale` is required and at most 500 characters; `evidence` requires one to five notes of at most 280 characters; `confidence` is `low` or `medium`. No more than 100 candidates per request; usually keep only 6–12 useful ones. Dates derive chronology (`consistent`, `conflict`, `unknown`) without proving influence. Conflicting chronology lowers confidence. Candidate edges remain inferred and never add source scores. “Earliest found” is limited to this observed sample, not a universal origin claim.

Optional `strategies` contains zero to six prioritized AI suggestions grounded in the original product target and collected evidence. These are recommendations, never executed actions. Each item accepts only:

| Field | Meaning |
| --- | --- |
| `priority` | Unique integer from 1 to 6. Suggestions display in ascending priority. |
| `kind` | `read`, `build`, `create` or `investigate`; also selects the compact UI icon. |
| `title` | Required nonempty short title, at most 60 characters. |
| `summary` | Required nonempty bounded explanation, at most 280 characters. Keep inference and uncertainty explicit. |
| `targetUrl` | Exact public URL of an opened record. Prefer original sources; an opened related social post is also valid. |
| `evidenceUrls` | One to five unique normalized public URLs of opened records, including `targetUrl`. |

All strategy targets and evidence must match `agent-browser`, `public-html`, `public-api` or `curated-public` records in the submitted batch or stored workspace. Search-only, manual and synthetic records cannot support a suggestion. No unknown fields, action results or execution/status fields are accepted. The app adds a stable per-run ID, `status: "suggested"`, `judgment: "ai-recommendation"` and `executed: false`; saves the sorted list to `run.strategies` and `analysis.aiStrategies`; and exposes it in `graph.analysis.aiStrategies`. Omitted or empty strategies produce an empty list. Starting a new run clears the active strategy list so recommendations from another product are never reused automatically. A recommendation based on an inferred path remains AI judgment, not proof of source origin or placement value.

The CLI uses bounded JSON and loopback HTTP only. Error output is on stderr; successful stdout is JSON. Check status/export before retrying an uncertain submit. `export` without an ID returns the portable raw workspace from `/api/export`. `export <runId>` returns `{run, workspace, graph}`: exact run status, raw workspace from `/api/export`, and the rendered graph from `/api/workspace`. Both workspace and graph cover the whole local workspace, so match the submitted record URLs and do not attribute every old graph node to this run. Inspect `graph.nodes`/`graph.edges` to verify explicit source paths. `workspace.relationships` is the optional inferred-relationship list, not the source edge list; zero inferred relationships can coexist with observed explicit links.
