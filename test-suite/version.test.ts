/**
 * @file test-suite/version.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-version` — devx -version
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CLI_COMMAND_NAME, BRAND_NAME, BRAND_ABBREVIATION, VERSION } from "../src/generated/brand";

const ROOT = path.resolve(__dirname, "..");

test("version: generated brand module exports non-empty values", () => {
  assert.ok(CLI_COMMAND_NAME.length > 0);
  assert.ok(BRAND_NAME.length > 0);
  assert.ok(BRAND_ABBREVIATION.length > 0);
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
});

test("version: generated VERSION matches package.json's version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert.strictEqual(VERSION, pkg.version);
});

test("version: `devx -version` prints the brand name, version, and command name (requires a prior build)", { skip: !fs.existsSync(path.join(ROOT, "dist", "cli", "index.js")) }, () => {
  const output = execFileSync("node", [path.join(ROOT, "dist", "cli", "index.js"), "-version"], {
    encoding: "utf-8",
  });
  assert.match(output, new RegExp(BRAND_NAME));
  assert.match(output, new RegExp(`v${VERSION.replace(/\./g, "\\.")}`));
  assert.match(output, new RegExp(CLI_COMMAND_NAME));
});
