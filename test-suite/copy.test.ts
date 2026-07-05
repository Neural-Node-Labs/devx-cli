/**
 * @file test-suite/copy.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-copy` — devx -copy [file/folder] -target [] -user [] -password [] -remote []
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../src/cli/parseArgs";
import { runCopyCommand } from "../src/commands/copyRemote";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devx-copy-test-"));
}

test("copy: source path is preserved literally, never read as file content", () => {
  const dir = tmpDir();
  try {
    const filePath = path.join(dir, "config.json");
    fs.writeFileSync(filePath, '{"real": "file content that must not leak into the path value"}');
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const parsed = parseArgs(["node", "devx", "-copy", "config.json", "-target", "host1", "-user", "root", "-password", "pw"]);
      assert.strictEqual(parsed.values["copy"], "config.json", "the -copy value must stay the literal path, not the file's content");
    } finally {
      process.chdir(cwd);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("copy: -remote is preserved literally even if a same-named local file exists", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "app"), "should not be read");
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const parsed = parseArgs(["node", "devx", "-copy", "src", "-target", "h", "-user", "u", "-password", "p", "-remote", "app"]);
    assert.strictEqual(parsed.values["remote"], "app");
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("copy: throws a clear error when the local source path doesn't exist", async () => {
  const dir = tmpDir();
  try {
    const parsed = parseArgs(["node", "devx", "-copy", "does-not-exist.txt", "-target", "h", "-user", "u", "-password", "p"]);
    await assert.rejects(() => runCopyCommand(parsed, dir, false), /Local path not found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("copy: throws a clear error when -target/-user/-password are missing", async () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, "a.txt"), "hi");
    await assert.rejects(
      () => runCopyCommand(parseArgs(["node", "devx", "-copy", "a.txt"]), dir, false),
      /Missing -target/
    );
    await assert.rejects(
      () => runCopyCommand(parseArgs(["node", "devx", "-copy", "a.txt", "-target", "h"]), dir, false),
      /Missing -user/
    );
    await assert.rejects(
      () => runCopyCommand(parseArgs(["node", "devx", "-copy", "a.txt", "-target", "h", "-user", "u"]), dir, false),
      /Missing -password/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("copy: source path resolves relative to the given cwd, not process.cwd()", async () => {
  // Regression test for a real bug found during manual testing: the source path must be
  // resolved against the devx working directory (DEVX_CWD), not wherever the process itself runs from.
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, "docker"));
    fs.writeFileSync(path.join(dir, "docker", "Dockerfile"), "FROM alpine");
    const parsed = parseArgs(["node", "devx", "-copy", "docker", "-target", "127.0.0.1:1", "-user", "u", "-password", "p"]);
    // This will fail to actually connect (nothing listening on port 1), but it must fail
    // AFTER finding the local path — not with "Local path not found".
    const results = await runCopyCommand(parsed, dir, false);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].ok, false);
    assert.doesNotMatch(results[0].error || "", /Local path not found/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
