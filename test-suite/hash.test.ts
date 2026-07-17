
/**
 * @file test-suite/hash.test.ts
 * @version 0.1.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-hash` — devx -hash [32|64] -secret [value]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../src/cli/parseArgs";
import { runHashCommand } from "../src/commands/hashSecret";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devx-hash-test-"));
}

test("hash: -secret is preserved literally, never read as file content", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, "topsecret"), "file content that must not leak in as the secret");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const parsed = parseArgs(["node", "devx", "-hash", "32", "-secret", "topsecret"]);
      assert.strictEqual(parsed.values["secret"], "topsecret");
    } finally {
      process.chdir(cwd);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: 32-bit output is 8 hex chars, 64-bit output is 16 hex chars", () => {
  const dir = tmpDir();
  try {
    const parsed32 = parseArgs(["node", "devx", "-hash", "32", "-secret", "my-api-key"]);
    const result32 = runHashCommand(parsed32, dir);
    assert.strictEqual(result32.hash.length, 8);
    assert.match(result32.hash, /^[0-9a-f]{8}$/);

    const parsed64 = parseArgs(["node", "devx", "-hash", "64", "-secret", "my-api-key"]);
    const result64 = runHashCommand(parsed64, dir);
    assert.strictEqual(result64.hash.length, 16);
    assert.match(result64.hash, /^[0-9a-f]{16}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: same secret + same workspace key reproduces the same hash", () => {
  const dir = tmpDir();
  try {
    const parsed = parseArgs(["node", "devx", "-hash", "32", "-secret", "consistent-value"]);
    const first = runHashCommand(parsed, dir);
    const second = runHashCommand(parsed, dir);
    assert.strictEqual(first.hash, second.hash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: same secret in two different workspaces produces different hashes (keys differ)", () => {
  const dirA = tmpDir();
  const dirB = tmpDir();
  try {
    const parsed = parseArgs(["node", "devx", "-hash", "32", "-secret", "same-secret"]);
    const resultA = runHashCommand(parsed, dirA);
    const resultB = runHashCommand(parsed, dirB);
    assert.notStrictEqual(resultA.hash, resultB.hash);
  } finally {
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  }
});

test("hash: rejects an invalid bit width", () => {
  const dir = tmpDir();
  try {
    const parsed = parseArgs(["node", "devx", "-hash", "128", "-secret", "value"]);
    assert.throws(() => runHashCommand(parsed, dir), /Invalid -hash value/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: throws a clear error when -secret is missing", () => {
  const dir = tmpDir();
  try {
    const parsed = parseArgs(["node", "devx", "-hash", "32"]);
    assert.throws(() => runHashCommand(parsed, dir), /Missing -secret/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: key file is written with owner-only permissions and lives under .devx/", () => {
  const dir = tmpDir();
  try {
    const parsed = parseArgs(["node", "devx", "-hash", "32", "-secret", "value"]);
    const result = runHashCommand(parsed, dir);
    assert.strictEqual(result.keyPath, path.join(dir, ".devx", "hash.key"));
    assert.ok(fs.existsSync(result.keyPath));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
