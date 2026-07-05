/**
 * @file src/tools/runCommand.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { execFile } from "child_process";
import { ToolDefinition, ToolResult } from "../types";

const DENY_PATTERNS = [
  /\brm\s+-rf\s+\/(?!\S)/, // rm -rf /
  /\bsudo\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /:\(\)\{.*\};:/, // fork bomb
];

/**
 * run_command tool: executes a shell command for validation
 * (tests, linters, type-checkers, build, reproducing a bug, etc).
 * Input: { command: string, timeoutMs?: number }
 */
export function createRunCommandTool(cwd: string): ToolDefinition {
  return {
    name: "run_command",
    description:
      "Run a shell command in the project directory and capture stdout/stderr/exit code. " +
      "Use this to run tests, linters, type-checkers, builds, or to reproduce a bug. " +
      "This is the validation step — always run it after making an edit to confirm the change works.",
    inputSchema: `{ "command": "npm test", "timeoutMs": 60000 }`,
    run: async (input: any): Promise<ToolResult> => {
      const command = input?.command;
      if (!command || typeof command !== "string") {
        return { ok: false, output: "Error: 'command' (string) is required." };
      }
      for (const pattern of DENY_PATTERNS) {
        if (pattern.test(command)) {
          return { ok: false, output: `Error: command blocked for safety: "${command}"` };
        }
      }
      const timeoutMs = typeof input?.timeoutMs === "number" ? input.timeoutMs : 120000;

      return new Promise<ToolResult>((resolve) => {
        execFile(
          "/bin/sh",
          ["-c", command],
          { cwd, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
          (error, stdout, stderr) => {
            const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
            if (error) {
              resolve({
                ok: false,
                output: `Command exited with error (code ${error.code ?? "unknown"}):\n${combined || error.message}`,
              });
            } else {
              resolve({ ok: true, output: combined || "(command produced no output, exit code 0)" });
            }
          }
        );
      });
    },
  };
}
