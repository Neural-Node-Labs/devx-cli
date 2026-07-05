/**
 * @file src/tools/sshRunCommand.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ToolDefinition, ToolResult } from "../types";
import { RemoteConfig } from "../remote/types";
import { connect, execCommand, execScript } from "../remote/sshConnection";

/**
 * ssh_run_command: lets the agent execute a shell command (or multi-line bash script,
 * detected by the presence of a newline) on one or all configured remote targets.
 * This is the remote equivalent of run_command — the agent's remote validation step.
 */
export function createSshRunCommandTool(remoteConfig: RemoteConfig): ToolDefinition {
  const targetLabels = remoteConfig.targets.map((t) => `${t.host}:${t.port}`);

  return {
    name: "ssh_run_command",
    description:
      `Execute a shell command (or multi-line bash script) over SSH on remote deployment target(s). ` +
      `Configured targets: ${targetLabels.join(", ")}. ` +
      `Omit "target" to run on ALL configured targets in parallel; set "target" to one of the values ` +
      `above to run on just that one. Use this for remote actions — checking what's installed, running ` +
      `docker/build commands, starting services, tailing logs, checking a service is actually up, etc. ` +
      `This is also your remote VALIDATION step: always verify a remote change actually worked (check ` +
      `process/container status, curl a health endpoint, check exit codes) rather than assuming success.`,
    inputSchema: `{ "command": "docker ps", "target": "optional, e.g. \\"${targetLabels[0] ?? "host:22"}\\"" }`,
    run: async (input: any): Promise<ToolResult> => {
      const command = input?.command;
      if (!command || typeof command !== "string") {
        return { ok: false, output: "Error: 'command' (string) is required." };
      }

      const requestedTarget = input?.target;
      const targets = requestedTarget
        ? remoteConfig.targets.filter(
            (t) => `${t.host}:${t.port}` === requestedTarget || t.host === requestedTarget
          )
        : remoteConfig.targets;

      if (targets.length === 0) {
        return {
          ok: false,
          output: `Error: target "${requestedTarget}" is not one of the configured targets: ${targetLabels.join(", ")}`,
        };
      }

      const isScript = command.includes("\n");

      const results = await Promise.all(
        targets.map(async (target) => {
          const label = `${target.host}:${target.port}`;
          try {
            const conn = await connect(target, remoteConfig.auth.user, remoteConfig.auth.password);
            const result = isScript ? await execScript(conn, command) : await execCommand(conn, command);
            conn.end();
            const ok = result.exitCode === 0;
            return {
              ok,
              text:
                `[${label}] exit ${result.exitCode}\n` +
                `stdout:\n${result.stdout.trim() || "(none)"}\n` +
                `stderr:\n${result.stderr.trim() || "(none)"}`,
            };
          } catch (err: any) {
            return { ok: false, text: `[${label}] ERROR: ${err.message}` };
          }
        })
      );

      const allOk = results.every((r) => r.ok);
      return { ok: allOk, output: results.map((r) => r.text).join("\n\n---\n\n") };
    },
  };
}
