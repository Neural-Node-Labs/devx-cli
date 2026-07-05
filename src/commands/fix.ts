/**
 * @file src/commands/fix.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -fix [issue detail]
 * "issue detail" may itself be a filepath to a bug report, or inline text.
 */
export function buildFixTask(parsed: ParsedCli): string {
  const issueDetail = parsed.values["fix"];

  return `You are FIXING a bug in this codebase.

ISSUE DETAIL:
${issueDetail || "(no issue detail provided)"}

INSTRUCTIONS:
1. Use grep_tool/glob_tool to locate the code related to this issue (error messages, function names,
   file names mentioned in the issue detail are good search seeds).
2. Read the relevant file(s) with read_tool to understand current behavior.
3. If possible, first reproduce the bug with run_command (e.g. run the failing test, or a small repro script)
   BEFORE fixing it, so you have a baseline failure to compare against.
4. Apply the minimal fix using write_tool (mode "edit").
5. Validate: re-run the same reproduction/test command from step 3 and confirm it now passes. Also run the
   broader test suite if one exists, to check you haven't broken anything else.
6. Give a Final Answer summarizing the root cause, the fix applied, and the validation output.`;
}
