import { RemoteConfig } from "./remote/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** Human-readable description of the expected JSON input shape, shown to the model. */
  inputSchema: string;
  run: (input: any) => Promise<ToolResult>;
}

export interface ParsedAction {
  type: "action" | "final";
  thought?: string;
  tool?: string;
  toolInput?: any;
  finalAnswer?: string;
  raw: string;
}

export interface OllamaChatOptions {
  model: string;
  baseUrl: string;
  temperature?: number;
}

export interface OrchestratorOptions {
  maxIterations?: number;
  verbose?: boolean;
  /** Working directory the agent is allowed to operate in. */
  cwd?: string;
  /** When set, the agent also gets ssh_run_command / ssh_copy_tool for remote deployment tasks. */
  remoteConfig?: RemoteConfig;
}
