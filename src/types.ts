import type { z } from "zod"

export const MemoryType = ["identity", "directive", "context", "bookmark"] as const
export type MemoryType = (typeof MemoryType)[number]

export const MemoryScope = ["session", "project", "global"] as const
export type MemoryScope = (typeof MemoryScope)[number]

export const MemoryStatus = ["active", "stale", "archived"] as const
export type MemoryStatus = (typeof MemoryStatus)[number]

export const MemorySource = ["user", "agent", "system"] as const
export type MemorySource = (typeof MemorySource)[number]

export interface MemoryFrontMatter {
  title: string
  type: MemoryType
  scope: string
  tags: string[]
  created: string
  updated: string
  status: MemoryStatus
  source: MemorySource
  importance: number
  expires?: string
  gitHash?: string
  related?: string[]
  entities?: string[]
}

export interface MemoryFile {
  path: string
  slug: string
  scope: MemoryScope
  frontmatter: MemoryFrontMatter
  body: string
}

export interface MemoryIndexEntry {
  slug: string
  title: string
  type: MemoryType
  tags: string[]
  status: MemoryStatus
  updated: string
  importance: number
  expires?: string
}

export interface MemoryIndex {
  scope: MemoryScope
  updated: string
  active: MemoryIndexEntry[]
  stale: MemoryIndexEntry[]
  archived: MemoryIndexEntry[]
}

export interface SearchResult {
  slug: string
  scope: MemoryScope
  title: string
  type: MemoryType
  tags: string[]
  status: MemoryStatus
  updated: string
  importance: number
  snippet?: string
}

export interface StalenessReport {
  slug: string
  scope: MemoryScope
  title: string
  reason: StalenessReason
  detail: string
}

export type StalenessReason = "git-hash-drift" | "expired" | "age-exceeded"

export interface PluginConfig {
  globalPath: string
  autoPromoteThreshold: number
  staleAgeDays: number
  injectOnFirstTurn: boolean
  maxInjectTokens: number
  maxSearchResults: number
}

/**
 * Build a scoped filename that encodes the scope.
 * Project memory: "project/<slug>.md" stored at .openmemory/project/<slug>.md
 * Session memory: "session/<slug>.md" stored at .openmemory/session/<slug>.md
 * Global memory: "<slug>.md" stored at globalPath/<slug>.md
 */
export function resolveMemoryDir(scope: MemoryScope, worktree: string, globalPath: string): string {
  switch (scope) {
    case "session":
      return `${worktree}/.openmemory/session`
    case "project":
      return `${worktree}/.openmemory/project`
    case "global":
      return globalPath
  }
}

export function resolveMemoryPath(
  scope: MemoryScope,
  slug: string,
  worktree: string,
  globalPath: string,
): string {
  const dir = resolveMemoryDir(scope, worktree, globalPath)
  return `${dir}/${slug}.md`
}

export function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "")
}

export function filenameFromSlug(slug: string): string {
  return `${slug}.md`
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}

export function isValidFrontMatter(data: unknown): data is MemoryFrontMatter {
  if (typeof data !== "object" || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.title === "string" &&
    typeof d.type === "string" && MemoryType.includes(d.type as MemoryType) &&
    typeof d.scope === "string" &&
    Array.isArray(d.tags) && d.tags.every((t: unknown) => typeof t === "string") &&
    typeof d.created === "string" &&
    typeof d.updated === "string"
  )
}

export const DEFAULT_FRONTMATTER: MemoryFrontMatter = {
  title: "",
  type: "context",
  scope: "project:unknown",
  tags: [],
  created: "",
  updated: "",
  status: "active",
  source: "agent",
  importance: 3,
}

export const DEFAULT_CONFIG: PluginConfig = {
  globalPath: "",
  autoPromoteThreshold: 3,
  staleAgeDays: 60,
  injectOnFirstTurn: true,
  maxInjectTokens: 2000,
  maxSearchResults: 10,
}
