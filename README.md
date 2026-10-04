# Creator Source Graph

**Creator discovery and source provenance, powered by the AI coding agent you already use.**

Creator Source Graph is an open-source AI agent app for web research. Give its Codex skill or Claude Code skill a product URL, then inspect creators, public content, and cited sources in a local browser graph. Follow the evidence behind a discovery instead of keeping a flat list of links.

Your existing AI host supplies reasoning, web search, and browser tools. The app stores structured observations and renders the graph locally. You do not need a separate model subscription or YouTube, X, Instagram, or Brave API keys for the skill workflow.

![Creator Source Graph showing creators, public content, source links, and research coverage](assets/creator-source-graph.png)

## What you can do

- Research creators publishing about a product, category, or related problem.
- Follow public links from creator content to projects, articles, papers, and other sources.
- Inspect supporting URLs, observation dates, creator identity, and collection status.
- Keep observed links separate from inferred relationships and search discoveries.
- Explore direct and additional second-hop creator paths within your collected sample.
- Export structured research as JSON for review or further analysis.

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

No npm dependencies need to be installed. The launcher starts the local server and opens the browser. The graph starts with your own workspace, ready for research.

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

You can add a brief, such as “Find creators covering AI agent workflows and trace the public sources they cite.” The agent researches public pages, submits structured observations to the local app, and reports what it could verify. Keep the app open while reviewing the graph.

## How it works

```text
Product URL + research brief
          ↓
Codex / Claude Code + installed skill
(reasoning, web search, browser observations)
          ↓
Structured research batches → local app → browser source graph
```

The browser app does not run an autonomous LLM. Research progresses while an AI host is executing the skill. The app's HTTP collection and observations submitted by an AI agent have different provenance; one must not be mistaken for the other.

Local-first means the workspace and graph are stored on your machine. Your AI host and any public sites it visits still follow their own data policies. Review a JSON export before sharing it.

## CLI reference

Run commands from the app directory:

| Command | Purpose |
| --- | --- |
| `node cli.mjs install --host both` | Install the skill for Codex and Claude Code. |
| `node cli.mjs start https://agentlas.cloud` | Start a research run for a product URL. |
| `node cli.mjs status [runId]` | List research runs or inspect one run. |
| `node cli.mjs submit <runId> <json-file\|->` | Submit a structured batch from a file or standard input. |
| `node cli.mjs export [runId]` | Export the local workspace, optionally with run status. |
| `node cli.mjs stop <runId>` | Cancel a research run while keeping the app available. |

A run records research progress; starting one does not launch or purchase an AI model. Invoke the installed skill in your AI host to perform the research.

## Structured batch input

The skill handles JSON submission for normal use. For a custom host workflow, save a batch as `batch.json` and submit it to the run ID returned by `start`:

```sh
node cli.mjs submit <runId> batch.json
```

This is a schema example, not a research finding. Replace its URL, title, timestamp, query, and provenance with information actually returned by your host tools:

```json
{
  "status": "partial",
  "note": "One search candidate; original page not yet opened.",
  "records": [
    {
      "url": "https://example.com/",
      "role": "source",
      "title": "Example search candidate",
      "observedAt": "2026-10-04T00:00:00Z",
      "collection": {
        "method": "agent-search",
        "evidenceUrl": "https://example.com/",
        "provenance": "Host web search result"
      }
    }
  ],
  "coverage": [
    {
      "platform": "web",
      "status": "partial",
      "query": "product category creators",
      "note": "Candidate found; original page inspection pending."
    }
  ]
}
```

Use `agent-search` for discovery candidates without original-page links or mentions. Use `agent-browser` only after opening the exact page; its `evidenceUrl` must match the record URL. Creator content records also need `creator.name`. Keep links to original observed hrefs, and use `null` or omit unavailable metrics. [Full input schema](skills/creator-source-graph/references/import-schema.md) documents the fields and coverage rules. A partial submission closes that run; start a new run to continue collecting.

## Reading the evidence

An explicit link records a public connection. It does **not** prove influence, endorsement, that a creator read the destination, or when the link first appeared. Inferred relationships must include a rationale and remain distinct from observed links.

Search results are discovery leads, not proof of a page's full contents. Creator identity, publication dates, platform access, and view counts may be unavailable. Unknown values remain unknown rather than becoming zero. Private conversations, closed communities, and inaccessible content are outside the visible sample.

Source scores describe paths and topic relevance in the collected sample. They are not audience reach, market share, conversion forecasts, or a ranking of all creators. Verify the supporting pages before using research for a business decision.

The app stores source metadata and selected links, not copied article paragraphs. Do not submit private data or raw page transcripts as research records.

## License

[MIT](LICENSE) — copyright 2026 Appbridge Inc.
