/**
 * @file test-suite/refactor.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-refactor` — devx -refactor [refactor detail or filepath]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";
import { buildRefactorTask } from "../src/commands/refactor";

test("refactor: parses literal detail text", () => {
  const parsed = parseArgs(["node", "devx", "-refactor", "extract validation logic"]);
  assert.strictEqual(parsed.command, "refactor");
  assert.strictEqual(parsed.values["refactor"], "extract validation logic");
});

test("refactor: task explicitly requires behavior to stay unchanged", () => {
  const task = buildRefactorTask(parseArgs(["node", "devx", "-refactor", "extract validation logic"]));
  assert.match(task, /WITHOUT changing external behavior/);
  assert.match(task, /extract validation logic/);
});

test("refactor: task requires capturing a passing baseline before changing anything", () => {
  const task = buildRefactorTask(parseArgs(["node", "devx", "-refactor", "detail"]));
  assert.match(task, /passing baseline/i);
  assert.match(task, /re-run the test suite/i);
});
