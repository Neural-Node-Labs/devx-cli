/**
 * @file src/utils/fileResolver.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { walkFiles } from "./fileWalker";
import { loadIndex } from "../index/indexManager";

export interface ResolveResult {
  /** Relative path to use, or null if it could not be resolved unambiguously. */
  resolvedPath: string | null;
  /** Human-readable explanation of how (or why not) the path was resolved — surfaced to the agent as part of the Observation. */
  note: string;
  /** When ambiguous, the candidate relative paths found. */
  candidates?: string[];
}

/**
 * Resolves a file path requested by the agent using a three-step strategy:
 *   1. Direct check — does the path exist as given?
 *   2. Workspace index (.devx/index.json) — look up by filename/path.
 *   3. Manual filesystem search — walk the tree for a matching filename.
 * This means devx keeps working even if the index is stale or was never built.
 */
export function resolveFilePath(cwd: string, requestedPath: string): ResolveResult {
  const direct = path.resolve(cwd, requestedPath);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return { resolvedPath: requestedPath, note: "found at the given path" };
  }

  const baseName = path.basename(requestedPath);

  // Step 2: workspace index
  const index = loadIndex(cwd);
  if (index) {
    const matches = index.files.filter(
      (f) => f.filename === baseName || f.path === requestedPath || f.path.endsWith("/" + baseName)
    );
    const existing = matches.filter((m) => fs.existsSync(path.resolve(cwd, m.path)));

    if (existing.length === 1) {
      return {
        resolvedPath: existing[0].path,
        note: `not found at "${requestedPath}"; resolved via workspace index (.devx/index.json) to "${existing[0].path}"`,
      };
    }
    if (existing.length > 1) {
      return {
        resolvedPath: null,
        note: `ambiguous: multiple files named "${baseName}" found in the workspace index`,
        candidates: existing.map((m) => m.path),
      };
    }
    // index present but had no (valid) match — fall through to manual search
  }

  // Step 3: manual filesystem search
  const manualMatches = walkFiles(cwd)
    .map((f) => path.relative(cwd, f))
    .filter((relPath) => path.basename(relPath) === baseName);

  if (manualMatches.length === 1) {
    return {
      resolvedPath: manualMatches[0],
      note:
        `not found at "${requestedPath}" and not in the workspace index; located manually by filename ` +
        `match at "${manualMatches[0]}" (consider running "devx -index" to refresh the index)`,
    };
  }
  if (manualMatches.length > 1) {
    return {
      resolvedPath: null,
      note: `ambiguous: multiple files named "${baseName}" found in the workspace`,
      candidates: manualMatches,
    };
  }

  return {
    resolvedPath: null,
    note: `file not found at "${requestedPath}", not in the workspace index, and no file named "${baseName}" exists anywhere in the workspace`,
  };
}
