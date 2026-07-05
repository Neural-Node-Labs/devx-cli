/**
 * @file src/llm/claudeClient.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ChatMessage } from "../types";
import { LlmLogger } from "../agent/llmLogger";
import { BaseHttpLlmClient, HttpRequestSpec } from "./baseClient";

export interface ClaudeOptions {
  /** Base URL up to (not including) "/v1/messages", e.g. "https://api.anthropic.com". */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Client for Anthropic's Messages API. Unlike the OpenAI-compatible providers, Claude takes
 * the system prompt as a separate top-level field (not a "system" role message) and returns
 * content as an array of typed blocks rather than a single string — this client adapts our
 * generic ChatMessage[]/string-in-string-out shape to that.
 */
export class ClaudeClient extends BaseHttpLlmClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(options: ClaudeOptions, logger?: LlmLogger) {
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    super(options.model, baseUrl, logger);
    this.baseUrl = baseUrl;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.temperature = options.temperature ?? 0.2;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  protected buildRequest(messages: ChatMessage[]): HttpRequestSpec {
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: conversation,
    };
    if (systemText) body.system = systemText;

    return {
      url: `${this.baseUrl}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body,
    };
  }

  protected parseResponse(data: any): string {
    const blocks = data?.content;
    if (!Array.isArray(blocks)) {
      throw new Error("missing content array");
    }
    const text = blocks
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("");
    if (!text) {
      throw new Error("no text blocks in content array");
    }
    return text;
  }
}
