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

## Memory Scopes

| Scope | Path | Use For |
|-------|------|---------|
| `session` | `.openmemory/session/` | Temporary notes for current task only |
| `project` | `.openmemory/project/` | Project-specific knowledge that spans sessions |
| `global` | `~/.local/share/openmemory/` | User preferences and cross-project knowledge |

## When to Read Memory

### Always check project memory before starting work

1. Call `memory_scan` for a quick overview of all scopes.
2. Call `memory_search` with keywords relevant to the current task.
3. Call `memory_get` to load full content of relevant files.

### Check global memory when
- You need to know user preferences (code style, communication, tools).
- Starting a new project the user has worked on similar things.

## When to Write Memory

### Write to PROJECT memory when you discover or decide
- An architectural decision with rationale → `memory_store type:context`
- A project-specific pattern or convention → `memory_store type:context`
- A tricky gotcha or workaround → `memory_store type:context`
- The tech stack or dependencies → `memory_store type:context`
- A completed milestone changes project state → `memory_store type:context`

### Write to SESSION memory when
- You find something helpful for the current task but not lasting.
- Intermediate debugging results that inform the next step.

### Write to GLOBAL memory ONLY when the user explicitly asks
- "Remember that I prefer..." → `memory_store scope:global`
- Global writes require user permission; the tool will prompt for approval.

## When to Update Memory

- **Mark as stale**: When you suspect a memory is outdated (`memory_update status:stale`).
- **Verify before correcting**: Always re-confirm outdated info before modifying.
- **Archive superseded**: When old info is replaced by new (`memory_delete mode:archive`).
- **Check staleness periodically**: Call `memory_check` to find expired or outdated memories.

## Memory Maintenance

- Call `memory_check` at the start of long sessions to find outdated information.
- Call `memory_scan` for periodic overview of memory health.
- Remove session memories when the information becomes irrelevant.
- If a session discovery should persist, promote it to project memory before the session ends.
- Contradictions: If new information contradicts a memory, flag the old memory as `stale` and create a new one with the corrected information.

## File Naming

- Use kebab-case slugs that clearly describe the topic: `auth-architecture`, `testing-conventions`, `redis-caching-strategy`.
- Session files: `ses_YYYYMMDD_descriptive-slug`.
- Keep slugs concise (2-5 words).

## YAML Front Matter Fields

Every memory file has YAML front matter. Key fields:

| Field | Values | Description |
|-------|--------|-------------|
| `title` | string | One-line summary |
| `type` | identity / directive / context / bookmark | Semantic category |
| `scope` | session / project / global | Memory scope |
| `tags` | string[] | 1-5 lowercase retrieval keywords |
| `status` | active / stale / archived | Freshness indicator |
| `importance` | 1-5 | Priority (5 = critical, 3 = default) |
| `git-hash` | string | Commit hash when memory was created |
| `related` | string[] | Slugs of related memories |
| `entities` | string[] | Libraries, services, people mentioned |

## Example Workflow

```
1. User: "Add rate limiting to the API"
2. Agent calls memory_search with query="rate limiting api"
3. Found: decisions.md mentions Redis is available for rate limiting
4. Agent calls memory_get slug="decisions" to read full context
5. Agent discovers Redis config details and implements rate limiting
6. Agent calls memory_store to save the implementation details for future reference:
   slug="api-rate-limiting", type="context", scope="project",
   tags=["rate-limiting", "redis", "api"],
   content="Implemented token bucket rate limiting using Redis..."
```

## Important

- **Read before write**: Always check memory before starting work.
- **Progressive disclosure**: Search first, then load full content only when relevant.
- **Accuracy over volume**: Keep memories concise and accurate. Remove outdated info.
- **Never store secrets**: No API keys, tokens, or credentials in memory.
- **Global = user gated**: Global memory writes always require user permission.
