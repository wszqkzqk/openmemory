import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { isValidSlug, slugFromFilename, filenameFromSlug, resolveMemoryDir, resolveMemoryPath } from "../src/types"

describe("types", () => {
  describe("isValidSlug", () => {
    it("accepts valid kebab-case slugs", () => {
      expect(isValidSlug("auth-architecture")).toBe(true)
      expect(isValidSlug("testing-conventions")).toBe(true)
      expect(isValidSlug("redis")).toBe(true)
      expect(isValidSlug("api-rate-limiting")).toBe(true)
      expect(isValidSlug("node-14-migration")).toBe(true)
    })

    it("rejects invalid slugs", () => {
      expect(isValidSlug("")).toBe(false)
      expect(isValidSlug("Auth-Architecture")).toBe(false)
      expect(isValidSlug("auth architecture")).toBe(false)
      expect(isValidSlug("auth--architecture")).toBe(false)
      expect(isValidSlug("-auth")).toBe(false)
      expect(isValidSlug("auth-")).toBe(false)
      expect(isValidSlug("auth_architecture")).toBe(false)
    })
  })

  describe("slugFromFilename", () => {
    it("strips .md extension", () => {
      expect(slugFromFilename("auth.md")).toBe("auth")
      expect(slugFromFilename("testing-conventions.md")).toBe("testing-conventions")
    })
  })

  describe("filenameFromSlug", () => {
    it("appends .md extension", () => {
      expect(filenameFromSlug("auth")).toBe("auth.md")
    })
  })

  describe("resolveMemoryDir", () => {
    it("resolves session memory path", () => {
      const dir = resolveMemoryDir("session", "/home/user/project", "/home/user/.local/share/openmemory")
      expect(dir).toBe("/home/user/project/.openmemory/session")
    })

    it("resolves project memory path", () => {
      const dir = resolveMemoryDir("project", "/home/user/project", "/home/user/.local/share/openmemory")
      expect(dir).toBe("/home/user/project/.openmemory/project")
    })

    it("resolves global memory path", () => {
      const dir = resolveMemoryDir("global", "/home/user/project", "/home/user/.local/share/openmemory")
      expect(dir).toBe("/home/user/.local/share/openmemory")
    })
  })

  describe("resolveMemoryPath", () => {
    it("builds full file path", () => {
      const path = resolveMemoryPath("project", "auth", "/home/user/project", "/tmp/openmemory")
      expect(path).toBe("/home/user/project/.openmemory/project/auth.md")
    })
  })
})
