import type { Plugin } from "@opencode-ai/plugin"
import type { PluginConfig } from "./types"
import { DEFAULT_CONFIG } from "./types"
import { getGlobalMemoryPath } from "./shared"
import { ensureDir, readFile, writeFile, fileExists } from "./storage"
import { collectContextForInjection, buildContextBlock } from "./injection"
import { buildCompactionContext, cleanupSessionMemories } from "./compaction"
import { checkStaleness } from "./staleness"

import { memoryStoreTool } from "./tools/memory-store"
import { memoryGetTool } from "./tools/memory-get"
import { memorySearchTool } from "./tools/memory-search"
import { memoryListTool } from "./tools/memory-list"
import { memoryUpdateTool } from "./tools/memory-update"
import { memoryDeleteTool } from "./tools/memory-delete"
import { memoryScanTool } from "./tools/memory-scan"
import { memoryCheckTool } from "./tools/memory-check"

async function loadConfig(): Promise<PluginConfig> {
  const config = { ...DEFAULT_CONFIG, globalPath: getGlobalMemoryPath() }

  const candidates = [
    `${getGlobalMemoryPath()}/../opencode/openmemory.json`,
    `${process.env.HOME}/.config/opencode/openmemory.json`,
  ]
  for (const path of candidates) {
    try {
      const raw = await readFile(path)
      const overrides = JSON.parse(raw)
      if (overrides.globalPath) config.globalPath = overrides.globalPath
      if (overrides.staleAgeDays != null) config.staleAgeDays = overrides.staleAgeDays
      if (overrides.maxInjectTokens != null) config.maxInjectTokens = overrides.maxInjectTokens
      break
    } catch {}
  }

  return config
}

export const OpenMemoryPlugin: Plugin = async (ctx) => {
  const config = await loadConfig()

  const worktree = ctx.worktree || ctx.directory
  await ensureDir(`${worktree}/.openmemory/session`)
  await ensureDir(`${worktree}/.openmemory/project`)
  await ensureDir(config.globalPath)

  const gitignorePath = `${worktree}/.openmemory/.gitignore`
  if (!(await fileExists(gitignorePath))) {
    await writeFile(gitignorePath, "*\n")
  }

  const injectedSessions = new Set<string>()
  let staleCount = 0

  return {
    tool: {
      memory_store: memoryStoreTool(),
      memory_get: memoryGetTool(),
      memory_search: memorySearchTool(config),
      memory_list: memoryListTool(),
      memory_update: memoryUpdateTool(),
      memory_delete: memoryDeleteTool(),
      memory_scan: memoryScanTool(),
      memory_check: memoryCheckTool(config),
    },

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

        let contextBlock = buildContextBlock(stats, projectIndex, globalMemory)

        if (staleCount > 0) {
          contextBlock += `\n\n⚠️ **${staleCount} stale memories** — run \`memory_check\` to review.`
        }

        if (output.system.length > 0 && output.system[0]) {
          output.system[0] = output.system[0] + "\n\n" + contextBlock
        } else {
          output.system.push(contextBlock)
        }
      } catch {}
    },

    "experimental.session.compacting": async (input, output) => {
      try {
        const contextBlock = await buildCompactionContext(worktree, config.globalPath, input.sessionID)
        if (contextBlock.trim().length > 0) {
          output.context.push(contextBlock)
        }
        await cleanupSessionMemories(worktree, input.sessionID)
      } catch {}
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      try {
        const reports = await checkStaleness(undefined, worktree, config.globalPath, config.staleAgeDays)
        staleCount = reports.length
      } catch {}
    },
  }
}
