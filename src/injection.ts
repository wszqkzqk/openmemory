import type { MemoryScope } from "./types"
import { getMemoryStats } from "./indexer"
import { searchMemories } from "./search"
import type { SearchResult } from "./types"

type MemoryStats = Record<MemoryScope, { total: number; active: number; stale: number; archived: number }>

interface InjectionContext {
  stats: MemoryStats
  projectIndex: SearchResult[]
  globalMemory: SearchResult[]
}

export function buildContextBlock(
  stats: MemoryStats,
  projectIndex: SearchResult[],
  globalMemory: SearchResult[],
): string {
  const lines: string[] = []

  const globalIdentity = globalMemory.filter(r => r.type === "identity")
  const globalDirectives = globalMemory.filter(r => r.type === "directive")

  if (globalDirectives.length > 0) {
    lines.push("## Global Directives — Follow these")
    lines.push("")
    for (const r of globalDirectives) {
      lines.push(`- **${r.slug}** — ${r.title} [importance ${r.importance}/5]`)
    }
    lines.push("")
  }

  if (globalIdentity.length > 0) {
    lines.push("## Global Preferences")
    lines.push("")
    for (const r of globalIdentity) {
      lines.push(`- **${r.slug}** — ${r.title}`)
    }
    lines.push("")
  }

  const projectStats = stats.project
  if (projectStats && projectStats.total > 0) {
    lines.push(`## Project Memory (${projectStats.active} active, ${projectStats.stale} stale)`)
    lines.push("")
    if (projectIndex.length > 0) {
      for (const r of projectIndex.slice(0, 10)) {
        lines.push(`- **${r.slug}** — ${r.title} [${r.type}, ${r.importance}/5, ${r.updated}]`)
      }
    }
    if (projectStats.stale > 0) {
      lines.push(`- *${projectStats.stale} stale memories* — run \`memory_check\` to review`)
    }
    lines.push("")
  }

  if (lines.length === 0) return ""

  lines.unshift("## OpenMemory — Memory Index", "")
  return lines.join("\n")
}

export async function collectContextForInjection(
  worktree: string,
  globalPath: string,
): Promise<InjectionContext> {
  const stats = await getMemoryStats(worktree, globalPath)
  const projectIndex = await searchMemories({ scope: "project", status: "active", limit: 10 }, worktree, globalPath)
  const globalMemory = await searchMemories(
    { scope: "global", status: "active", limit: 10 },
    worktree,
    globalPath,
  )
  return { stats, projectIndex, globalMemory }
}
