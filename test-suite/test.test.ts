/**
 * @file test-suite/test.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-test` — devx -test [detail] -component [name]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";
import { buildTestTask } from "../src/commands/test";

test("test: parses detail and component", () => {
  const parsed = parseArgs(["node", "devx", "-test", "cover the pricing calculator", "-component", "src/pricing.ts"]);
  assert.strictEqual(parsed.command, "test");
  assert.strictEqual(parsed.values["test"], "cover the pricing calculator");
  assert.strictEqual(parsed.values["component"], "src/pricing.ts");
});

test("test: component is optional", () => {
  const parsed = parseArgs(["node", "devx", "-test", "cover the pricing calculator"]);
  assert.strictEqual(parsed.values["component"], undefined);
  const task = buildTestTask(parsed);
  assert.match(task, /TEST DETAIL \/ SCOPE:/);
});

test("test: task names the target component when given", () => {
  const parsed = parseArgs(["node", "devx", "-test", "cover pricing", "-component", "src/pricing.ts"]);
  const task = buildTestTask(parsed);
  assert.match(task, /TARGET COMPONENT: src\/pricing\.ts/);
});

test("test: task falls back to a zero-dependency runner when no framework exists", () => {
  const task = buildTestTask(parseArgs(["node", "devx", "-test", "detail"]));
  assert.match(task, /node:test/);
  assert.match(task, /run_command/);
});
