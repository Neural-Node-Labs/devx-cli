/**
 * @file test-suite/continue.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-continue` — devx -continue (resumes the last unfinished task
 * recorded in .<cmd>/history.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../src/cli/parseArgs";
import { buildContinueTask } from "../src/commands/continueTask";
import { appendHistoryEntry, getLastUnfinishedTask, readHistoryEntries } from "../src/devxState/historyManager";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devx-continue-test-"));
}

test("continue: parses with no value required", () => {
  const parsed = parseArgs(["node", "devx", "-continue"]);
  assert.strictEqual(parsed.command, "continue");
});

test("continue: buildContinueTask interpolates the history entry's fields", () => {
  const task = buildContinueTask({
    timestamp: "2026-01-01T00:00:00.000Z",
    command: "fix",
    requestPreview: "some bug that never gets resolved",
    status: "incomplete",
    iterations: 5,
    summary: "hit max iterations",
  });
  assert.match(task, /RESUMING/);
  assert.match(task, /ORIGINAL TASK TYPE: fix/);
  assert.match(task, /some bug that never gets resolved/);
  assert.match(task, /INCOMPLETE after 5 iteration\(s\)/);
  assert.match(task, /hit max iterations/);
  assert.match(task, /re-check the current state/i);
});

test("history: appendHistoryEntry + readHistoryEntries round-trip", () => {
  const dir = tmpDir();
  try {
    appendHistoryEntry(dir, {
      command: "fix",
      requestPreview: "dummy issue",
      status: "incomplete",
      iterations: 2,
      summary: "stopped early",
    });
    const entries = readHistoryEntries(dir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].command, "fix");
    assert.strictEqual(entries[0].status, "incomplete");
    assert.strictEqual(entries[0].iterations, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("history: getLastUnfinishedTask returns null once the latest entry is completed", () => {
  const dir = tmpDir();
  try {
    appendHistoryEntry(dir, {
      command: "fix",
      requestPreview: "dummy issue",
      status: "incomplete",
      iterations: 2,
      summary: "stopped early",
    });
    assert.notStrictEqual(getLastUnfinishedTask(dir), null);

    appendHistoryEntry(dir, {
      command: "continue",
      requestPreview: "continue fix: dummy issue",
      status: "completed",
      iterations: 3,
      summary: "finished it",
    });
    assert.strictEqual(getLastUnfinishedTask(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("history: never stores a raw chat/task transcript, only a bounded preview", () => {
  const dir = tmpDir();
  try {
    const longText = "x".repeat(5000);
    appendHistoryEntry(dir, {
      command: "chat",
      requestPreview: longText,
      status: "completed",
      iterations: 1,
      summary: longText,
    });
    const entries = readHistoryEntries(dir);
    assert.ok(entries[0].requestPreview.length < 200, "requestPreview should be truncated");
    assert.ok(entries[0].summary.length < 700, "summary should be truncated");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
