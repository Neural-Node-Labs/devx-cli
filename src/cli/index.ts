#!/usr/bin/env node
import { parseArgs, ParsedCli } from "./parseArgs";
import { OllamaClient } from "../llm/ollamaClient";
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
import { parseTargets } from "../remote/sshConnection";
import { RemoteConfig } from "../remote/types";
import { appendHistoryEntry, getLastUnfinishedTask, TaskStatus } from "../devxState/historyManager";

const HELP = `devx — agentic DevX CLI (local Ollama/DeepSeek powered)

Usage:
  devx -design [requirement.md] -architecture [architecture.md]
  devx -implement [design.md] -component all
  devx -implement [design.md] -component <name>
  devx -fix [issue detail or filepath]
  devx -refactor [refactor detail or filepath]
  devx -test [detail or filepath] -component [name]
  devx -chat [instruction or question]
  devx -continue
  devx -index
  devx -ssh -task [instruction] -target [host1,host2] -user [user] -password [password]
  devx -copy [local file or folder] -target [host1,host2] -user [user] -password [password] -remote [destPath]
  devx -doc [readme|blueprint|scenario|testsuite|setup|testcase]
  devx -predeploy [instruction]

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
  ssh_run_command), and validates the result on the remote host itself — e.g.
  "devx -ssh -task 'deploy the current workspace docker setup' -target host1,host2 ..."
  -copy is a direct utility with no LLM involved — it just uploads a file/folder.
  SECURITY NOTE: -password on the command line is visible in shell history and the
  process list. Prefer a scoped/temporary credential where possible.

State kept in the project directory:
  .devx/history.md    Summary + status of each task devx runs (not raw chat logs).
                       "devx -continue" resumes the most recent unfinished entry.
  .devx/index.json     Workspace file index built by "devx -index": filename, path,
                       summary, and purpose per file. read_tool/write_tool consult this
                       first when a given path isn't found, before falling back to a
                       manual filesystem search.

Environment variables:
  DEVX_OLLAMA_URL     Ollama server base URL (default: http://localhost:11434)
  DEVX_MODEL          Model name to use (default: deepseek-coder-v2)
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
    default:
      return parsed.command;
  }
}

function resultStatus(success: boolean, finalAnswer: string): TaskStatus {
  if (!success && /failed to reach Ollama/i.test(finalAnswer)) return "error";
  return success ? "completed" : "incomplete";
}

async function main() {
  const argv = process.argv;

  if (argv.includes("--help") || argv.includes("-h") || argv.length <= 2) {
    console.log(HELP);
    return;
  }

  const parsed = parseArgs(argv);
  const cwd = process.env.DEVX_CWD || process.cwd();
  const model = process.env.DEVX_MODEL || "deepseek-coder-v2";
  const baseUrl = process.env.DEVX_OLLAMA_URL || "http://localhost:11434";
  const maxIterations = process.env.DEVX_MAX_ITER ? parseInt(process.env.DEVX_MAX_ITER, 10) : 15;
  const logFileName = process.env.DEVX_LOG_FILE || "llm.log";

  const logger = new LlmLogger(cwd, logFileName);
  const llm = new OllamaClient({ model, baseUrl }, logger);

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

  let taskDescription: string;
  let requestPreview: string;
  let remoteConfig: RemoteConfig | undefined;

  if (parsed.command === "continue") {
    const lastUnfinished = getLastUnfinishedTask(cwd);
    if (!lastUnfinished) {
      console.log("devx: no unfinished task found in .devx/history.md — nothing to continue.");
      return;
    }
    console.log(
      `devx: resuming unfinished "${lastUnfinished.command}" task from ${lastUnfinished.timestamp} ` +
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

  console.log(`devx: running "${parsed.command}" with model "${model}" at ${baseUrl}`);
  console.log(`devx: operating in ${cwd}`);
  console.log(`devx: logging LLM payloads/responses to ${logger.getPath()}\n`);

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
  console.error(`devx: fatal error — ${err.message}`);
  process.exit(1);
});

