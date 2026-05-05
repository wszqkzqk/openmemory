import type { MemoryFile, MemoryIndex, MemoryIndexEntry, MemoryScope, MemoryStatus } from "./types"
import { resolveMemoryDir } from "./types"
import { listMdFiles, writeFile, readFile, fileExists } from "./storage"
import { readMemoryFile } from "./frontmatter"
import { readdir } from "node:fs/promises"
import { join } from "node:path"

export async function regenerateIndex(
  scope: MemoryScope,
  worktree: string,
  globalPath: string,
): Promise<void> {
  if (scope === "session") return

  const dir = resolveMemoryDir(scope, worktree, globalPath)
  const files = await listMdFiles(dir)

  const entries: MemoryIndexEntry[] = []

  for (const filename of files) {
    const slug = filename.replace(/\.md$/, "")
    const path = `${dir}/${filename}`
    const memory = await readMemoryFile(path, slug, scope)
    if (!memory) continue

    entries.push({
      slug,
      title: memory.frontmatter.title,
      type: memory.frontmatter.type,
      tags: memory.frontmatter.tags,
      status: memory.frontmatter.status,
      updated: memory.frontmatter.updated,
      importance: memory.frontmatter.importance,
      expires: memory.frontmatter.expires,
    })
  }

  entries.sort((a, b) => b.updated.localeCompare(a.updated))

  const index: MemoryIndex = {
    scope,
    updated: new Date().toISOString(),
    active: entries.filter(e => e.status === "active"),
    stale: entries.filter(e => e.status === "stale"),
    archived: entries.filter(e => e.status === "archived"),
  }

  const indexPath = `${dir}/index.md`
  await writeFile(indexPath, formatIndexMarkdown(index))
}

export function formatIndexMarkdown(index: MemoryIndex): string {
  const lines: string[] = [
    `# Memory Index — \`${index.scope}\``,
    `*Last updated: ${index.updated}*`,
    "",
  ]

  for (const status of ["active", "stale", "archived"] as const) {
    const entries = index[status]
    if (entries.length === 0) continue
    lines.push(`## ${status} (${entries.length})`)
    lines.push("")
    if (status === "stale") {
      lines.push("| Slug | Title | Type | Tags | Updated | Expires |")
      lines.push("|------|-------|------|------|---------|---------|")
    } else {
      lines.push("| Slug | Title | Type | Tags | Updated | Importance |")
      lines.push("|------|-------|------|------|---------|------------|")
    }
      for (const e of entries) {
      const tags = esc(e.tags.join(", ")) || "—"
      if (status === "stale") {
        lines.push(`| ${esc(e.slug)} | ${esc(e.title)} | ${esc(e.type)} | ${tags} | ${e.updated} | ${e.expires ?? "—"} |`)
      } else {
        lines.push(`| ${esc(e.slug)} | ${esc(e.title)} | ${esc(e.type)} | ${tags} | ${e.updated} | ${e.importance} |`)
      }
    }
    lines.push("")
  }

  return lines.join("\n")
}

export async function readIndex(
  scope: MemoryScope,
  worktree: string,
  globalPath: string,
): Promise<MemoryIndex | null> {
  const dir = resolveMemoryDir(scope, worktree, globalPath)
  const indexPath = `${dir}/index.md`
  if (!(await fileExists(indexPath))) return null

  const content = await readFile(indexPath)
  return parseIndexMarkdown(content, scope)
}

function parseIndexMarkdown(content: string, scope: MemoryScope): MemoryIndex {
  const entries: MemoryIndexEntry[] = []
  const lines = content.split("\n")
  let currentStatus: MemoryStatus | null = null

  for (const line of lines) {
    if (line.startsWith("## active")) currentStatus = "active"
    else if (line.startsWith("## stale")) currentStatus = "stale"
    else if (line.startsWith("## archived")) currentStatus = "archived"
    else if (line.startsWith("|") && !line.includes("---") && currentStatus) {
      const cells = line.split("|").map(c => unesc(c.trim())).filter(Boolean)
      if (cells.length >= 5) {
        entries.push({
          slug: cells[0] ?? "",
          title: cells[1] ?? "",
          type: (cells[2] ?? "context") as MemoryIndexEntry["type"],
          tags: cells[3] === "—" ? [] : (cells[3] ?? "").split(",").map(t => t.trim()),
          status: currentStatus,
          updated: cells[4] ?? "",
          importance: currentStatus !== "stale" ? Number(cells[5]) || 3 : 3,
          expires: currentStatus === "stale" ? cells[5] || undefined : undefined,
        })
      }
    }
  }

  return {
    scope,
    updated: new Date().toISOString(),
    active: entries.filter(e => e.status === "active"),
    stale: entries.filter(e => e.status === "stale"),
    archived: entries.filter(e => e.status === "archived"),
  }
}

export async function getMemoryStats(
  worktree: string,
  globalPath: string,
): Promise<Record<MemoryScope, { total: number; active: number; stale: number; archived: number }>> {
  const result: Record<string, { total: number; active: number; stale: number; archived: number }> = {}

  // Session scope — count files across all session subdirectories
  let sessionTotal = 0
  const sessionBase = join(worktree, ".openmemory", "session")
  if (await fileExists(sessionBase)) {
    try {
      const entries = await readdir(sessionBase, { withFileTypes: true })
      const sessionDirs = entries.filter(e => e.isDirectory()).map(e => join(sessionBase, e.name))
      for (const dir of sessionDirs) {
        const files = await listMdFiles(dir)
        sessionTotal += files.length
      }
    } catch {
    }
  }
  result["session"] = { total: sessionTotal, active: sessionTotal, stale: 0, archived: 0 }

  // Project and global — use indexes
  for (const scope of ["project", "global"] as MemoryScope[]) {
    const index = await readIndex(scope, worktree, globalPath)
    result[scope] = index
      ? {
          total: index.active.length + index.stale.length + index.archived.length,
          active: index.active.length,
          stale: index.stale.length,
          archived: index.archived.length,
        }
      : { total: 0, active: 0, stale: 0, archived: 0 }
  }

  return result as Record<MemoryScope, typeof result[string]>
}

function esc(s: string): string {
  return s.replace(/\|/g, "\\|")
}

function unesc(s: string): string {
  return s.replace(/\\\|/g, "|")
}
