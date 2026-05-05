---
name: openmemory
description: >-
  Manage persistent memory across sessions. Store project decisions, user
  preferences, architectural notes, gotchas, and task state in Markdown files
  with YAML front matter. Use when starting new tasks, making decisions,
  discovering patterns, completing milestones, or needing context you forgot.
  Triggers: memory, remember, recall, context, project state, preferences,
  decisions, conventions, gotchas, tech stack, architecture, save memory,
  search memory, check memory.
license: GPL-3.0-or-later
compatibility: opencode
metadata:
  category: memory
  audience: agent
  workflow: persistent-memory
---

# OpenMemory — Agent Memory Protocol

You have persistent memory across sessions via the `memory_*` tools. Memory is stored as Markdown files with YAML front matter in `.openmemory/` (project) and `~/.local/share/openmemory/` (global).

The system prompt for each session already lists active project memories and any global directives or preferences. Use the tools below when you need more detail or to record new information.

## Core Rules

These override everything else. Follow them without exception.

**Never store secrets.** No API keys, tokens, or credentials in memory. Use environment variables.

**Read before you write.** Check what's already in memory before adding anything. Duplicates are noise, not signal.

**Don't silently overwrite.** When you find information that contradicts a memory, do not just replace it. Mark the old one stale, create a new one with corrections, and tell the user. Paper trail matters.

**Browse before you grep.** Use `memory_list` to see available files and their metadata first. Use `memory_search` only when you have a specific keyword to grep for. Don't guess what keywords might match before you've seen the file list.

**Global is user-gated.** Write to `scope:"global"` only when the user explicitly asks. The tool will prompt for permission.

## Finding Existing Memories

The system prompt already lists active memories. When you need to dig deeper:

1. `memory_list scope:"project"` — see all project memories with titles, types, and tags. No file bodies are read.
2. Read the files whose titles or tags match the current task with `memory_get`.
3. Use `memory_search` only when you know a specific term to grep for.

If the metadata from `memory_list` isn't enough to decide, call `memory_get` on multiple candidates. Reading a few extra files costs almost nothing compared to missing critical context. Don't try to guess content from titles alone.

Check global memory when you need user preferences (code style, communication, tooling) or starting a new project similar to previous ones.

## Writing Memories

A memory records **what matters and why** — not every step of how you got there.

### When to save

**Project memory** — architectural decisions, conventions, gotchas, tech stack details, completed milestones. Use `type:"context"`.

**Session memory** — temporary notes for the current task. Intermediate debugging results, partial findings, things that won't matter after this session.

**Global memory** — user preferences ("Remember that I prefer..."). Only on explicit user request. Use `type:"identity"` for preferences, `type:"directive"` for behavioral guardrails.

### How to write

The title and tags should make the topic obvious at a glance. The body is for substance that the front matter can't carry — usually a few paragraphs of conclusion plus rationale.

Good:

```
JWT invalidation was getting out of hand. Moved to Redis-backed sessions
with express-session + connect-redis. Server-side revocation, no more
scattered refresh tokens.

Middleware: src/middleware/auth.ts
Config:     src/config/session.ts
```

Bad: step-by-step implementation logs, conversation transcripts, debugging traces. Future agents need the conclusion, not the journey.

**One memory, one topic.** If you find yourself writing about two unrelated things, split them into separate files.

**Rewrite, don't append.** When updating a memory, rewrite the body to reflect current state. Don't stack new paragraphs on old ones. If history matters, link the stale version with `related`.

## Handling Conflicts

When you discover information that contradicts an existing memory:

1. Read the existing memory in full with `memory_get`. Confirm the contradiction is real.
2. Mark it stale with `memory_update status:"stale"`. Add a line to its body explaining what changed and why.
3. Create a new memory with the corrected information. Link it to the old one with `related`.
4. Tell the user: "Found outdated memory X. Marked stale and created replacement."

## Updating and Maintenance

- Mark as stale when you suspect a memory is outdated. Verify before marking.
- Archive (don't delete) when old info is fully superseded: `memory_delete mode:"archive"`.
- Call `memory_check` at the start of long sessions to find expired or drifted memories.
- Call `memory_scan` periodically for a health overview.
- Promote session discoveries to project memory before the session ends if they have lasting value.

## Example

```
User: "Add rate limiting to the API"

Agent: memory_list scope:"project"
  → Table shows: decisions, architecture, testing-conventions, gotchas

Agent: memory_get slug:"decisions" scope:"project"
  → Reads full context. Discovers Redis is already in the stack.

Agent: memory_search query:"rate limit" scope:"project"
  → Quick grep, nothing found. Proceeds with implementation.

Agent implements rate limiting using Redis.

Agent: memory_store slug:"api-rate-limiting" type:"context" scope:"project"
  tags=["rate-limiting", "redis", "api"]
  content="Token bucket rate limiting via Redis..."
```

Browse the list, read what looks relevant, grep when you know what to search for.

## Reference

### Tools

| Tool | Key parameters |
|---|---|
| `memory_store` | `slug`, `title`, `type`, `scope`, `tags`, `content`, `importance?`, `related?`, `entities?` |
| `memory_get` | `slug`, `scope` |
| `memory_search` | `query?`, `scope?`, `tags?`, `type?`, `status?`, `limit?` |
| `memory_list` | `scope`, `status?` |
| `memory_update` | `slug`, `scope`, `title?`, `tags?`, `content?`, `status?`, `importance?`, `expires?` |
| `memory_delete` | `slug`, `scope`, `mode` (`archive` or `delete`) |
| `memory_scan` | (no args — returns cross-scope overview) |
| `memory_check` | `scope?` (default: all) |

### Memory Scopes

| Scope | Path | Use For |
|---|---|---|
| `session` | `.openmemory/session/<id>/` | Temporary notes for current task |
| `project` | `.openmemory/project/` | Project knowledge that spans sessions |
| `global` | `~/.local/share/openmemory/` | Cross-project preferences |

### File Naming

- kebab-case slugs: `auth-architecture`, `testing-conventions`
- Session files are stored under `.openmemory/session/<sessionID>/` — use concise descriptive slugs
- 2-5 words

### Front Matter Fields

| Field | Values | Notes |
|---|---|---|
| `title` | string | One-line summary |
| `type` | identity / directive / context / bookmark | Semantic category |
| `scope` | session / project / global | Tool args use bare values; stored as `project:<slug>` or `session:<id>` |
| `tags` | string[] | 1-5 lowercase keywords |
| `created` | date | ISO 8601 when the memory was created |
| `updated` | date | ISO 8601 when last modified |
| `status` | active / stale / archived | Freshness |
| `source` | user / agent / system | Who created it (default: agent) |
| `importance` | 1-5 | Retrieval priority (default 3) |
| `git-hash` | string (optional) | Full commit SHA-1 when written |
| `expires` | date (optional) | Auto-excluded after this date |
| `related` | string[] (optional) | Linked memory slugs |
| `entities` | string[] (optional) | Libraries, services mentioned |
