import type { MemoryScope, MemoryFrontMatter, StalenessReport, StalenessReason } from "./types"
import { resolveMemoryDir } from "./types"
import { listMdFiles, fileExists, listSessionDirs } from "./storage"
import { readMemoryFile } from "./frontmatter"
import { join } from "node:path"

const MS_PER_DAY = 86_400_000

export async function checkStaleness(
  scope: MemoryScope | undefined,
  worktree: string,
  globalPath: string,
  staleAgeDays: number,
  currentGitHash?: string,
): Promise<StalenessReport[]> {
  const scopes: MemoryScope[] = scope ? [scope] : ["session", "project", "global"]
  const reports: StalenessReport[] = []

  for (const s of scopes) {
    if (s === "session") {
      const sessionReports = await checkSessionStaleness(worktree, staleAgeDays)
      reports.push(...sessionReports)
      continue
    }

    const dir = resolveMemoryDir(s, worktree, globalPath)
    if (!(await fileExists(dir))) continue

    const files = await listMdFiles(dir)
    for (const filename of files) {
      const slug = filename.replace(/\.md$/, "")
      const path = join(dir, filename)
      const memory = await readMemoryFile(path, slug, s)
      if (!memory || memory.frontmatter.status === "archived") continue

      const report = checkMemoryStaleness(memory.frontmatter, slug, s, staleAgeDays, currentGitHash)
      if (report) reports.push(report)
    }
  }

  return reports
}

async function checkSessionStaleness(worktree: string, staleAgeDays: number): Promise<StalenessReport[]> {
  const reports: StalenessReport[] = []
  const sessionDirs = await listSessionDirs(worktree)

  for (const sessionDir of sessionDirs) {
    const files = await listMdFiles(sessionDir)
    for (const filename of files) {
      const slug = filename.replace(/\.md$/, "")
      const path = join(sessionDir, filename)
      const memory = await readMemoryFile(path, slug, "session")
      if (!memory || memory.frontmatter.status === "archived") continue

      const report = checkMemoryStaleness(memory.frontmatter, slug, "session", staleAgeDays)
      if (report) reports.push(report)
    }
  }

  return reports
}

function checkMemoryStaleness(
  fm: MemoryFrontMatter,
  slug: string,
  scope: MemoryScope,
  staleAgeDays: number,
  currentGitHash?: string,
): StalenessReport | null {
  if (fm.expires) {
    const expiresDate = new Date(fm.expires)
    if (expiresDate < new Date()) {
      return { slug, scope, title: fm.title, reason: "expired", detail: `Expired on ${fm.expires}` }
    }
  }

  if (fm.gitHash && currentGitHash && fm.gitHash !== currentGitHash) {
    return {
      slug, scope, title: fm.title, reason: "git-hash-drift",
      detail: `Memory recorded at git ${fm.gitHash}, HEAD is now ${currentGitHash}. References may be outdated.`,
    }
  }

  const updatedTime = new Date(fm.updated).getTime()
  const now = Date.now()
  if (now - updatedTime > staleAgeDays * MS_PER_DAY) {
    const daysOld = Math.round((now - updatedTime) / MS_PER_DAY)
    return {
      slug, scope, title: fm.title, reason: "age-exceeded",
      detail: `Last updated ${daysOld} days ago (exceeds ${staleAgeDays}-day threshold).`,
    }
  }

  return null
}

export function formatStalenessReports(reports: StalenessReport[]): string {
  if (reports.length === 0) return "All memories appear current."

  const reasonIcons: Record<StalenessReason, string> = {
    "git-hash-drift": "[CODE CHANGED]",
    "expired": "[EXPIRED]",
    "age-exceeded": "[OLD]",
  }

  return reports
    .map(r => `**${reasonIcons[r.reason]}** \`${r.scope}/${r.slug}\` — ${r.title}\n  ${r.detail}`)
    .join("\n\n")
}
