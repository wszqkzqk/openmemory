import { tool } from "@opencode-ai/plugin"
import type { PluginConfig } from "../types"
import { searchMemories } from "../search"
import { getGlobalMemoryPath } from "../shared"

export function memorySearchTool(config: PluginConfig) {
  return tool({
    description:
      "Search memory files by keyword, tags, scope, or type. Returns matching file paths with front matter summaries. " +
      "Use this to find relevant memories before starting work on a topic. Does NOT return full file content — use memory_get for that.",
    args: {
      query: tool.schema
        .string()
        .optional()
        .describe("Keyword search query. Searches title, tags, and body content."),
      scope: tool.schema
        .enum(["session", "project", "global"])
        .optional()
        .describe("Limit search to a specific scope (default: all scopes)"),
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter by one or more tags (all must match)"),
      type: tool.schema
        .enum(["identity", "directive", "context", "bookmark"])
        .optional()
        .describe("Filter by memory type"),
      status: tool.schema
        .enum(["active", "stale", "archived"])
        .optional()
        .describe("Filter by status (default: active + stale)"),
      limit: tool.schema
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum results to return (default 10)"),
    },
    async execute(args, context) {
      try {
        const worktree = context.worktree || context.directory
        const globalPath = getGlobalMemoryPath()

        const results = await searchMemories(
          {
            query: args.query,
            scope: args.scope as any,
            tags: args.tags,
            type: args.type as any,
            status: args.status as any,
            limit: args.limit ?? config.maxSearchResults,
          },
          worktree,
          globalPath,
          context.sessionID,
        )

        if (results.length === 0) {
          return "No matching memories found. Try different keywords, broader scope, or use memory_list to see what's available."
        }

        const output = results.map((r, i) => {
          const lines = [
            `### [${i + 1}] \`${r.scope}/${r.slug}\` — ${r.title}`,
            `**Type**: ${r.type}  |  **Status**: ${r.status}  |  **Importance**: ${r.importance}/5  |  **Updated**: ${r.updated}`,
            `**Tags**: ${r.tags.join(", ") || "none"}`,
          ]
          if (r.snippet) {
            lines.push(`**Snippet**: ${r.snippet}`)
          }
          return lines.join("\n")
        }).join("\n\n---\n\n")

        return `Found ${results.length} memory file(s):\n\n${output}\n\nUse memory_get to read full content of any file.`
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}
