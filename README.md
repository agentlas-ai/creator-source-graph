# Creator Source Graph

**Find creator content on Instagram, YouTube, X and Threads, trace likely sources, and explore where to publish your product.**

Creator Source Graph is an open-source local research app for Codex and Claude Code. Your subscribed local AI host discovers public content, checks available view counts, follows source links, and distinguishes reference sources from publication opportunities in a browser graph on your computer. No model or platform API keys are required.

![Creator Source Graph browser workspace](assets/creator-source-graph.png)

## Quick start: install, sign in, analyze

1. In a local Codex or Claude Code session with shell, web search and browser tools, send:

   ```text
   https://github.com/agentlas-ai/creator-source-graph
   Install and open this app.
   ```

2. Sign in with **Agentlas** in the browser that opens.
3. Enter **your product or brand URL** on the home screen and choose **Analyze**. Use **Back** for another URL, or edit the address and choose **Reanalyze**.

The host reads [the setup instructions](AGENTS.md), obtains the app and opens Agentlas sign-in. Setup uses the bundled skill by default and leaves your personal skill folders untouched. Append your own product URL to begin research in the installing chat after sign-in.

From the obtained app folder, the host runs `./runtime/node cli.mjs setup --host codex <target-url>` or `./runtime/node cli.mjs setup --host claude <target-url>` (use `node` for source installations or `runtime\node.exe` on Windows). It reads the receipt's skill file and absolute CLI bridge, then continues in the same session. No research target means setup opens the app and asks what to investigate; the installation repository URL is not automatically the target.

Your host supplies reasoning, search and browser execution. Its existing subscription, tool availability, permissions and usage limits apply. Installing the app does not install Codex or Claude Code, add missing tools, or sign you into those hosts. A cloud-only host cannot reach this machine's loopback app.

## Share in a DM (Korean)

```text
브랜드 관련 SNS 콘텐츠의 출처를 역추적해, 어디에 글을 올릴지 추천하는 오픈소스 앱이에요.
https://github.com/agentlas-ai/creator-source-graph
내 PC의 Codex나 Claude Code에 위 링크와 함께 “이 앱 설치해서 열어줘”라고 입력하세요.
Agentlas 로그인 후 브랜드 URL을 넣고 Analyze를 누르면 됩니다.
인스타·유튜브·X·Threads를 기존 AI 구독으로 검색해요. 별도 API 키는 필요 없어요.
```

## Start at home, then inspect the analysis

![Centered brand URL home screen](assets/creator-source-graph-home.png)

After Agentlas sign-in, the home screen presents a centered URL form. Enter a product or repository URL, choose **Auto**, **Codex** or **Claude**, then submit it to start local CLI research. Use **Back** for a different URL, **View latest** for retained results, or the analysis view's editable address and **Reanalyze** control. An installed subscribed CLI is required; permanent skill installation is optional. Auto selects an available subscription route. Missing or signed-out hosts show an actionable error before replacing the previous result.

Each browser analysis starts a **new local CLI research job**; it does not resume the AI chat that installed the app. The initial install-and-research request can still continue in that original chat through the bundled skill and receipt bridge. Both routes use the host’s existing subscription and tools, without provider API keys or separate provider billing.

The browser job follows explicit links and searches for additional plausible upstream sources. It preserves relevant search discoveries even when an original page cannot be opened. Connections supported only by search observations remain low-confidence, dashed candidates with no source-score contribution; they do not confirm an original page, a creator's follow, or AI collection. Missing evidence stays unresolved and there is no minimum connection count.

Progress appears in the app. Validated results are imported automatically with their actual complete or partial status. **Stop**, **Sign out** and **Quit local app** abort the job. Superseded jobs and results from a changed account cannot import into the current run.

Reanalysis creates a fresh run and retains existing source records and run history. History records run metadata; it does not restore a historical graph snapshot. Missing views, restricted platforms and incomplete source paths remain explicit in the results.

The host derives roughly 6–10 keyword angles while preserving the target's language, market and concrete subject. It runs both domestic/original-language and English/global searches, including the product's observed functions, principles and related problems. This can uncover relevant foreign material without requiring an exact local qualification name. Generic topic overlap or unrelated English results do not fill a sparse sample. Record notes distinguish direct subject matches, adjacent concepts and operator-owned seeds. Optional `product.keywords` stores up to 16 keywords as compact chips; these are research angles, not proof that every term was searched.

Research keeps exactly four social platforms: Instagram, YouTube, X and Threads. Separate web searches broaden source discovery across news, communities, papers, official material, blogs, cafe boards and repositories. A useful bounded target is about 20–40 social discoveries plus 20–40 source records, within 80 host-output records. Smaller truthful samples remain valid, and partial results retain actual discoveries. Search-only records keep the observed title/URL and a brief search context, with no original-page summary, links or measured counts.

## Explore the whole graph, then choose a next step

The graph opens with all collected content and its source connections visible. Click a content item to focus on its upstream path; return to the overview to compare the whole investigation.

