/**
 * @file test-suite/fix.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-fix` — devx -fix [issue detail or filepath]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../src/cli/parseArgs";
import { buildFixTask } from "../src/commands/fix";

test("fix: literal text is preserved as-is", () => {
  const parsed = parseArgs(["node", "devx", "-fix", "login button throws 500"]);
  assert.strictEqual(parsed.values["fix"], "login button throws 500");
});

test("fix: a real filepath is resolved to its file content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devx-fix-test-"));
  const filePath = path.join(dir, "issue.md");
  fs.writeFileSync(filePath, "Detailed bug report contents");
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const parsed = parseArgs(["node", "devx", "-fix", "issue.md"]);
    assert.strictEqual(parsed.values["fix"], "Detailed bug report contents");
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fix: task instructs reproducing before fixing, and validating after", () => {
  const task = buildFixTask(parseArgs(["node", "devx", "-fix", "some bug"]));
  assert.match(task, /ISSUE DETAIL:/);
  assert.match(task, /some bug/);
  assert.match(task, /reproduce the bug/i);
  assert.match(task, /minimal fix/i);
  assert.match(task, /re-run the same reproduction/i);
});
