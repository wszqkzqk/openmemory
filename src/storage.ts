import { mkdir, readdir, unlink, rename, stat } from "node:fs/promises"
import { join, dirname } from "node:path"

export function getProjectBase(worktree: string): string {
  return join(worktree, ".openmemory")
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function readFile(path: string): Promise<string> {
  return Bun.file(path).text()
}

export async function writeFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path))
  await Bun.write(path, content)
}

export async function deleteFile(path: string): Promise<void> {
  if (await fileExists(path)) {
    await unlink(path)
  }
}

export async function moveFile(from: string, to: string): Promise<void> {
  await ensureDir(dirname(to))
  if (await fileExists(to)) {
    await unlink(to)
  }
  await rename(from, to)
}

export async function listMdFiles(dir: string): Promise<string[]> {
  if (!(await fileExists(dir))) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(e => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
    .map(e => e.name)
}

export async function lastModified(path: string): Promise<Date> {
  try {
    const s = await stat(path)
    return s.mtime
  } catch {
    return new Date()
  }
}
