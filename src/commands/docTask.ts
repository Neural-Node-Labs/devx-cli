/**
 * @file src/commands/docTask.ts
 * @version 0.3.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ParsedCli } from "../cli/parseArgs";

export const DOC_TYPES = ["readme", "blueprint", "scenario", "testsuite", "setup", "testcase"] as const;
export type DocType = (typeof DOC_TYPES)[number];

const GROUNDING_RULE =
  "Base every claim strictly on what you actually find in the codebase — never invent features, " +
  "dependencies, scripts, or commands that don't exist. If something is genuinely unclear from the " +
  "code, say so explicitly rather than guessing. Never copy actual secret/credential values (API keys, " +
  "passwords, tokens, connection strings) from any file's content into the documents you write — refer " +
  "to the variable/setting name only (e.g. \"requires DEEPSEEK_API_KEY to be set\"), never its value.";

// Shared "digest first" step prepended to every doc type's instructions. Reading the whole workspace
// through the precomputed dump up front — once, completely — replaces the old approach of paging through
// .devx/index.dump in raw line windows (which routinely split file boundaries and produced incomplete or
// garbled context). Once digested this way, it is treated as authoritative and no further exploration is
// needed; write_tool/run_command afterward are for producing and validating output, not exploration.
const DIGEST_STEP = `1. DIGEST THE WORKSPACE:
   a. Call dump_read_tool with { "mode": "list" }.
   b. If it reports no dump exists, skip to step 2 and instead use index_lookup_tool/glob_tool/grep_tool/
      read_tool to explore the project directly.
   c. If a dump exists, call dump_read_tool with { "mode": "read", "path": "<path>" } once for every file
      path it listed that's relevant to this task — for a whole-project document that means essentially
      every source/config file; you can skip lockfiles, build output, and binary/asset paths.
   d. Once every relevant entry has been read this way, treat that content as your COMPLETE and
      AUTHORITATIVE picture of the current workspace for the rest of this task. Do NOT call
      index_lookup_tool/glob_tool/grep_tool/read_tool afterward to "double check" something already in
      the digested content — the dump reflects the workspace as of the last index run and re-exploring it
      wastes iterations. Only fall back to those tools for something the dump genuinely doesn't cover
      (e.g. it's stale, or a file was excluded from indexing).`;

/**
 * devx -doc [readme|blueprint|scenario|testsuite|setup|testcase]
 * All doc types route through the full ReAct loop so the agent actually inspects the
 * current workspace before writing anything, rather than generating generic boilerplate.
 */
export function buildDocTask(parsed: ParsedCli): string {
  const raw = (parsed.values["doc"] || "").trim().toLowerCase();
  if (!DOC_TYPES.includes(raw as DocType)) {
    throw new Error(`Unknown -doc type "${raw || "(empty)"}". Expected one of: ${DOC_TYPES.join(", ")}`);
  }

  switch (raw as DocType) {
    case "readme":
      return buildReadmeTask();
    case "blueprint":
      return buildBlueprintTask();
    case "scenario":
      return buildScenarioTask();
    case "testsuite":
      return buildTestsuiteTask();
    case "setup":
      return buildSetupTask();
    case "testcase":
      return buildTestcaseTask();
  }
}

function buildReadmeTask(): string {
  return `You are generating/updating README.md for the CURRENT WORKSPACE by examining the actual project.

${GROUNDING_RULE}

INSTRUCTIONS:
${DIGEST_STEP}
2. Write README.md at the project root (write_tool) covering: a clear project summary, key features,
   prerequisites, install/setup steps, how to run it, how to run its tests, a brief project structure
   overview, and a contributing section if there's evidence this is a collaborative project.
3. Re-read the file back with read_tool to confirm it saved correctly and renders as well-formed markdown.
4. Give a Final Answer summarizing what the README now covers and noting anything you couldn't verify.`;
}

function buildBlueprintTask(): string {
  return `You are producing a technical BLUEPRINT (design document) for the CURRENT WORKSPACE as it exists today.

${GROUNDING_RULE}

INSTRUCTIONS:
${DIGEST_STEP}
2. Write docs/BLUEPRINT.md (write_tool) covering:
   - System overview (what it is, one paragraph)
   - Component breakdown: each major module, its responsibility, and what it depends on / is depended on by
     (trace real imports/calls you saw in the digested content — don't assume)
   - Data flow: how a typical request/operation moves through the system
   - Key design decisions evident from the code, and any risks or inconsistencies you noticed
   - Suggested areas for improvement, if any stood out (clearly labeled as suggestions, not existing behavior)
3. Re-read the file back to confirm it saved correctly, then give a Final Answer summarizing the document's
   structure and any parts where the workspace's actual design was ambiguous.`;
}

