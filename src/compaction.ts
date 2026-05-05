import { resolveMemoryDir, slugFromFilename } from "./types"
import { listMdFiles } from "./storage"
import { readMemoryFile, extractFrontMatterCompact } from "./frontmatter"
import { readIndex } from "./indexer"
import { readdir, rm } from "node:fs/promises"
import { join } from "node:path"

export async function buildCompactionContext(
  worktree: string,
  globalPath: string,
  sessionID?: string,
): Promise<string> {
  const lines: string[] = []

  if (sessionID) {
    const sessionMemories = await collectSessionMemories(worktree, sessionID)
    if (sessionMemories.length > 0) {
      lines.push("## Session Discoveries")
      for (const m of sessionMemories) {
        lines.push(`- ${m}`)
      }
      lines.push("")
    }
  }

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

async function collectSessionMemories(worktree: string, sessionID: string): Promise<string[]> {
  const dir = resolveMemoryDir("session", worktree, "", sessionID)
  const files = await listMdFiles(dir)
  const summaries: string[] = []

  for (const filename of files.slice(0, 5)) {
    const slug = slugFromFilename(filename)
    const path = join(dir, filename)
    const memory = await readMemoryFile(path, slug, "session")
    if (!memory) continue
    summaries.push(extractFrontMatterCompact(memory))
  }

  return summaries
}

export async function cleanupSessionMemories(worktree: string, sessionID?: string): Promise<void> {
  if (!sessionID) return
  const dir = resolveMemoryDir("session", worktree, "", sessionID)
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Best effort — directory may not exist
  }
}
