import type { MemoryFrontMatter, MemoryFile, MemoryScope } from "./types"
import { DEFAULT_FRONTMATTER, MemoryType, MemoryStatus, MemorySource } from "./types"
import { readFile } from "./storage"

const FM_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

export function splitFrontMatter(content: string): { raw: string; body: string } | null {
  const match = content.match(FM_RE)
  if (!match || !match[1]) return null
  return { raw: match[1], body: match[2] ?? "" }
}

export function parseFrontMatter(raw: string): MemoryFrontMatter {
  const parsed = Bun.YAML.parse(raw)
  return mergeDefaults(parsed)
}

function mergeDefaults(data: unknown): MemoryFrontMatter {
  if (typeof data !== "object" || data === null) return { ...DEFAULT_FRONTMATTER }
  const d = data as Record<string, unknown>

  const typeVal = sanitizeString(d.type)
  const scopeVal = sanitizeString(d.scope)
  const statusVal = isValidStatus(d.status) ? d.status : DEFAULT_FRONTMATTER.status
  const sourceVal = isValidSource(d.source) ? d.source : DEFAULT_FRONTMATTER.source

  return {
    title: sanitizeString(d.title) || DEFAULT_FRONTMATTER.title,
    type: (MemoryType as readonly string[]).includes(typeVal) ? (typeVal as MemoryFrontMatter["type"]) : DEFAULT_FRONTMATTER.type,
    scope: scopeVal || DEFAULT_FRONTMATTER.scope,
    tags: Array.isArray(d.tags) ? d.tags.filter((t: unknown) => typeof t === "string").slice(0, 5) : [],
    created: sanitizeString(d.created) || toISODate(new Date()),
    updated: sanitizeString(d.updated) || toISODate(new Date()),
    status: (MemoryStatus as readonly string[]).includes(statusVal) ? (statusVal as MemoryFrontMatter["status"]) : DEFAULT_FRONTMATTER.status,
    source: (MemorySource as readonly string[]).includes(sourceVal) ? (sourceVal as MemoryFrontMatter["source"]) : DEFAULT_FRONTMATTER.source,
    importance: typeof d.importance === "number" && d.importance >= 1 && d.importance <= 5
      ? d.importance
      : DEFAULT_FRONTMATTER.importance,
    expires: sanitizeString(d.expires) || undefined,
    gitHash: sanitizeString(d["git-hash"]) || sanitizeString(d.gitHash) || undefined,
    related: Array.isArray(d.related)
      ? d.related.filter((r: unknown) => typeof r === "string").slice(0, 10)
      : undefined,
    entities: Array.isArray(d.entities)
      ? d.entities.filter((e: unknown) => typeof e === "string").slice(0, 20)
      : undefined,
  }
}

function sanitizeString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function isValidStatus(v: unknown): v is string {
  return typeof v === "string" && ["active", "stale", "archived"].includes(v)
}

function isValidSource(v: unknown): v is string {
  return typeof v === "string" && ["user", "agent", "system"].includes(v)
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0] ?? ""
}

export function formatFrontMatter(fm: MemoryFrontMatter): string {
  const data: Record<string, unknown> = {
    title: fm.title,
    type: fm.type,
    scope: fm.scope,
    tags: fm.tags,
    created: fm.created,
    updated: fm.updated,
    status: fm.status,
    source: fm.source,
    importance: fm.importance,
  }
  if (fm.expires) data.expires = fm.expires
  if (fm.gitHash) data["git-hash"] = fm.gitHash
  if (fm.related && fm.related.length > 0) data.related = fm.related
  if (fm.entities && fm.entities.length > 0) data.entities = fm.entities

  return `---\n${Bun.YAML.stringify(data).trim()}\n---`
}

export function buildMemoryFile(fm: MemoryFrontMatter, body: string): string {
  return `${formatFrontMatter(fm)}\n\n${body.trim()}\n`
}

export async function readMemoryFile(
  path: string,
  slug: string,
  scope: MemoryScope,
): Promise<MemoryFile | null> {
  const content = await readFile(path)
  if (!content) return null

  const split = splitFrontMatter(content)
  if (!split) {
    return {
      path,
      slug,
      scope,
      frontmatter: { ...DEFAULT_FRONTMATTER },
      body: content.trim(),
    }
  }

  return {
    path,
    slug,
    scope,
    frontmatter: parseFrontMatter(split.raw),
    body: split.body.trim(),
  }
}

export function extractFrontMatterSummary(memory: MemoryFile): string {
  const fm = memory.frontmatter
  const lines = [
    `# ${fm.title}`,
    `**Scope**: ${memory.scope}  |  **Type**: ${fm.type}  |  **Status**: ${fm.status}  |  **Importance**: ${fm.importance}/5`,
    `**Tags**: ${fm.tags.join(", ") || "none"}`,
    `**Updated**: ${fm.updated}`,
  ]
  if (fm.expires) lines.push(`**Expires**: ${fm.expires}`)
  if (fm.gitHash) lines.push(`**Git**: ${fm.gitHash}`)
  if (fm.related && fm.related.length > 0) lines.push(`**Related**: ${fm.related.join(", ")}`)
  if (fm.entities && fm.entities.length > 0) lines.push(`**Entities**: ${fm.entities.join(", ")}`)
  lines.push("")
  lines.push(memory.body.slice(0, 200) + (memory.body.length > 200 ? "..." : ""))
  return lines.join("\n")
}

export function extractFrontMatterCompact(memory: MemoryFile): string {
  const fm = memory.frontmatter
  return `**${memory.slug}** — ${fm.title} [${fm.type}, ${fm.importance}/5] tags: ${fm.tags.join(", ") || "—"}`
}
