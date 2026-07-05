import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -ssh -task [instruction] -target [host1,host2] -user [user] -password [password]
 *
 * Unlike a plain "run this command over SSH" utility, -ssh routes through the full
 * ReAct agent loop: the LLM inspects the local workspace, decides what needs to be
 * uploaded and what remote commands to run, executes them via ssh_copy_tool /
 * ssh_run_command, and validates the result on the remote host itself.
 */
export function buildSshTask(parsed: ParsedCli, targetLabels: string[]): string {
  const instruction = parsed.values["task"];

  return `You are performing a REMOTE DEPLOYMENT / OPERATIONS task over SSH.

REMOTE TARGETS: ${targetLabels.join(", ")}

INSTRUCTION:
${instruction || "(no instruction provided)"}

INSTRUCTIONS:
1. First inspect the LOCAL workspace (index_lookup_tool/glob_tool/grep_tool/read_tool) to understand
   what's relevant to this instruction — e.g. find the Dockerfile, docker-compose.yml, build scripts,
   or config files that need to be deployed or acted on.
2. Decide your own deployment strategy based on what you find. There is no fixed script to follow —
   for a Docker deployment this typically means: upload the relevant build context with ssh_copy_tool,
   then use ssh_run_command to build the image and start the container/service on the remote target(s).
3. If targets differ or something is uncertain, use ssh_run_command first to probe the remote environment
   (e.g. "docker --version", "which docker-compose", "ls ~/app") before assuming it's ready.
4. VALIDATE that the deployment/operation actually worked on the remote host itself — check container/
   process status, curl a health endpoint, check exit codes — before declaring success. Do not assume a
   command worked just because it didn't error immediately.
5. If multiple targets were given and results differ, report exactly which targets succeeded and which
   failed in your Final Answer. Do not report overall success if even one target failed.
6. Give a Final Answer summarizing what was deployed/run, on which target(s), and how you validated it.`;
}
