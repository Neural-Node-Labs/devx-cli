/**
 * @file src/tools/sshCopy.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { ToolDefinition, ToolResult } from "../types";
import { RemoteConfig } from "../remote/types";
import { connect } from "../remote/sshConnection";
import { uploadPath } from "../remote/scpUpload";
import { resolveFilePath } from "../utils/fileResolver";

/**
 * ssh_copy_tool: lets the agent upload a local file or folder from the workspace to
 * one or all configured remote targets over SFTP. This is how the agent gets build
 * context, compose files, configs, etc. onto the remote host before running commands
 * against them with ssh_run_command.
 */
export function createSshCopyTool(cwd: string, remoteConfig: RemoteConfig): ToolDefinition {
  const targetLabels = remoteConfig.targets.map((t) => `${t.host}:${t.port}`);

  return {
    name: "ssh_copy_tool",
    description:
      `Upload a local file or folder from this workspace to remote deployment target(s) over SFTP. ` +
      `Configured targets: ${targetLabels.join(", ")}. ` +
      `Omit "target" to upload to ALL configured targets; set "target" to one of the values above for ` +
      `just that one. "localPath" is resolved the same way as read_tool (direct path, then workspace ` +
      `index, then manual search) so it also works for directories, not just files known to the index.`,
    inputSchema: `{ "localPath": "docker", "remotePath": "~/app/docker", "target": "optional" }`,
    run: async (input: any): Promise<ToolResult> => {
      const localPathInput = input?.localPath;
      const remotePath = input?.remotePath;
      if (!localPathInput || typeof localPathInput !== "string") {
        return { ok: false, output: "Error: 'localPath' (string) is required." };
      }
      if (!remotePath || typeof remotePath !== "string") {
        return { ok: false, output: "Error: 'remotePath' (string) is required." };
      }

      let absLocal: string;
      const resolved = resolveFilePath(cwd, localPathInput);
      if (resolved.resolvedPath) {
        absLocal = path.resolve(cwd, resolved.resolvedPath);
      } else {
        // resolveFilePath only matches regular files; directories need a direct check.
        const direct = path.resolve(cwd, localPathInput);
        if (fs.existsSync(direct)) {
          absLocal = direct;
        } else {
          return { ok: false, output: `Error: ${resolved.note}` };
        }
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

      const results = await Promise.all(
        targets.map(async (target) => {
          const label = `${target.host}:${target.port}`;
          try {
            const conn = await connect(target, remoteConfig.auth.user, remoteConfig.auth.password);
            const stats = await uploadPath(conn, absLocal, remotePath);
            conn.end();
            return { ok: true, text: `[${label}] uploaded ${stats.filesUploaded} file(s), ${stats.dirsCreated} dir(s) to ${remotePath}` };
          } catch (err: any) {
            return { ok: false, text: `[${label}] ERROR: ${err.message}` };
          }
        })
      );

      const allOk = results.every((r) => r.ok);
      return { ok: allOk, output: results.map((r) => r.text).join("\n") };
    },
  };
}
