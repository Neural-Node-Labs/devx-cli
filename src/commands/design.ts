/**
 * @file src/commands/design.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -design [requirement.md] -architecture [architecture.md]
 * Produces a design document from requirements (+ optional architecture constraints).
 */
export function buildDesignTask(parsed: ParsedCli): string {
  const requirement = parsed.values["design"];
  const architecture = parsed.values["architecture"];

  return `You are producing a technical DESIGN document for a software feature.

REQUIREMENTS:
${requirement || "(no requirement content provided)"}

${architecture ? `ARCHITECTURE CONSTRAINTS:\n${architecture}\n` : ""}
INSTRUCTIONS:
1. Explore the existing project (glob_tool/grep_tool/read_tool) to understand current structure and conventions.
2. Write a design document to "design.md" at the project root (write_tool, mode "overwrite") covering:
   - Summary of the requirement
   - Proposed component breakdown (list each component/module with responsibility)
   - Data model / interfaces, if applicable
   - Key design decisions and trade-offs
   - Open questions or risks
3. There is nothing to "run" for a pure design task — validation here means re-reading the file you wrote
   back with read_tool to confirm it was saved correctly and is well-formed, then give your Final Answer.`;
}
