import type { MemoryScope, PluginConfig } from "./types"
import { getMemoryStats } from "./indexer"
import { searchMemories } from "./search"
import type { SearchResult } from "./types"

export function buildContextBlock(
  stats: Record<MemoryScope, { total: number; active: number; stale: number; archived: number }>,
  projectIndex: SearchResult[],
  globalIdentity: SearchResult[],
): string {
  const lines: string[] = [
    "## OpenMemory — Persistent Context",
    "",
    "*Memory is stored as Markdown files in `.openmemory/` (project) and `~/.local/share/openmemory/` (global). Use `memory_search` to find relevant context. Use `memory_store` to save important discoveries. Use `memory_check` to verify staleness.*",
    "",
  ]

  // Project memory summary
  const projStats = stats.project
  if (projStats && projStats.total > 0) {
    lines.push(`### Project Memory (${projStats.active} active, ${projStats.stale} stale)`)
    lines.push("")
    if (projectIndex.length > 0) {
      for (const r of projectIndex.slice(0, 10)) {
        lines.push(`- **${r.slug}** — ${r.title} [${r.type}, ${r.importance}/5, ${r.updated}]`)
      }
    }
    if (projStats.stale > 0) {
      lines.push(`- *${projStats.stale} stale memories* — run \`memory_check\` to review`)
    }
    lines.push("")
  }

  // Global identity/directive summary
  if (globalIdentity.length > 0) {
    lines.push("### Global Memory (User Preferences)")
    lines.push("")
    for (const r of globalIdentity) {
      lines.push(`- **${r.slug}** — ${r.title} [${r.type}]`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

export async function collectContextForInjection(
  worktree: string,
  globalPath: string,
): Promise<{ stats: ReturnType<typeof getMemoryStats> extends Promise<infer T> ? T : never; projectIndex: SearchResult[]; globalIdentity: SearchResult[] }> {
  const stats = await getMemoryStats(worktree, globalPath)
  const projectIndex = await searchMemories({ scope: "project", status: "active", limit: 10 }, worktree, globalPath)
  const globalIdentity = await searchMemories({ scope: "global", type: "identity", status: "active", limit: 5 }, worktree, globalPath)
  return { stats, projectIndex, globalIdentity } as any
}
