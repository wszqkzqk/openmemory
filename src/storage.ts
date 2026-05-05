import { mkdir, readdir, unlink, stat } from "node:fs/promises"
import { join, dirname } from "node:path"

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

export async function listMdFiles(dir: string): Promise<string[]> {
  if (!(await fileExists(dir))) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(e => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
    .map(e => e.name)
}

export async function gitHash(worktree: string): Promise<string | undefined> {
  try {
    const { stdout } = await Bun.$`git -C ${worktree} rev-parse HEAD`.nothrow()
    return stdout.toString().trim() || undefined
  } catch {
    return undefined
  }
}

export async function listSessionDirs(worktree: string): Promise<string[]> {
  const sessionBase = join(worktree, ".openmemory", "session")
  if (!(await fileExists(sessionBase))) return []
  try {
    const entries = await readdir(sessionBase, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => join(sessionBase, e.name))
  } catch {
    return []
  }
}
