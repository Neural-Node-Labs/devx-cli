# devx — Agentic DevX CLI

A local, agentic coding CLI powered by **Ollama + DeepSeek** (no API key required).
It runs a real Thought → Action → Observation loop against your project on disk:
searching with `glob`/`grep`/`read`, making changes with `write`/`edit`, and
**validating** every change by actually running commands (tests, build, lint).

## Why ReAct-style prompting instead of native tool calling?

Local models served via Ollama (DeepSeek included) don't reliably support
OpenAI/Anthropic-style structured function calling. Instead, `devx` uses a
strict text protocol the model must follow each turn:

```
Thought: <reasoning>
Action: <tool name>
Action Input: <JSON>
```
or
```
Thought: <reasoning>
Final Answer: <summary>
```

`src/agent/responseParser.ts` parses this deterministically (tolerating minor
formatting drift), and `src/agent/orchestrator.ts` runs the loop: call the
model → parse → execute the chosen tool → feed the result back as an
"Observation" → repeat until the model emits a Final Answer or the iteration
cap is hit.

## Setup

```bash
# 1. Install & run Ollama, then pull a DeepSeek model
ollama pull deepseek-coder-v2      # or deepseek-r1, deepseek-v2, etc.
ollama serve                       # usually already running as a service

# 2. Install devx
cd devx-cli
npm install
npm run build

# Optional: link it globally so `devx` works from any project directory
npm link
```

## Configuration (environment variables)

| Variable          | Default                    | Meaning                                |
|-------------------|-----------------------------|-----------------------------------------|
| `DEVX_OLLAMA_URL` | `http://localhost:11434`    | Ollama server base URL                  |
| `DEVX_MODEL`      | `deepseek-coder-v2`         | Model name to use                       |
| `DEVX_MAX_ITER`   | `15`                        | Max agent loop iterations               |
| `DEVX_CWD`        | current directory           | Project directory the agent operates in |

## Usage

```bash
devx -design requirement.md -architecture architecture.md
devx -implement design.md -component all
devx -implement design.md -component compo1
devx -fix "login button throws 500 when email has a + in it"
devx -fix issue-report.md
devx -refactor "extract validation logic out of UserController into its own module"
devx -test "cover the pricing calculator" -component src/pricing.ts
devx -chat "what does the auth module do?"
devx -index
devx -continue
devx -ssh -task "deploy the current workspace docker setup" -target host1,host2 -user root -password secret
devx -copy docker -target host1,host2 -user root -password secret -remote ~/app/docker
devx -doc readme
devx -doc blueprint
devx -doc testsuite
devx -predeploy "prepare for docker and local run"
devx -predeploy
```

### `-predeploy`: make the workspace deployable

Creates or fixes whatever's missing for the project to run locally and/or in Docker —
Dockerfile, `.dockerignore`, `docker-compose.yml` (only if there's real evidence of
multiple services), `.env.example` (one line per env var the code actually reads, never
real secrets). The instruction is optional context (e.g. `"just Docker, no compose"`);
omit it to cover both local and Docker readiness by default.

Crucially, it **validates** rather than just writing files: it checks whether Docker is
actually available and tries `docker build` (and a brief container run/health check) when
it is; if Docker isn't available in the environment devx runs in, it says so explicitly
in the Final Answer and validates what it can locally instead, rather than claiming an
unverified build succeeded.

### `-doc`: generate workspace-grounded documentation

Every type routes through the full ReAct loop and is explicitly instructed to base its
content on what it actually finds in the workspace, not generic boilerplate:

| Type        | Output                                | What it produces                                      |
|-------------|----------------------------------------|--------------------------------------------------------|
| `readme`    | `README.md`                            | Project overview, setup, usage — updates existing README thoughtfully rather than blindly overwriting it |
| `blueprint` | `docs/BLUEPRINT.md`                    | Technical design doc: components, data flow, decisions, risks |
| `scenario`  | `docs/SCENARIO.md`                     | Inferred business scenario, personas, use cases — flags what's evidenced vs. guessed |
| `testsuite` | test files + `docs/TESTSUITE.md`       | Writes and **runs** tests covering the whole workspace, not just one component |
| `setup`     | `docs/SETUP.md`                        | How to run the project locally, derived from actual scripts/config found |
| `testcase`  | `docs/TESTCASES.md`                    | Structured test case list (ID/steps/expected result) — a document, not code |

