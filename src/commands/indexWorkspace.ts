/**
 * @file src/commands/indexWorkspace.ts
 * @version 0.3.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { LlmClient } from "../llm/types";
import { buildIndex, getIndexPath } from "../index/indexManager";

/**
 * devx -index
 * Walks the workspace, summarizes each file via the LLM (with a heuristic fallback),
 * and writes .devx/index.json. This is a direct scan, not a ReAct agent loop — there's
 * nothing to "decide" here, just files to process.
 */
export async function runIndexCommand(cwd: string, llm: LlmClient): Promise<void> {
  console.log(`devx: indexing workspace at ${cwd} ...\n`);

  const index = await buildIndex(cwd, llm, {
    onProgress: (current, total, relPath) => {
      process.stdout.write(`\r[${current}/${total}] ${relPath}`.padEnd(100));
    },
  });

  console.log(`\n\nIndexed ${index.fileCount} files.`);
  if (index.ignoreFilesUsed?.length) {
    console.log(`Respected: ${index.ignoreFilesUsed.join(", ")} (skipped ${index.ignoredCount ?? 0} entries).`);
  } else if (index.ignoredCount) {
    console.log(`Skipped ${index.ignoredCount} entries (default-ignored dirs; no .gitignore/.dockerignore/.devxignore found).`);
  }
  console.log(`Saved to ${getIndexPath(cwd)}`);
}
