# OpenMemory

Persistent memory for OpenCode agents. Your knowledge lives in plain Markdown files — you can read them, edit them, grep them, commit them. Three layers keep temporary scratchpad notes separate from lasting project knowledge. The agent does the busywork. You stay in control.

> Your agent starts every session with amnesia. You tell it about your stack, your conventions, your preferences. Next session, gone. You repeat yourself. It re-discovers the same things. This is wasteful, inconsistent, and frankly boring.

OpenMemory fixes that. It gives agents a filesystem-level memory they can read, write, and maintain across sessions — no databases, no servers, no Docker. Just `.md` files in `.openmemory/`.

---

## Design

There are a bunch of memory plugins already. They tend to fall into two camps.

The kitchen sink. SQLite databases, vector embeddings, web dashboards, daemon processes, REST APIs. Impressive engineering, but every layer is something that can break, drift, or slow you down. When your session ends mid-flight because the daemon crashed, you're back to amnesia.

The toy. A single JSON file with mode strings. Barely searchable. No staleness handling. The agent writes junk and it stays there forever.

OpenMemory sits between them. Storage is Markdown with YAML front matter — human-readable, git-friendly, trivial to inspect. Eight named tools instead of one `memory({ mode: "something" })` monolith. Stale memories get flagged by comparing git hashes, expiration dates, and age. Global writes require user permission. Session memories clean up after themselves.

The design principle: **the filesystem is the database**. No moving parts.

---

## Usage

You don't call the tools yourself. The agent does. But here's what a typical session looks like under the hood.

```
User: "Add rate limiting to the API"

Agent calls memory_search { query: "rate limiting api" }
  → Hits decisions.md: Redis is available, already in the stack

Agent calls memory_get { slug: "decisions", scope: "project" }
  → Reads full context: Redis config details, connection pattern

Agent implements rate limiting using Redis
  → Tests pass, code committed

Agent calls memory_store {
  slug: "api-rate-limiting",
  type: "context",
  scope: "project",
  tags: ["rate-limiting", "redis", "api"],
  content: "Implemented token bucket rate limiting..."
}
```

Three turns of the agent thinking ahead of you. It finds existing knowledge, uses it, then records what it did so the next session picks up where this one left off.

When a memory goes stale — a dependency upgrades, an API changes, you tell the agent to switch patterns — `memory_check` surfaces it. The agent marks it stale or updates it. Bad information doesn't linger.

Global memory requires your permission. "Remember that I always use TypeScript strict mode" — the agent asks, you approve, it gets stored. Every future session sees it.

---

## Memory Layers

```
~/.local/share/openmemory/       # global — cross-project, your preferences
    python-style.md
    how-to-write-vala.md

project/.openmemory/
    session/                     # session — scratchpad, dies with the tab
        ses_20260505_nasty-bug.md
    project/                     # project — stuff other sessions need
        why-we-ditched-grpc.md
        test-conventions.md
```

| Layer | Who manages it | When it dies |
|---|---|---|
| Session | Agent, autonomously | End of session |
| Project | Agent, autonomously | Never (until marked stale) |
| Global | You (agent assists on command) | Never |

The agent is smart about scope. It puts temporary debugging notes in session, architectural decisions in project, and only touches global when you explicitly say "remember that I prefer..."

---

## Memory format

Every memory is a Markdown file with YAML front matter. The agent sees the filename and front matter first and decides whether to read the body. No wasted tokens loading irrelevant context.

```markdown
---
title: Switched auth from JWT to session tokens
type: context
scope: project:backend
tags: [auth, security, redis]
created: 2026-05-01
updated: 2026-05-05
status: active
importance: 4
git-hash: 3f7c8a9b1d2e4f6a8b0c1d3e5f7a9b2c4d6e8f0a
---

JWT invalidation was getting out of hand. Moved to Redis-backed sessions
with express-session + connect-redis. Server-side revocation, no more
scattered refresh tokens.

Middleware: src/middleware/auth.ts
Config:     src/config/session.ts
```

The `git-hash` records the full commit SHA-1 at the time the memory was written. When HEAD moves past that commit, `memory_check` flags it — the content might have drifted.

### Fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | One-line summary |
| `type` | identity / directive / context / bookmark | Semantic category |
| `scope` | global / project:`<slug>` / session:`<id>` | Where it lives |
| `tags` | string[] | 1-5 lowercase keywords |
| `status` | active / stale / archived | Freshness indicator |
| `importance` | 1-5 | Retrieval priority, default 3 |
| `git-hash` | string (optional) | Full commit SHA-1 when written |
| `expires` | date (optional) | Auto-excluded after this date |

---

## Tools

| Tool | What it does |
|---|---|
| `memory_store` | Write a new memory (session/project/global) |
| `memory_get` | Read one by slug |
| `memory_search` | Full-text + tag search across scopes |
| `memory_list` | Table view of a scope |
| `memory_update` | Modify title, tags, body, status |
| `memory_delete` | Archive or wipe |
| `memory_scan` | Quick health overview |
| `memory_check` | Find stale/expired/drifted memories |

The design is **agent-agnostic**. **Any coding tool** that can read and write files can use this structure. OpenCode got the first plugin implementation; others are just a matter of wiring up the same eight tools to a different runtime.

A companion skill teaches the agent when to read and when to write. It learns to check memory before starting work and to save important discoveries after. You don't have to remind it.

---

## Compaction

When a session compacts, the agent gets a fresh system prompt. Without intervention, all its accumulated project knowledge evaporates.

OpenMemory hooks into the compaction lifecycle and injects a summary of active project memories plus any session discoveries. The compacted session wakes up knowing what the project looks like. This kind of detail is what separates "works in the demo" from "works at 4am when you're debugging a production incident."

---

## Installation

```json
{
  "plugin": ["@openmemory/opencode-plugin"],
  "permission": {
    "skill": { "openmemory": "allow" }
  }
}
```

That's it. Directories are created on first use. No config file required.

Optional tweaks if you want them:

```json
{
  "openmemory": {
    "globalPath": "~/.local/share/openmemory",
    "staleAgeDays": 60,
    "maxInjectTokens": 2000
  }
}
```

---

## Limitations

No vector search. No embeddings. No LLM-powered contradiction detection. No web dashboard.

These are fine ideas for version two. Version one gets the fundamentals right: reliable storage, accurate retrieval, automatic cleanup. Everything else is optimization.

---

## Development

```bash
git clone https://github.com/openmemory/opencode-plugin
cd opencode-plugin
bun install
bun test        # 56 tests, 7 suites
bun run build   # → dist/index.js
```

The full design document is in [`openmemory-design.md`](openmemory-design.md) — architecture rationale, research against 11 competing plugins, and verified API details.

---

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
