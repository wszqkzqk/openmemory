import { tool } from "@opencode-ai/plugin"
import type { PluginConfig } from "../types"
import { checkStaleness, formatStalenessReports } from "../staleness"
import { gitHash } from "../storage"
import { getGlobalMemoryPath } from "../shared"

export function memoryCheckTool(config: PluginConfig) {
  return tool({
    description:
      "Check memories for staleness. Compares git-hash against HEAD, checks expiration dates, and flags memories that haven't been updated recently. " +
      "Use this periodically to maintain memory accuracy. Always verify before updating or deleting flagged memories — use memory_get to read the full content first.",
    args: {
      scope: tool.schema
        .enum(["session", "project", "global"])
        .optional()
        .describe("Scope to check (default: all scopes)"),
    },
    async execute(args, context) {
      try {
        const worktree = context.worktree || context.directory
        const globalPath = getGlobalMemoryPath()

        const currentGitHash = await gitHash(worktree)

        const scope = args.scope as any
        const reports = await checkStaleness(scope, worktree, globalPath, config.staleAgeDays, currentGitHash)

        return formatStalenessReports(reports)
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}
