import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import { ensureDir, writeFile } from "../src/storage"
import { buildMemoryFile } from "../src/frontmatter"
import { checkStaleness, formatStalenessReports } from "../src/staleness"
import type { MemoryFrontMatter } from "../src/types"

describe("staleness", () => {
  let tmpDir: string
  let globalPath: string

  const baseFm: MemoryFrontMatter = {
    title: "",
    type: "context",
    scope: "project:test",
    tags: [],
    created: "2026-01-01",
    updated: "2026-01-01",
    status: "active",
    source: "agent",
    importance: 3,
  }

  beforeAll(async () => {
    tmpDir = join(os.tmpdir(), `openmemory-stale-${Date.now()}`)
    globalPath = join(os.tmpdir(), `openmemory-global-${Date.now()}`)
    await ensureDir(`${tmpDir}/.openmemory/project`)

    await writeFile(
      `${tmpDir}/.openmemory/project/expired.md`,
      buildMemoryFile(
        { ...baseFm, title: "Expired", expires: "2025-01-01" },
        "Expired content",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/project/drift.md`,
      buildMemoryFile(
        { ...baseFm, title: "Drift", gitHash: "abcd1234" },
        "Drift content",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/project/old.md`,
      buildMemoryFile(
        { ...baseFm, title: "Old", updated: "2020-01-01" },
        "Old content",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/project/fresh.md`,
      buildMemoryFile(
        { ...baseFm, title: "Fresh", updated: new Date().toISOString() },
        "Fresh content",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/project/archived.md`,
      buildMemoryFile(
        { ...baseFm, title: "Archived", status: "archived" },
        "Archived content",
      ),
    )
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("detects expired memories", async () => {
    const reports = await checkStaleness(undefined, tmpDir, globalPath, 60)
    const expired = reports.filter(r => r.reason === "expired")
    expect(expired.length).toBeGreaterThanOrEqual(1)
    expect(expired.some(r => r.slug === "expired")).toBe(true)
  })

  it("detects git hash drift", async () => {
    const reports = await checkStaleness(undefined, tmpDir, globalPath, 60, "efgh5678")
    const drift = reports.filter(r => r.reason === "git-hash-drift")
    expect(drift.length).toBeGreaterThanOrEqual(1)
    expect(drift.some(r => r.slug === "drift")).toBe(true)
  })

  it("detects old memories exceeding age threshold", async () => {
    const reports = await checkStaleness(undefined, tmpDir, globalPath, 1)
    const ageExceeded = reports.filter(r => r.reason === "age-exceeded")
    expect(ageExceeded.length).toBeGreaterThanOrEqual(1)
    expect(ageExceeded.some(r => r.slug === "old")).toBe(true)
  })

  it("does not flag fresh memories", async () => {
    const reports = await checkStaleness(undefined, tmpDir, globalPath, 60)
    expect(reports.some(r => r.slug === "fresh")).toBe(false)
  })

  it("does not flag archived memories", async () => {
    const reports = await checkStaleness(undefined, tmpDir, globalPath, 60)
    expect(reports.some(r => r.slug === "archived")).toBe(false)
  })

  it("does not flag git-hash-drift if git hash matches", async () => {
    const reports = await checkStaleness(undefined, tmpDir, globalPath, 60, "abcd1234")
    const drift = reports.filter(r => r.reason === "git-hash-drift" && r.slug === "drift")
    expect(drift.length).toBe(0)
  })

  it("filters by scope", async () => {
    const reports = await checkStaleness("project", tmpDir, globalPath, 1)
    expect(reports.every(r => r.scope === "project")).toBe(true)
  })

  it("formatStalenessReports produces readable output", () => {
    const reports = [
      { slug: "expired", scope: "project" as const, title: "Expired Mem", reason: "expired" as const, detail: "Expired on 2025-01-01" },
      { slug: "old", scope: "project" as const, title: "Old Mem", reason: "age-exceeded" as const, detail: "Last updated 365 days ago" },
    ]

    const formatted = formatStalenessReports(reports)
    expect(formatted).toContain("Expired Mem")
    expect(formatted).toContain("Old Mem")
    expect(formatted).toContain("[EXPIRED]")
    expect(formatted).toContain("[OLD]")
  })

  it("returns empty message when no stale memories", () => {
    expect(formatStalenessReports([])).toBe("All memories appear current.")
  })
})
