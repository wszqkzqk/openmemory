import { tool } from "@opencode-ai/plugin"
import { resolveMemoryPath } from "../types"
import type { PluginConfig, MemoryScope } from "../types"
import { readMemoryFile, extractFrontMatterSummary } from "../frontmatter"
import { fileExists } from "../storage"
import { getGlobalMemoryPath } from "../shared"

export function memoryGetTool(_config: PluginConfig) {
  return tool({
    description:
      "Read a specific memory file by its slug. Returns the full content including YAML front matter and body. " +
      "Use this to recall project context or user preferences before starting work on a related task.",
    args: {
      slug: tool.schema
        .string()
        .describe("Memory file slug (without .md extension, e.g. 'auth-architecture')"),
      scope: tool.schema
        .enum(["session", "project", "global"])
        .describe("Scope of the memory to read"),
    },
    async execute(args, context) {
      try {
        const worktree = context.worktree || context.directory
        const globalPath = getGlobalMemoryPath()
        const filePath = resolveMemoryPath(args.scope as MemoryScope, args.slug, worktree, globalPath)

        if (!(await fileExists(filePath))) {
          return JSON.stringify({
            success: false,
            error: `Memory not found: ${args.scope}/${args.slug}.md. Use memory_search or memory_list to find available memories.`,
          })
        }

        const memory = await readMemoryFile(filePath, args.slug, args.scope as MemoryScope)
        if (!memory) {
          return JSON.stringify({
            success: false,
            error: `Could not read memory: ${args.scope}/${args.slug}.md`,
          })
        }

        return extractFrontMatterSummary(memory)
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}
