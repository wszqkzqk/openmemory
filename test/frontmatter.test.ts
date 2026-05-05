import { describe, it, expect } from "bun:test"
import {
  splitFrontMatter,
  parseFrontMatter,
  formatFrontMatter,
  buildMemoryFile,
  extractFrontMatterSummary,
  extractFrontMatterCompact,
} from "../src/frontmatter"
import type { MemoryFrontMatter } from "../src/types"
import { DEFAULT_FRONTMATTER } from "../src/types"

describe("frontmatter", () => {
  describe("splitFrontMatter", () => {
    it("splits YAML front matter from body", () => {
      const content = [
        "---",
        "title: Test Memory",
        "type: context",
        "scope: project:test",
        "tags: [a, b]",
        "created: 2026-01-01",
        "updated: 2026-01-01",
        "---",
        "",
        "This is the body content.",
      ].join("\n")

      const result = splitFrontMatter(content)
      expect(result).not.toBeNull()
      expect(result!.raw).toContain("title: Test Memory")
      expect(result!.body.trim()).toBe("This is the body content.")
    })

    it("returns null for content without front matter", () => {
      const result = splitFrontMatter("Just plain text")
      expect(result).toBeNull()
    })

    it("handles empty body", () => {
      const content = ["---", "title: Test", "---", ""].join("\n")
      const result = splitFrontMatter(content)
      expect(result).not.toBeNull()
      expect(result!.body).toBe("")
    })
  })

  describe("parseFrontMatter", () => {
    it("parses valid YAML front matter", () => {
      const raw = [
        "title: Auth Architecture",
        "type: context",
        "scope: project:backend",
        "tags: [auth, security]",
        "created: 2026-01-01",
        "updated: 2026-01-15",
        "status: active",
        "source: agent",
        "importance: 4",
        "git-hash: a1b2c3d4",
      ].join("\n")

      const fm = parseFrontMatter(raw)
      expect(fm.title).toBe("Auth Architecture")
      expect(fm.type).toBe("context")
      expect(fm.scope).toBe("project:backend")
      expect(fm.tags).toEqual(["auth", "security"])
      expect(fm.status).toBe("active")
      expect(fm.source).toBe("agent")
      expect(fm.importance).toBe(4)
      expect(fm.gitHash).toBe("a1b2c3d4")
    })

    it("falls back to defaults for missing fields", () => {
      const raw = "title: Minimal"
      const fm = parseFrontMatter(raw)
      expect(fm.title).toBe("Minimal")
      expect(fm.type).toBe(DEFAULT_FRONTMATTER.type)
      expect(fm.status).toBe(DEFAULT_FRONTMATTER.status)
      expect(fm.importance).toBe(DEFAULT_FRONTMATTER.importance)
    })

    it("handles empty input", () => {
      const fm = parseFrontMatter("")
      expect(fm.title).toBe(DEFAULT_FRONTMATTER.title)
    })

    it("clamps importance to [1,5] range", () => {
      const fm = parseFrontMatter("importance: 999")
      expect(fm.importance).toBe(3) // 999 outside [1,5] falls back to default
    })

    it("limits tags to 5", () => {
      const raw = "tags: [a, b, c, d, e, f, g]"
      const fm = parseFrontMatter(raw)
      expect(fm.tags.length).toBeLessThanOrEqual(5)
    })
  })

  describe("formatFrontMatter", () => {
    it("formats front matter with all fields", () => {
      const fm: MemoryFrontMatter = {
        title: "Test",
        type: "context",
        scope: "project:test",
        tags: ["a", "b"],
        created: "2026-01-01",
        updated: "2026-01-01",
        status: "active",
        source: "agent",
        importance: 3,
      }

      const result = formatFrontMatter(fm)
      expect(result).toContain("title: Test")
      expect(result).toContain("type: context")
      expect(result).toContain("tags:")
      expect(result.startsWith("---")).toBe(true)
      expect(result.endsWith("---")).toBe(true)
    })

    it("includes optional fields when present", () => {
      const fm: MemoryFrontMatter = {
        title: "Test",
        type: "context",
        scope: "project:test",
        tags: [],
        created: "2026-01-01",
        updated: "2026-01-01",
        status: "active",
        source: "agent",
        importance: 3,
        gitHash: "abc12345",
        expires: "2026-12-31",
      }

      const result = formatFrontMatter(fm)
      expect(result).toContain("git-hash: abc12345")
      expect(result).toContain("expires: 2026-12-31")
    })
  })

  describe("buildMemoryFile", () => {
    it("builds a complete memory file", () => {
      const fm: MemoryFrontMatter = {
        title: "Test",
        type: "context",
        scope: "project:test",
        tags: ["a"],
        created: "2026-01-01",
        updated: "2026-01-01",
        status: "active",
        source: "agent",
        importance: 3,
      }

      const result = buildMemoryFile(fm, "Body content")
      expect(result.startsWith("---")).toBe(true)
      expect(result).toContain("title: Test")
      expect(result).toContain("Body content")
    })
  })

  describe("extractFrontMatterSummary", () => {
    it("produces a readable summary", () => {
      const memory = {
        path: "/tmp/auth.md",
        slug: "auth",
        scope: "project" as const,
        frontmatter: {
          title: "Auth Architecture",
          type: "context" as const,
          scope: "project:backend",
          tags: ["auth"],
          created: "2026-01-01",
          updated: "2026-01-01",
          status: "active" as const,
          source: "agent" as const,
          importance: 4,
        },
        body: "Detailed auth architecture notes here.",
      }

      const summary = extractFrontMatterSummary(memory)
      expect(summary).toContain("Auth Architecture")
      expect(summary).toContain("context")
      expect(summary).toContain("4/5")
      expect(summary).toContain("Detailed auth architecture notes")
    })
  })

  describe("extractFrontMatterCompact", () => {
    it("produces a single-line compact summary", () => {
      const memory = {
        path: "/tmp/auth.md",
        slug: "auth",
        scope: "project" as const,
        frontmatter: {
          title: "Auth Architecture",
          type: "context" as const,
          scope: "project:backend",
          tags: ["auth", "security"],
          created: "2026-01-01",
          updated: "2026-01-01",
          status: "active" as const,
          source: "agent" as const,
          importance: 4,
        },
        body: "Notes",
      }

      const compact = extractFrontMatterCompact(memory)
      expect(compact).toContain("auth")
      expect(compact).toContain("Auth Architecture")
      expect(compact).toContain("context")
      expect(compact).toContain("4/5")
      expect(compact).toContain("auth, security")
    })
  })
})
