import { glob } from "glob";
import path from "path";
import { ToolDefinition, ToolResult } from "../types";

/**
 * glob_tool: agentic file search by pattern.
 * Input: { pattern: string, cwd?: string, limit?: number }
 */
export function createGlobTool(cwd: string): ToolDefinition {
  return {
    name: "glob_tool",
    description:
      "Find files matching a glob pattern (e.g. 'src/**/*.ts', '**/*.test.ts'). " +
      "Use this to discover which files exist before reading or editing them.",
    inputSchema: `{ "pattern": "src/**/*.ts", "limit": 50 }`,
    run: async (input: any): Promise<ToolResult> => {
      try {
        const pattern = input?.pattern;
        if (!pattern || typeof pattern !== "string") {
          return { ok: false, output: "Error: 'pattern' (string) is required." };
        }
        const limit = typeof input?.limit === "number" ? input.limit : 100;
        const matches = await glob(pattern, {
          cwd,
          nodir: true,
          ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
        });
        const relative = matches.slice(0, limit).map((m) => path.relative(cwd, path.resolve(cwd, m)) || m);
        if (relative.length === 0) {
          return { ok: true, output: `No files matched pattern "${pattern}".` };
        }
        return { ok: true, output: relative.join("\n") };
      } catch (err: any) {
        return { ok: false, output: `Error running glob: ${err.message}` };
      }
    },
  };
}
