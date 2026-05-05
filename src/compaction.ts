import type { MemoryScope } from "./types"
import { resolveMemoryDir, slugFromFilename } from "./types"
import { listMdFiles } from "./storage"
import { readMemoryFile, extractFrontMatterCompact } from "./frontmatter"
import { readIndex } from "./indexer"

export interface CompactionContext {
  sessionDiscoveries: string[]
  projectContext: string
}

export async function buildCompactionContext(
  worktree: string,
  globalPath: string,
): Promise<string> {
  const lines: string[] = []

  // Include session memory summaries
  const sessionMemories = await collectSessionMemories(worktree)
  if (sessionMemories.length > 0) {
    lines.push("## Session Discoveries")
    for (const m of sessionMemories) {
      lines.push(`- ${m}`)
    }
    lines.push("")
  }

  // Include project memory index summary
  const projectIndex = await readIndex("project", worktree, globalPath)
  if (projectIndex && projectIndex.active.length > 0) {
    lines.push("## Project Memory (Active)")
    for (const entry of projectIndex.active.slice(0, 8)) {
      lines.push(`- **${entry.slug}** — ${entry.title} [${entry.type}, ${entry.importance}/5]`)
    }
    if (projectIndex.stale.length > 0) {
      lines.push(`- *${projectIndex.stale.length} stale memories need review*`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

async function collectSessionMemories(worktree: string): Promise<string[]> {
  const dir = resolveMemoryDir("session", worktree, "")
  const files = await listMdFiles(dir)
  const summaries: string[] = []

  for (const filename of files.slice(0, 5)) {
    const slug = slugFromFilename(filename)
    const path = `${dir}/${filename}`
    const memory = await readMemoryFile(path, slug, "session")
    if (!memory) continue
    summaries.push(extractFrontMatterCompact(memory))
  }

  return summaries
}

export async function cleanupSessionMemories(worktree: string): Promise<void> {
  const dir = resolveMemoryDir("session", worktree, "")
  const files = await listMdFiles(dir)
  for (const filename of files) {
    await Bun.file(`${dir}/${filename}`).delete?.().catch(() => {})
  }
}
