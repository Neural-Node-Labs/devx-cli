#!/usr/bin/env node
/**
 * @file src/cli/index.ts
 * @version 0.3.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { parseArgs, ParsedCli } from "./parseArgs";
import { createLlmClient } from "../llm/factory";
import { LlmLogger } from "../agent/llmLogger";
import { runAgent } from "../agent/orchestrator";
import { buildDesignTask } from "../commands/design";
import { buildImplementTask } from "../commands/implement";
import { buildFixTask } from "../commands/fix";
import { buildRefactorTask } from "../commands/refactor";
import { buildTestTask } from "../commands/test";
import { buildChatTask } from "../commands/chat";
import { buildContinueTask } from "../commands/continueTask";
import { buildSshTask } from "../commands/sshTask";
import { buildDocTask } from "../commands/docTask";
import { buildPredeployTask } from "../commands/predeploy";
import { runIndexCommand } from "../commands/indexWorkspace";
import { runCopyCommand } from "../commands/copyRemote";
import { runHashCommand } from "../commands/hashSecret";
import { parseTargets } from "../remote/sshConnection";
import { RemoteConfig } from "../remote/types";
import { appendHistoryEntry, getLastUnfinishedTask, TaskStatus } from "../devxState/historyManager";
import { CLI_COMMAND_NAME, BRAND_NAME, BRAND_ABBREVIATION, VERSION } from "../generated/brand";
import { randomBytes } from 'crypto';
const CMD = CLI_COMMAND_NAME;

const HELP = `${BRAND_NAME} (${BRAND_ABBREVIATION}) — command: ${CMD} — v${VERSION}

Usage:
  ${CMD} -design [requirement.md] -architecture [architecture.md]
  ${CMD} -implement [design.md] -component all
  ${CMD} -implement [design.md] -component <name>
  ${CMD} -fix [issue detail or filepath]
  ${CMD} -refactor [refactor detail or filepath]
  ${CMD} -test [detail or filepath] -component [name]
  ${CMD} -chat [instruction or question]
  ${CMD} -continue
  ${CMD} -index
  ${CMD} -ssh -task [instruction] -target [host1,host2] -user [user] -password [password]
  ${CMD} -copy [local file or folder] -target [host1,host2] -user [user] -password [password] -remote [destPath]
  ${CMD} -doc [readme|blueprint|scenario|testsuite|setup|testcase]
  ${CMD} -predeploy [instruction]
  ${CMD} -hash [32|64] -secret [value]
  ${CMD} -hash32
  ${CMD} -version

-hash keys a hash of -secret with a local, auto-generated per-workspace key
  (.${CMD}/hash.key, never committed — .gitignore already excludes .${CMD}/), truncated
  to 32 or 64 bits. Same secret + same workspace always reproduces the same hash;
  the secret value itself is never printed, logged, or stored. Runs directly, not
  through the LLM agent loop.

-predeploy makes the workspace ready to run locally and/or in Docker: creates or fixes
whatever's missing (Dockerfile, .dockerignore, docker-compose.yml, .env.example, etc.),
then validates by actually building/running what it can. Instruction is optional context
(e.g. "just Docker, no compose"); omit it to cover both local and Docker readiness.

-doc generates documentation grounded in the actual current workspace (not boilerplate):
  readme     -> README.md                 project overview, setup, usage
  blueprint  -> docs/BLUEPRINT.md          technical design document
  scenario   -> docs/SCENARIO.md           inferred business scenario / use cases
  testsuite  -> test files + docs/TESTSUITE.md   generates & runs tests for the whole workspace
  setup      -> docs/SETUP.md              how to run the project locally
  testcase   -> docs/TESTCASES.md           structured test case list (not code)

Any flag value that is a real file path is read from disk; otherwise it's
treated as literal text (this does NOT apply to -target/-user/-password/-copy/-remote,
which are always used literally, even if a same-named file happens to exist).

Remote commands (-ssh, -copy):
  -target accepts one or more comma-separated hosts, each optionally with a port
  (host or host:port), e.g. -target 203.0.113.5,203.0.113.6:2222
  -ssh routes through the full ReAct agent loop: the LLM inspects the local workspace,
  decides what to upload and which remote commands to run (via ssh_copy_tool /
  ssh_run_command), and validates the result on the remote host itself.
  -copy is a direct utility with no LLM involved — it just uploads a file/folder.
  SECURITY NOTE: -password on the command line is visible in shell history and the
  process list. Prefer a scoped/temporary credential where possible.

State kept in the project directory:
  .${CMD}/history.md    Summary + status of each task ${CMD} runs (not raw chat logs).
                       "${CMD} -continue" resumes the most recent unfinished entry.
  .${CMD}/index.json     Workspace file index built by "${CMD} -index": filename, path,
                       summary, and purpose per file. read_tool/write_tool consult this
                       first when a given path isn't found, before falling back to a
                       manual filesystem search.

LLM provider (DEVX_PROVIDER, default "ollama"): ollama | deepseek | claude | openai | grok | openrouter | kimi
  Generic overrides (work for any provider): DEVX_MODEL, DEVX_BASE_URL, DEVX_API_KEY
  Provider-specific fallback API key env vars (used if DEVX_API_KEY isn't set):
    deepseek   DEEPSEEK_API_KEY        openai     OPENAI_API_KEY
    claude     ANTHROPIC_API_KEY       grok       XAI_API_KEY / GROK_API_KEY
    openrouter OPENROUTER_API_KEY      kimi       MOONSHOT_API_KEY / KIMI_API_KEY
  ollama-specific: DEVX_OLLAMA_URL (default http://localhost:11434)

Other environment variables:
  DEVX_MAX_ITER       Max agent loop iterations (default: 15)
  DEVX_CWD            Project directory the agent operates in (default: cwd)
  DEVX_LOG_FILE       LLM payload/response log file name (default: llm.log)
`;

/** Short, non-sensitive preview of what was asked — used for history.md, never the full chat/task text. */
function buildRequestPreview(parsed: ParsedCli): string {
  switch (parsed.command) {
    case "design":
      return `design (requirement: ${parsed.rawValues["design"] || "?"}${
        parsed.rawValues["architecture"] ? `, architecture: ${parsed.rawValues["architecture"]}` : ""
      })`;
    case "implement":
      return `implement (design: ${parsed.rawValues["implement"] || "?"}, component: ${
        parsed.rawValues["component"] || "all"
      })`;
    case "fix":
      return `fix: ${parsed.rawValues["fix"] || "?"}`;
    case "refactor":
      return `refactor: ${parsed.rawValues["refactor"] || "?"}`;
    case "test":
      return `test: ${parsed.rawValues["test"] || "?"}${
        parsed.rawValues["component"] ? ` (component: ${parsed.rawValues["component"]})` : ""
      }`;
    case "chat":
      return `chat: ${parsed.rawValues["chat"] || "?"}`;
    case "ssh":
      return `ssh task on [${parsed.rawValues["target"] || "?"}] as ${parsed.rawValues["user"] || "?"}: ${
        parsed.rawValues["task"] || "?"
      }`;
    case "copy":
      return `copy "${parsed.rawValues["copy"] || "?"}" to [${parsed.rawValues["target"] || "?"}] as ${
        parsed.rawValues["user"] || "?"
      } -> ${parsed.rawValues["remote"] || "(default remote path)"}`;
    case "doc":
      return `doc: ${parsed.rawValues["doc"] || "?"}`;
    case "predeploy":
      return `predeploy: ${parsed.rawValues["predeploy"] || "(default: local + docker readiness)"}`;
    case "hash":
      // Deliberately omits the -secret value itself — history.md must never contain it.
      return `hash: ${parsed.rawValues["hash"] || "?"}-bit`;

    default:
      return parsed.command;
  }
}

