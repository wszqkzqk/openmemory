import type { MemoryScope, MemoryType, MemoryStatus, SearchResult } from "./types"
import { resolveMemoryDir, slugFromFilename } from "./types"
import { listMdFiles } from "./storage"
import { readMemoryFile } from "./frontmatter"

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

  for (const scope of scopes) {
    const dir = resolveMemoryDir(scope, worktree, globalPath)
    const files = await listMdFiles(dir)

    for (const filename of files) {
      const slug = slugFromFilename(filename)
      const memory = await readMemoryFile(`${dir}/${filename}`, slug, scope)
      if (!memory) continue

      const fm = memory.frontmatter

      // Filter by status (default: active + stale)
      if (params.status) {
        if (fm.status !== params.status) continue
      } else {
        if (fm.status === "archived") continue
      }

      // Filter by type
      if (params.type && fm.type !== params.type) continue

      // Filter by tags
      if (params.tags && params.tags.length > 0) {
        const hasAllTags = params.tags.every(t => fm.tags.includes(t))
        if (!hasAllTags) continue
      }

      // Filter by query
      if (query) {
        const searchableText = [
          fm.title,
          ...fm.tags,
          memory.body,
          slug,
        ].join(" ").toLowerCase()

        if (!searchableText.includes(query)) continue
      }

      const snippet = query
        ? extractSnippet(memory.body, query)
        : undefined

      results.push({
        slug,
        scope,
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

  // Sort by importance (desc), then by updated date (desc)
  results.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance
    return b.updated.localeCompare(a.updated)
  })

  return results.slice(0, limit)
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
