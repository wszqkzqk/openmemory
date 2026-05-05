# OpenMemory — Design Document

**Status:** Draft
**Version:** 1.0.0
**Date:** 2026-05-05

---

## Table of Contents

1. [Overview & Motivation](#1-overview--motivation)
2. [Three-Layer Memory Architecture](#2-three-layer-memory-architecture)
3. [Storage Format: Markdown + YAML Front Matter](#3-storage-format-markdown--yaml-front-matter)
4. [Plugin Architecture & Source Tree](#4-plugin-architecture--source-tree)
5. [Tool Definitions (Discrete Named Tools)](#5-tool-definitions-discrete-named-tools)
6. [Hook Strategy & Context Injection](#6-hook-strategy--context-injection)
7. [Auto-Maintenance & Memory Lifecycle](#7-auto-maintenance--memory-lifecycle)
8. [Companion Skill (SKILL.md)](#8-companion-skill-skillmd)
9. [Installation & Configuration](#9-installation--configuration)
10. [Known Limitations & Future Roadmap](#10-known-limitations--future-roadmap)
11. [Appendix: Research Basis & References](#11-appendix-research-basis--references)

---

## 1. Overview & Motivation

### Problem

OpenCode agents operate statelessly across sessions. Every new session starts from zero context beyond what the user provides. Agents re-discover project structure, re-learn user preferences, re-trace decisions from scratch. This wastes tokens, produces inconsistent results, and creates user frustration.

### Solution

OpenMemory is a file-based, LLM-managed, three-tier persistent memory system for OpenCode. Memory is stored as plain Markdown files with YAML Front Matter — human-readable, git-friendly, and semantically scannable by LLMs before loading full content.

### Key Principles

| Principle | Implementation |
|-----------|---------------|
| **File-first** | Markdown files with YAML front matter. No external database or server required. |
| **Progressive disclosure** | Agent reads compact filename + front matter first, loads body on demand. |
| **LLM-automated** | Agent autonomously creates, updates, and invalidates session/project memories. |
| **User-authority for global** | Global memories require user approval (or explicit user-triggered commands). |
| **Accuracy over volume** | Stale detection, contradiction flagging, and revision tracking prevent misinformation. |
| **XDG-compliant** | Global memory at `$XDG_DATA_HOME/openmemory/`; project memory at `.openmemory/`. |

### What Makes This Different from Existing Plugins

| Gap in existing plugins | How OpenMemory addresses it |
|--------------------------|----------------------------|
| Monolithic mode-based tools (`memory({mode:"search"})`) | Discrete named tools (`memory_store`, `memory_search`, etc.) |
| Full memory dump on session start (wastes tokens) | Progressive disclosure index |
| Single scope (user vs project) | Three layers: session / project / global |
| No stale detection | `git-hash` comparison + `expires` field + age-based review cues |
| No human review path | Global memory requires user permission; human-triggered commands for all layers |
| No YAML front matter in files | Full YAML front matter schema for metadata-driven retrieval |
| No compaction-aware summarization | `experimental.session.compacting` hook preserves memory into compaction context |
| External service dependency (OpenMemory server, SQLite) | Zero dependencies — plain filesystem |

---

## 2. Three-Layer Memory Architecture

```
$XDG_DATA_HOME/openmemory/          ← Global memory
    ├── coding-preferences.md
    ├── go-to-python-migration.md
    └── ...

<project-root>/.openmemory/
    ├── session/                     ← Session memory (current session only)
    │   └── ses_20260505_debug-refactoring.md
    ├── project/                     ← Project memory (all sessions in this project)
    │   ├── architecture.md
    │   ├── testing-conventions.md
    │   ├── decisions.md
    │   ├── gotchas.md
    │   └── tech-stack.md
    └── index.md                     ← Compact memory index for quick scanning
```

### Layer 1: Session Memory (`<project>/.openmemory/session/`)

| Property | Value |
|----------|-------|
| **Scope** | Current session only |
| **Lifetime** | Tied to the active session; cleaned up on session end or compaction |
| **Manager** | LLM (autonomous) |
| **Purpose** | Temporary notes relevant only to the in-progress task — intermediate findings, partial conclusions, active exploration paths |

**When to use:**
- The LLM discovers something that helps the *current task* but has no lasting project-wide value.
- Example: "The memory leak only reproduces when NODE_ENV=production and worker count >= 4."
- Example: "Skipping tests in `auth/` directory because we're refactoring those next."

**When NOT to use:**
- If the information matters for future sessions → use project memory.
- If it's user preferences or cross-project knowledge → use global memory.

**Cleanup behavior:**
- On compaction: session memories become part of the compaction summary (preserved in condensed form).
- On session end: `.openmemory/session/` directory is cleaned up; a summary may be promoted to project memory.
- Implementation note: Session-level reads/writes are lightweight; if the session layer cannot be reliably scoped (e.g., `session.created` not firing), this layer collapses into project memory with a session-id-scoped filename.

### Layer 2: Project Memory (`<project>/.openmemory/project/`)

| Property | Value |
|----------|-------|
| **Scope** | All sessions within this project (by worktree root) |
| **Lifetime** | Persists across sessions; inspected periodically for staleness |
| **Manager** | LLM (autonomous) |
| **Purpose** | Project-specific knowledge that agents need across sessions — architecture decisions, tech stack details, conventions, gotchas, patterns |

**When to use:**
- Making an architectural decision → `decisions.md`
- Discovering a project-specific footgun → `gotchas.md`
- Learning the tech stack details → `tech-stack.md`
- Establishing testing conventions → `testing-conventions.md`
- Completing a milestone → update `state.md`

**When NOT to use:**
- User preferences that apply across projects → global memory.
- Session-specific temporary notes → session memory.
- Secrets or API keys → never store in memory; use environment variables.

### Layer 3: Global Memory (`$XDG_DATA_HOME/openmemory/`)

| Property | Value |
|----------|-------|
| **Scope** | All projects, all sessions (cross-project, cross-machine) |
| **Lifetime** | Indefinite; reviewed on use |
| **Manager** | User (with LLM assistance on explicit user instruction) |
| **Purpose** | User identity, cross-project preferences, reusable domain knowledge |

**When to use:**
- User explicitly requests: "Remember that I prefer TypeScript strict mode."
- User runs explicit command: `/memory-save-global`
- LLM suggests saving to global memory but requires user permission.

**When NOT to use:**
- Project-specific knowledge (use project memory).
- LLM should NOT autonomously write to global memory.
- Anything that changes per-project.

**Permission model:**
- Plugin uses `context.ask()` for global memory write operations.
- The `identity` type memories (user preferences) are injected into every session's context.
- The `directive` type memories act as behavioral guardrails for the agent.

---

## 3. Storage Format: Markdown + YAML Front Matter

### File Naming Convention

```
<project>/.openmemory/project/architecture.md
<project>/.openmemory/project/testing-conventions.md
<project>/.openmemory/session/ses_20260505T143000_refactoring-auth.md
$XDG_DATA_HOME/openmemory/coding-style-preferences.md
```

- **kebab-case** for filename slugs.
- **Concise, topic-descriptive** names — the filename itself is the first retrieval signal.
- Session files prefixed with session ID + ISO 8601 timestamp.
- No spaces, no special characters beyond hyphens and underscores.

### YAML Front Matter Schema

Every memory file begins with YAML Front Matter delimited by `---`.

#### Required Fields

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `title` | `string` | `"Testing conventions"` | One-line summary; doubles as display title |
| `type` | `enum` | `context` | Semantic category (see table below) |
| `scope` | `enum` | `project:backend-api` | `global`, `project:<slug>`, or `session:<id>` |
| `tags` | `string[]` | `[testing, jest, ci]` | 1–5 lowercase retrieval keywords |
| `created` | `date` | `2026-05-05` | ISO 8601 date of creation |
| `updated` | `date` | `2026-05-05T14:30:00Z` | ISO 8601 timestamp of last significant change |

#### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `enum` | `active` | `active`, `stale`, or `archived` |
| `expires` | `date` | — | ISO 8601 date after which memory should be excluded |
| `source` | `enum` | `agent` | `user` (explicit), `agent` (auto-extracted), `system` (bootstrapped) |
| `importance` | `int` | `3` | 1 (low) to 5 (critical) — guides retrieval priority |
| `git-hash` | `string` | — | Git commit hash when memory was created/updated (8+ chars) |
| `related` | `string[]` | — | Array of related memory file slugs for bidirectional linking |
| `entities` | `string[]` | — | Named entities mentioned (libraries, services, repositories) |

#### Controlled Vocabularies

```yaml
type:
  identity   — User profile, preferences, communication style
  directive  — Behavioral guidance, guardrails, correction rules
  context    — Project state, decisions, timeline, architecture
  bookmark   — External resource pointers (URLs, dashboards, docs)

status:
  active    — Currently trusted and used
  stale     — Suspected outdated; needs review before use
  archived  — Superseded or no longer relevant; excluded from injection

source:
  user      — Explicitly saved by user or via user-triggered command
  agent     — Auto-extracted by LLM during session
  system    — Bootstrapped by init scan

scope:
  global           — Cross-project memory in XDG_DATA_HOME
  project:<slug>   — Project-scoped memory (slug = project dir name)
  session:<id>     — Session-scoped memory (id = OpenCode session ID)
```

### Example Memory Files

#### Example: Project Context (Architecture Decision)

```yaml
---
title: Switched auth from JWT to session tokens
type: context
scope: project:backend-api
tags: [auth, security, architecture, jwt, sessions]
created: 2026-04-20
updated: 2026-05-01
status: active
source: agent
importance: 4
git-hash: a1b2c3d4
entities: [Redis, express-session, passport.js]
related: [api-rate-limiting, redis-caching]
---

Decision: Replaced JWT-based auth with Redis-backed session tokens (express-session + connect-redis).

Reasoning:
- JWT invalidation is complex and inconsistent
- Sessions allow server-side revocation
- Redis already in stack for caching

Implementation:
- Auth middleware: `src/middleware/auth.ts`
- Session config: `src/config/session.ts`
- Migration ran April 20, 2026
- All `/api/auth/*` endpoints updated
- Client-side: token cookie `sid` (httpOnly, secure, sameSite=lax)
```

#### Example: Global User Preference

```yaml
---
title: TypeScript strict mode preference
type: identity
scope: global
tags: [typescript, preferences, code-style]
created: 2026-03-10
updated: 2026-03-10
status: active
source: user
importance: 5
---

Always use TypeScript `strict: true` in tsconfig.json for all new projects.
Prefer explicit types on function signatures; use inferred types for variables.
Avoid `any` — use `unknown` with type guards instead.
```

#### Example: Project Gotcha

```yaml
---
title: CI fails on ARM runners — increased timeout
type: context
scope: project:backend-api
tags: [ci, workaround, timeout, arm]
created: 2026-04-15
updated: 2026-04-15
status: stale
expires: 2026-06-01
source: agent
importance: 2
git-hash: h8i9j0k1
---

Temporary workaround: CI jobs timeout on ARM runners.
Increased timeout from 10min to 30min in `.github/workflows/ci.yml`.
Remove this workaround once ARM runner pool is upgraded (ETA June 2026).
```

### Memory Index (`index.md`)

The plugin maintains `index.md` in each memory scope directory for quick scanning:

```markdown
# Project Memory Index — `backend-api`
Last updated: 2026-05-05T15:00:00Z

## active (8)

| File | Type | Tags | Updated |
|------|------|------|---------|
| architecture.md | context | [architecture, design] | 2026-05-01 |
| testing-conventions.md | context | [testing, jest, ci] | 2026-04-28 |
| gotchas.md | context | [gotchas, debugging] | 2026-04-25 |
| tech-stack.md | context | [tech-stack, dependencies] | 2026-04-20 |
| decisions.md | context | [decisions] | 2026-05-05 |
| ... | | | |

## stale (2)

| File | Type | Tags | Updated | Expires |
|------|------|------|---------|---------|
| ci-timeout-workaround.md | context | [ci, workaround] | 2026-04-15 | 2026-06-01 |
| old-api-endpoint.md | context | [api, deprecated] | 2026-03-01 | 2026-05-01 |

## archived (3)

| File | Type | Tags | Updated |
|------|------|------|---------|
| node-14-migration.md | context | [migration, legacy] | 2025-12-01 |
| ... | | | |
```

The index is regenerated on writes; the agent reads it first to decide which files to load.

---

## 4. Plugin Architecture & Source Tree

### Delivery as NPM Package

The plugin is published as `@openmemory/opencode-plugin` on npm.

### Source Tree

```
opencode-openmemory/
├── package.json                        # npm metadata + @opencode-ai/plugin dependency
├── tsconfig.json                       # TypeScript config
├── README.md
├── src/
│   ├── index.ts                        # Plugin entry point — returns Hooks
│   ├── config.ts                       # Plugin configuration (Zod schema + defaults)
│   ├── storage.ts                      # Filesystem I/O — read/write memory files + index
│   ├── frontmatter.ts                  # YAML front matter parse/generate
│   ├── indexer.ts                      # Memory index generation
│   ├── search.ts                       # File scanning, tag filtering, keyword search
│   ├── staleness.ts                    # Stale detection (git-hash comparison, age check)
│   ├── injection.ts                    # Context injection logic for system prompt
│   ├── compaction.ts                   # Compaction hook — preserve session memory
│   └── tools/
│       ├── memory-store.ts             # memory_store tool
│       ├── memory-get.ts               # memory_get tool
│       ├── memory-search.ts            # memory_search tool
│       ├── memory-list.ts              # memory_list tool
│       ├── memory-update.ts            # memory_update tool
│       ├── memory-delete.ts            # memory_delete tool
│       ├── memory-check.ts             # memory_check (staleness) tool
│       └── memory-scan.ts              # memory_scan (overview) tool
├── skills/
│   └── openmemory/
│       └── SKILL.md                    # Companion skill — teaches agent memory workflow
├── install.js                           # Install script: copies plugin + skill to .opencode/
└── test/
    ├── storage.test.ts
    ├── frontmatter.test.ts
    ├── search.test.ts
    ├── staleness.test.ts
    └── tools/
        └── memory-store.test.ts
```

### Dependencies

```json
{
  "name": "@openmemory/opencode-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun",
    "test": "bun test"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.3.3",
    "yaml": "^2.6.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

Minimal external dependencies: `@opencode-ai/plugin` (mandatory for plugin SDK), `yaml` (for front matter parsing), `zod` (if not reusing `tool.schema`). All file I/O uses `Bun.file()` and `Bun.write()` (zero extra deps).

---

## 5. Tool Definitions (Discrete Named Tools)

All tools are registered via the plugin's `tool` key. Each tool has its own name, schema, and execute function — no monolithic mode-based tool.

### `memory_store`

Save a new memory file or overwrite an existing one.

```typescript
tool({
  description: "Save a memory to the filesystem. Creates or overwrites a Markdown file with YAML front matter. Use this when you discover information worth keeping across sessions.",
  args: {
    slug: tool.schema.string().describe("File slug (kebab-case, e.g. 'auth-architecture')"),
    title: tool.schema.string().describe("One-line title for the memory"),
    type: tool.schema.enum(["identity", "directive", "context", "bookmark"]).describe("Memory type"),
    scope: tool.schema.enum(["session", "project", "global"]).describe("Memory scope — session=current session only, project=this project, global=cross-project (requires user permission)"),
    tags: tool.schema.array(tool.schema.string()).describe("1-5 lowercase tags for categorization and retrieval"),
    content: tool.schema.string().describe("Memory body content in Markdown format. Include context, decisions, reasoning, file references, and any relevant details."),
    importance: tool.schema.number().min(1).max(5).optional().describe("Priority 1-5 (default 3). Higher values surface first in search and injection."),
    related: tool.schema.array(tool.schema.string()).optional().describe("Slugs of related memory files for bidirectional linking"),
    entities: tool.schema.array(tool.schema.string()).optional().describe("Named entities mentioned (libraries, services, etc.)"),
  },
  async execute(args, context) {
    // Validate scope permissions
    if (args.scope === "global") {
      await context.ask({
        permission: "openmemory_global_write",
        patterns: [args.slug],
        always: [],
        metadata: { title: args.title, scope: "global" },
      });
    }
    // Try to get current git hash
    const gitHash = await getCurrentGitHash(context.worktree);
    // Build YAML front matter + body
    const fileContent = buildMemoryFile({ ...args, gitHash });
    // Write to appropriate path
    const dirPath = resolveMemoryPath(args.scope, context);
    await ensureDir(dirPath);
    await Bun.write(`${dirPath}/${args.slug}.md`, fileContent);
    // Regenerate index
    await regenerateIndex(dirPath);
    return `Memory saved: ${args.scope}/${args.slug}.md (${args.type}, importance: ${args.importance ?? 3})`;
  },
})
```

### `memory_get`

Read a memory file by slug and scope.

```typescript
tool({
  description: "Read a specific memory file by its slug. Returns the full content including YAML front matter and body. Use this to recall project context before starting work.",
  args: {
    slug: tool.schema.string().describe("Memory file slug (without .md extension)"),
    scope: tool.schema.enum(["session", "project", "global"]).describe("Scope of the memory"),
  },
  async execute(args, context) {
    const dirPath = resolveMemoryPath(args.scope, context);
    const filePath = `${dirPath}/${args.slug}.md`;
    if (!await exists(filePath)) {
      return `Memory not found: ${args.scope}/${args.slug}.md. Use memory_search or memory_list to find available memories.`;
    }
    const content = await Bun.file(filePath).text();
    return content;
  },
})
```

### `memory_search`

Search memories by keyword, tags, scope, or type.

```typescript
tool({
  description: "Search memory files by keyword, tags, scope, or type. Returns matching file paths with front matter summaries. Use this to find relevant memories before starting work on a topic.",
  args: {
    query: tool.schema.string().optional().describe("Keyword search query. Searches title, tags, and body content."),
    scope: tool.schema.enum(["session", "project", "global"]).optional().describe("Limit search to a specific scope (default: project + global)"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Filter by one or more tags"),
    type: tool.schema.enum(["identity", "directive", "context", "bookmark"]).optional().describe("Filter by memory type"),
    status: tool.schema.enum(["active", "stale", "archived"]).optional().describe("Filter by status (default: active only)"),
    limit: tool.schema.number().min(1).max(20).optional().describe("Maximum results (default 10)"),
  },
  async execute(args, context) {
    const results = await searchMemories(args, context);
    if (results.length === 0) return "No matching memories found.";
    // Return compact: filename + front matter summary (not full body)
    return results.map(r => formatMemorySummary(r)).join("\n\n---\n\n");
  },
})
```

### `memory_list`

List all memories in a scope with a compact table.

```typescript
tool({
  description: "List all memory files in a scope. Returns a compact table with slug, title, type, tags, and status. Use this for a quick overview of what's available.",
  args: {
    scope: tool.schema.enum(["session", "project", "global"]).describe("Scope to list"),
    status: tool.schema.enum(["active", "stale", "archived"]).optional().describe("Filter by status (default: active)"),
  },
  async execute(args, context) {
    const dirPath = resolveMemoryPath(args.scope, context);
    const index = await readIndex(dirPath);
    return formatMemoryList(index, args.status);
  },
})
```

### `memory_update`

Update an existing memory's content, metadata, or status.

```typescript
tool({
  description: "Update an existing memory file. Modify the body content, change metadata fields, or mark as stale/archived. Use this when you find a memory is outdated or needs refinement. Always verify the correction before updating.",
  args: {
    slug: tool.schema.string().describe("Memory file slug to update"),
    scope: tool.schema.enum(["session", "project", "global"]).describe("Scope of the memory"),
    title: tool.schema.string().optional().describe("New title"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("New tags (replaces existing)"),
    content: tool.schema.string().optional().describe("New body content (replaces existing)"),
    status: tool.schema.enum(["active", "stale", "archived"]).optional().describe("Change status"),
    importance: tool.schema.number().min(1).max(5).optional().describe("Change importance level"),
    expires: tool.schema.string().optional().describe("Set expiration date (ISO 8601, e.g. '2026-06-01')"),
  },
  async execute(args, context) {
    const dirPath = resolveMemoryPath(args.scope, context);
    const filePath = `${dirPath}/${args.slug}.md`;
    if (!await exists(filePath)) {
      return `Memory not found: ${args.scope}/${args.slug}.md`;
    }
    // Read existing, merge changes, update `updated` timestamp, regenerate
    const updated = await updateMemoryFile(filePath, args, context.worktree);
    await regenerateIndex(dirPath);
    return `Memory updated: ${args.scope}/${args.slug}.md\nChanges applied: ${Object.keys(args).filter(k => k !== 'slug' && k !== 'scope' && args[k] !== undefined).join(', ')}`;
  },
})
```

### `memory_delete`

Remove or archive a memory.

```typescript
tool({
  description: "Delete or archive a memory file. Use `mode: 'archive'` to keep the file but exclude from active results (recommended). Use `mode: 'delete'` to permanently remove. Always verify the memory is truly obsolete before deleting.",
  args: {
    slug: tool.schema.string().describe("Memory file slug to remove"),
    scope: tool.schema.enum(["session", "project", "global"]).describe("Scope of the memory"),
    mode: tool.schema.enum(["archive", "delete"]).describe("'archive' marks as archived (reversible), 'delete' permanently removes"),
  },
  async execute(args, context) {
    if (args.scope === "global") {
      await context.ask({
        permission: "openmemory_global_delete",
        patterns: [args.slug],
        always: [],
        metadata: { title: args.slug, scope: "global", mode: args.mode },
      });
    }
    const dirPath = resolveMemoryPath(args.scope, context);
    if (args.mode === "archive") {
      await markArchived(dirPath, args.slug);
    } else {
      await removeFile(dirPath, args.slug);
    }
    await regenerateIndex(dirPath);
    return `Memory ${args.mode}d: ${args.scope}/${args.slug}.md`;
  },
})
```

### `memory_scan`

Quick overview of all memories across scopes.

```typescript
tool({
  description: "Scan all memory scopes for a quick overview. Returns counts by scope and status, plus top-level index. Use this at the start of a session or when assessing memory health.",
  args: {},
  async execute(_args, context) {
    const scopes = ["session", "project", "global"];
    const results = [];
    for (const scope of scopes) {
      const dirPath = resolveMemoryPath(scope, context);
      if (!await exists(dirPath)) {
        results.push(`**${scope}**: No memories`);
        continue;
      }
      const index = await readIndex(dirPath);
      results.push(formatScopeOverview(scope, index));
    }
    return results.join("\n\n");
  },
})
```

### `memory_check`

Check for stale or potentially outdated memories.

```typescript
tool({
  description: "Check memories for staleness. Compares git-hash against HEAD, checks expiration dates, and flags memories that haven't been updated in a long time. Use this periodically to maintain memory accuracy. Always verify before updating or deleting.",
  args: {
    scope: tool.schema.enum(["session", "project", "global"]).optional().describe("Scope to check (default: all)"),
  },
  async execute(args, context) {
    const results = await checkStaleness(args.scope, context);
    if (results.length === 0) return "All memories appear current. No staleness issues detected.";
    return "## Stale/Outdated Memories\n\n" + results.map(r => formatStaleWarning(r)).join("\n\n");
  },
})
```

---

## 6. Hook Strategy & Context Injection

### Hook Registration (in `src/index.ts`)

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin";
import { storeTool } from "./tools/memory-store";
// ... other imports

export const OpenMemoryPlugin: Plugin = async (ctx) => {
  const config = loadConfig(ctx);
  const state = { sessionFirstTurnDone: false, projectMemoryIndex: null };

  return {
    // --- Tools ---
    tool: {
      memory_store: storeTool(config),
      memory_get: getTool(config),
      memory_search: searchTool(config),
      memory_list: listTool(config),
      memory_update: updateTool(config),
      memory_delete: deleteTool(config),
      memory_scan: scanTool(config),
      memory_check: checkTool(config),
    },

    // --- Lifecycle hooks ---
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        // On session idle: suggest memory extraction
        await suggestMemories(ctx, config);
      }
    },

    "experimental.chat.system.transform": async (input, output) => {
      // Inject relevant memories into system prompt
      await injectMemoriesIntoSystem(input, output, config, ctx, state);
    },

    "experimental.session.compacting": async (input, output) => {
      // Preserve session memory into compaction context
      await injectMemoriesForCompaction(input, output, ctx, config);
    },

    "tool.execute.after": async (input, output) => {
      // Track tool usage for context awareness
      trackToolUsage(input, ctx);
    },
  };
};
```

### Context Injection Strategy

The plugin uses **progressive disclosure** — inject a compact index first, let the agent load full content on demand.

#### Phase 1: First Turn Injection (via `experimental.chat.system.transform`)

On the first turn of every session, inject into the system prompt:

```
## OpenMemory — Persistent Context

### Project Memory (`.openmemory/project/`)
| File | Title | Tags | Updated |
|------|-------|------|---------|
| architecture.md | Microservices boundaries | [architecture, services] | 2026-05-01 |
| testing-conventions.md | Jest + Supertest pattern | [testing, jest, ci] | 2026-04-28 |
| gotchas.md | Known issues and workarounds | [gotchas, debugging] | 2026-04-25 |

### Global Memory (User Preferences)
- TypeScript strict mode preferred | [typescript, code-style] | active
- Use async/await over raw promises | [javascript, patterns] | active

**Protocol**: Use `memory_search` to find relevant context before starting work.
Use `memory_store` to save important discoveries. Use `memory_check` to verify staleness.
```

Implementation: merge into the first `output.system` entry to avoid multiple system messages.

```typescript
async function injectMemoriesIntoSystem(input, output, config, ctx, state) {
  // Guard: only inject on first turn
  if (state.sessionFirstTurnDone) return;
  state.sessionFirstTurnDone = true;

  // Build compact project memory index
  const projectIndex = await loadProjectMemoryIndex(ctx.directory);
  // Build compact global identity/directive index
  const globalIdentity = await loadGlobalIdentityMemories(config.globalPath);

  const contextBlock = buildContextBlock(projectIndex, globalIdentity);

  // Merge into existing system prompt (don't push new entry)
  if (output.system.length > 0) {
    output.system[0] += `\n\n${contextBlock}`;
  } else {
    output.system.push(contextBlock);
  }
}
```

#### Phase 2: On-Demand Retrieval (via tools)

After the first turn, the agent uses `memory_search`, `memory_get`, and `memory_list` to load full memory content as needed. No further automatic injection happens.

#### Phase 3: Compaction Preservation (via `experimental.session.compacting`)

When compaction occurs, inject the current memory state into the compaction prompt so the new session retains project context:

```typescript
async function injectMemoriesForCompaction(input, output, ctx, config) {
  const projectIndex = await loadProjectMemoryIndex(ctx.directory);
  if (projectIndex) {
    output.context.push(`## OpenMemory — Current Project Context\n${formatIndexForCompaction(projectIndex)}`);
  }
  // Also include any pending session memories
  const sessionMemories = await loadSessionMemories(ctx.directory);
  if (sessionMemories.length > 0) {
    output.context.push(`## Session Discoveries\n${sessionMemories.map(m => `- ${m.title}`).join('\n')}`);
  }
}
```

#### Phase 4: Idle-Time Analysis (via `event.session.idle`)

When the session becomes idle, the plugin can suggest memories worth saving:

```typescript
async function suggestMemories(ctx, config) {
  // Analyze the session for important discoveries, decisions, patterns
  // This is a lightweight operation — just flag, don't force
  // The flag is picked up on next turn via system prompt injection
  // (Implementation detail: store suggestion in a session state file)
}
```

Note: `event` handlers are fire-and-forget (not awaited by the runtime). Long-running analysis should be offloaded or use the compaction hook instead.

---

## 7. Auto-Maintenance & Memory Lifecycle

### Staleness Detection

`memory_check` performs the following checks:

1. **Git hash drift**: If a memory's `git-hash` no longer matches HEAD, and the memory references specific files, flag it for review.
2. **Expiration**: If `expires` date has passed, flag as `stale` automatically.
3. **Age-based review**: Memories not updated in 60+ days are flagged for review.
4. **Contradiction detection** (future): Compare new memories against existing ones with similar tags; flag potential contradictions.

### Cleanup Protocol for Session Memory

On session end or compaction:
1. Read all files in `.openmemory/session/`.
2. Extract a compact summary (1-2 lines per file).
3. Inject this summary into the compaction context.
4. If `auto-promote` is enabled: compare session memories against project memories; if a session memory covers a topic NOT in project memory, suggest promotion.
5. Remove the `.openmemory/session/` directory contents.

### Memory Revision vs Overwrite

- `memory_store` with an existing slug **overwrites** (updates `updated` timestamp, preserves `created`).
- `memory_update` allows partial mutation of existing memories.
- Deleted memories use `archive` mode by default (soft delete); explicit `delete` mode for permanent removal.
- No immutable revision lineage (unlike open-mem) — simplicity over complexity. Git history on the `.openmemory/` directory serves as revision tracking if needed.

### User-Triggered Operations

Users can manually trigger any layer of memory management:

```bash
# In OpenCode TUI or via slash commands:
/memory-save project architecture.md      # Save a project memory
/memory-save global coding-style.md       # Save a global memory
/memory-review                            # Review stale memories
/memory-check                             # Run staleness check
/memory-cleanup                           # Clean session memories
```

These are implemented as OpenCode custom commands (`.opencode/commands/`).

---

## 8. Companion Skill (SKILL.md)

### Location: `skills/openmemory/SKILL.md`

```markdown
---
name: openmemory
description: >-
  Manage persistent memory across sessions. Store project decisions, user
  preferences, architectural notes, gotchas, and task state in Markdown files
  with YAML front matter. Use when starting new tasks, making decisions,
  discovering patterns, completing milestones, or needing context you forgot.
  Triggers: memory, remember, recall, context, project state, preferences,
  decisions, conventions, gotchas, tech stack.
license: MIT
compatibility: opencode
metadata:
  category: memory
  audience: agent
  workflow: persistent-memory
---

# OpenMemory — Agent Memory Protocol

You have persistent memory across sessions via the `memory_*` tools. Memory is stored as Markdown files with YAML front matter in `.openmemory/` (project) and `~/.local/share/openmemory/` (global).

## Memory Scopes

| Scope | Path | Use For |
|-------|------|---------|
| `session` | `.openmemory/session/` | Temporary notes for current task only |
| `project` | `.openmemory/project/` | Project-specific knowledge that spans sessions |
| `global` | `~/.local/share/openmemory/` | User preferences and cross-project knowledge |

## When to Read Memory

**Always check project memory before starting work:**
1. Call `memory_scan` for a quick overview of all scopes.
2. Call `memory_search` with keywords relevant to the current task.
3. Call `memory_get` to load full content of relevant files.

**Check global memory when:**
- You need to know user preferences (code style, communication, tools).
- Starting a new project the user has worked on similar things.

## When to Write Memory

**Write to PROJECT memory when you discover or decide:**
- An architectural decision with rationale → `memory_store type:context`
- A project-specific pattern or convention → `memory_store type:context`
- A tricky gotcha or workaround → `memory_store type:context`
- The tech stack or dependencies → `memory_store type:context`
- A completed milestone changes project state → `memory_store type:context`

**Write to SESSION memory when:**
- You find something helpful for the current task but not lasting.
- Intermediate debugging results that inform the next step.

**Write to GLOBAL memory ONLY when the user explicitly asks:**
- "Remember that I prefer..." → `memory_store scope:global`
- Global writes require user permission; the tool will prompt for approval.

## When to Update Memory

- **Mark as stale**: When you suspect a memory is outdated (`memory_update status:stale`).
- **Verify before correcting**: Always re-confirm outdated info before modifying.
- **Archive superseded**: When old info is replaced by new (`memory_delete mode:archive`).
- **Check staleness periodically**: Call `memory_check` to find expired or outdated memories.

## Memory Maintenance

- Call `memory_check` at the start of long sessions to find outdated information.
- Remove session memories when the information becomes irrelevant.
- If a session discovery should persist, promote it to project memory before the session ends.
- Contradictions: If new information contradicts a memory, flag the old memory as `stale` and create a new one with the corrected information.

## File Naming

- Use kebab-case slugs that clearly describe the topic: `auth-architecture`, `testing-conventions`, `redis-caching-strategy`.
- Session files: `ses_YYYYMMDD_descriptive-slug`.
- Keep slugs concise (2-5 words).

## Example Workflow

```
1. User: "Add rate limiting to the API"
2. Agent: `memory_search query:"rate limiting api"`
3. Found: `decisions.md` mentions Redis is available for rate limiting
4. Agent: `memory_get slug:"decisions"`
5. Agent reads full context, discovers Redis config details
6. Agent implements rate limiting using Redis
7. Agent: `memory_store slug:"api-rate-limiting" type:context ...`
8. Agent stores the implementation details for future reference
```
```

---

## 9. Installation & Configuration

### Quick Install

```bash
# Via npm (auto-added to opencode.json):
npx @openmemory/opencode-plugin install

# Or manually:
bun add -D @openmemory/opencode-plugin
```

### Configuration (`opencode.json`)

```json
{
  "plugin": ["@openmemory/opencode-plugin"],
  "permission": {
    "skill": {
      "openmemory": "allow"
    }
  }
}
```

### Optional Config (`openmemory.json` or `opencode.json` `openmemory` key)

```json
{
  "openmemory": {
    "globalPath": "~/.local/share/openmemory",
    "autoPromoteThreshold": 3,
    "staleAgeDays": 60,
    "injectOnFirstTurn": true,
    "maxInjectTokens": 2000,
    "maxSearchResults": 10
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `globalPath` | `$XDG_DATA_HOME/openmemory` | Global memory directory |
| `autoPromoteThreshold` | `3` | Minimum importance to auto-suggest promotion from session to project |
| `staleAgeDays` | `60` | Days after which a memory is flagged for review |
| `injectOnFirstTurn` | `true` | Whether to inject memory index on first turn |
| `maxInjectTokens` | `2000` | Maximum estimated tokens for injection block |
| `maxSearchResults` | `10` | Default max results for `memory_search` |

### Directory Initialization

On first load, the plugin ensures all memory directories exist:
```
mkdir -p .openmemory/session/
mkdir -p .openmemory/project/
mkdir -p $XDG_DATA_HOME/openmemory/
```

### Requiring a `.opencode/package.json`

If the user wants TypeScript plugin support with dependencies:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.3.3",
    "@openmemory/opencode-plugin": "^1.0.0"
  }
}
```

OpenCode runs `bun install` automatically at startup to resolve these.

---

## 10. Known Limitations & Future Roadmap

### Known Limitations

1. **`session.created` bug (#14808)**: Session scope cannot reliably bind to the current session. Workaround: use session-id-prefixed filenames and `experimental.chat.system.transform` for first-turn injection.

2. **No `session.start` hook**: Resume via `--continue` does not fire a plugin event. Workaround: system transform fires on every turn, including resumed sessions.

3. **No semantic/vector search**: Current implementation uses file scanning + front matter filtering. Semantic search requires embedding models (not in v1 scope). Workaround: descriptive tags + good file naming compensates for most use cases.

4. **No AI-based staleness analysis**: `memory_check` uses heuristic rules only (time, git-hash). Full AI-driven contradiction detection requires LLM call with all memory context — too expensive for auto-triggering.

5. **`event` handlers are fire-and-forget**: `session.idle` analysis cannot guarantee completion before process exit (especially in `opencode run` mode). Use `OPencode_EXPERIMENTAL_PLUGIN_EXIT_DEFAULT_TIMEOUT_MS` env var.

6. **Multiple system message bug**: Backends like Qwen/vLLM break with multiple `output.system.push()` calls. Our design merges into the first entry to avoid this.

### Future Roadmap

| Priority | Feature | Description |
|----------|---------|-------------|
| P1 | `/memory-review` command | Interactive user review of stale/suggested memories |
| P1 | Auto-promote from session to project | LLM suggests, user approves promotion |
| P2 | Semantic search with embeddings | Optional embedding model for semantic similarity search |
| P2 | Contradiction detection | LLM-based comparison of new vs existing memories |
| P2 | Memory merge/deduplication | Merge overlapping memories across scopes |
| P3 | Web dashboard | Memory health overview, search, manual editing |
| P3 | Export/import format | NDJSON for migrating between memory plugins |
| P3 | AGENTS.md auto-generation | Generate AGENTS.md rules from memory for non-OpenCode tooling |
| P4 | Multi-project memory linking | Link memories across related projects |
| P4 | Team memory sharing | Git-tracked `.openmemory/` usable across team members |

---

## 11. Appendix: Research Basis & References

### Sources Confirmed

| Source | Key Information |
|--------|----------------|
| [OpenCode Plugin Docs](https://opencode.ai/docs/plugins/) | Plugin API, hooks, tools, events, installation |
| [OpenCode Custom Tools Docs](https://opencode.ai/docs/custom-tools) | `tool()` helper, Zod schema, `tool.schema` |
| [GitHub: `@opencode-ai/plugin` source](https://github.com/anomalyco/opencode/tree/main/packages/plugin/src/) | Type definitions, `PluginInput`, `ToolContext`, `Hooks` |
| [XDG Base Directory v0.8](https://specifications.freedesktop.org/basedir-spec/latest/) | Standard paths for data/config/state/cache |
| [OpenCode Skills System](https://opencode.school/lessons/plugins) | SKILL.md format, companion skill pattern, Replicate plugin |
| [GitHub Issue #14808](https://github.com/anomalyco/opencode/issues/14808) | `session.created` bug confirmation |
| [GitHub Issue #5409](https://github.com/anomalyco/opencode/issues/5409) | `session.start` hook discussion |
| [Existing plugins analyzed](#) | opencode-openmemory, open-mem, opencode-mem, codemem, engram, simple-memory, context-mode — design patterns, tool signatures, storage formats |

### Package Versions Verified

- `@opencode-ai/plugin`: v1.3.3 (latest on npm)
- SDK v1 → v2 migration in progress (types still reference v1)

### OpenCode Version Context

- Research conducted against OpenCode v2.x / v1.4.x API surface
- `dev` branch as of April-May 2026
- Some hooks (`experimental.session.compacting`, `experimental.chat.system.transform`) are marked experimental

---

*End of Design Document*
