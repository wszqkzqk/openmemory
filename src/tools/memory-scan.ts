import { tool } from "@opencode-ai/plugin"
import type { PluginConfig, MemoryScope } from "../types"
import { resolveMemoryDir } from "../types"
import { fileExists } from "../storage"
import { getMemoryStats } from "../indexer"
import { getGlobalMemoryPath } from "../shared"

export function memoryScanTool(_config: PluginConfig) {
  return tool({
    description:
      "Scan all memory scopes for a quick overview. Returns counts by scope and status, plus top-level summary. " +
      "Use this at the start of a session to assess what memories are available, or periodically to monitor memory health. " +
      "This is a lightweight operation — it reads only indexes, not full files.",
    args: {},
    async execute(_args, context) {
      try {
        const worktree = context.worktree || context.directory
        const globalPath = getGlobalMemoryPath()

        const stats = await getMemoryStats(worktree, globalPath)
        const total = Object.values(stats).reduce((sum, s) => sum + s.total, 0)

        if (total === 0) {
          return [
            "## OpenMemory — No memories found",
            "",
            "No memory files exist yet. Use **memory_store** to save:",
            "- **Project memory** — architecture decisions, conventions, gotchas",
            "- **Session memory** — temporary task-specific notes",
            "- **Global memory** — cross-project user preferences (requires user permission)",
            "",
            `Memories are stored as Markdown files in \`.openmemory/\` (project) and \`${getGlobalMemoryPath()}\` (global).`,
          ].join("\n")
        }

        const lines = ["## OpenMemory — Storage Overview", ""]

        for (const scope of ["session", "project", "global"] as MemoryScope[]) {
          const s = stats[scope]
          if (!s) continue
          const dir = resolveMemoryDir(scope, worktree, globalPath)
          const exists = await fileExists(dir)

          if (!exists || s.total === 0) {
            lines.push(`### ${scope} (0 memories)`)
            lines.push("")
            continue
          }

          lines.push(`### ${scope} (${s.total} total: ${s.active} active, ${s.stale} stale, ${s.archived} archived)`)
          if (s.stale > 0) {
            lines.push(`⚠️ *${s.stale} stale memory file(s) need review — run memory_check for details*`)
          }
          lines.push(`**Path**: \`${dir}\``)
          lines.push("")
        }

        lines.push("---")
        lines.push(`**Total**: ${total} memory file(s) across all scopes.`)
        lines.push("Use **memory_list** for detailed listings, **memory_search** for keyword search, or **memory_check** to find stale files.")

        return lines.join("\n")
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}
