/**
 * @file src/commands/implement.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -implement [design.md] -component all
 * devx -implement [design.md] -component compo1
 */
export function buildImplementTask(parsed: ParsedCli): string {
  const design = parsed.values["implement"];
  const component = parsed.values["component"] || "all";

  const scope =
    component.toLowerCase() === "all"
      ? "Implement ALL components described in the design document."
      : `Implement ONLY the component named "${component}" from the design document. Do not touch unrelated components.`;

  return `You are IMPLEMENTING code based on an approved design document.

DESIGN DOCUMENT:
${design || "(no design content provided)"}

SCOPE:
${scope}

INSTRUCTIONS:
1. Explore the existing project structure with glob_tool and grep_tool to understand conventions
   (naming, folder layout, existing patterns) before writing new code.
2. Read any files you'll be modifying with read_tool first.
3. Implement the code using write_tool ("edit" mode for existing files, "overwrite" mode for new files).
4. Validate your work with run_command: run the type-checker/build (e.g. "npx tsc --noEmit" or the project's
   build script) and the test suite if one exists. Fix any errors that surface and re-run until it passes.
5. Only give a Final Answer once the code compiles/builds and, if tests exist, they pass. Summarize which
   files were created/changed and the validation commands you ran with their results.`;
}
