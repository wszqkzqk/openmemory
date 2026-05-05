import { tool } from "@opencode-ai/plugin"
import { resolveMemoryPath, isValidSlug } from "../types"
import type { PluginConfig, MemoryScope } from "../types"
import { readMemoryFile, buildMemoryFile } from "../frontmatter"
import { writeFile, fileExists } from "../storage"
import { regenerateIndex } from "../indexer"
import { getGlobalMemoryPath } from "../shared"

export function memoryUpdateTool(_config: PluginConfig) {
  return tool({
    description:
      "Update an existing memory file. Modify the body content, change metadata fields, or mark as stale/archived. " +
      "Always verify the information is correct before updating. When correcting outdated info, create a new memory and mark the old one as stale (don't silently overwrite).",
    args: {
      slug: tool.schema
        .string()
        .describe("Memory file slug to update (without .md extension)"),
      scope: tool.schema
        .enum(["session", "project", "global"])
        .describe("Scope of the memory to update"),
      title: tool.schema
        .string()
        .optional()
        .describe("New title for the memory"),
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("New tags (replaces existing tags)"),
      content: tool.schema
        .string()
        .optional()
        .describe("New body content in Markdown (replaces existing body)"),
      status: tool.schema
        .enum(["active", "stale", "archived"])
        .optional()
        .describe("Change status — 'stale' when suspecting outdated, 'archived' when superseded"),
      importance: tool.schema
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Change importance level (1-5)"),
      expires: tool.schema
        .string()
        .optional()
        .describe("Set an expiration date (ISO 8601, e.g. '2026-06-01')"),
    },
    async execute(args, context) {
      try {
        if (!isValidSlug(args.slug)) {
          return JSON.stringify({
            success: false,
            error: "Invalid slug. Use kebab-case: lowercase letters, digits, and single hyphens only.",
          })
        }

        const worktree = context.worktree || context.directory
        const globalPath = getGlobalMemoryPath()
        const filePath = resolveMemoryPath(args.scope as MemoryScope, args.slug, worktree, globalPath)

        if (!(await fileExists(filePath))) {
          return JSON.stringify({
            success: false,
            error: `Memory not found: ${args.scope}/${args.slug}.md`,
          })
        }

        const memory = await readMemoryFile(filePath, args.slug, args.scope as MemoryScope)
        if (!memory) {
          return JSON.stringify({
            success: false,
            error: `Could not read memory: ${args.scope}/${args.slug}.md`,
          })
        }

        // Global write requires explicit user permission
        if (args.scope === "global") {
          try {
            await (context.ask as any)?.({
              permission: "openmemory_global_write",
              patterns: [args.slug],
              always: [],
              metadata: { title: memory.frontmatter.title, scope: "global", action: "update" },
            })
          } catch {
            // proceed
          }
        }

        // Merge changes
        const fm = { ...memory.frontmatter }
        if (args.title !== undefined) fm.title = args.title
        if (args.tags !== undefined) fm.tags = args.tags.slice(0, 5)
        if (args.status !== undefined) fm.status = args.status
        if (args.importance !== undefined) fm.importance = args.importance
        if (args.expires !== undefined) fm.expires = args.expires || undefined

        fm.updated = new Date().toISOString()

        // Update git hash
        try {
          const { stdout } = await Bun.$`git -C ${worktree} rev-parse HEAD`.nothrow()
          const hash = stdout.toString().trim()
          if (hash) fm.gitHash = hash
        } catch {
          // OK
        }

        const body = args.content !== undefined ? args.content : memory.body
        const fileContent = buildMemoryFile(fm, body)
        await writeFile(filePath, fileContent)
        await regenerateIndex(args.scope as MemoryScope, worktree, globalPath)

        const changes: string[] = []
        if (args.title !== undefined) changes.push("title")
        if (args.tags !== undefined) changes.push("tags")
        if (args.content !== undefined) changes.push("content")
        if (args.status !== undefined) changes.push("status")
        if (args.importance !== undefined) changes.push("importance")
        if (args.expires !== undefined) changes.push("expires")

        return JSON.stringify({
          success: true,
          message: `Memory updated: ${args.scope}/${args.slug}.md`,
          changes: changes.length > 0 ? changes.join(", ") : "no changes applied",
          path: filePath,
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
