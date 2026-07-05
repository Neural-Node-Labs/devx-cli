/**
 * @file src/commands/copyRemote.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { ParsedCli } from "../cli/parseArgs";
import { parseTargets, connect } from "../remote/sshConnection";
import { uploadPath } from "../remote/scpUpload";

export interface CopyTargetResult {
  target: string;
  ok: boolean;
  filesUploaded?: number;
  dirsCreated?: number;
  error?: string;
}

/**
 * devx -copy [local file or folder] -target [host1,host2] -user [user] -password [password] -remote [destPath]
 *
 * A direct utility — no LLM/agent loop involved, just an upload to one or more targets.
 * (For LLM-driven deployment strategy, use "devx -ssh" instead, which has ssh_copy_tool
 * available as one of several tools it can choose to use.)
 */
export async function runCopyCommand(parsed: ParsedCli, cwd: string, verbose = true): Promise<CopyTargetResult[]> {
  const sourcePath = parsed.values["copy"];
  const targetRaw = parsed.values["target"];
  const user = parsed.values["user"];
  const password = parsed.values["password"];
  const remoteDest = parsed.values["remote"] || `~/${path.basename(sourcePath || "")}`;

  if (!sourcePath) throw new Error("Missing -copy value: provide the local file or folder path to copy.");
  const absSource = path.resolve(cwd, sourcePath);
  if (!fs.existsSync(absSource)) throw new Error(`Local path not found: ${sourcePath}`);
  if (!targetRaw) throw new Error("Missing -target: provide one or more comma-separated hosts (host[:port]).");
  if (!user) throw new Error("Missing -user: provide the SSH username.");
  if (!password) throw new Error("Missing -password: provide the SSH password.");

  const targets = parseTargets(targetRaw);

  const results = await Promise.all(
    targets.map(async (target): Promise<CopyTargetResult> => {
      const label = `${target.host}:${target.port}`;
      try {
        if (verbose) console.log(`\n[${label}] connecting...`);
        const conn = await connect(target, user, password);
        if (verbose) console.log(`[${label}] uploading "${sourcePath}" -> "${remoteDest}"...`);
        const stats = await uploadPath(conn, absSource, remoteDest);
        conn.end();
        if (verbose) console.log(`[${label}] done: ${stats.filesUploaded} file(s), ${stats.dirsCreated} dir(s)`);
        return { target: label, ok: true, ...stats };
      } catch (err: any) {
        if (verbose) console.log(`[${label}] ERROR: ${err.message}`);
        return { target: label, ok: false, error: err.message };
      }
    })
  );

  return results;
}
