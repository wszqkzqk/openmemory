import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import { ensureDir, writeFile } from "../src/storage"
import { searchMemories } from "../src/search"
import { buildMemoryFile } from "../src/frontmatter"
import type { MemoryFrontMatter } from "../src/types"

describe("search", () => {
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
    tmpDir = join(os.tmpdir(), `openmemory-search-${Date.now()}`)
    globalPath = join(os.tmpdir(), `openmemory-global-${Date.now()}`)
    await ensureDir(`${tmpDir}/.openmemory/project`)
    await ensureDir(globalPath)

    await writeFile(
      `${tmpDir}/.openmemory/project/auth.md`,
      buildMemoryFile(
        { ...baseFm, title: "Auth Architecture", type: "context", tags: ["auth", "security"], importance: 4 },
        "JWT-based authentication with Redis sessions. The auth middleware is in src/middleware/auth.ts",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/project/testing.md`,
      buildMemoryFile(
        { ...baseFm, title: "Testing Conventions", type: "context", tags: ["testing", "jest"], importance: 3 },
        "Always run tests before committing. Use Jest with Supertest for API tests.",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/project/gotchas.md`,
      buildMemoryFile(
        { ...baseFm, title: "CI Timeout Workaround", type: "context", tags: ["ci", "workaround"], status: "stale", importance: 2 },
        "Temporary workaround for CI timeout on ARM runners.",
      ),
    )

    await writeFile(
      `${globalPath}/prefs.md`,
      buildMemoryFile(
        { ...baseFm, title: "TypeScript Preferences", type: "identity", scope: "global", tags: ["typescript", "preferences"], importance: 5 },
        "Always use TypeScript strict mode.",
      ),
    )
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("finds memories by keyword", async () => {
    const results = await searchMemories({ query: "auth" }, tmpDir, globalPath)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.slug === "auth")).toBe(true)
  })

  it("finds memories by tag", async () => {
    const results = await searchMemories({ tags: ["jest"] }, tmpDir, globalPath)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some(r => r.slug === "testing")).toBe(true)
  })

  it("filters by scope", async () => {
    const results = await searchMemories({ scope: "global" }, tmpDir, globalPath)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.scope === "global")).toBe(true)
  })

  it("filters by type", async () => {
    const results = await searchMemories({ type: "identity" }, tmpDir, globalPath)
    expect(results.every(r => r.type === "identity")).toBe(true)
  })

  it("filters by status", async () => {
    const results = await searchMemories({ status: "stale" }, tmpDir, globalPath)
    expect(results.every(r => r.status === "stale")).toBe(true)
  })

  it("excludes archived by default", async () => {
    const results = await searchMemories({}, tmpDir, globalPath)
    expect(results.every(r => r.status !== "archived")).toBe(true)
  })

  it("limits results", async () => {
    const results = await searchMemories({ limit: 2 }, tmpDir, globalPath)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it("sorts by importance then date", async () => {
    const results = await searchMemories({}, tmpDir, globalPath)
    const importance5Idx = results.findIndex(r => r.importance === 5)
    const importance3Idx = results.findIndex(r => r.importance === 3)
    if (importance5Idx >= 0 && importance3Idx >= 0) {
      expect(importance5Idx).toBeLessThan(importance3Idx)
    }
  })

  it("returns empty for no matches", async () => {
    const results = await searchMemories({ query: "nonexistent-keyword-xyz" }, tmpDir, globalPath)
    expect(results).toHaveLength(0)
  })
})
