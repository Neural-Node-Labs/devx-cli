/**
 * @file src/utils/fileWalker.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { CLI_COMMAND_NAME } from "../generated/brand";

const DEFAULT_IGNORE = new Set(["node_modules", "dist", ".git", "build", "coverage", `.${CLI_COMMAND_NAME}`]);

/** Recursively lists all files under `dir`, skipping common noise directories. */
export function walkFiles(dir: string, files: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (DEFAULT_IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}
