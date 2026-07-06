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

## No other files change

`src/index/indexManager.ts` and `src/commands/indexWorkspace.ts` need no edits — they already
call `walkFiles(cwd)` with no ignore-related logic of their own, so the new behavior applies
automatically to `devx -index`.
