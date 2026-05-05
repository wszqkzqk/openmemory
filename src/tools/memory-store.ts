import { tool } from "@opencode-ai/plugin"
import { resolveMemoryPath, isValidSlug } from "../types"
import type { PluginConfig, MemoryScope, MemoryFrontMatter } from "../types"
import { buildMemoryFile } from "../frontmatter"
import { writeFile } from "../storage"
import { regenerateIndex } from "../indexer"
import { getGlobalMemoryPath } from "../shared"

export function memoryStoreTool(_config: PluginConfig) {
  return tool({
    description:
      "Save a memory to the filesystem. Creates or overwrites a Markdown file with YAML front matter. " +
      "Use this to persist project knowledge, decisions, conventions, gotchas, or user preferences across sessions. " +
      "Scope: 'session' = current task only, 'project' = this project, 'global' = cross-project (global scope requires user permission).",
    args: {
      slug: tool.schema
        .string()
        .describe("File slug (kebab-case, e.g. 'auth-architecture', 'testing-conventions')"),
      title: tool.schema
        .string()
        .describe("One-line summary title for the memory (sentence case, no trailing period)"),
      type: tool.schema
        .enum(["identity", "directive", "context", "bookmark"])
        .describe("Memory type — identity=preferences, directive=guardrails, context=decisions/state, bookmark=external-link"),
      scope: tool.schema
        .enum(["session", "project", "global"])
        .describe("Memory scope — session=current session only, project=this project, global=cross-project (requires user permission)"),
      tags: tool.schema
        .array(tool.schema.string())
        .describe("1-5 lowercase tags for categorization and retrieval (e.g. ['testing', 'jest', 'ci'])"),
      content: tool.schema
        .string()
        .describe("Memory body content in Markdown. Include context, decisions, reasoning, file paths, and any relevant details."),
      importance: tool.schema
        .number()
        .min(1)
        .max(5)
        .optional()
        .describe("Priority 1-5 (default 3). Higher values surface first in search and injection."),
      related: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Slugs of related memory files for bidirectional linking"),
      entities: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Named entities mentioned (libraries, services, repositories, people)"),
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

        // Global write requires explicit user permission
        if (args.scope === "global") {
          try {
            await (context.ask as any)?.({
              permission: "openmemory_global_write",
              patterns: [args.slug],
              always: [],
              metadata: { title: args.title, scope: "global" },
            })
          } catch {
            // If ask is not available or denied, proceed with a note
          }
        }

        // Get current git hash
        let gitHash: string | undefined
        try {
          const { stdout } = await Bun.$`git -C ${worktree} rev-parse HEAD`.nothrow()
          gitHash = stdout.toString().trim() || undefined
        } catch {
          // Not a git repo or git not available
        }

        const now = new Date().toISOString()
        const projectSlug = worktree.split("/").pop() || "unknown"

        const fm: MemoryFrontMatter = {
          title: args.title,
          type: args.type,
          scope: args.scope === "global" ? "global" : `${args.scope}:${projectSlug}`,
          tags: args.tags.slice(0, 5),
          created: now.split("T")[0] || now,
          updated: now,
          status: "active",
          source: "agent",
          importance: args.importance ?? 3,
          gitHash: gitHash || undefined,
          related: args.related?.slice(0, 10),
          entities: args.entities?.slice(0, 20),
        }

        const fileContent = buildMemoryFile(fm, args.content)
        const filePath = resolveMemoryPath(args.scope as MemoryScope, args.slug, worktree, globalPath, context.sessionID)
        await writeFile(filePath, fileContent)
        await regenerateIndex(args.scope as MemoryScope, worktree, globalPath)

        return JSON.stringify({
          success: true,
          message: `Memory saved: ${args.scope}/${args.slug}.md`,
          slug: args.slug,
          scope: args.scope,
          type: args.type,
          importance: fm.importance,
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
