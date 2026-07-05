import fs from "fs";
import path from "path";
import { ToolDefinition, ToolResult } from "../types";
import { walkFiles } from "../utils/fileWalker";

/**
 * grep_tool: agentic content search across files.
 * Input: { query: string, filePattern?: string, cwd?: string, maxMatches?: number, contextLines?: number }
 */
export function createGrepTool(cwd: string): ToolDefinition {
  return {
    name: "grep_tool",
    description:
      "Search file contents for a regex or plain-text pattern across the project. " +
      "Use this to locate where a symbol, function, string, or error message appears.",
    inputSchema: `{ "query": "function fooBar", "filePattern": "\\\\.ts$", "maxMatches": 50, "contextLines": 1 }`,
    run: async (input: any): Promise<ToolResult> => {
      try {
        const query = input?.query;
        if (!query || typeof query !== "string") {
          return { ok: false, output: "Error: 'query' (string) is required." };
        }
        const maxMatches = typeof input?.maxMatches === "number" ? input.maxMatches : 50;
        const contextLines = typeof input?.contextLines === "number" ? input.contextLines : 1;
        let fileFilter: RegExp | null = null;
        if (input?.filePattern) {
          try {
            fileFilter = new RegExp(input.filePattern);
          } catch {
            fileFilter = null;
          }
        }

        let re: RegExp;
        try {
          re = new RegExp(query, "gi");
        } catch {
          // fall back to escaped literal search if invalid regex
          re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        }

        const allFiles = walkFiles(cwd);
        const results: string[] = [];
        let matchCount = 0;

        for (const file of allFiles) {
          if (fileFilter && !fileFilter.test(file)) continue;
          let content: string;
          try {
            content = fs.readFileSync(file, "utf-8");
          } catch {
            continue;
          }
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            re.lastIndex = 0;
            if (re.test(lines[i])) {
              matchCount++;
              const start = Math.max(0, i - contextLines);
              const end = Math.min(lines.length - 1, i + contextLines);
              const snippet = lines
                .slice(start, end + 1)
                .map((l, idx) => `${start + idx + 1}: ${l}`)
                .join("\n");
              results.push(`${path.relative(cwd, file)}:${i + 1}\n${snippet}`);
              if (matchCount >= maxMatches) break;
            }
          }
          if (matchCount >= maxMatches) break;
        }

        if (results.length === 0) {
          return { ok: true, output: `No matches found for "${query}".` };
        }
        return { ok: true, output: results.join("\n---\n") };
      } catch (err: any) {
        return { ok: false, output: `Error running grep: ${err.message}` };
      }
    },
  };
}