Under **Where to publish**, the left panel shows channels as logos and short names. A publication action has a green graph border; a channel needing investigation has a Check icon and dashed border. Select it to focus its node, or hover for a brief summary and available links. Naver Blog, Naver Cafe, Daangn Cafe and Kakao Open Chat have dedicated icons.

A project homepage, repository or paper remains reference material. Publication actions require an observed writing/submission route, current rules and a public feed/index. Investigation candidates need an opened community/publication page relevant to the target; unverified routes stay empty. Domestic and international publication/community candidates are considered for their subject and audience fit, with up to six suggestions. Accessible relevant Naver blogs and cafe boards can qualify under the same evidence rules. Show HN requires relevant developer/product fit. A chat invitation is a community candidate, with membership and moderation still to check; private chat messages do not become publicly indexed source evidence. Suggestions never create source relationships or guarantee creator use, indexing or exposure.

- **Left — choose a starting point.** Browse suggested channels and Instagram, YouTube, X and Threads content. Available views are ordered within each platform; unknown counts remain unknown.
- **Middle — follow sources.** Explore the whole map or select content to focus its connections. Solid links and dashed candidate connections stay visually distinct.
- **Right — open a source.** Browse source names and compact references, with a short summary and original link. “Earliest found” refers to this investigation’s sample.

The screen keeps explanations brief: icons, names, one short summary and original links. Detailed research metadata remains in the JSON export.

## Download or run from source

