/**
 * @file src/tools/registry.ts
 * @version 0.3.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ToolDefinition } from "../types";
import { createGlobTool } from "./glob";
import { createGrepTool } from "./grep";
import { createReadTool } from "./read";
import { createWriteTool } from "./write";
import { createRunCommandTool } from "./runCommand";
import { createIndexLookupTool } from "./indexLookup";
import { createDumpReadTool } from "./dumpReader";
import { createSshRunCommandTool } from "./sshRunCommand";
import { createSshCopyTool } from "./sshCopy";
import { RemoteConfig } from "../remote/types";

export function buildToolRegistry(cwd: string, remoteConfig?: RemoteConfig): Map<string, ToolDefinition> {
  const tools: ToolDefinition[] = [
    createIndexLookupTool(cwd),
    createDumpReadTool(cwd),
    createGlobTool(cwd),
    createGrepTool(cwd),
    createReadTool(cwd),
    createWriteTool(cwd),
    createRunCommandTool(cwd),
  ];

  if (remoteConfig && remoteConfig.targets.length > 0) {
    tools.push(createSshRunCommandTool(remoteConfig));
    tools.push(createSshCopyTool(cwd, remoteConfig));
  }
  const map = new Map<string, ToolDefinition>();
  for (const tool of tools) map.set(tool.name, tool);
  return map;
}

export function renderToolsForPrompt(tools: Map<string, ToolDefinition>): string {
  return Array.from(tools.values())
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  Input JSON shape: ${t.inputSchema}`
    )
    .join("\n\n");
}
