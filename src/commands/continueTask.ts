import { TaskHistoryEntry } from "../devxState/historyManager";

/**
 * devx -continue
 * Resumes the most recent unfinished task recorded in .devx/history.md.
 */
export function buildContinueTask(entry: TaskHistoryEntry): string {
  return `You are RESUMING a previously unfinished task. Do not assume prior actions fully succeeded —
re-check the current state of the project first, since files may already be partially changed.

ORIGINAL TASK TYPE: ${entry.command}
ORIGINAL REQUEST (preview): ${entry.requestPreview}
STATUS WHEN LAST STOPPED: ${entry.status.toUpperCase()} after ${entry.iterations} iteration(s)
NOTES FROM LAST RUN: ${entry.summary}

INSTRUCTIONS:
1. Use index_lookup_tool / glob_tool / grep_tool / read_tool to inspect the current state of any
   files that were likely touched or relevant, rather than trusting the notes above blindly.
2. Determine what's left to do to complete the original task, and finish it.
3. Validate your work with run_command (tests/build/lint) before declaring completion.
4. Give a Final Answer summarizing what was completed in this run and the validation results.`;
}
