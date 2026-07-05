import { ParsedCli } from "../cli/parseArgs";

export const DOC_TYPES = ["readme", "blueprint", "scenario", "testsuite", "setup", "testcase"] as const;
export type DocType = (typeof DOC_TYPES)[number];

const GROUNDING_RULE =
  "Base every claim strictly on what you actually find in the codebase (index_lookup_tool/glob_tool/" +
  "grep_tool/read_tool) — never invent features, dependencies, scripts, or commands that don't exist. " +
  "If something is genuinely unclear from the code, say so explicitly rather than guessing.";

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
1. Explore the workspace to determine: what the project does, its language/framework/runtime, folder
   structure, entry point(s), dependencies (check package.json / requirements.txt / pyproject.toml / go.mod
   / Cargo.toml / etc., whichever exists), existing build/test/run scripts, and any existing README.md to
   preserve genuinely useful content from (don't blindly overwrite good existing sections).
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
1. Explore the workspace's actual architecture: main modules/components and their responsibilities, how
   they interact (imports/calls between files — use grep_tool to trace real dependencies, not assumptions),
   data models/interfaces, external integrations (databases, APIs, queues), and entry points.
2. Write docs/BLUEPRINT.md (write_tool) covering:
   - System overview (what it is, one paragraph)
   - Component breakdown: each major module, its responsibility, and what it depends on / is depended on by
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
1. Explore the workspace for evidence of business intent: domain terminology in code/comments, existing
   requirement or design docs (design.md, docs/*, README, etc.), user-facing strings, API routes/endpoints
   that hint at what users can do, and any config suggesting the target environment (e.g. multi-tenant,
   payments, internal tool).
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
1. Use index_lookup_tool/glob_tool to enumerate the workspace's source modules, and grep_tool/read_tool to
   identify what test framework and conventions (if any) already exist (jest/vitest/mocha/pytest/etc.,
   existing *.test.*/*.spec.* files, config files).
2. For each significant module lacking adequate test coverage, write a test file (write_tool, "overwrite"
   for new files) following the project's existing framework and naming conventions. If no framework exists,
   default to a zero-dependency approach appropriate to the language (e.g. Node's built-in "node:test" for
   JS/TS). Cover happy path, edge cases, and error handling per module — don't just write one trivial test.
3. Run the full test suite with run_command after writing the tests. Fix failures in the NEW tests you wrote
   (not the source code) unless a test reveals a genuine pre-existing bug — in that case, leave the test
   correct and report the bug rather than hiding it by writing a weaker test.
4. Write docs/TESTSUITE.md (write_tool) summarizing: which modules now have tests, what each test file
   covers, how to run the full suite, and the actual run_command output from step 3.
5. Give a Final Answer listing every test file created/modified, overall pass/fail status, and any known
   gaps in coverage you didn't have time/information to close.`;
}

function buildSetupTask(): string {
  return `You are producing a SETUP GUIDE (how to run this project locally) for the CURRENT WORKSPACE.

${GROUNDING_RULE}

INSTRUCTIONS:
1. Determine the actual prerequisites: language/runtime + version (check .nvmrc, engines field, go.mod,
   pyproject.toml, etc.), package manager, required services (database, cache, message queue — check
   docker-compose.yml / config / env references), and any required environment variables (check .env.example,
   config loading code, or README).
2. Determine the actual commands to install dependencies, build, run in development, run tests, and run in
   production, by reading package.json scripts / Makefile / justfile / CI config — whichever exists. If a
   command doesn't actually exist in the project, do not invent one.
3. If genuinely helpful and verifiable, try running the install step with run_command to confirm the command
   as documented actually works (skip if it would be destructive, slow, or require credentials you don't have).
4. Write docs/SETUP.md (write_tool) with numbered steps: prerequisites, installation, configuration
   (env vars/config files), running locally, running tests, and troubleshooting notes for anything you hit.
5. Give a Final Answer summarizing the setup steps and noting anything you couldn't verify by actually running it.`;
}

function buildTestcaseTask(): string {
  return `You are writing a TEST CASE document (not test code) for the CURRENT WORKSPACE — a structured,
human-readable list of test cases covering its functionality.

${GROUNDING_RULE}

INSTRUCTIONS:
1. Explore the workspace to identify its major features/behaviors (via source code, routes/endpoints,
   CLI commands, public functions — whatever the project actually exposes).
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