`testsuite` differs from the existing `-test` command in scope: `-test` targets one
component you specify, while `devx -doc testsuite` surveys the entire workspace and
fills gaps across all of it.

### `-ssh`: agentic remote deployment/operations

Unlike `-copy`, `-ssh` routes through the **full ReAct agent loop** — the LLM decides the
strategy itself. Given an instruction like "deploy the current workspace docker setup",
it will typically:

1. Inspect the local workspace (`index_lookup_tool`/`glob_tool`/`read_tool`) to find the
   Dockerfile, compose file, or whatever's relevant.
2. Use `ssh_copy_tool` to upload the build context to the remote target(s).
3. Use `ssh_run_command` to run `docker build`, `docker run`/`docker compose up -d`, etc.
4. Validate on the remote host itself (e.g. `docker ps`, curl a health check) before
   declaring success — and report per-target success/failure if targets disagree.

`-target` accepts one or more comma-separated hosts, each optionally with a port
(`host` or `host:port`), e.g. `-target 203.0.113.5,203.0.113.6:2222`. Both tools run on
**all** configured targets by default; the agent can target just one by passing
`"target": "host:port"` in its tool input if a task needs per-host handling.

### `-copy`: direct multi-target file/folder upload

No LLM involved — a plain recursive SFTP upload of a local file or folder to one or more
targets. Useful for a quick, deterministic copy without agent overhead.

**Security note:** `-password` on the command line is visible in shell history and the
process list on most systems. This is implemented as requested, but prefer a
scoped/temporary credential over a long-lived one where possible; key-based auth would
be a natural follow-up if this becomes a regular workflow.

### `-index`: build a workspace index

Walks the project, summarizes each file (LLM-generated `summary` + `purpose`, falling
back to a heuristic if the model call fails), and writes `.devx/index.json`:

```json
{
  "generatedAt": "...",
  "root": "/path/to/project",
  "fileCount": 42,
  "files": [
    { "filename": "auth.ts", "path": "src/auth.ts", "summary": "...", "purpose": "..." }
  ]
}
```

`read_tool` and `write_tool` (edit mode) both consult this index automatically whenever
a requested path isn't found as given, before falling back to a manual filename search
across the whole project — so the agent still works even without an index, just faster
with one. The agent also has a dedicated `index_lookup_tool` to search the index by
filename or purpose/keyword up front. Re-run `devx -index` after major changes to keep
it fresh; it's just a cache, never a source of truth the agent blindly trusts.

### `-chat`: freeform instruction or question

Handles anything from "what does X do" (answered by exploring the codebase) to an
actionable request (handled like any other devx command — searched, edited, validated).

### `-continue`: resume the last unfinished task

Every task run (`design`/`implement`/`fix`/`refactor`/`test`/`chat`/`continue` itself)
appends a summary + status entry to `.devx/history.md` — never the raw chat/task text,
just a short preview, status (`COMPLETED`/`INCOMPLETE`/`ERROR`), iteration count, and the
agent's own final summary. `devx -continue` looks at the most recent entry; if it isn't
`COMPLETED`, it rebuilds a resume task (telling the agent not to trust the old state
blindly and to re-inspect the project first) and runs it. `devx -index` does not write to
history — it's a workspace scan, not a task.

Any flag value that resolves to an existing file path on disk is read and its
content is used as the task detail; otherwise the value is treated as literal
inline text. This is handled in `src/cli/parseArgs.ts`.

## Tools available to the agent

