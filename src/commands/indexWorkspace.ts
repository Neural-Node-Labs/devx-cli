import { OllamaClient } from "../llm/ollamaClient";
import { buildIndex, getIndexPath } from "../index/indexManager";

/**
 * devx -index
 * Walks the workspace, summarizes each file via the LLM (with a heuristic fallback),
 * and writes .devx/index.json. This is a direct scan, not a ReAct agent loop — there's
 * nothing to "decide" here, just files to process.
 */
export async function runIndexCommand(cwd: string, llm: OllamaClient): Promise<void> {
  console.log(`devx: indexing workspace at ${cwd} ...\n`);

  const index = await buildIndex(cwd, llm, {
    onProgress: (current, total, relPath) => {
      process.stdout.write(`\r[${current}/${total}] ${relPath}`.padEnd(100));
    },
  });

  console.log(`\n\nIndexed ${index.fileCount} files.`);
  console.log(`Saved to ${getIndexPath(cwd)}`);
}