function buildScenarioTask(): string {
  return `You are producing a BUSINESS SCENARIO document for the CURRENT WORKSPACE, inferred from the actual
code, comments, existing docs, and any requirement/design files present in the project.

${GROUNDING_RULE} Where the business context genuinely isn't derivable from the code (e.g. target market,
exact business goals), say so explicitly rather than fabricating specifics.

INSTRUCTIONS:
${DIGEST_STEP}
2. Write docs/SCENARIO.md (write_tool) covering:
   - The apparent business problem this project solves (based on evidence, with a note on confidence)
   - Likely user personas / actors and what they do with the system
   - Key user journeys / use cases the code supports today
   - Value proposition — why this matters to the business, as far as the code shows evidence for it
   - Open questions: business context that isn't determinable from the code alone
3. Re-read the file back to confirm it saved correctly, then give a Final Answer summarizing the scenario
   and flagging which parts are well-evidenced vs. inferred.`;
}

function buildTestsuiteTask(): string {
  return `You are generating a TEST SUITE covering the ENTIRE CURRENT WORKSPACE (not a single component).

${GROUNDING_RULE}

INSTRUCTIONS:
${DIGEST_STEP}
2. From the digested content, identify what test framework and conventions (if any) already exist
   (jest/vitest/mocha/pytest/etc., existing *.test.*/*.spec.* files, config files).
3. For each significant module lacking adequate test coverage, write a test file (write_tool, "overwrite"
   for new files) following the project's existing framework and naming conventions. If no framework exists,
   default to a zero-dependency approach appropriate to the language (e.g. Node's built-in "node:test" for
   JS/TS). Cover happy path, edge cases, and error handling per module — don't just write one trivial test.
4. Run the full test suite with run_command after writing the tests. Fix failures in the NEW tests you wrote
   (not the source code) unless a test reveals a genuine pre-existing bug — in that case, leave the test
   correct and report the bug rather than hiding it by writing a weaker test.
5. Write docs/TESTSUITE.md (write_tool) summarizing: which modules now have tests, what each test file
   covers, how to run the full suite, and the actual run_command output from step 4.
6. Give a Final Answer listing every test file created/modified, overall pass/fail status, and any known
   gaps in coverage you didn't have time/information to close.`;
}

function buildSetupTask(): string {
  return `You are producing a SETUP GUIDE (how to run this project locally) for the CURRENT WORKSPACE.

${GROUNDING_RULE}

INSTRUCTIONS:
${DIGEST_STEP}
2. From the digested content, determine the actual prerequisites (language/runtime + version, package
   manager, required services such as a database/cache/queue, required environment variables — check
   .env.example, config-loading code, docker-compose files, etc.) and the actual commands to install
   dependencies, build, run in development, run tests, and run in production (from package.json scripts /
   Makefile / justfile / CI config — whichever exists). If a command doesn't actually exist in the project,
   do not invent one.
3. If genuinely helpful and verifiable, try running the install step with run_command to confirm the command
   as documented actually works (skip if it would be destructive, slow, or require credentials you don't have).
4. Write docs/SETUP.md (write_tool) with numbered steps: prerequisites, installation, configuration
   (env vars/config files — names only, never values), running locally, running tests, and troubleshooting
   notes for anything you hit.
5. Give a Final Answer summarizing the setup steps and noting anything you couldn't verify by actually running it.`;
}

function buildTestcaseTask(): string {
  return `You are writing a TEST CASE document (not test code) for the CURRENT WORKSPACE — a structured,
human-readable list of test cases covering its functionality.

${GROUNDING_RULE}

INSTRUCTIONS:
${DIGEST_STEP}
2. Write docs/TESTCASES.md (write_tool) as a structured list. For each test case include:
   - ID (e.g. TC-001)
   - Title
   - Preconditions
   - Steps (numbered)
   - Expected result
   - Priority (High/Medium/Low), based on how central the behavior is to the system
   Group test cases by feature/module with a heading per group, and include both happy-path and
   edge-case/error-handling test cases for each feature.
3. Re-read the file back to confirm it saved correctly, then give a Final Answer summarizing how many
   test cases were written, grouped by feature, and any features you weren't able to fully characterize.`;
}
