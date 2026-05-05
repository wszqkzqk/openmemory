import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import { ensureDir, writeFile, readFile } from "../src/storage"
import { buildMemoryFile } from "../src/frontmatter"
import { regenerateIndex, readIndex, getMemoryStats, formatIndexMarkdown } from "../src/indexer"
import type { MemoryFrontMatter } from "../src/types"

describe("indexer", () => {
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
    tmpDir = join(os.tmpdir(), `openmemory-indexer-${Date.now()}`)
    globalPath = join(os.tmpdir(), `openmemory-global-${Date.now()}`)
    await ensureDir(`${tmpDir}/.openmemory/project`)

    await writeFile(
      `${tmpDir}/.openmemory/project/auth.md`,
      buildMemoryFile(
        { ...baseFm, title: "Auth Architecture", type: "context", tags: ["auth"], importance: 4, updated: "2026-05-01" },
        "Auth details",
      ),
    )
    await writeFile(
      `${tmpDir}/.openmemory/project/testing.md`,
      buildMemoryFile(
        { ...baseFm, title: "Testing Conventions", type: "context", tags: ["testing"], importance: 3, updated: "2026-04-28" },
        "Testing details",
      ),
    )
    await writeFile(
      `${tmpDir}/.openmemory/project/stale-note.md`,
      buildMemoryFile(
        { ...baseFm, title: "Old CI Note", type: "context", tags: ["ci"], status: "stale", importance: 2, updated: "2026-03-01" },
        "Stale content",
      ),
    )
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("regenerates index from memory files", async () => {
    await regenerateIndex("project", tmpDir, globalPath)
    const indexPath = `${tmpDir}/.openmemory/project/index.md`
    const exists = await Bun.file(indexPath).exists()
    expect(exists).toBe(true)

    const content = await readFile(indexPath)
    expect(content).toContain("Auth Architecture")
    expect(content).toContain("Testing Conventions")
    expect(content).toContain("Old CI Note")
  })

  it("reads back index correctly", async () => {
    await regenerateIndex("project", tmpDir, globalPath)
    const index = await readIndex("project", tmpDir, globalPath)
    expect(index).not.toBeNull()
    expect(index!.active.length).toBeGreaterThanOrEqual(2)
    expect(index!.stale.length).toBeGreaterThanOrEqual(1)
  })

  it("formatIndexMarkdown produces valid markdown tables", () => {
    const index = {
      scope: "project" as const,
      updated: "2026-01-01",
      active: [
        { slug: "auth", title: "Auth", type: "context" as const, tags: ["auth"], status: "active" as const, updated: "2026-01-01", importance: 4 },
      ],
      stale: [],
      archived: [],
    }

    const formatted = formatIndexMarkdown(index)
    expect(formatted).toContain("## active (1)")
    expect(formatted).toContain("auth")
    expect(formatted).toContain("Auth")
  })

  it("getMemoryStats returns correct counts", async () => {
    await regenerateIndex("project", tmpDir, globalPath)
    const stats = await getMemoryStats(tmpDir, globalPath)
    expect(stats.project.active).toBeGreaterThanOrEqual(2)
    expect(stats.project.stale).toBeGreaterThanOrEqual(1)
    expect(stats.project.archived).toBe(0)
  })

  it("returns null for non-existent scope", async () => {
    const index = await readIndex("session", tmpDir, globalPath)
    expect(index).toBeNull()
  })
})
