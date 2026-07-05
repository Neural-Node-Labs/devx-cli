/**
 * @file test-suite/index.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-index` — devx -index (builds .<cmd>/index.json).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../src/cli/parseArgs";
import { buildIndex, loadIndex, searchIndex, getIndexPath } from "../src/index/indexManager";
import { LlmClient } from "../src/llm/types";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devx-index-test-"));
}

/** A stub LLM that always returns a fixed, valid summary/purpose JSON reply. */
const stubLlm: LlmClient = {
  async chat() {
    return '{"summary": "stub summary", "purpose": "stub purpose"}';
  },
};

test("index: parses with no value required", () => {
  const parsed = parseArgs(["node", "devx", "-index"]);
  assert.strictEqual(parsed.command, "index");
});

test("index: buildIndex writes .<cmd>/index.json with one entry per file", async () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, "a.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(dir, "b.ts"), "export const b = 2;");

    const index = await buildIndex(dir, stubLlm);
    assert.strictEqual(index.fileCount, 2);
    assert.ok(fs.existsSync(getIndexPath(dir)));

    const reloaded = loadIndex(dir);
    assert.ok(reloaded);
    assert.strictEqual(reloaded!.files.length, 2);
    assert.strictEqual(reloaded!.files[0].summary, "stub summary");
    assert.strictEqual(reloaded!.files[0].purpose, "stub purpose");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("index: falls back to a heuristic summary if the LLM reply isn't valid JSON", async () => {
  const dir = tmpDir();
  const brokenLlm: LlmClient = { async chat() { return "not json at all"; } };
  try {
    fs.writeFileSync(path.join(dir, "a.ts"), "// a real comment\nexport const a = 1;");
    const index = await buildIndex(dir, brokenLlm);
    assert.strictEqual(index.files.length, 1);
    assert.match(index.files[0].purpose, /heuristic fallback/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("index: searchIndex matches on filename, path, summary, and purpose", async () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, "auth.ts"), "login logic");
    const llm: LlmClient = {
      async chat() {
        return '{"summary": "Handles user login", "purpose": "Authentication"}';
      },
    };
    const index = await buildIndex(dir, llm);
    assert.strictEqual(searchIndex(index, "auth").length, 1);
    assert.strictEqual(searchIndex(index, "login").length, 1);
    assert.strictEqual(searchIndex(index, "authentication").length, 1);
    assert.strictEqual(searchIndex(index, "nonexistent-keyword").length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("index: loadIndex returns null when no index has been built", () => {
  const dir = tmpDir();
  try {
    assert.strictEqual(loadIndex(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