function resultStatus(success: boolean, finalAnswer: string): TaskStatus {
  if (!success && /failed to reach (Ollama|the model provider)/i.test(finalAnswer)) return "error";
  return success ? "completed" : "incomplete";
}

async function main() {
  const argv = process.argv;

  if (argv.includes("--help") || argv.includes("-h") || argv.length <= 2) {
    console.log(HELP);
    return;
  }

  if (argv.includes("-version") || argv.includes("--version")) {
    console.log(`${BRAND_NAME} (${BRAND_ABBREVIATION}) v${VERSION} — command: ${CMD}`);
    return;
  }

  if (argv.includes("-hash32") || argv.includes("--hash32")) {

    try {
            console.log('Generating Hash 32 key');
            const { randomBytes } = require('crypto'); // Use require if not using ES modules
            const token = randomBytes(32).toString('hex');
            console.log(token);
        } catch (error) {
            console.error('Failed to generate secret key:', error);
        }
    return;
    }


  const parsed = parseArgs(argv);
  const cwd = process.env.DEVX_CWD || process.cwd();
  const maxIterations = process.env.DEVX_MAX_ITER ? parseInt(process.env.DEVX_MAX_ITER, 10) : 15;
  const logFileName = process.env.DEVX_LOG_FILE || "llm.log";

  const logger = new LlmLogger(cwd, logFileName);
  const llm = createLlmClient(logger);
  const providerLabel = process.env.DEVX_PROVIDER || "ollama";

  // -index: a direct workspace scan, not an agent loop, and not logged to history.
  if (parsed.command === "index") {
    await runIndexCommand(cwd, llm);
    return;
  }

  // -copy: a direct multi-target upload, not an agent loop.
  if (parsed.command === "copy") {
    const results = await runCopyCommand(parsed, cwd);
    const allOk = results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);
    console.log("\n============================================");
    console.log(allOk ? "✅ Copy complete on all targets" : anyOk ? "⚠️  Copy partially succeeded" : "❌ Copy failed on all targets");
    console.log("============================================");

    appendHistoryEntry(cwd, {
      command: "copy",
      requestPreview: buildRequestPreview(parsed),
      status: allOk ? "completed" : anyOk ? "incomplete" : "error",
      iterations: 0,
      summary: results
        .map((r) => (r.ok ? `${r.target}: ok (${r.filesUploaded ?? 0} files)` : `${r.target}: FAILED (${r.error})`))
        .join("; "),
    });

    process.exit(allOk ? 0 : 1);
  }




  // -hash: a direct, deterministic local computation — not an agent loop, no LLM call.
  if (parsed.command === "hash") {
    const result = runHashCommand(parsed, cwd);
    console.log(`${CMD}: ${result.bits}-bit hash -> ${result.hash}`);
    console.log(`${CMD}: keyed with ${result.keyPath} (local only, never printed or committed)`);

    appendHistoryEntry(cwd, {
      command: "hash",
      requestPreview: buildRequestPreview(parsed),
      status: "completed",
      iterations: 0,
      summary: `${result.bits}-bit hash computed: ${result.hash}`,
    });
    return;
  }

  let taskDescription: string;
  let requestPreview: string;
  let remoteConfig: RemoteConfig | undefined;

  if (parsed.command === "continue") {
    const lastUnfinished = getLastUnfinishedTask(cwd);
    if (!lastUnfinished) {
      console.log(`${CMD}: no unfinished task found in .${CMD}/history.md — nothing to continue.`);
      return;
    }
    console.log(
      `${CMD}: resuming unfinished "${lastUnfinished.command}" task from ${lastUnfinished.timestamp} ` +
        `(was ${lastUnfinished.status}, ${lastUnfinished.iterations} iteration(s) used)\n`
    );
    taskDescription = buildContinueTask(lastUnfinished);
    requestPreview = `continue ${lastUnfinished.command}: ${lastUnfinished.requestPreview}`;
  } else if (parsed.command === "ssh") {
    const task = parsed.values["task"];
    const targetRaw = parsed.values["target"];
    const user = parsed.values["user"];
    const password = parsed.values["password"];
    if (!task) throw new Error("Missing -task: describe what to do on the remote target(s).");
    if (!targetRaw) throw new Error("Missing -target: provide one or more comma-separated hosts (host[:port]).");
    if (!user) throw new Error("Missing -user: provide the SSH username.");
    if (!password) throw new Error("Missing -password: provide the SSH password.");

    const targets = parseTargets(targetRaw);
    remoteConfig = { targets, auth: { user, password } };
    const targetLabels = targets.map((t) => `${t.host}:${t.port}`);
    taskDescription = buildSshTask(parsed, targetLabels);
    requestPreview = buildRequestPreview(parsed);
  } else {
    switch (parsed.command) {
      case "design":
        taskDescription = buildDesignTask(parsed);
        break;
      case "implement":
        taskDescription = buildImplementTask(parsed);
        break;
      case "fix":
        taskDescription = buildFixTask(parsed);
        break;
      case "refactor":
        taskDescription = buildRefactorTask(parsed);
        break;
      case "test":
        taskDescription = buildTestTask(parsed);
        break;
      case "chat":
        taskDescription = buildChatTask(parsed);
        break;
      case "doc":
        await runIndexCommand(cwd, llm);
        taskDescription = buildDocTask(parsed);
        break;
      case "predeploy":
        taskDescription = buildPredeployTask(parsed);
        break;
      default:
        throw new Error(`Unhandled command: ${parsed.command}`);
    }
    requestPreview = buildRequestPreview(parsed);
  }

  console.log(`${CMD}: running "${parsed.command}" with provider "${providerLabel}"`);
  console.log(`${CMD}: operating in ${cwd}`);
  console.log(`${CMD}: logging LLM payloads/responses to ${logger.getPath()}\n`);

  const result = await runAgent(taskDescription, llm, { cwd, maxIterations, verbose: true, remoteConfig });

  console.log("\n============================================");
  console.log(result.success ? "✅ Task complete" : "⚠️  Task stopped without full success");
  console.log(`Iterations used: ${result.iterations}`);
  console.log("============================================\n");
  console.log(result.finalAnswer);

  appendHistoryEntry(cwd, {
    command: parsed.command,
    requestPreview,
    status: resultStatus(result.success, result.finalAnswer),
    iterations: result.iterations,
    summary: result.finalAnswer,
  });

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(`${CLI_COMMAND_NAME}: fatal error — ${err.message}`);
  process.exit(1);
});

