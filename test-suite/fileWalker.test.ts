/**
 * @file test-suite/fileWalker.test.ts
 * @version 0.1.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for src/utils/fileWalker.ts — .gitignore / .dockerignore / .devxignore support.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { walkFiles } from "../src/utils/fileWalker";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "devx-filewalker-test-"));
}

function relFiles(dir: string): string[] {
  return walkFiles(dir)
    .map((f) => path.relative(dir, f).split(path.sep).join("/"))
    .sort();
}

test("fileWalker: with no ignore files, lists everything except the built-in noise dirs", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, "a.ts"), "a");
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "index.js"), "x");
    assert.deepStrictEqual(relFiles(dir), ["a.ts"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fileWalker: honors .gitignore patterns, including whole-directory prune", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".gitignore"), "logs/\n*.env\n");
    fs.mkdirSync(path.join(dir, "logs"));
    fs.writeFileSync(path.join(dir, "logs", "debug.log"), "x");
    fs.writeFileSync(path.join(dir, "secret.env"), "x");
    fs.writeFileSync(path.join(dir, "keep.ts"), "x");
    assert.deepStrictEqual(relFiles(dir), [".gitignore", "keep.ts"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fileWalker: honors .dockerignore, merged alongside .gitignore", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".dockerignore"), "*.md\n");
    fs.writeFileSync(path.join(dir, "README.md"), "x");
    fs.writeFileSync(path.join(dir, "keep.ts"), "x");
    assert.deepStrictEqual(relFiles(dir), [".dockerignore", "keep.ts"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fileWalker: honors .devxignore", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".devxignore"), "scratch/\n");
    fs.mkdirSync(path.join(dir, "scratch"));
    fs.writeFileSync(path.join(dir, "scratch", "notes.txt"), "x");
    fs.writeFileSync(path.join(dir, "keep.ts"), "x");
    assert.deepStrictEqual(relFiles(dir), [".devxignore", "keep.ts"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fileWalker: a later negation rule re-includes a path an earlier pattern excluded", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".gitignore"), "*.env\n");
    fs.writeFileSync(path.join(dir, ".dockerignore"), "!keep.env\n");
    fs.writeFileSync(path.join(dir, "keep.env"), "x");
    fs.writeFileSync(path.join(dir, "secret.env"), "x");
    assert.deepStrictEqual(relFiles(dir), [".dockerignore", ".gitignore", "keep.env"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fileWalker: rules only apply from the top-level walk root, not nested .gitignore files", () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, "sub"));
    // This nested .gitignore is itself just an ordinary file as far as the walker is concerned —
    // fileWalker only reads ignore files at the root passed to the initial walkFiles() call.
    fs.writeFileSync(path.join(dir, "sub", ".gitignore"), "*.log\n");
    fs.writeFileSync(path.join(dir, "sub", "debug.log"), "x");
    assert.deepStrictEqual(relFiles(dir), ["sub/.gitignore", "sub/debug.log"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
