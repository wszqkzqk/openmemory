# OpenMemory — Design Document

**Version:** 1.0.0 — 2026-05-05

---

## Overview

OpenCode agents are stateless across sessions. Every new session starts from zero context. The agent re-discovers project structure, re-learns user preferences, re-traces decisions from scratch.

OpenMemory is a file-based, three-tier memory system that persists knowledge across sessions. The storage is plain Markdown with YAML front matter — no databases, no servers, no external processes.

The design enforces three principles: the agent does the busywork (autonomous create/update/cleanup for session and project layers), global memory requires user permission, and stale information gets flagged rather than silently trusted.

---

## Three-Layer Architecture

```
~/.local/share/openmemory/          ← Global — cross-project, user-managed

<project>/.openmemory/
    session/<sessionID>/            ← Session — current conversation only
        debug-findings.md
    project/                        ← Project — cross-session, agent-managed
        architecture.md
        decisions.md
        gotchas.md
    index.md                        ← Compact metadata table, regenerated on write
```

| Layer | Location | Manager | Lifetime |
|---|---|---|---|
| Session | `.openmemory/session/<sessionID>/` | Agent (autonomous) | Current session |
| Project | `.openmemory/project/` | Agent (autonomous) | Until marked stale |
| Global | `$XDG_DATA_HOME/openmemory/` | User (agent assists) | Indefinite |

Session memories are scoped per-session using OpenCode's `ToolContext.sessionID`. Each session writes to its own subdirectory. Concurrent sessions do not clobber each other. Compaction cleanup removes only the current session's directory.

---

## Storage Format

Every memory is a `.md` file with YAML front matter:

```markdown
---
title: Switched auth from JWT to session tokens
type: context
scope: project:backend
tags: [auth, security, redis]
created: 2026-04-20
updated: 2026-05-01
status: active
importance: 4
git-hash: 3f7c8a9b1d2e4f6a8b0c1d3e5f7a9b2c4d6e8f0a
---

Decision body in Markdown.
```

### Why YAML front matter

The filename and front matter carry enough information for the agent to decide whether to read the body. This is progressive disclosure — metadata-only browsing is cheap, full-body reads are only done for files that pass the initial filter.

### Fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | One-line summary |
| `type` | identity/directive/context/bookmark | Semantic category |
| `scope` | string | `global`, `project:<slug>`, `session:<id>` |
| `tags` | string[] | 1-5 lowercase keywords |
| `status` | active/stale/archived | Freshness indicator |
| `importance` | 1-5 | Retrieval priority (default 3) |
| `git-hash` | string (optional) | Full commit SHA-1 when written |
| `expires` | date (optional) | Auto-excluded after this date |
| `related` | string[] (optional) | Linked memory slugs |
| `entities` | string[] (optional) | Named libraries, services, people |

### Index file

`index.md` is regenerated after every write (store/update/delete) for project and global scopes. Session scope skips index generation — session files are ephemeral and searched by walking subdirectories.

The index is the primary data structure for search. When the agent calls `memory_search` for project or global scope, the system checks the index first (title, tags, type, status), and only reads a file's body when a text query requires body-level matching and the metadata was insufficient.

---

## Tools

Eight discrete named tools, each registered via the `tool` key in the plugin hooks object. No monolithic mode-based API.

### Retrieval tools

| Tool | Purpose |
|---|---|
| `memory_scan` | Cross-scope overview — counts by status, file paths |
| `memory_list` | Full metadata table for one scope — slug, title, type, tags, status |
| `memory_search` | Filtered lookup — keyword, tags, type, status. Returns metadata + optional body snippet |
| `memory_get` | Read full content of one file by slug |

### Mutation tools

| Tool | Purpose |
|---|---|
| `memory_store` | Create or overwrite a memory |
| `memory_update` | Modify metadata fields, body, or status |
| `memory_delete` | Archive (soft) or permanently remove |

### Maintenance tools

| Tool | Purpose |
|---|---|
| `memory_check` | Compare git-hash, check expirations, flag old memories |

### Discovery flow

The recommended pattern taught by the companion SKILL.md:

1. `memory_list` — see everything available (metadata only, no body reads)
2. `memory_get` — read files whose titles or tags match the task
3. `memory_search` — grep for a specific keyword after you know what exists

This replaces the naive `scan → search → get` pattern where the agent guesses keywords. Browsing the list first ensures the agent knows what's available before deciding what to read.

---

## Hook Strategy

OpenMemory hooks into four OpenCode plugin lifecycle points.

### 1. First-turn context injection

**Hook:** `experimental.chat.system.transform`

