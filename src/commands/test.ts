import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -test [detail] -component []
 * Generates a test suite for a component (or the detail describes what to test).
 */
export function buildTestTask(parsed: ParsedCli): string {
  const detail = parsed.values["test"];
  const component = parsed.values["component"];

  return `You are GENERATING A TEST SUITE for this codebase.

TEST DETAIL / SCOPE:
${detail || "(no detail provided)"}

${component ? `TARGET COMPONENT: ${component}\n` : ""}
INSTRUCTIONS:
1. Use glob_tool/grep_tool to find the source file(s) for the component/behavior under test, and to see
   what test framework and conventions the project already uses (look for existing *.test.ts / *.spec.ts
   files, jest/vitest/mocha config, etc.).
2. Read the target source file(s) with read_tool to understand the public API/behavior to cover.
3. Write a test file using write_tool (mode "overwrite" for a new test file), covering:
   - Happy path behavior
   - Edge cases and invalid input
   - Error handling
   Follow the naming convention and test framework already used in the project; if none exists, default
   to a simple Node "node:test" + "node:assert" based file so it runs with zero extra dependencies.
4. Validate by actually running the new test file with run_command (e.g. "npx jest <file>", "npx vitest run <file>",
   or "node --test <file>" depending on what's available). Fix any failures in the tests themselves
   (not the source code) until they run cleanly, unless the failures reveal a genuine bug — in that case,
   report it in the Final Answer rather than silently "fixing" the test to hide it.
5. Give a Final Answer listing the test file created, what it covers, and the run_command output.`;
}
