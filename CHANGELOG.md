# Changelog

## 0.5.0

- Opens Agentlas login on first skill use, then resumes the original product research request.
- Stores local workspaces separately for each Agentlas account and preserves existing workspace data on upgrade.
- Adds sign-out and login-status commands without exposing identity tokens to the AI host.
- Adds floating previews for graph nodes and platform logos, with original links, observation dates, collection status, and optional short AI summaries.
- Keeps search-only discoveries free of original-page summary claims and guards the UI against delayed responses after account changes.

## 0.4.0

- Introduces the public, local-first Creator Source Graph app for creator discovery and source provenance.
- Adds installable skills for Codex and Claude Code to research public sources through an existing AI host.
- Adds a local launcher and CLI for skill installation, research runs, structured batch submission, status, export, and stop.
- Separates public link evidence, search discoveries, AI agent observations, and inferred relationships.
- Provides source packages and Node-runtime-bundled packages for macOS Apple Silicon, macOS Intel, Windows x64, and Linux x64.

AI research requires a compatible host with the necessary tools and permissions. Release package availability is separate from verification on each target operating system.
