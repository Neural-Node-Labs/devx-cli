/**
 * @file test-suite/design.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-design` — devx -design [requirement.md] -architecture [architecture.md]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";
import { buildDesignTask } from "../src/commands/design";

test("design: parses command and literal values", () => {
  const parsed = parseArgs(["node", "devx", "-design", "Build a login page", "-architecture", "Use MVC"]);
  assert.strictEqual(parsed.command, "design");
  assert.strictEqual(parsed.values["design"], "Build a login page");
  assert.strictEqual(parsed.values["architecture"], "Use MVC");
});

test("design: task includes the requirement text", () => {
  const parsed = parseArgs(["node", "devx", "-design", "Build a login page"]);
  const task = buildDesignTask(parsed);
  assert.match(task, /REQUIREMENTS:/);
  assert.match(task, /Build a login page/);
});

test("design: architecture section only appears when -architecture is given", () => {
  const withArch = buildDesignTask(parseArgs(["node", "devx", "-design", "req", "-architecture", "Use MVC"]));
  const withoutArch = buildDesignTask(parseArgs(["node", "devx", "-design", "req"]));
  assert.match(withArch, /ARCHITECTURE CONSTRAINTS:/);
  assert.match(withArch, /Use MVC/);
  assert.doesNotMatch(withoutArch, /ARCHITECTURE CONSTRAINTS:/);
});

test("design: task instructs writing design.md and re-reading it back", () => {
  const task = buildDesignTask(parseArgs(["node", "devx", "-design", "req"]));
  assert.match(task, /design\.md/);
  assert.match(task, /read_tool/);
});
