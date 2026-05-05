import { homedir } from "node:os"

export function getHomedir(): string {
  return process.env.HOME || homedir()
}

export function getGlobalPath(): string {
  return process.env.XDG_DATA_HOME || `${getHomedir()}/.local/share`
}

export function getGlobalMemoryPath(): string {
  return `${getGlobalPath()}/openmemory`
}
