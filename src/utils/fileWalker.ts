/**
 * @file src/utils/fileWalker.ts
 * @version 0.4.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { CLI_COMMAND_NAME } from "../generated/brand";

const DEFAULT_IGNORE = new Set(["node_modules", "dist", ".git", "build", "coverage", `.${CLI_COMMAND_NAME}`]);

/**
 * Ignore-file names read from the root of the walk, in load order. All three are merged into
 * one rule set (later files can override earlier ones for the same path, same as a single
 * concatenated file would), so a project can rely on whichever subset of these actually exists.
 */
const IGNORE_FILENAMES = [".gitignore", ".dockerignore", `.${CLI_COMMAND_NAME}ignore`];

interface IgnoreRule {
  regex: RegExp;
  negate: boolean;
  dirOnly: boolean;
}

/**
 * Parses a single gitignore-style pattern line into a matchable rule.
 * Returns null for blank lines and comments.
 *
 * Supports the common subset of gitignore syntax: `#` comments, `!` negation, a trailing `/`
 * for directory-only patterns, a leading `/` to anchor to the ignore file's root, `*`, `?`, and
 * `**` (matches across any number of path segments, including zero).
 */
function parseIgnoreLine(line: string): IgnoreRule | null {
  let pattern = line.trim();
  if (!pattern || pattern.startsWith("#")) return null;

  let negate = false;
  if (pattern.startsWith("!")) {
    negate = true;
    pattern = pattern.slice(1);
  }
  // A leading "\#" or "\!" is an escaped literal character, not a comment/negation marker.
  pattern = pattern.replace(/^\\([#!])/, "$1");

  let dirOnly = false;
  if (pattern.endsWith("/")) {
    dirOnly = true;
    pattern = pattern.slice(0, -1);
  }
  if (!pattern) return null;

  const anchored = pattern.startsWith("/");
  if (anchored) pattern = pattern.slice(1);

  let regexSource = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++; // consume the second "*"
        if (pattern[i + 1] === "/") i++; // consume a following "/" — "**/" also matches zero segments
        regexSource += ".*";
      } else {
        regexSource += "[^/]*";
      }
    } else if (c === "?") {
      regexSource += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      regexSource += "\\" + c;
    } else {
      regexSource += c;
    }
  }

  // Anchored patterns must match from the start of the relative path; unanchored patterns may
  // match starting at any path segment. Either way, a match on a directory also covers
  // everything underneath it.
  const bodySource = anchored ? `^${regexSource}` : `(^|/)${regexSource}`;
  const fullSource = `${bodySource}(/.*)?$`;

  return { regex: new RegExp(fullSource), negate, dirOnly };
}

/** Loads and merges ignore rules from .gitignore, .dockerignore, and .<cmd>ignore at `rootDir`, if present. */
function loadIgnoreRules(rootDir: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const filename of IGNORE_FILENAMES) {
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(rootDir, filename), "utf-8");
    } catch {
      continue; // that ignore file simply doesn't exist — fine, the others (if any) still apply
    }
    for (const line of raw.split(/\r?\n/)) {
      const rule = parseIgnoreLine(line);
      if (rule) rules.push(rule);
    }
  }
  return rules;
}

/**
 * Whether `relPath` (forward-slash separated, relative to the walk root) should be skipped.
 * Later matching rules win over earlier ones, same as git's own precedence, so a `!`-negated
 * rule further down a file can re-include something an earlier pattern excluded.
 */
function isIgnored(relPath: string, isDir: boolean, rules: IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.regex.test(relPath)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

/**
 * Returns which of the supported ignore-file names actually exist at `rootDir` — useful for
 * callers (e.g. the indexer) that want to report what was respected, without duplicating the
 * file-existence checks `loadIgnoreRules` already does internally.
 */
export function getIgnoreFilesPresent(rootDir: string): string[] {
  return IGNORE_FILENAMES.filter((filename) => fs.existsSync(path.join(rootDir, filename)));
}

export interface WalkFilesOptions {
  /**
   * Called for every entry pruned because it matched a DEFAULT_IGNORE name or an ignore-file
   * rule — once per pruned directory (its contents are never visited, so they aren't reported
   * individually) and once per skipped file. Lets a caller report "skipped N entries" without
   * the walker needing to know anything about how that gets displayed.
   */
  onIgnored?: (relPath: string, isDir: boolean) => void;
}

/**
 * Recursively lists all files under `dir`, skipping common noise directories plus anything
 * excluded by .gitignore, .dockerignore, or .<cmd>ignore found at the top-level walk root
 * (the first call's `dir`). Ignored directories are pruned entirely rather than just having
 * their files filtered out, so a huge excluded tree (e.g. a build output dir) is never descended into.
 */
export function walkFiles(dir: string, options: WalkFilesOptions = {}): string[] {
  const files: string[] = [];
  walkFilesInternal(dir, dir, loadIgnoreRules(dir), files, options.onIgnored);
  return files;
}

function walkFilesInternal(
  dir: string,
  root: string,
  ignoreRules: IgnoreRule[],
  files: string[],
  onIgnored?: (relPath: string, isDir: boolean) => void
): void {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relPath = path.relative(root, full).split(path.sep).join("/");
    const isDir = entry.isDirectory();

    if (DEFAULT_IGNORE.has(entry.name) || isIgnored(relPath, isDir, ignoreRules)) {
      onIgnored?.(relPath, isDir);
      continue;
    }

    if (isDir) {
      walkFilesInternal(full, root, ignoreRules, files, onIgnored);
    } else {
      files.push(full);
    }
  }
}

