/**
 * @file src/tools/dumpReader.ts
 * @version 0.3.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { ToolDefinition, ToolResult } from "../types";
import { getDevxDir, getDumpPath, IndexedFile, loadIndex } from "../index/indexManager";

interface DumpEntry {
  path: string;
  content: string;
  lineCount: number;
}

// Matches the "\n<====...>\nFILE: <path>\n<====...>\n" header written by
// indexManager's dumpHeader(). Using "=+" (not a fixed count) so this keeps
// working even if that separator width ever changes.
const HEADER_RE = /\n=+\nFILE: (.+)\n=+\n/g;

/**
 * Splits one dump part file's raw content into one entry per file, using the
 * "FILE: <path>" headers as boundaries — so a single tool call always returns
 * exactly one file's worth of content, never an arbitrary line window that
 * cuts across two unrelated files.
 */
function parseDumpFile(raw: string): DumpEntry[] {
  const matches = [...raw.matchAll(HEADER_RE)];
  return matches.map((m, i) => {
    const filePath = m[1].trim();
    const contentStart = m.index! + m[0].length;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index! : raw.length;
    const content = raw.slice(contentStart, contentEnd).replace(/\n+$/, "");
    return { path: filePath, content, lineCount: content ? content.split("\n").length : 0 };
  });
}

/** Finds an entry by exact path, falling back to an unambiguous filename match. */
function findByPath<T extends { path: string }>(
  entries: T[],
  requestedPath: string
): { entry: T | null; ambiguous: T[] | null } {
  const exact = entries.find((e) => e.path === requestedPath);
  if (exact) return { entry: exact, ambiguous: null };

  const baseName = requestedPath.split("/").pop();
  const candidates = entries.filter((e) => e.path === baseName || e.path.endsWith("/" + baseName));
  if (candidates.length === 1) return { entry: candidates[0], ambiguous: null };
  if (candidates.length > 1) return { entry: null, ambiguous: candidates };
  return { entry: null, ambiguous: null };
}

/**
 * dump_read_tool: reads the precomputed workspace content dump one file at a time, instead
 * of paging through it with read_tool. Once a workspace has been indexed (which also builds
 * this dump), the dump is normally the fastest and most complete way to understand the whole
 * project without touching the filesystem file-by-file.
 *
 * Large workspaces produce a dump too big for one file, so it's split across multiple
 * size-capped part files (index.1.dump, index.2.dump, ...). Which part holds which file's
 * content is recorded directly on that file's entry in .devx/index.json (dumpPart / dumpLineCount)
 * — there's no separate manifest to go stale or fall out of sync. This tool reads index.json to
 * navigate straight to the right part; the agent never needs to know which part a file lives in,
 * or how many parts exist. A legacy, pre-split single .devx/index.dump (built by an older version
 * of the index command, with no dumpPart info in index.json) is still supported as a fallback.
 */
