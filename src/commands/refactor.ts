import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -refactor [refactor detail]
 */
export function buildRefactorTask(parsed: ParsedCli): string {
  const refactorDetail = parsed.values["refactor"];

  return `You are REFACTORING existing code WITHOUT changing external behavior.

REFACTOR DETAIL:
${refactorDetail || "(no refactor detail provided)"}

INSTRUCTIONS:
1. Use glob_tool/grep_tool to find all files affected by this refactor, including call sites that reference
   the code being changed (so nothing is left broken).
2. Read the relevant files with read_tool before editing.
3. Before making changes, if a test suite exists, run it once with run_command to capture the current
   passing baseline.
4. Apply the refactor incrementally using write_tool (mode "edit" preferred), keeping behavior identical.
5. After each meaningful change, re-run the test suite / build with run_command to confirm behavior is
   unchanged. If something breaks, fix it before continuing.
6. Give a Final Answer summarizing what was refactored, why, which files changed, and the before/after
   validation results.`;
}