On the first LLM call of each session, a compact memory index is merged into the system prompt. Order: global directives → global preferences → project active memories (importance-descending, max 10).

The `session.created` event (#14808) is known-unreliable and is deliberately NOT used. The system transform fires on every LLM call but is guarded by a `firstTurnDone` session flag.

**Merge, don't push.** The context block is appended to `output.system[0]` rather than pushed as a new entry. Multiple system messages break OpenAI-compatible backends (Qwen, vLLM).

### 2. Compaction preservation

**Hook:** `experimental.session.compacting`

Before the compaction LLM generates a continuation summary, the current session's discoveries and active project memories are injected into the compaction context. The compacted session wakes up with project awareness.

Session memories from the current `sessionID` are collected, summarized, and the session subdirectory is cleaned up after compaction.

### 3. Session idle staleness check

**Hook:** `event` (`session.idle`)

When the agent loop becomes idle, a lightweight staleness check runs across all scopes. Warnings are stored in module-level state and surfaced on the next session's first turn.

**Fire-and-forget.** The `event` hook's return promise is NOT awaited by the OpenCode runtime. Heavy processing is avoided; only a lightweight file scan is run.

### 4. Tool usage tracking

**Hook:** `tool.execute.after`

Currently a no-op placeholder. In future versions this will feed data into intelligent memory extraction — e.g., "the agent just edited three auth files, it probably discovered something worth remembering."

---

## Configuration

Defaults are embedded in the plugin source. Optional overrides via `openmemory.json`:

| Key | Default | Purpose |
|---|---|---|
| `globalPath` | `$XDG_DATA_HOME/openmemory` | Global memory directory |
| `staleAgeDays` | 60 | Days before flagging as old |
| `injectOnFirstTurn` | true | Whether to inject context on session start |
| `maxInjectTokens` | 2000 | Rough token budget for injection block |

---

## Staleness Detection

`memory_check` runs three heuristics:

1. **Expiration.** An `expires` date in the past marks the memory as expired.
2. **Git-hash drift.** If the memory's `git-hash` differs from current HEAD, the referenced code may have changed. The memory is flagged, not auto-modified — the agent must verify.
3. **Age threshold.** Memories not updated in `staleAgeDays` (default 60) are flagged for review.

Archived memories are excluded from all checks.

---

## Research Basis

Before implementation, 11 existing OpenCode memory plugins were analyzed:

| Plugin | Storage | Architecture |
|---|---|---|
| opencode-openmemory | REST API (OpenMemory server) | External service + monolithic tool |
| open-mem | SQLite + FTS5 + sqlite-vec | Full stack: daemon, dashboard, 9 tools |
| opencode-mem | SQLite + USearch | Monolithic mode-based tool, vector index |
| codemem | SQLite + FTS5 + sqlite-vec | Plugin + MCP split |
| engram | SQLite + FTS5 (Go binary) | MCP-first, thin plugin wrapper |
| simple-memory | Logfmt files | Minimal, file-based only |
| opencode-memory | Git-tracked markdown | ripgrep + rag-cli, file-first |
| opencode-git-memory | Git notes | Conversation transcripts as git notes |
| opencode-session-recall | OpenCode's own SQLite DB | Read-only session history search |
| opencode-sessions | N/A (message relay) | Agent orchestration, not memory |
| context-mode | SQLite | Context window compression + sandbox routing |

Key patterns adopted: discrete named tools (open-mem), file-first storage (opencode-memory, simple-memory), companion skill (opencode-memory), progressive disclosure index (open-mem), session lifecycle awareness (engram).

Key patterns avoided: monolithic mode-based tools (opencode-openmemory, opencode-mem), external service dependency (opencode-openmemory), full memory dump on session start, no stale detection.

---

## Tradeoffs

**No vector search.** The filesystem is the database. Keyword matching on titles, tags, and body text covers the common cases without the complexity of embedding models. If the agent needs semantic search, it can read the files it already knows about and reason about relevance itself.

**No auto-extraction of memories.** The agent decides what to store via `memory_store`. There is no background process watching tool calls and extracting facts. This keeps the system simple and puts the agent in control, but it means the quality of memory depends on the SKILL.md guidance.

**No revision history.** Updates overwrite. Git history on the `.openmemory/` directory serves as a revision log if needed.

**No cross-project memory linking.** Each project's `.openmemory/` is independent. Global memory fills the cross-project role.

---

## Future

Dedup across scopes when overlapping memories exist (e.g., same preference in both project and global). Agent-auto-suggested memory extraction on session idle. Export/import for migration between memory plugins. Multi-project memory linking.
