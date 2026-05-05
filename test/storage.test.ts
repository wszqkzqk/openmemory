import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import os from "node:os"
import {
  ensureDir,
  fileExists,
  readFile,
  writeFile,
  deleteFile,
  listMdFiles,
} from "../src/storage"

describe("storage", () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = join(os.tmpdir(), `openmemory-test-${Date.now()}`)
    await ensureDir(tmpDir)
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe("ensureDir", () => {
    it("creates nested directories", async () => {
      const deep = join(tmpDir, "a", "b", "c")
      await ensureDir(deep)
      const exists = await fileExists(deep)
      expect(exists).toBe(true)
      // And should not throw when listing
      await expect(ensureDir(deep)).resolves.toBeUndefined()
    })
  })

  describe("writeFile and readFile", () => {
    it("writes and reads file content", async () => {
      const path = join(tmpDir, "test.md")
      await writeFile(path, "Hello, world!")
      const content = await readFile(path)
      expect(content).toBe("Hello, world!")
    })

    it("creates parent directories automatically", async () => {
      const path = join(tmpDir, "nested", "dir", "file.md")
      await writeFile(path, "content")
      const content = await readFile(path)
      expect(content).toBe("content")
    })
  })

  describe("fileExists", () => {
    it("returns true for existing files", async () => {
      const path = join(tmpDir, "exists.md")
      await writeFile(path, "x")
      expect(await fileExists(path)).toBe(true)
    })

    it("returns false for non-existent files", async () => {
      const path = join(tmpDir, "nonexistent.md")
      expect(await fileExists(path)).toBe(false)
    })
  })

  describe("deleteFile", () => {
    it("deletes a file", async () => {
      const path = join(tmpDir, "delete-me.md")
      await writeFile(path, "x")
      expect(await fileExists(path)).toBe(true)
      await deleteFile(path)
      expect(await fileExists(path)).toBe(false)
    })

    it("does not throw for non-existent files", async () => {
      await expect(deleteFile(join(tmpDir, "no-such-file.md"))).resolves.toBeUndefined()
    })
  })

  describe("listMdFiles", () => {
    it("lists .md files excluding index.md", async () => {
      await writeFile(join(tmpDir, "a.md"), "")
      await writeFile(join(tmpDir, "b.md"), "")
      await writeFile(join(tmpDir, "index.md"), "")
      await writeFile(join(tmpDir, "not-a-markdown.txt"), "")

      const files = await listMdFiles(tmpDir)
      expect(files).toContain("a.md")
      expect(files).toContain("b.md")
      expect(files).not.toContain("index.md")
      expect(files).not.toContain("not-a-markdown.txt")
    })

    it("returns empty array for non-existent directory", async () => {
      const files = await listMdFiles(join(tmpDir, "no-such-dir"))
      expect(files).toEqual([])
    })
  })
})
