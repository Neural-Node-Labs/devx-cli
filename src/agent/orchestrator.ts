/**
 * @file src/agent/orchestrator.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { LlmClient } from "../llm/types";
import { buildToolRegistry } from "../tools/registry";
import { buildSystemPrompt, INITIAL_USER_MESSAGE } from "./promptBuilder";
import { parseAgentResponse } from "./responseParser";
import { ChatMessage, OrchestratorOptions } from "../types";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

function colorize(color: string, text: string): string {
  // Disable color codes when not attached to a TTY (e.g. piped to a file).
  if (!process.stdout.isTTY) return text;
  return `${color}${text}${RESET}`;
}

const DEFAULT_MAX_ITERATIONS = 15;

export interface RunResult {
  success: boolean;
  finalAnswer: string;
  iterations: number;
  transcript: ChatMessage[];
}

/**
 * The core agentic loop:
 *   Thought -> Action -> Observation -> repeat -> Final Answer
 *
 * This wires together search tools (glob/grep/read), the action tool (write/edit),
 * and the validation tool (run_command), driven by a local Ollama/DeepSeek model.
 */
export async function runAgent(
  taskDescription: string,
  llm: LlmClient,
  options: OrchestratorOptions = {}
): Promise<RunResult> {
  const cwd = options.cwd ?? process.cwd();
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const verbose = options.verbose ?? true;

  const tools = buildToolRegistry(cwd, options.remoteConfig);
  const remoteTargets = options.remoteConfig?.targets.map((t) => `${t.host}:${t.port}`);
  const systemPrompt = buildSystemPrompt(tools, taskDescription, { remoteTargets });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: INITIAL_USER_MESSAGE },
  ];

  let lastFailedActionSignature: string | null = null;
  let repeatedFailureCount = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (verbose) {
      console.log(colorize(BOLD, `\n━━━ Iteration ${iteration}/${maxIterations} ━━━`));
      console.log(colorize(DIM, "Calling model..."));
    }

    const callStart = Date.now();
    let reply: string;
    try {
      reply = await llm.chat(messages);
    } catch (err: any) {
      if (verbose) console.log(colorize(RED, `LLM call failed: ${err.message}`));
      return {
        success: false,
        finalAnswer: `Agent stopped: failed to reach Ollama — ${err.message}`,
        iterations: iteration,
        transcript: messages,
      };
    }
    const callMs = Date.now() - callStart;

    messages.push({ role: "assistant", content: reply });
    const parsed = parseAgentResponse(reply);

    if (verbose) {
      console.log(colorize(DIM, `(model responded in ${callMs}ms)`));
      if (parsed.thought) {
        console.log(colorize(CYAN, BOLD + "Thought: " + RESET + CYAN) + parsed.thought + RESET);
      } else {
        console.log(colorize(RED, "Thought: (none provided — model may be drifting from the response format)"));
      }
    }

    if (parsed.type === "final") {
      if (verbose) {
        console.log(colorize(GREEN, BOLD + "Final Answer: " + RESET + GREEN) + parsed.finalAnswer + RESET);
      }
      return {
        success: true,
        finalAnswer: parsed.finalAnswer ?? "(no final answer provided)",
        iterations: iteration,
        transcript: messages,
      };
    }

    // Action turn
    const toolName = parsed.tool ?? "";
    const tool = tools.get(toolName);

    if (verbose) {
      console.log(colorize(YELLOW, BOLD + "Action: " + RESET + YELLOW) + toolName + RESET);
      console.log(colorize(YELLOW, "Action Input: ") + JSON.stringify(parsed.toolInput ?? {}));
      if (tool) {
        console.log(colorize(DIM, `Strategy: ${describeStrategy(toolName)}`));
      }
    }

    if (!tool) {
      const availableNames = Array.from(tools.keys()).join(", ");
      const observation = `Error: unknown tool "${toolName}". Available tools: ${availableNames}`;
      if (verbose) console.log(colorize(RED, `Observation: ${observation}`));
      messages.push({ role: "user", content: `Observation: ${observation}` });
      continue;
    }

    if (parsed.toolInput?.__parseError) {
      const observation = `Error: your Action Input was not valid JSON: ${parsed.toolInput.raw}. Re-emit valid JSON matching the schema: ${tool.inputSchema}`;
      if (verbose) console.log(colorize(RED, `Observation: ${observation}`));
      messages.push({ role: "user", content: `Observation: ${observation}` });
      continue;
    }

    const result = await tool.run(parsed.toolInput);

    // Basic loop-guard: if the exact same action fails repeatedly, stop the agent
    // instead of burning iterations on an unrecoverable path.
    const signature = `${toolName}:${JSON.stringify(parsed.toolInput)}`;
    if (!result.ok && signature === lastFailedActionSignature) {
      repeatedFailureCount++;
    } else {
      repeatedFailureCount = 0;
    }
    lastFailedActionSignature = result.ok ? null : signature;

    const truncatedOutput =
      result.output.length > 4000 ? result.output.slice(0, 4000) + "\n...(truncated)" : result.output;

    if (verbose) {
      const color = result.ok ? GREEN : RED;
      console.log(colorize(color, BOLD + `Observation (${result.ok ? "ok" : "error"}): ` + RESET + color) + truncatedOutput + RESET);
    }

    messages.push({ role: "user", content: `Observation: ${truncatedOutput}` });

    if (repeatedFailureCount >= 2) {
      const giveUpMsg =
        "Observation: The same action has failed 3 times in a row. Stop repeating it — either try a fundamentally different approach or give a Final Answer explaining the blocker.";
      if (verbose) console.log(colorize(MAGENTA, `⚠ Loop guard: ${giveUpMsg}`));
      messages.push({ role: "user", content: giveUpMsg });
    }
  }

  return {
    success: false,
    finalAnswer: `Agent stopped after reaching the maximum of ${maxIterations} iterations without a Final Answer.`,
    iterations: maxIterations,
    transcript: messages,
  };
}

/** One-line, human-readable description of what each tool's call represents strategically. */
function describeStrategy(toolName: string): string {
  switch (toolName) {
    case "index_lookup_tool":
      return "search phase — checking the precomputed workspace index before touching the filesystem";
    case "glob_tool":
      return "search phase — discovering relevant files by name/pattern before reading them";
    case "grep_tool":
      return "search phase — locating relevant code/content by matching text or symbols";
    case "read_tool":
      return "search phase — inspecting a specific file's content in detail";
    case "write_tool":
      return "action phase — creating or modifying code on disk";
    case "run_command":
      return "validation phase — executing a command to verify the change actually works";
    case "ssh_copy_tool":
      return "remote action phase — uploading local files/folders to a remote deployment target";
    case "ssh_run_command":
      return "remote action/validation phase — executing or verifying a command on a remote deployment target";
    default:
      return "unrecognized tool";
  }
}
