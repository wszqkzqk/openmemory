import { tool } from "@opencode-ai/plugin"
import { resolveMemoryPath, isValidSlug } from "../types"
import type { PluginConfig, MemoryScope } from "../types"
import { readMemoryFile, buildMemoryFile } from "../frontmatter"
import { writeFile, fileExists, deleteFile as deleteFromDisk } from "../storage"
import { regenerateIndex } from "../indexer"
import { getGlobalMemoryPath } from "../shared"

export function memoryDeleteTool(_config: PluginConfig) {
  return tool({
    description:
      "Delete or archive a memory file. Use mode='archive' to keep the file but exclude from active results (recommended, reversible). " +
      "Use mode='delete' to permanently remove. Always verify the memory is truly obsolete before deleting. " +
      "When new information contradicts old, prefer marking the old as stale/archived and creating a new memory.",
    args: {
      slug: tool.schema
        .string()
        .describe("Memory file slug to remove (without .md extension)"),
      scope: tool.schema
        .enum(["session", "project", "global"])
        .describe("Scope of the memory to remove"),
      mode: tool.schema
        .enum(["archive", "delete"])
        .describe("'archive' marks status as archived (reversible), 'delete' permanently removes the file"),
    },
    async execute(args, context) {
      try {
        if (!isValidSlug(args.slug)) {
          return JSON.stringify({ success: false, error: "Invalid slug." })
        }

        const worktree = context.worktree || context.directory
        const globalPath = getGlobalMemoryPath()
        const filePath = resolveMemoryPath(args.scope as MemoryScope, args.slug, worktree, globalPath, context.sessionID)

        if (!(await fileExists(filePath))) {
          return JSON.stringify({
            success: false,
            error: `Memory not found: ${args.scope}/${args.slug}.md`,
          })
        }

        // Global operations require user permission
        if (args.scope === "global") {
          try {
            await (context.ask as any)?.({
              permission: "openmemory_global_write",
              patterns: [args.slug],
              always: [],
              metadata: { title: args.slug, scope: "global", action: args.mode },
            })
          } catch {
            // proceed
          }
        }

        if (args.mode === "archive") {
          const memory = await readMemoryFile(filePath, args.slug, args.scope as MemoryScope)
          if (memory) {
            const fm = { ...memory.frontmatter, status: "archived" as const, updated: new Date().toISOString() }
            const content = buildMemoryFile(fm, memory.body)
            await writeFile(filePath, content)
          }
        } else {
          await deleteFromDisk(filePath)
        }

        await regenerateIndex(args.scope as MemoryScope, worktree, globalPath)

        return JSON.stringify({
          success: true,
          message: `Memory ${args.mode}d: ${args.scope}/${args.slug}.md`,
          slug: args.slug,
          scope: args.scope,
          mode: args.mode,
        })
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })
}