export function createDumpReadTool(cwd: string): ToolDefinition {
  return {
    name: "dump_read_tool",
    description:
      "Read the precomputed workspace content dump one file at a time, instead of paging through it " +
      "with read_tool. This is normally the fastest and most complete way to understand an entire " +
      "project, since the dump already contains every indexed file's content. Large workspaces are " +
      "split transparently across multiple dump part files — you don't need to know about that; just " +
      'use paths as given. Mode "list" returns every file path in the dump plus its line count — ' +
      'always call this first. Mode "read" returns the exact, complete dumped content for one file, ' +
      "looked up by path (falls back to a filename match if the exact path isn't found). Call mode " +
      '"read" once per file you actually need, based on the paths from "list" — never try to guess ' +
      "line ranges into a raw dump file, since file boundaries don't line up with fixed-size line windows.",
    inputSchema: `List: { "mode": "list" }\nRead: { "mode": "read", "path": "src/foo.ts" }`,
    run: async (input: any): Promise<ToolResult> => {
      const index = loadIndex(cwd);
      const filesWithDump: IndexedFile[] = index?.dumpParts?.length
        ? index.files.filter((f) => !!f.dumpPart)
        : [];
      const hasDumpInfo = filesWithDump.length > 0;

      const legacyDumpPath = getDumpPath(cwd);
      const hasLegacyDump = !hasDumpInfo && fs.existsSync(legacyDumpPath);

      if (!hasDumpInfo && !hasLegacyDump) {
        return {
          ok: true,
          output:
            "No workspace dump found. Run the index command first (it builds this automatically), or " +
            "fall back to glob_tool/grep_tool/read_tool/index_lookup_tool to explore the live filesystem instead.",
        };
      }

      const mode = input?.mode === "read" ? "read" : "list";

      if (mode === "list") {
        if (hasDumpInfo) {
          const rendered = filesWithDump
            .map((f) => `${f.path} (${f.dumpLineCount ?? 0} line${f.dumpLineCount === 1 ? "" : "s"})`)
            .join("\n");
          return {
            ok: true,
            output:
              `${filesWithDump.length} file(s) across ${index!.dumpParts!.length} dump part(s). Fetch ` +
              `each one you need with { "mode": "read", "path": "<path>" } — the part is resolved for ` +
              `you automatically:\n\n${rendered}`,
          };
        }
        // Legacy single-file dump (no dumpPart info in index.json).
        const raw = fs.readFileSync(legacyDumpPath, "utf-8");
        const entries = parseDumpFile(raw);
        if (entries.length === 0) {
          return { ok: true, output: `.devx/index.dump exists but contains no parsable file entries.` };
        }
        const rendered = entries
          .map((e) => `${e.path} (${e.lineCount} line${e.lineCount === 1 ? "" : "s"})`)
          .join("\n");
        return {
          ok: true,
          output: `${entries.length} file(s) in the dump. Fetch each one you need with { "mode": "read", "path": "<path>" }:\n\n${rendered}`,
        };
      }

      // mode === "read"
      const requestedPath = input?.path;
      if (!requestedPath || typeof requestedPath !== "string") {
        return { ok: false, output: 'Error: \'path\' (string) is required for mode "read".' };
      }

      if (hasDumpInfo) {
        return readViaIndex(cwd, filesWithDump, requestedPath);
      }

      const raw = fs.readFileSync(legacyDumpPath, "utf-8");
      const entries = parseDumpFile(raw);
      const { entry, ambiguous } = findByPath(entries, requestedPath);
      if (ambiguous) {
        return {
          ok: false,
          output: `Error: ambiguous — multiple dump entries match "${requestedPath}": ${ambiguous.map((c) => c.path).join(", ")}`,
        };
      }
      if (!entry) {
        return {
          ok: false,
          output: `Error: no dump entry for "${requestedPath}". Call { "mode": "list" } to see available paths.`,
        };
      }
      const prefix = entry.path !== requestedPath ? `(resolved "${requestedPath}" -> "${entry.path}")\n` : "";
      return { ok: true, output: `${prefix}${entry.content || "(empty file)"}` };
    },
  };
}

/** Resolves a requested path to its dumpPart via index.json, then reads just that one part file. */
function readViaIndex(cwd: string, filesWithDump: IndexedFile[], requestedPath: string): ToolResult {
  const { entry: indexed, ambiguous } = findByPath(filesWithDump, requestedPath);
  if (ambiguous) {
    return {
      ok: false,
      output: `Error: ambiguous — multiple dump entries match "${requestedPath}": ${ambiguous.map((c) => c.path).join(", ")}`,
    };
  }
  if (!indexed) {
    return {
      ok: false,
      output: `Error: no dump entry for "${requestedPath}". Call { "mode": "list" } to see available paths.`,
    };
  }

  const partPath = path.join(getDevxDir(cwd), indexed.dumpPart!);
  let raw: string;
  try {
    raw = fs.readFileSync(partPath, "utf-8");
  } catch (err: any) {
    return {
      ok: false,
      output:
        `Error: index.json points "${indexed.path}" at part "${indexed.dumpPart}", but that part file ` +
        `could not be read (${err.message}). The dump may be stale or corrupted — re-run the index command.`,
    };
  }

  const entries = parseDumpFile(raw);
  const entry = entries.find((e) => e.path === indexed.path);
  if (!entry) {
    return {
      ok: false,
      output:
        `Error: index.json points "${indexed.path}" at part "${indexed.dumpPart}", but it wasn't found ` +
        `there. The dump may be stale or corrupted — re-run the index command.`,
    };
  }

  const prefix = entry.path !== requestedPath ? `(resolved "${requestedPath}" -> "${entry.path}")\n` : "";
  return { ok: true, output: `${prefix}${entry.content || "(empty file)"}` };
}
