# Host evidence import

Submit one JSON object to the exact run ID returned by `start`:

```json
{
  "product": {"keywords": []},
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

Optional `product` accepts only `keywords`: an array of zero to 16 nonempty strings, each at most 80 characters. Whitespace is normalized; duplicates are rejected after case and whitespace normalization. Omitted `product`, omitted `keywords`, or an empty array yields an empty keyword list for compatibility; no prior run's keywords are reused. The host should derive 6–10 distinct capability/problem/technique/integration/use-case angles from the opened target and run multiple relevant queries per available platform. Prefer a broad actual sample, about 20–40 relevant social discoveries and 20–40 source records within the host's 80-record output cap; these are useful bounds, not required minimums. Preserve actual discoveries in partial results; fewer truthful findings remain valid. Keywords persist in `run.keywords` and `analysis.keywords` and appear in `graph.analysis.keywords`. They are product-derived research angles, not executed-query receipts. `coverage.query` separately retains the bounded actual executed-query summary unchanged; do not claim a planned keyword was searched when it was not.

Keep the target's observed language, market and primary subject in the search plan, and execute both domestic/original-language and English/global searches. Use its exact qualification, industry, jurisdiction or product category, expanding foreign queries through observed functions, principles and related problems. Exact local terminology need not appear in a relevant foreign result, but generic topic overlap is insufficient. Briefly distinguish direct subject matches, adjacent concepts and operator-owned seeds in `collection.note`, with a concrete reason. Open the target's linked social accounts as discovery seeds, identifying operator-owned content in `collection.note`; a footer/profile link is not evidence that another creator sourced the product. Keep the smaller relevant sample when a niche has few public originals. Blocked pages remain partial with unknown provenance; never fill missing relations with generic learning theories or official institutions.

Retain relevant concrete post/video and source discoveries from actual search results or an opened parent, even when original access fails, using `agent-search` and the actual discovery URL as `collection.evidenceUrl`. Search domestic/global web pages, news, communities, papers, official material, blogs, cafe boards and repositories for source candidates. Keep summary/counts null and links/mentions empty; titles/URLs/authors must come from that observation. Put a short specific search context, relevance and access limit in `collection.note`; a note is not an original-page summary. A missing author uses the destination hostname with `identityStatus:"domain-placeholder"`. Profile links do not justify inventing post URLs. Copy all URLs from tool results without retyping non-Latin slugs or percent escapes; an `agent-browser` record reuses the identical opened URL in its record/evidence/parent-link fields.

Each record accepts:

| Field | Meaning |
| --- | --- |
| `url` | Exact public HTTP/HTTPS content/source URL. No credentials or local/private hosts. |
| `role` | `content` for creator posts; `source` for relevant source documents discovered by search, an opened parent or a citation, including web/news/community/paper/official/blog/cafe/repository material. |
| `title` | Observed short title; no invented title from a URL. |
| `summary` | Optional one-sentence AI paraphrase of an original page actually opened, at most 280 characters on one line. Leave absent for search-only candidates. Never copy article paragraphs. |
| `topics` | Optional array of at most ten nonempty subject labels, each at most 100 characters. Local-language and industry-specific labels are retained. |
| `creator` | `{name, url?, identityStatus}`. Required for content. `identityStatus` is `page-metadata` for visible author/channel, `domain-placeholder` if only a domain is known, or `provided` if supplied by the user. Domain placeholders are not verified creator identities. |
| `observedAt` | Required actual ISO observation time for this record. |
| `publishedAt` | Optional observed publication date; omit/null when unknown. |
| `links` | Explicit observed links: `{url, anchor?, kind, scope, evidenceUrl?}`. `kind`: `hyperlink` or `citation`; `scope`: `article`, `main`, `document` or `readme`. Optional link evidenceUrl equals its parent record's normalized URL. Avoid navigation/footer/profile links as source evidence. |
| `metrics` | Optional `{platform, views?, likes?, comments?, points?, stars?, basis?}`. Discovery platforms are `instagram`, `youtube`, `x`, `threads`. Views must be a nonnegative safe integer actually observed on the original opened page, with a nonempty `basis` (at most 160 characters) describing the visible count. Hidden/unverifiable views remain absent/null; likes/comments/reposts never substitute. Other metric types remain separate. Counts stay host-reported. |
| `collection` | Required `{method, evidenceUrl, provenance, note?}`. `method`: `agent-browser` or `agent-search` (discovery only). `provenance` is the actual host tool name, at most 160 characters, such as `Claude Code WebFetch` or `Codex web.open`; keep URLs in `evidenceUrl`, explanations in `note` (at most 500 characters). Browser evidenceUrl matches the record's normalized URL. Discovery evidenceUrl may be the actual search result or opened parent-page URL, and discovery-only records have `links: []`, `mentions: []` and no measured metrics. |

Coverage requires exactly these discovery keys: `instagram`, `youtube`, `x`, `threads`; `status` (`searched`, `partial`, `unavailable`); a nonempty `query` (maximum 300 characters); and short `note` (maximum 500 characters). Web and Hacker News are not additional social-platform coverage tasks. Independent web source searches supplement these four tasks; arbitrary relevant public pages remain valid source records and evidence destinations. Use the executed query when searched; for unavailable tools preserve the planned query and say it was not executed. `searched` means the query actually ran; zero results are valid. `partial` means restricted/incomplete research. Include one entry per platform, joining multiple executed queries if needed.

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

Replace example URLs/time/text with actual observations; do not submit this as live evidence. Both endpoints and every evidence URL must match an actual non-synthetic `agent-search` discovery or opened `agent-browser`, `public-html`, `public-api` or `curated-public` record in the submitted batch or stored workspace. Manual records and public-index placeholders do not qualify. `rationale` is required and at most 500 characters; `evidence` requires one to five nonempty notes of at most 280 characters; input `confidence` is `low` or `medium`. No more than 100 candidates per request; keep only useful supported comparisons.

The app computes `evidenceBasis`; never submit that field or invent a verification claim. With fully opened endpoints and evidence, output is `evidenceBasis: "opened-pages"`. If any endpoint or supporting evidence is `agent-search`, output is `evidenceBasis: "search-discovery"` and confidence is forced to `low`, even when the input requests medium. Search-discovery requires both exact normalized endpoint URLs in the evidence array, each with a specific comparison note. Every search record used by that relationship requires a nonempty `collection.note` (at most 500 characters) describing its actual search/parent discovery context and original-access limit. Its `provenance`, discovery `evidenceUrl` and real `observedAt` remain required. It has no original-page summary, links, mentions or measured counts.

Compare distinctive terms, claims, unusual examples or concrete search observations; a shared broad topic is insufficient. Search-discovery shows only a possible source relationship, without verifying the original page, actual follow or AI collection. It stays inferred-only, dashed and unresolved, contributing zero source score. Publication strategies still require opened venue evidence; a source discovery is not a publication recommendation.

Dates derive chronology (`consistent`, `conflict`, `unknown`) without proving influence. Publication dates copied from search-only discoveries are not used as observed chronology. Unknown dates remain unknown, and conflicting opened-page chronology lowers confidence. All inferred candidates remain separate from explicit links and never add source scores. “Earliest found” is limited to this observed sample, not a universal origin claim.

Optional `strategies` contains zero to six prioritized AI suggestions grounded in the original target and collected evidence. Publication suggestions identify actual channels where new product information could be posted or listed. A project homepage, repository, framework or paper is reference evidence, not an automatic publication venue. Each item accepts only:

| Field | Meaning |
| --- | --- |
| `priority` | Unique integer from 1 to 6, sorted ascending. |
| `kind` | `read`, `build`, `create` or `investigate`. Placement metadata is allowed only with `create` or `investigate`. |
| `title` | Required nonempty short title, at most 60 characters. |
| `summary` | Required nonempty explanation, at most 280 characters, tying the original product to the proposed channel or reference and keeping unverified conditions explicit. |
| `targetUrl` | Public URL of an opened record; must equal `placement.channelUrl` for a placement suggestion. |
| `evidenceUrls` | One to five unique normalized public URLs of opened records, including `targetUrl`. |
| `placement` | Optional object with exactly `channelUrl`, `submissionUrl`, `discoveryUrl`, `rulesUrl`, `venueType`. Omitted or null metadata is reference-only. |

Placement URL fields are normalized public URLs without custom ports. `venueType` is `community`, `directory`, `newsletter`, `newsfeed`, `blog` or `chat`. `channelUrl` always identifies an opened, relevant publication/community page included in `evidenceUrls`; shared URLs are allowed. Select up to six domestic and international channels from the target's subject and audience, while preserving its original-language context. Accessible relevant Naver blogs, suitable cafe boards and an existing study community can be investigated alongside global venues without forcing a developer launch site. Operator-owned channels remain distinct from independent communities and evidence of creator sourcing.

For `kind: "create"`, channel, public discovery/feed and current rules URLs must all match opened records included in `evidenceUrls`. The opened rules record must contain an actual `links` hyperlink (`kind: "hyperlink"`) to the exact normalized `submissionUrl`, even when that submission page is opened. A login-gated editor/form can remain unopened only when this observed hyperlink grounds its route. `chat` is not valid for `create`. A room invitation, sign-in page or app-launch button is neither a publication submission route nor a public content feed.

For `kind: "investigate"`, unknown `submissionUrl`, `discoveryUrl` and `rulesUrl` may be `null`. Any supplied discovery/rules URL still requires an opened record included in `evidenceUrls`. A supplied submission URL requires an observed hyperlink from one of the opened channel, discovery or rules pages; never guess editor URLs. If its submission page was opened in this batch, include it in `evidenceUrls` as well. A public chat landing page can ground investigation of community fit while all three routes remain null; it does not establish public indexing, posting permission or the content of a private room. State membership, moderation, promotional restrictions and other missing conditions briefly in `summary`. An ordinary product homepage/reference is not a candidate merely because it is relevant: its public description must establish an actual authoring, listing or community activity. Read current restrictions when accessible; never bypass login or submit anything.

All strategy targets/evidence must match non-synthetic `agent-browser`, `public-html`, `public-api` or `curated-public` records in the submitted batch or stored workspace. Search-only and manual records cannot support a suggestion. Unknown fields and execution/status claims are rejected atomically. The app adds a stable per-run ID, `recommendationType: "placement"` for validated `create` routes, `"channel-candidate"` for `investigate` channels, or `"reference"` without placement metadata, plus `status: "suggested"`, `judgment: "ai-recommendation"`, and `executed: false`. Candidates appear with the Check icon and a dashed border in Where to publish; they never create source edges, raise source scores or prove public discoverability. Sorted suggestions persist to `run.strategies` and `analysis.aiStrategies`, exposed in `graph.analysis.aiStrategies`. Old stored suggestions lacking metadata remain references. Omitted/empty strategies clear the active list; new runs never reuse another product's suggestions. Return an empty list when no relevant channel or candidate can be grounded. Recommendations remain AI judgment, not confirmed creator sourcing or guaranteed distribution.

The CLI uses bounded JSON and loopback HTTP only. Error output is on stderr; successful stdout is JSON. Check status/export before retrying an uncertain submit. `export` without an ID returns the portable raw workspace from `/api/export`. `export <runId>` returns `{run, workspace, graph}`: exact run status, raw workspace from `/api/export`, and the rendered graph from `/api/workspace`. Both workspace and graph cover the whole local workspace, so match the submitted record URLs and do not attribute every old graph node to this run. Inspect `graph.nodes`/`graph.edges` to verify explicit source paths. `workspace.relationships` is the optional inferred-relationship list, not the source edge list; zero inferred relationships can coexist with observed explicit links.
