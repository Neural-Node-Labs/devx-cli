# Software Engineer Agentic CLI (SEA CLI)

An agentic coding CLI that runs a real Thought → Action → Observation loop against your
project on disk: searching with `glob`/`grep`/`read`, making changes with `write`/`edit`,
and **validating** every change by actually running commands (tests, build, lint).

Ships as the `devx` command by default — the name is just configurable branding (see
[Renaming the CLI](#renaming-the-cli) below), not a fixed identity, so it's easy to
re-brand if "devx" collides with something else for you.

Works with a local Ollama model out of the box (no API key required), or with a hosted
provider — DeepSeek, Claude, GPT, Grok, OpenRouter, or Kimi — via one environment
variable. See [LLM providers](#llm-providers).

## Why ReAct-style prompting instead of native tool calling?

Local models served via Ollama don't reliably support OpenAI/Anthropic-style structured
function calling, and using one text protocol for every provider keeps behavior identical
regardless of which model is driving the agent. So SEA CLI uses a strict text protocol
the model must follow each turn:

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
cd devx-cli
npm install
npm run build      # also runs scripts/configure-bin.js — see "Renaming the CLI" below

# Optional: link it globally so the command works from any project directory
npm link
```

Then either run a local model via Ollama, or point at a hosted provider:

```bash
# Local (default) — no API key needed
ollama pull deepseek-coder-v2
ollama serve

# Hosted, e.g. Claude
export DEVX_PROVIDER=claude
export ANTHROPIC_API_KEY=sk-ant-...
export DEVX_MODEL=claude-sonnet-4-5

devx -chat "what does this project do?"
```

## Renaming the CLI

The installed command name isn't hardcoded — it's read from `.env` at build time:

```bash
# .env
CLI_COMMAND_NAME=devx
```

Change it (e.g. to avoid a name collision) and rebuild:

```bash
echo "CLI_COMMAND_NAME=sea" > .env
npm run build     # scripts/configure-bin.js rewrites package.json's "bin" field
                  # and regenerates src/generated/brand.ts from the new name
npm link          # now installs as `sea` instead of `devx`
```

Everything that displays the command name — help text, log line prefixes, the state
directory (`.<command>/history.md` / `.<command>/index.json`), `-version` — follows
automatically; nothing else needs to change. Don't hand-edit `src/generated/brand.ts`,
it's overwritten on every build.

## LLM providers

Set `DEVX_PROVIDER` to pick one (default: `ollama`):

| Provider     | `DEVX_PROVIDER` | Default model         | API key env var (fallback for `DEVX_API_KEY`) |
|--------------|------------------|------------------------|--------------------------------------------------|
| Ollama       | `ollama`         | `deepseek-coder-v2`    | none — local server                              |
| DeepSeek     | `deepseek`       | `deepseek-chat`        | `DEEPSEEK_API_KEY`                                |
| Claude       | `claude`         | *(required, no default)* | `ANTHROPIC_API_KEY`                            |
| OpenAI (GPT) | `openai`         | `gpt-4o-mini`          | `OPENAI_API_KEY`                                  |
| Grok         | `grok`           | `grok-2-latest`        | `XAI_API_KEY` or `GROK_API_KEY`                   |
| OpenRouter   | `openrouter`     | `openrouter/auto`      | `OPENROUTER_API_KEY`                              |
| Kimi         | `kimi`           | `moonshot-v1-8k`       | `MOONSHOT_API_KEY` or `KIMI_API_KEY`              |

Generic overrides work for **any** provider (useful for self-hosted/proxy endpoints,
or to force a specific model):

- `DEVX_MODEL` — model name
- `DEVX_BASE_URL` — API base URL (Ollama-only default env var name is `DEVX_OLLAMA_URL`, also respected)
- `DEVX_API_KEY` — API key, checked before the provider-specific env var above

Claude requires `DEVX_MODEL` explicitly — Anthropic has no single implied default the
way the other providers do. DeepSeek, OpenAI, Grok, OpenRouter, and Kimi are all
OpenAI-compatible `/chat/completions` APIs handled by one shared client
(`src/llm/openAiCompatibleClient.ts`); Claude uses Anthropic's distinct Messages API
shape (`src/llm/claudeClient.ts`); Ollama uses its native `/api/chat` endpoint
(`src/llm/ollamaClient.ts`). All three extend `src/llm/baseClient.ts`, which is where
the shared request/response/`llm.log` logging logic lives.

## Configuration (environment variables)

| Variable          | Default                    | Meaning                                |
|-------------------|-----------------------------|-----------------------------------------|
| `DEVX_PROVIDER`   | `ollama`                    | Which LLM provider to use — see above   |
| `DEVX_MODEL`      | provider-specific            | Model name (required for `claude`)      |
| `DEVX_BASE_URL`   | provider-specific            | API base URL override (any provider)    |
| `DEVX_API_KEY`    | —                            | API key override (any provider)         |
| `DEVX_OLLAMA_URL` | `http://localhost:11434`    | Ollama server base URL                  |
| `DEVX_MAX_ITER`   | `15`                        | Max agent loop iterations               |
| `DEVX_CWD`        | current directory           | Project directory the agent operates in |
| `DEVX_LOG_FILE`   | `llm.log`                   | LLM payload/response log file name      |

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
devx -version
```

### `-version`

Prints the SEA CLI release version (from `package.json`, baked into
`src/generated/brand.ts` at build time) along with the brand name and configured
command name. No LLM call, no agent loop.

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
back to a heuristic if the model call fails), and writes `.devx/index.json` (the
directory name follows whatever `CLI_COMMAND_NAME` is configured as — see
[Renaming the CLI](#renaming-the-cli); it's `.devx` by default):

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
  generated/brand.ts         GENERATED — command name / brand / version, from scripts/configure-bin.js
  llm/
    types.ts                 LlmClient interface implemented by every provider
    baseClient.ts             Shared HTTP request/response/llm.log logging (BaseHttpLlmClient)
    ollamaClient.ts           Ollama's native /api/chat
    openAiCompatibleClient.ts Generic /chat/completions client (DeepSeek/OpenAI/Grok/OpenRouter/Kimi)
    claudeClient.ts           Anthropic Messages API (/v1/messages)
    factory.ts                Reads DEVX_PROVIDER + env vars, builds the right client
  index/indexManager.ts      Builds/loads/searches .<cmd>/index.json
  devxState/historyManager.ts Appends/reads structured entries in .<cmd>/history.md
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
    parseArgs.ts             -flag argument parser; excludes target/user/password/copy/remote from file-content resolution
    index.ts                 entry point wiring CLI -> command -> orchestrator -> history; handles -version directly

scripts/
  configure-bin.js           prebuild step: .env CLI_COMMAND_NAME -> package.json "bin" + generated/brand.ts
  add-version-headers.js     adds/refreshes the @version header comment on every src/**/*.ts file
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
