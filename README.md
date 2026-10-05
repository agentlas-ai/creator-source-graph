# Creator Source Graph

**Find creator content on Instagram, YouTube, X and Threads, then trace its sources.**

Creator Source Graph is an open-source local research app for Codex and Claude Code. Your subscribed local AI host discovers public content, checks available view counts, follows source links, and distinguishes reference sources from publication opportunities in a browser graph on your computer. No model or platform API keys are required.

![Creator Source Graph browser workspace](assets/creator-source-graph.png)

## Install and open with your AI host

In a local Codex or Claude Code session with shell, web search and browser tools, send:

```text
https://github.com/agentlas-ai/creator-source-graph
Install and open this app. Then research creators covering https://agentlas.cloud.
```

The host reads [the setup instructions](AGENTS.md), installs the app and personal skill, opens the browser and prompts you to sign in with Agentlas. After authentication, it continues the original research target. If sign-in is still pending, it checks login status before continuing; it does not claim research has already run.

From the obtained app folder, the host runs `./runtime/node cli.mjs setup --host codex <target-url>` or `./runtime/node cli.mjs setup --host claude <target-url>` (use `node` for source installations or `runtime\node.exe` on Windows). It reads the installed skill from the setup receipt and continues in the same session. Without a research target, setup opens the app and asks what to investigate; the installation repository URL is not automatically the target.

Your host supplies reasoning, search and browser execution. Its existing subscription, tool availability, permissions and usage limits apply. Installing the app does not install Codex or Claude Code, add missing tools, or sign you into those hosts. A cloud-only host cannot reach this machine's loopback app.

## Start at home, then inspect the analysis

![Centered brand URL home screen](assets/creator-source-graph-home.png)

After Agentlas sign-in, the home screen presents a centered URL form. Enter a product or repository URL, choose **Auto**, **Codex** or **Claude**, then submit it to start actual local CLI research. The app moves to the analysis view as the investigation progresses. Use **Back** to return home for a different URL, or **View latest** to reopen the retained analysis. The analysis view also keeps its editable target URL and **Reanalyze** control. The app requires an installed local Codex or Claude Code CLI signed in with an existing subscription. Auto selects an authenticated subscription host. If the CLI is missing or signed out, the app shows an actionable error before replacing the previous result.

Each browser analysis starts a **new local CLI research job**; it does not resume the AI chat that installed the app. The initial install-and-research request can still continue in that original chat through the installed skill. Both routes use the host’s existing subscription and tools, without provider API keys or separate provider billing.

The browser job follows explicit links and investigates possible source connections when paths are incomplete. Candidate connections remain estimates; missing evidence stays unresolved. There is no minimum connection count.

Progress appears in the app. Validated results are imported automatically with their actual complete or partial status. **Stop**, **Sign out** and **Quit local app** abort the job. Superseded jobs and results from a changed account cannot import into the current run.

Reanalysis creates a fresh run and retains existing source records and run history. History records run metadata; it does not restore a historical graph snapshot. Missing views, restricted platforms and incomplete source paths remain explicit in the results.

The host derives roughly 6–10 keyword angles from the opened target to find a broader sample of related social content. Keywords remain tied to product evidence rather than becoming claims of market coverage. Optional `product.keywords` stores up to 16 keywords, shown as compact chips in the analysis.

## Explore the whole graph, then choose a next step

The graph opens with all collected content and its source connections visible. Click a content item to focus on its upstream path; return to the overview to compare the whole investigation.

The left panel shows publication channel suggestions as icons and short names, alongside the four-platform content sample. Hover for one short summary and an original link. Select a channel to see its compact brand → channel → feed → possible AI discovery → creators route. Reference originals stay separate.

A project homepage, repository or paper—such as LangGraph—is a reference original, not automatically a place to distribute your product. Your own GitHub and docs hold verifiable product evidence. Real channel suggestions need a separate submission/publication route, its public rules, and an opened feed or index where new entries can be found. A community Show HN route, launch directory or newsletter tip route can be considered only when that evidence is available. Do not assume those channels supplied the traced creator posts. Suggestions without verified placement metadata remain reference-only; acceptance, creator AI use and visibility probability are unverified unless independently observed.

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

The first skill invocation opens the Agentlas login screen. After you sign in, the browser returns to Creator Source Graph and the AI continues with the product URL you supplied. If login takes longer than the host's wait, the skill checks login status and resumes the same request.

Agentlas login identifies your local workspace. It does not replace your Codex or Claude Code subscription. No model or search API key is required. Graphs stay on your computer and are separated by Agentlas account. The app does not upload your workspace to a central graph service; signing in on another computer does not download a cloud copy.

Use **Sign out** to return to the login screen. The app keeps your local graph for your next sign-in. On upgrade, an existing unassigned workspace is preserved and copied into the first signed-in account's local workspace; subsequent accounts start separately.

![Agentlas sign-in screen for Creator Source Graph](assets/agentlas-sign-in.png)

## Connect Codex or Claude Code

For a downloaded runtime-bundled package, use its installer helper. It uses the included Node.js runtime:

| Platform | Install skills for both hosts |
| --- | --- |
| macOS | `Install-Skills.command` |
| Windows | `Install-Skills.bat` |
| Linux | `./install-skills.sh` |

For a source checkout with Node.js available, install from the app directory:

```sh
node cli.mjs install --host both
```

Or use:

```sh
npm run install:skills -- --host both
```

Start a new AI session after installation so the host discovers the skill. Your host must have the relevant tools enabled and permission to use them. Subscription plans, tool availability, limits, and host configuration vary; installing this skill does not add unavailable search or browser capabilities.

In **Claude Code**:

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
New subscribed local CLI job + installed skill
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
| `node cli.mjs setup --host codex [target-url]` | Install or reuse the current host skill, open sign-in/graph and preserve the research target. Use `claude` for Claude Code. |
| `node cli.mjs install --host both` | Install the skill for Codex and Claude Code. |
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

An explicit link records a public connection. It does **not** prove influence, endorsement, that a creator read the destination, or when the link first appeared. Inferred source candidates require recorded semantic and chronological evidence and a rationale. They remain hypotheses, separate from explicit citation paths; neither kind establishes a global first origin.

Search results are discovery leads, not proof of a page's full contents. Creator identity, publication dates, platform access, and view counts may be unavailable. Unknown values remain unknown rather than becoming zero. Private conversations, closed communities, and inaccessible content are outside the visible sample.

Source scores describe paths and topic relevance in the collected sample. They are not audience reach, market share, conversion forecasts, or a ranking of all creators. Verify the supporting pages before using research for a business decision.

The app stores source metadata and selected links, not copied article paragraphs. Do not submit private data or raw page transcripts as research records.

## License

[MIT](LICENSE) — copyright 2026 Appbridge Inc.