| Tool           | Purpose                                                             |
|----------------|----------------------------------------------------------------------|
| `index_lookup_tool` | Search `.devx/index.json` by filename/path/purpose — checked first |
| `glob_tool`    | Find files by glob pattern — agentic file discovery                 |
| `grep_tool`    | Search file contents by regex/text across the project               |
| `read_tool`    | Read a file (optionally a line range); index-aware with manual fallback |
| `write_tool`   | Create/overwrite a file, or apply a targeted find-and-replace edit  |
| `run_command`  | Execute a shell command — the validation step (tests, build, lint)  |
| `ssh_run_command` | *(only with -ssh)* Execute a command on remote deployment target(s) |
| `ssh_copy_tool`   | *(only with -ssh)* Upload local files/folders to remote target(s)   |

All tools are scoped to the working directory (`DEVX_CWD` or `process.cwd()`)
and path-traversal outside it is rejected. `run_command` blocks an explicit
denylist of destructive patterns (`rm -rf /`, `sudo`, `shutdown`, etc.), but
it still executes arbitrary shell commands the model chooses — only run
`devx` against projects/directories you trust, ideally inside a container or
VM, especially with smaller/less aligned local models.

## Project layout

```
src/
  types.ts                  Shared types (ChatMessage, ToolDefinition, etc.)
  llm/ollamaClient.ts        Minimal Ollama /api/chat client, logs every exchange
  index/indexManager.ts      Builds/loads/searches .devx/index.json
  devxState/historyManager.ts Appends/reads structured entries in .devx/history.md
  remote/
    types.ts                 SshTarget / RemoteAuth / RemoteConfig types
    sshConnection.ts         connect/execCommand/execScript (ssh2-based)
    scpUpload.ts             Recursive SFTP upload for files and directories
  utils/
    fileWalker.ts            Shared recursive directory walker
    fileResolver.ts          Index-first, manual-fallback path resolution
  tools/
    indexLookup.ts           index_lookup_tool
    glob.ts                 glob_tool
    grep.ts                 grep_tool
    read.ts                 read_tool (uses fileResolver)
    write.ts                write_tool (overwrite + edit modes, edit uses fileResolver)
    runCommand.ts            run_command (validation)
    sshRunCommand.ts          ssh_run_command (remote action/validation, -ssh only)
    sshCopy.ts                ssh_copy_tool (remote upload, -ssh only)
    registry.ts              wires tools together, renders tool docs for the prompt
  agent/
    promptBuilder.ts         system prompt + ReAct protocol spec + remote-target awareness
    responseParser.ts        parses model replies into actions/final answers
    orchestrator.ts          the Thought/Action/Observation loop + loop guards + console echo
    llmLogger.ts              writes request/response pairs to llm.log
  commands/
    design.ts / implement.ts / fix.ts / refactor.ts / test.ts / chat.ts / continueTask.ts / sshTask.ts / docTask.ts
      each builds a task-specific prompt from parsed CLI flags (or a history entry, for continue)
    indexWorkspace.ts         runs the -index scan directly (not an agent loop)
    copyRemote.ts             runs the -copy upload directly (not an agent loop)
    predeploy.ts              builds the -predeploy task (Docker/local deployment readiness)
  cli/
    parseArgs.ts             devx's -flag argument parser; excludes target/user/password/copy/remote from file-content resolution
    index.ts                 entry point wiring CLI -> command -> orchestrator -> history
```

## Notes / things to tune for your setup

- **Model choice matters a lot.** `deepseek-coder-v2` or `deepseek-r1` (7B+) are
  reasonable starting points; smaller models will drift from the response
  format more often. `responseParser.ts` is tolerant but not infinitely so.
- **Loop guard:** if the exact same action fails twice in a row, the
  orchestrator injects a warning telling the model to stop repeating itself
  (see `orchestrator.ts`), to avoid burning all iterations on one bad path.
- **`write_tool` edit mode requires a unique match** for `oldStr` — this
  mirrors how frontier-model coding agents avoid accidentally editing the
  wrong occurrence, and pushes the model to include enough surrounding
  context in its edits.
- Increase `DEVX_MAX_ITER` for bigger `-implement all` runs; decorate/adjust
  `promptBuilder.ts` if you want the agent to also commit to git, open a PR,
  etc. (not included here, but `run_command` already makes that possible.)