Get the current packages from [GitHub Releases](https://github.com/agentlas-ai/creator-source-graph/releases/latest):

| Package | Download | Launch after extracting |
| --- | --- | --- |
| macOS Apple Silicon | [ZIP](https://github.com/agentlas-ai/creator-source-graph/releases/latest/download/creator-source-graph-macos-arm64.zip) | `Start.command` |
| macOS Intel | [ZIP](https://github.com/agentlas-ai/creator-source-graph/releases/latest/download/creator-source-graph-macos-x64.zip) | `Start.command` |
| Windows x64 | [ZIP](https://github.com/agentlas-ai/creator-source-graph/releases/latest/download/creator-source-graph-windows-x64.zip) | `Start.bat` |
| Linux x64 | [tar.gz](https://github.com/agentlas-ai/creator-source-graph/releases/latest/download/creator-source-graph-linux-x64.tar.gz) | `./start.sh` |
| Portable source | [ZIP](https://github.com/agentlas-ai/creator-source-graph/releases/latest/download/creator-source-graph-source.zip) | `npm start` |

Bundled packages include Node.js; the source ZIP requires Node.js 20 or newer. [SHA256 checksums](https://github.com/agentlas-ai/creator-source-graph/releases/latest/download/SHA256SUMS) accompany the downloads. Cross-platform package availability does not imply that every operating system has been verified with a real interaction.

To run from source, install [Node.js](https://nodejs.org/) 20 or newer, then:

```sh
git clone https://github.com/agentlas-ai/creator-source-graph.git
cd creator-source-graph
npm start
```

No npm dependencies need to be installed. The launcher starts the local server and opens the browser. Sign in with your Agentlas account to open your local graph.

## Sign in with Agentlas

The sign-in button opens Agentlas's official page at `agentlas.cloud`. New users can create an account with Google or Apple; existing accounts can also use email and password. Successful sign-in returns to this app's URL input home.

The first skill invocation opens the Agentlas login screen. After you sign in, the browser returns to Creator Source Graph and the AI continues with the product URL you supplied. If login takes longer than the host's wait, the skill checks login status and resumes the same request.

Agentlas login identifies your local workspace. It does not replace your Codex or Claude Code subscription. No model or search API key is required. Graphs stay on your computer and are separated by Agentlas account. The app does not upload your workspace to a central graph service; signing in on another computer does not download a cloud copy.

Use **Sign out** to return to the login screen. The app keeps your local graph for your next sign-in. On upgrade, an existing unassigned workspace is preserved and copied into the first signed-in account's local workspace; subsequent accounts start separately.

If sign-in does not return to the app, keep the local app running and finish sign-in in the same browser. A sign-in link lasts 10 minutes. After restarting the app or when a link expires, return to its home screen and click **Sign in with Agentlas** again. You can check `node cli.mjs login status` (or `./runtime/node cli.mjs login status` in a bundled package) without opening another page; callback failures include a safe error code and retry guidance.

![Agentlas sign-in screen for Creator Source Graph](assets/agentlas-sign-in.png)

## Connect Codex or Claude Code

For a downloaded runtime-bundled package, use its installer helper. It uses the included Node.js runtime:

| Platform | Read bundled skill for both hosts |
| --- | --- |
| macOS | `Install-Skills.command` |
| Windows | `Install-Skills.bat` |
| Linux | `./install-skills.sh` |

Choose how to connect from the app directory. Use `./runtime/node` for bundled downloads or `node` for source:

```sh
node cli.mjs setup --host codex --skip-skills
node cli.mjs install --host both --skill-scope user
node cli.mjs install --host claude --skills-dir ./chosen-skills
```

The default/app scope and `--skip-skills` use the bundled skill without permanent installation. `--skill-scope user` explicitly opts into `~/.agents/skills` and/or `~/.claude/skills`; `--skills-dir` chooses a parent directory for one host. Existing modified skills are preserved. Browser Analyze works without any personal skill installation.

For explicit personal installation you can also use:

```sh
npm run install:skills -- --host both --skill-scope user
```

The installing chat reads the receipt skill immediately. Future sessions discover a personal skill after explicit installation. Search/browser tools and host subscription limits still apply.

Claude Code supports browser subscription sign-in and an existing `setup-token` configuration through `CLAUDE_CODE_OAUTH_TOKEN`. Start the app from the shell/AI host that already exports that variable; restart it after environment changes. The app forwards it only to Claude and does not store it or use API-key providers. CLI status identifies token configuration; the research request determines whether it is still valid. Expired/invalid authentication shows a renewal message. See [Claude Code authentication](https://code.claude.com/docs/en/authentication).

After personal skill installation, in **Claude Code**:

```text
/creator-source-graph https://agentlas.cloud
```

In **Codex**:

```text
$creator-source-graph https://agentlas.cloud
```

You can add a brief, such as “Find creators covering AI agent workflows and trace the public sources they cite.” Complete Agentlas login when prompted. The agent then researches public pages, submits structured observations to the local app, and reports what it could verify. Keep the app open while reviewing the graph.

## How it works

```text
Agentlas sign-in → home URL form
          ↓
New subscribed local CLI job + bundled research instructions
          ↓
Product keywords → related social content → upstream sources
          ↓
Validated observations → reference graph + evidenced publication channels
          ↓
Back → new URL, or View latest → retained analysis
```

The app delegates browser analysis to a new subscribed local CLI job. You can also invoke the installed skill directly in an existing AI host session. The app’s HTTP collection and observations submitted by an AI agent have different provenance; one must not be mistaken for the other.

Local-first means the workspace and graph are stored on your machine. Your AI host and any public sites it visits still follow their own data policies. Review a JSON export before sharing it.

## CLI reference

Run commands from the app directory:

| Command | Purpose |
| --- | --- |
| `node cli.mjs setup --host codex [target-url]` | Read the bundled skill, open sign-in/graph and preserve the target. Use `claude` for Claude Code; add `--skill-scope user` or `--skills-dir` to install. |
| `node cli.mjs install --host both` | Return bundled skill and bridge paths without permanent installation. `--skip-skills` is explicit; `--skill-scope user` installs for both hosts. |
| `node cli.mjs login --wait-seconds 90` | Open Agentlas login and wait for sign-in. |
| `node cli.mjs login status` | Check login without reopening a browser. |
| `node cli.mjs logout` | Sign out of the local app. |
| `node cli.mjs start https://agentlas.cloud` | Sign in if needed, then start a research run for the original URL. |
| `node cli.mjs status [runId]` | List research runs or inspect one run. |
| `node cli.mjs submit <runId> <json-file\|->` | Submit a structured batch from a file or standard input. |
| `node cli.mjs export [runId]` | Export the local workspace, optionally with run status. |
| `node cli.mjs stop <runId>` | Cancel a research run while keeping the app available. |

The manual `start` command creates a ready run for your current AI host to research and submit. The browser’s Analyze/Reanalyze action separately launches a new subscribed local CLI job. Neither route purchases a model subscription.

For local integrations, `GET /api/research/hosts` reports host availability. `POST /api/research` accepts `{url, host}` with `host` set to `auto`, `codex` or `claude`, and starts a new local research job. `/api/analyze` creates a ready run only; it does not launch a host job.

## Structured batch input

The skill handles submissions for normal use. For custom host workflows, [the import schema](skills/creator-source-graph/references/import-schema.md) documents bounded records, view-count provenance, platform coverage, relationship evidence and optional AI priorities. Submit to the exact run ID returned by `start`:

```sh
node cli.mjs submit <runId> batch.json
```

Use search-only records for discovery candidates. Record original-page observations only after opening the exact source. Preserve unknown counts as absent or null. Check the exact run status before retrying a submission whose outcome is uncertain.

## Reading the evidence

An explicit link records a public connection. It does **not** prove influence, endorsement, that a creator read the destination, or when the link first appeared. Inferred source candidates require specific recorded claim, terminology, example or search-observation comparisons and a rationale; a shared broad topic is insufficient. Opened-page evidence and search-discovery evidence are distinguished in the export. Search-discovery candidates include both recorded endpoints as evidence, stay low-confidence and add zero source score. They remain hypotheses, separate from explicit citation paths; neither kind establishes a global first origin.

Search results are discovery leads, not proof of a page's full contents. Creator identity, publication dates, platform access, and view counts may be unavailable. Unknown values remain unknown rather than becoming zero. Private conversations, closed communities, and inaccessible content are outside the visible sample.

Source scores describe paths and topic relevance in the collected sample. They are not audience reach, market share, conversion forecasts, or a ranking of all creators. Verify the supporting pages before using research for a business decision.

The app stores source metadata and selected links, not copied article paragraphs. Do not submit private data or raw page transcripts as research records.

## License

[MIT](LICENSE) — copyright 2026 Appbridge Inc.
