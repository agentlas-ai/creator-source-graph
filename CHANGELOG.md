# Changelog

## 0.7.5 — 2026-10-07

- Opens Agentlas sign-in in the system browser while the local app waits and detects completion; provides a manual sign-in link if opening the browser fails.
- Preserves an active sign-in across app restarts on the same local port and makes waiting, finishing, expiry and retry states available to the AI host.
- Keeps sign-out immediate, cancels pending authentication requests, and prevents a late callback from restoring a signed-out account.
- Retries one interrupted identity check using the existing grant without exchanging the authorization code twice, and restores saved sessions only after private-file validation succeeds.
- Rejects older running app versions before using the updated login flow.

## 0.7.4 — 2026-10-06

- Reuses an active Agentlas sign-in when its button is opened more than once, preserving the first tab's return link.
- Joins repeated callbacks while sign-in is finishing instead of exchanging the same authorization code twice.
- Shows actionable retry guidance for expired, restarted, incomplete and rejected sign-ins, with safe diagnostic codes in login status.
- Accepts the local app's explicit port 80 callback without losing the exact redirect URI.

## 0.7.3 — 2026-10-06

- Searches domestic and English/global results together, expanding from the target's primary subject into related functions, principles and problems supported by its page.
- Broadens web source discovery across articles, news, specialist blogs, cafe boards, communities, papers, official resources and repositories, retaining useful discoveries when originals are restricted.
- Supports search-backed inferred source candidates with separate endpoint comparisons, dashed graph paths and persistence across restarts; original-page metadata, scores and earliest-origin claims remain unavailable for those paths.
- Raises the local research pool to 80 records and 24 inferred candidates, without forcing minimum counts or unrelated filler.
- Keeps graph logos readable as the result pool grows, with scrolling for larger maps and deeper source chains.
- Synchronizes the launcher and app version so fresh release launches can pass the startup health check.
- Includes the subscription setup-token, optional skill installation and Korean channel improvements from 0.7.2.

## 0.7.2 — 2026-10-06

- Preserves target language, market and specific subject in research, starting with target-linked social content instead of filling niche searches with unrelated English results.
- Retains relevant restricted-original discoveries without original-page claims and recognizes concrete YouTube embeds linked by target pages.
- Retains local-language subject labels, uses the product's subject overlap for observed-path relevance, and prioritizes relevant Korean blogs, cafe boards and study communities over unrelated launch venues.
- Adds investigation-only channel candidates with unknown routes left empty, dedicated Korean channel icons and dashed borders; candidates never create source paths or imply public chat indexing.
- Supports existing Claude Code setup-token subscription environments, forwarding the token only to Claude and reporting configured tokens separately from remotely verified authentication.
- Uses bundled skills by default without personal installation. Adds explicit user/custom installation choices and `--skip-skills`, with the absolute bridge returned for same-session use.

## 0.7.1 — 2026-10-05

- Removes the duplicate Source map heading and separate suggested-channel route to give the relationship graph more space.
- Shows publication channels as logos and short names under Where to publish, with green borders on the matching graph nodes.
- Keeps channel summaries and original, submission, feed and rules links in the floating preview.
- Preserves content-path selection, the whole-graph overview and source-detail expansion without adding suggested provenance links.

## 0.7.0 — 2026-10-05

- Fixes failed reanalysis when an older submission page remains in history; newly opened submission pages still require supporting evidence.
- Simplifies the consumer UI to icons, names, one short summary, original links and compact channel routes; detailed rationale, confidence and collection metadata remain in exported research data.
- Makes browser research investigate explicit references and evidence-supported inferred source candidates when link paths are incomplete; insufficient evidence produces an explained gap rather than a fabricated connection.
- Keeps Threads post share URLs with one descriptive slug in discovery and source traces, preserving their opened URL evidence.
- Opens a centered URL home screen after sign-in; submitting starts a new subscribed local CLI investigation and moves to the analysis view.
- Adds Back and View latest navigation while keeping editable URL and Reanalyze controls in the analysis view.
- Uses multiple grounded keyword angles for related social content and supports up to 16 saved product keywords shown as chips.
- Detects installed, authenticated subscription hosts and reports missing or signed-out hosts before replacing the previous result.
- Displays progress and automatically imports validated complete or partial results.
- Aborts jobs on stop, sign-out or shutdown and prevents superseded or account-switched results from importing.
- Preserves source records and run metadata across fresh investigations without historical graph restoration.
- Separates publication-channel suggestions from reference-only project homepages, repositories and papers.
- Requires opened public rules and discoverable feeds or indexes plus an observed rules-to-submission hyperlink for channel suggestions; keeps acceptance, creator AI use and visibility probability unverified.
- Shows a compact brand → publication channel → possible AI collector → social creator route without treating suggested channels as proven inputs to the traced creators.
- Keeps initial installation in the current AI chat and retains manual skill/run/import workflows without provider API keys.

## 0.6.0 — 2026-10-05

- Opens the whole content-and-source graph by default; selecting content focuses its upstream path.
- Adds compact, icon-led AI priorities for evidence-backed reading, investigation, building and content creation.
- Keeps source summaries and path details expandable to reduce visual clutter.
- Starts content discovery with Instagram, YouTube, X and Threads.
- Ranks confirmed views within each platform and preserves unknown counts without substituting likes or snippet estimates.
- Traces content through intermediate references to the earliest source found in the investigation, without claiming a global first origin.
- Adds separately labelled inferred source candidates supported by semantic and chronological evidence.
- Makes repository-to-host installation and opening the first-use path, with Agentlas sign-in followed by the original research target.
- Keeps search and execution in the existing local Codex or Claude Code host, with account-separated local graphs and no central workspace upload.

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
