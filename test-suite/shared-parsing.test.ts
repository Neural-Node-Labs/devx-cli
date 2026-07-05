/**
 * @file test-suite/shared-parsing.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Cross-cutting regression tests for src/cli/parseArgs.ts — behavior shared across every
 * command, rather than specific to one. Everything else in this suite is one file per
 * CLI parameter/command; this file is the deliberate exception for shared plumbing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";

test("shared: throws with no arguments at all", () => {
  assert.throws(() => parseArgs(["node", "devx"]), /No arguments provided/);
});

test("shared: throws for an unrecognized command", () => {
  assert.throws(() => parseArgs(["node", "devx", "-bogus", "x"]), /Unrecognized command "-bogus"/);
});

test("shared: throws for a value token before any flag", () => {
  assert.throws(() => parseArgs(["node", "devx", "loose-token"]), /Unexpected argument "loose-token"/);
});

test("shared: multi-word values are joined with single spaces", () => {
  const parsed = parseArgs(["node", "devx", "-fix", "the", "login", "button", "is", "broken"]);
  assert.strictEqual(parsed.values["fix"], "the login button is broken");
});

test("shared: flags without a following value resolve to an empty string, not undefined", () => {
  const parsed = parseArgs(["node", "devx", "-index"]);
  assert.strictEqual(parsed.values["index"], "");
  assert.strictEqual(parsed.rawValues["index"], "");
});

test("shared: rawValues always mirrors the original CLI value, even when values[] is file-resolved", () => {
  const parsed = parseArgs(["node", "devx", "-fix", "some literal text"]);
  assert.strictEqual(parsed.rawValues["fix"], parsed.values["fix"]);
});

test("shared: flag names are case-insensitive (normalized to lowercase)", () => {
  const parsed = parseArgs(["node", "devx", "-FIX", "case test"]);
  assert.strictEqual(parsed.command, "fix");
  assert.strictEqual(parsed.values["fix"], "case test");
});

test("shared: every known top-level command is accepted as the first flag", () => {
  const commands = ["design", "implement", "fix", "refactor", "test", "chat", "continue", "index", "ssh", "copy", "doc", "predeploy"];
  for (const cmd of commands) {
    const parsed = parseArgs(["node", "devx", `-${cmd}`, "x"]);
    assert.strictEqual(parsed.command, cmd);
  }
});
