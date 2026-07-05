/**
 * @file test-suite/ssh.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-ssh` — devx -ssh -task [] -target [] -user [] -password []
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../src/cli/parseArgs";
import { buildSshTask } from "../src/commands/sshTask";
import { parseTarget, parseTargets } from "../src/remote/sshConnection";

test("ssh: parses task/target/user/password", () => {
  const parsed = parseArgs([
    "node", "devx", "-ssh",
    "-task", "deploy the docker workspace",
    "-target", "host1,host2:2222",
    "-user", "root",
    "-password", "secret123",
  ]);
  assert.strictEqual(parsed.command, "ssh");
  assert.strictEqual(parsed.values["task"], "deploy the docker workspace");
  assert.strictEqual(parsed.values["target"], "host1,host2:2222");
  assert.strictEqual(parsed.values["user"], "root");
  assert.strictEqual(parsed.values["password"], "secret123");
});

test("ssh: parseTarget defaults to port 22, and honors an explicit port", () => {
  assert.deepStrictEqual(parseTarget("example.com"), { host: "example.com", port: 22 });
  assert.deepStrictEqual(parseTarget("example.com:2222"), { host: "example.com", port: 2222 });
});

test("ssh: parseTargets splits a comma-separated list", () => {
  const targets = parseTargets("host1, host2:2222 ,host3");
  assert.deepStrictEqual(targets, [
    { host: "host1", port: 22 },
    { host: "host2", port: 2222 },
    { host: "host3", port: 22 },
  ]);
});

test("ssh: -target/-user/-password are NEVER resolved as file content, even if a matching file exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devx-ssh-test-"));
  // Create files that would collide with the flag VALUES if resolution were mistakenly applied.
  fs.writeFileSync(path.join(dir, "host1"), "THIS SHOULD NEVER BE READ");
  fs.writeFileSync(path.join(dir, "root"), "THIS SHOULD NEVER BE READ");
  fs.writeFileSync(path.join(dir, "secret"), "THIS SHOULD NEVER BE READ");
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const parsed = parseArgs([
      "node", "devx", "-ssh",
      "-task", "do something",
      "-target", "host1",
      "-user", "root",
      "-password", "secret",
    ]);
    assert.strictEqual(parsed.values["target"], "host1");
    assert.strictEqual(parsed.values["user"], "root");
    assert.strictEqual(parsed.values["password"], "secret");
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ssh: task lists all remote targets and never mentions the password", () => {
  const parsed = parseArgs([
    "node", "devx", "-ssh",
    "-task", "deploy",
    "-target", "host1,host2",
    "-user", "root",
    "-password", "s3cr3t",
  ]);
  const task = buildSshTask(parsed, ["host1:22", "host2:22"]);
  assert.match(task, /REMOTE TARGETS: host1:22, host2:22/);
  assert.doesNotMatch(task, /s3cr3t/);
});

test("ssh: task requires validating on the remote host and reporting per-target results", () => {
  const parsed = parseArgs(["node", "devx", "-ssh", "-task", "deploy", "-target", "h", "-user", "u", "-password", "p"]);
  const task = buildSshTask(parsed, ["h:22"]);
  assert.match(task, /VALIDATE/);
  assert.match(task, /ssh_run_command/);
  assert.match(task, /ssh_copy_tool/);
  assert.match(task, /which targets succeeded and which/i);
});
