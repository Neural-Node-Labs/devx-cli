/**
 * @file src/tools/read.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { ToolDefinition, ToolResult } from "../types";
import { resolveFilePath } from "../utils/fileResolver";

/**
 * read_tool: read a file's content, optionally a line range.
 * Input: { path: string, startLine?: number, endLine?: number }
 */
export function createReadTool(cwd: string): ToolDefinition {
  return {
    name: "read_tool",
    description:
      "Read the contents of a file, optionally restricted to a line range. " +
      "Use this after glob_tool/grep_tool locate a file you need to inspect closely. " +
      "If the given path isn't found, this tool automatically checks the workspace index " +
      "(.devx/index.json) and, failing that, searches the filesystem manually for a matching filename.",
    inputSchema: `{ "path": "src/index.ts", "startLine": 1, "endLine": 200 }`,
    run: async (input: any): Promise<ToolResult> => {
      try {
        const relPath = input?.path;
        if (!relPath || typeof relPath !== "string") {
          return { ok: false, output: "Error: 'path' (string) is required." };
        }

        const resolved = resolveFilePath(cwd, relPath);
        if (!resolved.resolvedPath) {
          const candidateNote = resolved.candidates ? `\nCandidates: ${resolved.candidates.join(", ")}` : "";
          return { ok: false, output: `Error: ${resolved.note}${candidateNote}` };
        }

        const fullPath = path.resolve(cwd, resolved.resolvedPath);
        if (!fullPath.startsWith(path.resolve(cwd))) {
          return { ok: false, output: "Error: path escapes the project directory." };
        }
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const start = typeof input?.startLine === "number" ? Math.max(1, input.startLine) : 1;
        const end = typeof input?.endLine === "number" ? Math.min(lines.length, input.endLine) : lines.length;
        const slice = lines
          .slice(start - 1, end)
          .map((l, idx) => `${start + idx}: ${l}`)
          .join("\n");

        const prefix = resolved.resolvedPath !== relPath ? `(${resolved.note})\n` : "";
        return { ok: true, output: prefix + (slice || "(empty file)") };
      } catch (err: any) {
        return { ok: false, output: `Error reading file: ${err.message}` };
      }
    },
  };
}
