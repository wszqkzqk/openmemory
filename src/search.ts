import type { MemoryScope, MemoryType, MemoryStatus, SearchResult } from "./types"
import { slugFromFilename } from "./types"
import { listMdFiles, readFile, fileExists } from "./storage"
import { readMemoryFile } from "./frontmatter"
import { readIndex } from "./indexer"
import { readdir } from "node:fs/promises"
import { join } from "node:path"

export interface SearchParams {
  query?: string
  scope?: MemoryScope
  tags?: string[]
  type?: MemoryType
  status?: MemoryStatus
  limit?: number
}

export async function searchMemories(
  params: SearchParams,
  worktree: string,
  globalPath: string,
): Promise<SearchResult[]> {
  const scopes: MemoryScope[] = params.scope ? [params.scope] : ["session", "project", "global"]
  const results: SearchResult[] = []
  const query = params.query?.toLowerCase()
  const limit = params.limit ?? 10
  const needsBodyScan = !!query && query.length > 0

  for (const scope of scopes) {
    if (scope === "session") {
      const sessionResults = await searchSessionScope(params, worktree, needsBodyScan)
      results.push(...sessionResults)
      continue
    }

    // For project and global scopes, prefer index; fall back to file scan
    const index = await readIndex(scope, worktree, globalPath)

    if (index) {
      const candidates = [...index.active]
      if (!params.status || params.status !== "active") {
        candidates.push(...index.stale)
      }
      if (params.status === "archived") {
        candidates.push(...index.archived)
      }

      for (const entry of candidates) {
        if (params.status && entry.status !== params.status) continue
        if (params.type && entry.type !== params.type) continue
        if (params.tags && params.tags.length > 0) {
          if (!params.tags.every(t => entry.tags.includes(t))) continue
        }

        if (!needsBodyScan) {
          results.push({
            slug: entry.slug,
            scope,
            title: entry.title,
            type: entry.type,
            tags: entry.tags,
            status: entry.status,
            updated: entry.updated,
            importance: entry.importance,
          })
          continue
        }

        const titleLower = entry.title.toLowerCase()
        const tagsLower = entry.tags.join(" ").toLowerCase()
        if (titleLower.includes(query!) || tagsLower.includes(query!) || entry.slug.includes(query!)) {
          results.push({
            slug: entry.slug,
            scope,
            title: entry.title,
            type: entry.type,
            tags: entry.tags,
            status: entry.status,
            updated: entry.updated,
            importance: entry.importance,
          })
          continue
        }

        const dir = scope === "project"
          ? join(worktree, ".openmemory", "project")
          : globalPath
        const filePath = join(dir, `${entry.slug}.md`)
        const memory = await readMemoryFile(filePath, entry.slug, scope)
        if (!memory) continue

        if (memory.body.toLowerCase().includes(query!)) {
          const snippet = extractSnippet(memory.body, query!)
          results.push({
            slug: entry.slug,
            scope,
            title: entry.title,
            type: entry.type,
            tags: entry.tags,
            status: entry.status,
            updated: entry.updated,
            importance: entry.importance,
            snippet,
          })
        }
      }
    } else {
      // Fallback: no index available, scan files directly
      const dir = scope === "project"
        ? join(worktree, ".openmemory", "project")
        : globalPath
      const fileResults = await scanDirectory(dir, scope, params, needsBodyScan)
      results.push(...fileResults)
    }
  }

  results.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance
    return b.updated.localeCompare(a.updated)
  })

  return results.slice(0, limit)
}

async function searchSessionScope(
  params: SearchParams,
  worktree: string,
  needsBodyScan: boolean,
): Promise<SearchResult[]> {
  const query = params.query?.toLowerCase()
  const sessionBase = join(worktree, ".openmemory", "session")
  const results: SearchResult[] = []

  if (!(await fileExists(sessionBase))) return []

  // Walk all session subdirectories
  let sessionDirs: string[] = []
  try {
    const entries = await readdir(sessionBase, { withFileTypes: true })
    sessionDirs = entries.filter(e => e.isDirectory()).map(e => join(sessionBase, e.name))
  } catch {
    return []
  }

  for (const sessionDir of sessionDirs) {
    const files = await listMdFiles(sessionDir)
    for (const filename of files) {
      const slug = slugFromFilename(filename)
      const memory = await readMemoryFile(join(sessionDir, filename), slug, "session")
      if (!memory) continue

      const fm = memory.frontmatter
      if (params.status && fm.status !== params.status) continue
      if (params.type && fm.type !== params.type) continue
      if (params.tags && params.tags.length > 0) {
        if (!params.tags.every(t => fm.tags.includes(t))) continue
      }

      if (query) {
        const searchable = [fm.title, ...fm.tags, memory.body, slug].join(" ").toLowerCase()
        if (!searchable.includes(query)) continue
      }

      const snippet = query ? extractSnippet(memory.body, query) : undefined
      results.push({
        slug,
        scope: "session",
        title: fm.title,
        type: fm.type,
        tags: fm.tags,
        status: fm.status,
        updated: fm.updated,
        importance: fm.importance,
        snippet,
      })
    }
  }

  return results
}

async function scanDirectory(
  dir: string,
  scope: MemoryScope,
  params: SearchParams,
  needsBodyScan: boolean,
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const query = params.query?.toLowerCase()

  const files = await listMdFiles(dir)
  for (const filename of files) {
    const slug = slugFromFilename(filename)
    const memory = await readMemoryFile(join(dir, filename), slug, scope)
    if (!memory) continue

    const fm = memory.frontmatter
    if (params.status) { if (fm.status !== params.status) continue }
    else { if (fm.status === "archived") continue }
    if (params.type && fm.type !== params.type) continue
    if (params.tags && params.tags.length > 0) {
      if (!params.tags.every(t => fm.tags.includes(t))) continue
    }

    if (query) {
      const searchable = [fm.title, ...fm.tags, memory.body, slug].join(" ").toLowerCase()
      if (!searchable.includes(query)) continue
    }

    const snippet = query ? extractSnippet(memory.body, query) : undefined
    results.push({
      slug, scope, title: fm.title, type: fm.type, tags: fm.tags,
      status: fm.status, updated: fm.updated, importance: fm.importance, snippet,
    })
  }

  return results
}

function extractSnippet(body: string, query: string): string | undefined {
  const idx = body.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return undefined

  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + query.length + 100)
  let snippet = body.slice(start, end)

  if (start > 0) snippet = "..." + snippet
  if (end < body.length) snippet = snippet + "..."

  return snippet
}
