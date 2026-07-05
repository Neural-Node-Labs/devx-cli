/**
 * @file src/tools/indexLookup.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ToolDefinition, ToolResult } from "../types";
import { loadIndex, searchIndex } from "../index/indexManager";

/**
 * index_lookup_tool: search the workspace index (.devx/index.json) by filename,
 * path, or purpose/summary keyword. This is normally the fastest way to find a file
 * because it doesn't touch the filesystem — it's just a lookup against a precomputed
 * summary of the project built by `devx -index`.
 */
export function createIndexLookupTool(cwd: string): ToolDefinition {
  return {
    name: "index_lookup_tool",
    description:
      "Search the workspace index (.devx/index.json) by filename, path, or purpose/summary keyword. " +
      "Prefer this before glob_tool/grep_tool when an index exists — it's faster and includes a " +
      "one-line summary and purpose for each file. If no index exists yet, this tool will say so; " +
      "fall back to glob_tool/grep_tool in that case (or suggest the user run 'devx -index').",
    inputSchema: `{ "query": "authentication middleware" }`,
    run: async (input: any): Promise<ToolResult> => {
      const query = input?.query;
      if (!query || typeof query !== "string") {
        return { ok: false, output: "Error: 'query' (string) is required." };
      }
      const index = loadIndex(cwd);
      if (!index) {
        return {
          ok: true,
          output:
            "No workspace index found at .devx/index.json. Fall back to glob_tool/grep_tool for now " +
            "(the user can run 'devx -index' to build one for faster lookups in future runs).",
        };
      }
      const matches = searchIndex(index, query);
      if (matches.length === 0) {
        return { ok: true, output: `No index entries matched "${query}". Try glob_tool/grep_tool instead.` };
      }
      const rendered = matches
        .map((m) => `${m.path}\n  summary: ${m.summary}\n  purpose: ${m.purpose}`)
        .join("\n\n");
      return { ok: true, output: rendered };
    },
  };
}
