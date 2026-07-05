#!/usr/bin/env node
/**
 * scripts/add-version-headers.js
 *
 * Prepends (or refreshes) a standard version header comment on every src/**\/*.ts file
 * (excluding src/generated/**, which is machine-generated and already carries its own
 * "do not edit by hand" notice). Idempotent: re-running updates existing headers' version
 * number rather than duplicating them, based on the "@sea-cli-instruction" marker.
 *
 * Usage: node scripts/add-version-headers.js
 * Run this (or bump the header manually) whenever you modify a file, per the instruction
 * baked into each header.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const TEST_SUITE_DIR = path.join(ROOT, "test-suite");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const VERSION = pkg.version;

const HEADER_MARKER = "@sea-cli-instruction";

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated") continue; // machine-generated, has its own notice
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function buildHeader(relPath) {
  return (
    `/**\n` +
    ` * @file ${relPath}\n` +
    ` * @version ${VERSION}\n` +
    ` * ${HEADER_MARKER} Increment @version above whenever this file is modified.\n` +
    ` */\n`
  );
}

function stripExistingHeader(content) {
  const headerRegex = new RegExp(`^/\\*\\*[\\s\\S]*?${HEADER_MARKER}[\\s\\S]*?\\*/\\n`);
  return content.replace(headerRegex, "");
}

const SHEBANG_REGEX = /^#!.*\n/;

const files = [...walk(SRC_DIR), ...(fs.existsSync(TEST_SUITE_DIR) ? walk(TEST_SUITE_DIR) : [])];
let updated = 0;

for (const file of files) {
  const relPath = path.relative(ROOT, file).split(path.sep).join("/");
  const original = fs.readFileSync(file, "utf-8");

  let content = original;
  let shebang = "";

  const directShebang = content.match(SHEBANG_REGEX);
  if (directShebang) {
    shebang = directShebang[0];
    content = content.slice(shebang.length);
  }

  content = stripExistingHeader(content);

  // Handles the case where a previous run left the header before the shebang.
  if (!shebang) {
    const laterShebang = content.match(SHEBANG_REGEX);
    if (laterShebang) {
      shebang = laterShebang[0];
      content = content.slice(shebang.length);
    }
  }

  const next = shebang + buildHeader(relPath) + content;
  if (next !== original) {
    fs.writeFileSync(file, next, "utf-8");
    updated++;
  }
}

console.log(`add-version-headers: updated ${updated}/${files.length} file(s) to version ${VERSION}`);
