# -index: respect .gitignore, .dockerignore, and .devxignore

## 1. src/utils/fileWalker.ts — full rewrite

`walkFiles()` now loads and merges ignore rules from three files at the top-level walk root
(the directory `-index` was invoked from), if they exist:

- `.gitignore`
- `.dockerignore`
- `.devxignore` (new — a devx-specific ignore file, same syntax, for excluding things you
  don't want in the workspace index/dump without also affecting git or Docker)

Supports the common gitignore syntax subset: `#` comments, `!` negation, trailing `/` for
directory-only patterns, leading `/` to anchor a pattern to the root, and `*` / `?` / `**`
globs. Later rules override earlier ones for the same path (same precedence as git), so a
`.devxignore` rule can re-include something `.gitignore` excluded, or vice versa.

Ignored directories are pruned entirely rather than walked and filtered, so e.g. a large
excluded build-output directory is never descended into.

The existing hard-coded `DEFAULT_IGNORE` set (`node_modules`, `dist`, `.git`, `build`,
`coverage`, `.<cmd>`) is unchanged and still always applies, regardless of ignore-file content.

Note: only the ignore files at the walk root are read — nested `.gitignore` files deeper in
the tree are treated as ordinary files, not as additional rule sources. This matches what
most simple tools do without needing per-directory git semantics, but is a known limitation
worth knowing about.

Replace the full file with the version in `fileWalker.ts` from this patch. Bump the `@version`
header (done — 0.2.0 → 0.3.0).

## 2. test-suite/fileWalker.test.ts — new file

Adds regression coverage: no-ignore-file baseline, `.gitignore` directory pruning, `.dockerignore`
merge, `.devxignore` support, negation precedence across files, and confirmation that nested
ignore files are *not* auto-applied.

Drop in `fileWalker.test.ts` from this patch as-is.

## 3. src/utils/fileWalker.ts — public API change (update, not additive)

`walkFiles(dir, files, root, rules)` is now `walkFiles(dir, options?)` where
`options: { onIgnored?: (relPath, isDir) => void }`. The only caller in the codebase was
`indexManager.ts`'s `buildIndex()`, which is updated below — but if anything else calls
`walkFiles` with the old positional `files`/`root`/`rules` args, update those call sites too.

Also new: `getIgnoreFilesPresent(rootDir): string[]` — returns which of `.gitignore`,
`.dockerignore`, `.<cmd>ignore` actually exist at `rootDir`, for reporting purposes.

## 4. src/index/indexManager.ts — wire the ignore list into buildIndex()

- `WorkspaceIndex` gains two optional fields: `ignoreFilesUsed?: string[]` (which ignore files
  were found and respected) and `ignoredCount?: number` (how many files/directories were
  pruned by `DEFAULT_IGNORE` or an ignore-file rule).
- `buildIndex()` now calls `getIgnoreFilesPresent(cwd)` up front and passes an `onIgnored`
  counter into `walkFiles(cwd, { onIgnored })`, so both fields get populated on the returned
  (and persisted) index automatically.

Bump the `@version` header (0.5.0 → 0.6.0).

## 5. src/commands/indexWorkspace.ts — report it

`runIndexCommand()` now prints a line after "Indexed N files.":

```
Respected: .gitignore, .devxignore (skipped 3 entries).
```

or, if no ignore file was found but the built-in defaults still pruned something:

```
Skipped 2 entries (default-ignored dirs; no .gitignore/.dockerignore/.devxignore found).
```

Bump the `@version` header (done — 0.2.0 → 0.3.0).

Verified end-to-end: ran `runIndexCommand` against a temp workspace with a `.gitignore`
excluding a `logs/` dir — `index.json` came back with `ignoreFilesUsed: [".gitignore"]` and
`ignoredCount: 1`, and the CLI printed the "Respected: .gitignore (skipped 1 entries)." line.
