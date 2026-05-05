import { tool } from "@opencode-ai/plugin"
import type { PluginConfig, MemoryScope } from "../types"
import { resolveMemoryDir } from "../types"
import { fileExists } from "../storage"
import { readIndex, formatIndexMarkdown } from "../indexer"
import { getGlobalMemoryPath } from "../shared"

export function memoryListTool(_config: PluginConfig) {
  return tool({
    description:
      "List all memory files in a scope. Returns a compact table with slug, title, type, tags, status, and last-updated date. " +
      "Use this for a quick overview of available memories before searching or when assessing memory health.",
    args: {
      scope: tool.schema
        .enum(["session", "project", "global"])
        .describe("Scope to list memories from"),
      status: tool.schema
        .enum(["active", "stale", "archived"])
        .optional()
        .describe("Filter by status (default: active)"),
    },
    async execute(args, context) {
      try {
        const worktree = context.worktree || context.directory
        const globalPath = getGlobalMemoryPath()

        const dir = resolveMemoryDir(args.scope as MemoryScope, worktree, globalPath)
        if (!(await fileExists(dir))) {
          return JSON.stringify({
            success: true,
            message: `No ${args.scope} memory directory exists yet. Use memory_store to create memories.`,
            scope: args.scope,
            total: 0,
          })
        }

        const index = await readIndex(args.scope as MemoryScope, worktree, globalPath)

        if (args.status) {
          if (!index) {
            return `No ${args.status} memories in ${args.scope} scope. Use memory_store to create memories.`
          }
          const filtered = {
            scope: index.scope,
            updated: index.updated,
            active: args.status === "active" ? index.active : [],
            stale: args.status === "stale" ? index.stale : [],
            archived: args.status === "archived" ? index.archived : [],
          }
          return formatIndexMarkdown(filtered)
        }

        if (!index || (index.active.length === 0 && index.stale.length === 0 && index.archived.length === 0)) {
          return `No memories in ${args.scope} scope. Use memory_store to create memories.`
        }

        return formatIndexMarkdown(index)
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}
