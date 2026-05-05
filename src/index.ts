import type { Plugin } from "@opencode-ai/plugin"
import type { PluginConfig } from "./types"
import { DEFAULT_CONFIG } from "./types"
import { getGlobalMemoryPath } from "./shared"
import { ensureDir } from "./storage"
import { collectContextForInjection, buildContextBlock } from "./injection"
import { buildCompactionContext } from "./compaction"
import { checkStaleness } from "./staleness"
import { searchMemories } from "./search"
import { getMemoryStats } from "./indexer"

import { memoryStoreTool } from "./tools/memory-store"
import { memoryGetTool } from "./tools/memory-get"
import { memorySearchTool } from "./tools/memory-search"
import { memoryListTool } from "./tools/memory-list"
import { memoryUpdateTool } from "./tools/memory-update"
import { memoryDeleteTool } from "./tools/memory-delete"
import { memoryScanTool } from "./tools/memory-scan"
import { memoryCheckTool } from "./tools/memory-check"

export const OpenMemoryPlugin: Plugin = async (ctx) => {
  // ── Configuration ────────────────────────────────────────────
  const config: PluginConfig = {
    ...DEFAULT_CONFIG,
    globalPath: getGlobalMemoryPath(),
  }

  // ── Ensure memory directories exist ──────────────────────────
  const worktree = ctx.worktree || ctx.directory
  await ensureDir(`${worktree}/.openmemory/session`)
  await ensureDir(`${worktree}/.openmemory/project`)
  await ensureDir(config.globalPath)

  // ── Session state (module-level singleton) ────────────────────
  const state = {
    firstTurnDone: false,
    pendingStaleWarnings: false,
  }

  // ── Context injection on first turn ──────────────────────────
  // Uses experimental.chat.system.transform for reliable first-turn injection.
  // The session.created event (#14808) is known unreliable, so we inject on
  // the first LLM call via system transform and guard via state flag.
  // We MERGE into output.system[0] rather than pushing new entries to avoid
  // breaking backends that only support a single system message (Qwen/vLLM).

  // ── Track active session for staleness analysis on idle ──────
  let currentSessionID: string | undefined

  return {
    // ── Custom Tools ───────────────────────────────────────────
    tool: {
      memory_store: memoryStoreTool(config),
      memory_get: memoryGetTool(config),
      memory_search: memorySearchTool(config),
      memory_list: memoryListTool(config),
      memory_update: memoryUpdateTool(config),
      memory_delete: memoryDeleteTool(config),
      memory_scan: memoryScanTool(config),
      memory_check: memoryCheckTool(config),
    },

    // ── System Prompt Injection ────────────────────────────────
    "experimental.chat.system.transform": async (input, output) => {
      // Track session for later use in idle hook
      if (input.sessionID) currentSessionID = input.sessionID

      if (!config.injectOnFirstTurn) return
      if (state.firstTurnDone) return
      state.firstTurnDone = true

      try {
        const { stats, projectIndex, globalMemory } = await collectContextForInjection(
          worktree,
          config.globalPath,
        )

        const total = Object.values(stats).reduce((s, v) => s + v.total, 0)
        if (total === 0) return // No memories to inject

        const contextBlock = buildContextBlock(stats, projectIndex, globalMemory)

        // Merge into existing system prompt to avoid multi-system-message bug
        if (output.system.length > 0 && output.system[0]) {
          output.system[0] = output.system[0] + "\n\n" + contextBlock
        } else {
          output.system.push(contextBlock)
        }
      } catch {
        // Silently fail — memory injection is best-effort
      }
    },

    // ── Compaction Memory Preservation ─────────────────────────
    "experimental.session.compacting": async (input, output) => {
      try {
        const context = await buildCompactionContext(worktree, config.globalPath, input.sessionID)
        if (context.trim().length > 0) {
          output.context.push(context)
        }
      } catch {
        // Best-effort
      }
    },

    // ── Tool Usage Tracking ────────────────────────────────────
    "tool.execute.after": async (input, _output) => {
      // Track tool execution patterns — this is fire-and-forget data collection
      // Future: use this for intelligent memory extraction suggestions
      void input // Currently a no-op placeholder for future use
    },

    // ── Session Lifecycle Events ───────────────────────────────
    event: async ({ event }) => {
      // session.created is UNRELIABLE (#14808) — DO NOT rely on it
      // We use system.transform for first-turn injection instead

      if (event.type === "session.idle") {
        // Fire-and-forget: on session idle, flag stale memory warnings for next session
        // event handlers are not awaited by the runtime, so heavy work must be
        // offloaded or done synchronously.

        try {
          const reports = await checkStaleness(
            undefined,
            worktree,
            config.globalPath,
            config.staleAgeDays,
          )
          if (reports.length > 0) {
            state.pendingStaleWarnings = true
          }
        } catch {
          // Best-effort
        }
      }
    },
  }
}
