import fs from "fs";
import path from "path";
import { ToolDefinition, ToolResult } from "../types";
import { resolveFilePath } from "../utils/fileResolver";

/**
 * write_tool: create or fully overwrite a file, OR perform a targeted
 * find-and-replace edit on an existing file.
 *
 * Input for full write:
 *   { path: string, content: string, mode: "overwrite" }
 * Input for targeted edit:
 *   { path: string, mode: "edit", oldStr: string, newStr: string }
 */
export function createWriteTool(cwd: string): ToolDefinition {
  return {
    name: "write_tool",
    description:
      "Create a new file, overwrite an existing file, or apply a find-and-replace edit " +
      "to an existing file. Prefer 'edit' mode for small changes to existing files, and " +
      "'overwrite' mode only for new files or full rewrites.",
    inputSchema:
      `Overwrite: { "path": "src/foo.ts", "mode": "overwrite", "content": "..." }\n` +
      `Edit:      { "path": "src/foo.ts", "mode": "edit", "oldStr": "exact text to replace", "newStr": "replacement text" }`,
    run: async (input: any): Promise<ToolResult> => {
      try {
        const relPath = input?.path;
        if (!relPath || typeof relPath !== "string") {
          return { ok: false, output: "Error: 'path' (string) is required." };
        }
        const fullPath = path.resolve(cwd, relPath);
        if (!fullPath.startsWith(path.resolve(cwd))) {
          return { ok: false, output: "Error: path escapes the project directory." };
        }
        const mode = input?.mode === "edit" ? "edit" : "overwrite";

        if (mode === "overwrite") {
          const content = input?.content;
          if (typeof content !== "string") {
            return { ok: false, output: "Error: 'content' (string) is required for overwrite mode." };
          }
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content, "utf-8");
          return { ok: true, output: `Wrote ${content.split("\n").length} lines to ${relPath}` };
        }

        // edit mode
        const { oldStr, newStr } = input;
        if (typeof oldStr !== "string" || typeof newStr !== "string") {
          return { ok: false, output: "Error: 'oldStr' and 'newStr' (strings) are required for edit mode." };
        }
        const resolved = resolveFilePath(cwd, relPath);
        if (!resolved.resolvedPath) {
          const candidateNote = resolved.candidates ? `\nCandidates: ${resolved.candidates.join(", ")}` : "";
          return {
            ok: false,
            output: `Error: ${resolved.note}${candidateNote}\nUse mode "overwrite" to create a new file instead.`,
          };
        }
        const resolvedFullPath = path.resolve(cwd, resolved.resolvedPath);
        const original = fs.readFileSync(resolvedFullPath, "utf-8");
        const occurrences = original.split(oldStr).length - 1;
        if (occurrences === 0) {
          return { ok: false, output: "Error: 'oldStr' was not found in the file. No changes made." };
        }
        if (occurrences > 1) {
          return {
            ok: false,
            output: `Error: 'oldStr' matches ${occurrences} locations; it must be unique. Add more context and retry.`,
          };
        }
        const updated = original.replace(oldStr, newStr);
        fs.writeFileSync(resolvedFullPath, updated, "utf-8");
        const prefix = resolved.resolvedPath !== relPath ? `(${resolved.note}) ` : "";
        return { ok: true, output: `${prefix}Applied edit to ${resolved.resolvedPath}` };
      } catch (err: any) {
        return { ok: false, output: `Error writing file: ${err.message}` };
      }
    },
  };
}
