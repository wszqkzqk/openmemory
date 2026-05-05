import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import { ensureDir, writeFile } from "../src/storage"
import { buildMemoryFile } from "../src/frontmatter"
import { regenerateIndex } from "../src/indexer"
import { buildCompactionContext, cleanupSessionMemories } from "../src/compaction"
import type { MemoryFrontMatter } from "../src/types"

describe("compaction", () => {
  let tmpDir: string

  const baseFm: MemoryFrontMatter = {
    title: "",
    type: "context",
    scope: "session:test",
    tags: [],
    created: "2026-01-01",
    updated: "2026-01-01",
    status: "active",
    source: "agent",
    importance: 3,
  }

  beforeAll(async () => {
    tmpDir = join(os.tmpdir(), `openmemory-compact-${Date.now()}`)
    await ensureDir(`${tmpDir}/.openmemory/session`)
    await ensureDir(`${tmpDir}/.openmemory/project`)

    await writeFile(
      `${tmpDir}/.openmemory/session/debug-note.md`,
      buildMemoryFile(
        { ...baseFm, title: "Debug: Memory leak", type: "context", tags: ["debug"], importance: 2 },
        "Memory leak only reproduces when NODE_ENV=production.",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/session/finding.md`,
      buildMemoryFile(
        { ...baseFm, title: "Finding: Auth bug root cause", type: "context", tags: ["auth", "bug"], importance: 4 },
        "Root cause is expired refresh token not handled in middleware.",
      ),
    )

    await writeFile(
      `${tmpDir}/.openmemory/project/architecture.md`,
      buildMemoryFile(
        { ...baseFm, title: "Architecture", type: "context", scope: "project:test", tags: ["architecture"], importance: 3, updated: "2026-05-01" },
        "Microservices with Redis caching.",
      ),
    )

    await regenerateIndex("project", tmpDir, "/tmp/openmemory")
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("buildCompactionContext includes session discoveries", async () => {
    const context = await buildCompactionContext(tmpDir, "/tmp/openmemory")
    expect(context).toContain("Session Discoveries")
    expect(context).toContain("Debug: Memory leak")
    expect(context).toContain("Finding: Auth bug root cause")
  })

  it("buildCompactionContext includes project memory index", async () => {
    const context = await buildCompactionContext(tmpDir, "/tmp/openmemory")
    expect(context).toContain("Project Memory (Active)")
    expect(context).toContain("Architecture")
  })

  it("cleanupSessionMemories does not throw", async () => {
    await expect(cleanupSessionMemories(tmpDir)).resolves.toBeUndefined()
  })
})
