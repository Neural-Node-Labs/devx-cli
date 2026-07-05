# Regression test suite

One test file per CLI parameter (command), covering:

- **Argument parsing** — the right values land on the right flags, including the
  file-vs-literal resolution rules and which flags (`-target`/`-user`/`-password`/
  `-copy`/`-remote`/`-doc`) must *never* be resolved as file content even when a
  same-named file happens to exist.
- **Task/prompt construction** — each command's generated task description contains
  the sections, output paths, and instructions it's supposed to (e.g. `-doc readme`
  targets `README.md`, `-predeploy` mentions `Dockerfile`/`.env.example`, `-ssh` never
  leaks the password into the prompt it builds).
- **Local state logic that doesn't require a live LLM or SSH target** — `.{cmd}/history.md`
  round-tripping, `.{cmd}/index.json` building/searching (against a stub `LlmClient`,
  no network), and `-copy`'s pre-flight validation (missing target/user/password, source
  path not found, source path resolved against the right working directory).

## What this suite deliberately does NOT cover

These tests are fast, deterministic, and require no network access, Ollama/API keys, or
SSH targets — by design. They do **not** exercise:

- A full agentic run against a real or stubbed LLM (the Thought → Action → Observation loop
  itself, in `src/agent/orchestrator.ts`)
- Real SSH/SFTP against a live host (`src/remote/*`)
- The actual `run_command`/`write_tool`/`glob_tool`/`grep_tool`/`read_tool` tool
  implementations executing against a real workspace

Those were validated manually during development using stub HTTP servers standing in for
Ollama and an in-process `ssh2`-based fake SSH server standing in for a real host — see the
project's development history for the exact scripts used. If you want to extend this suite
to cover that layer too, the same pattern works well: spin up a tiny `http.createServer`
that returns scripted `Thought:/Action:/Final Answer:` replies, point `DEVX_BASE_URL` at it,
and run a command end-to-end in a temp directory.

## Running the suite

Requires only what's already in `devDependencies` (`ts-node`, `typescript`) plus Node's
built-in test runner (Node 18+) — no extra test framework needed.

```bash
npm install     # first time only
npm test
```

Equivalent to running directly:

```bash
node -r ts-node/register --test test-suite/*.test.ts
```

Tests run straight against the TypeScript sources in `src/` (via `ts-node/register`), not
against `dist/` — so `npm test` works without building first. The one exception is the
`-version` subprocess check in `version.test.ts`, which only runs if `dist/cli/index.js`
already exists (it's skipped otherwise, not failed) — run `npm run build` first if you want
that specific check included:

```bash
npm run build
npm test
```

### Running a single file

```bash
node -r ts-node/register --test test-suite/fix.test.ts
```

### On Windows

The `test-suite/*.test.ts` glob in `npm test` is expanded by the shell, which `cmd.exe`
doesn't do. Use Git Bash/WSL, or list files explicitly:

```bash
node -r ts-node/register --test test-suite/design.test.ts test-suite/fix.test.ts ...
```

## Files

| File | Covers |
|------|--------|
| `design.test.ts` | `-design` |
| `implement.test.ts` | `-implement` |
| `fix.test.ts` | `-fix` |
| `refactor.test.ts` | `-refactor` |
| `test.test.ts` | `-test` |
| `chat.test.ts` | `-chat` |
| `continue.test.ts` | `-continue` (+ `historyManager.ts` round-trip) |
| `index.test.ts` | `-index` (+ `indexManager.ts` build/load/search) |
| `ssh.test.ts` | `-ssh` (+ target parsing, raw-flag guarantee) |
| `copy.test.ts` | `-copy` (+ pre-flight validation) |
| `doc.test.ts` | `-doc` (all six types) |
| `predeploy.test.ts` | `-predeploy` |
| `version.test.ts` | `-version` (+ generated brand module) |
| `shared-parsing.test.ts` | Cross-cutting `parseArgs` behavior not specific to one command |

## Adding a new command's tests

1. Create `test-suite/<command>.test.ts` following the pattern above: parsing assertions
   first, then task-content assertions, then any command-specific logic (validation
   errors, file I/O) that doesn't need a live LLM/network call.
2. If the command touches `.{cmd}/` state, use `fs.mkdtempSync(...)` for an isolated temp
   directory per test and clean it up in a `finally` block (see `continue.test.ts` /
   `index.test.ts` for the pattern).
3. Remember the version-header instruction baked into every source file: if you change a
   file under `src/` to make a test pass, bump its `@version` header (or re-run
   `node scripts/add-version-headers.js`).
