import { tool } from "@opencode-ai/plugin"
import type { MemoryScope, MemoryIndex } from "../types"
import { resolveMemoryDir } from "../types"
import { fileExists, listMdFiles, listSessionDirs } from "../storage"
import { readIndex, formatIndexMarkdown } from "../indexer"
import { getGlobalMemoryPath } from "../shared"

export function memoryListTool() {
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

        if (args.scope === "session") {
          return listSessionMemories(worktree, args.status)
        }

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
          const filtered: MemoryIndex = {
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

async function listSessionMemories(worktree: string, _status?: string): Promise<string> {
  const sessionDirs = await listSessionDirs(worktree)

  if (sessionDirs.length === 0) return "No active session memories."

  const lines: string[] = ["## Session Memories", ""]
  let count = 0

  for (const sessionDir of sessionDirs) {
    const sessionName = sessionDir.split("/").pop() || ""
    const files = await listMdFiles(sessionDir)
    if (files.length === 0) continue

    for (const filename of files) {
      const slug = filename.replace(/\.md$/, "")
      lines.push(`- \`${slug}\` — ${sessionName.slice(0, 12)}...`)
      count++
    }
  }

  if (count === 0) return "No session memories."

  lines.push("", `**${count}** file(s) across ${sessionDirs.length} session(s).`)
  return lines.join("\n")
}
