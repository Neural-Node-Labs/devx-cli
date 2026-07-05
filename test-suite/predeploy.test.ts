/**
 * @file test-suite/predeploy.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-predeploy` — devx -predeploy [instruction]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";
import { buildPredeployTask } from "../src/commands/predeploy";

test("predeploy: instruction is optional", () => {
  const parsed = parseArgs(["node", "devx", "-predeploy"]);
  assert.strictEqual(parsed.command, "predeploy");
  assert.strictEqual(parsed.values["predeploy"], "");
});

test("predeploy: defaults to covering both local and Docker readiness when no instruction given", () => {
  const task = buildPredeployTask(parseArgs(["node", "devx", "-predeploy"]));
  assert.match(task, /cover both local run readiness and Docker readiness by default/);
});

test("predeploy: an explicit instruction narrows the scope", () => {
  const task = buildPredeployTask(parseArgs(["node", "devx", "-predeploy", "just Docker, no compose"]));
  assert.match(task, /just Docker, no compose/);
});

test("predeploy: task lists the deployment artifacts it may need to create", () => {
  const task = buildPredeployTask(parseArgs(["node", "devx", "-predeploy"]));
  for (const artifact of ["Dockerfile", ".dockerignore", "docker-compose.yml", ".env.example"]) {
    assert.ok(task.includes(artifact), `expected task to mention ${artifact}`);
  }
});

test("predeploy: task requires disclosing when Docker validation wasn't possible", () => {
  const task = buildPredeployTask(parseArgs(["node", "devx", "-predeploy"]));
  assert.match(task, /NOT validated here/);
  assert.match(task, /docker --version/);
});
