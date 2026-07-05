/**
 * @file test-suite/implement.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-implement` — devx -implement [design.md] -component [all|name]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";
import { buildImplementTask } from "../src/commands/implement";

test("implement: parses design content and component", () => {
  const parsed = parseArgs(["node", "devx", "-implement", "some design", "-component", "compo1"]);
  assert.strictEqual(parsed.command, "implement");
  assert.strictEqual(parsed.values["implement"], "some design");
  assert.strictEqual(parsed.values["component"], "compo1");
});

test("implement: defaults to ALL components when -component is omitted", () => {
  const parsed = parseArgs(["node", "devx", "-implement", "some design"]);
  const task = buildImplementTask(parsed);
  assert.match(task, /Implement ALL components/);
});

test("implement: scopes to a single named component and tells the agent not to touch others", () => {
  const parsed = parseArgs(["node", "devx", "-implement", "some design", "-component", "compo1"]);
  const task = buildImplementTask(parsed);
  assert.match(task, /Implement ONLY the component named "compo1"/);
  assert.match(task, /Do not touch unrelated components/);
});

test("implement: task requires build\\/test validation before declaring success", () => {
  const task = buildImplementTask(parseArgs(["node", "devx", "-implement", "design"]));
  assert.match(task, /run_command/);
  assert.match(task, /compiles\/builds/);
});
