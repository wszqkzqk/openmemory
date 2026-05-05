import type { Plugin } from "@opencode-ai/plugin"
import type { PluginConfig } from "./types"
import { DEFAULT_CONFIG } from "./types"
import { getGlobalMemoryPath } from "./shared"
import { ensureDir } from "./storage"
import { collectContextForInjection, buildContextBlock } from "./injection"
import { buildCompactionContext } from "./compaction"
import { checkStaleness } from "./staleness"

import { memoryStoreTool } from "./tools/memory-store"
import { memoryGetTool } from "./tools/memory-get"
import { memorySearchTool } from "./tools/memory-search"
import { memoryListTool } from "./tools/memory-list"
import { memoryUpdateTool } from "./tools/memory-update"
import { memoryDeleteTool } from "./tools/memory-delete"
import { memoryScanTool } from "./tools/memory-scan"
import { memoryCheckTool } from "./tools/memory-check"

export const OpenMemoryPlugin: Plugin = async (ctx) => {
  const config: PluginConfig = {
    ...DEFAULT_CONFIG,
    globalPath: getGlobalMemoryPath(),
  }

  const worktree = ctx.worktree || ctx.directory
  await ensureDir(`${worktree}/.openmemory/session`)
  await ensureDir(`${worktree}/.openmemory/project`)
  await ensureDir(config.globalPath)

  const injectedSessions = new Set<string>()

  return {
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

    // Inject memory index on first LLM call per session.
    // We use system.transform rather than session.created (#14808 unreliable).
    // Merge into system[0] rather than push to avoid breaking Qwen/vLLM.
    "experimental.chat.system.transform": async (input, output) => {
      if (!config.injectOnFirstTurn) return
      const sid = input.sessionID
      if (sid && injectedSessions.has(sid)) return
      if (sid) injectedSessions.add(sid)

      try {
        const { stats, projectIndex, globalMemory } = await collectContextForInjection(
          worktree,
          config.globalPath,
        )

        const total = Object.values(stats).reduce((s, v) => s + v.total, 0)
        if (total === 0) return

        const contextBlock = buildContextBlock(stats, projectIndex, globalMemory)

        if (output.system.length > 0 && output.system[0]) {
          output.system[0] = output.system[0] + "\n\n" + contextBlock
        } else {
          output.system.push(contextBlock)
        }
      } catch {
        // Best-effort — injection failure must not block the LLM call
      }
    },

    "experimental.session.compacting": async (input, output) => {
      try {
        const ctx = await buildCompactionContext(worktree, config.globalPath, input.sessionID)
        if (ctx.trim().length > 0) {
          output.context.push(ctx)
        }
      } catch {}
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      try {
        await checkStaleness(undefined, worktree, config.globalPath, config.staleAgeDays)
      } catch {}
    },
  }
}
