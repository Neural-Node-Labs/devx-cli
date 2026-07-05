/**
 * @file src/llm/ollamaClient.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ChatMessage, OllamaChatOptions } from "../types";
import { LlmLogger } from "../agent/llmLogger";
import { BaseHttpLlmClient, HttpRequestSpec } from "./baseClient";

/**
 * Client for a local Ollama server (e.g. deepseek-coder-v2, deepseek-r1, llama3, etc.).
 * Ollama exposes an Ollama-flavored /api/chat endpoint (distinct from the OpenAI-compatible
 * /v1/chat/completions endpoint newer Ollama versions also expose — this client uses the
 * native one since it's been available the longest across Ollama versions).
 */
export class OllamaClient extends BaseHttpLlmClient {
  private model: string;
  private baseUrl: string;
  private temperature: number;

  constructor(options: OllamaChatOptions, logger?: LlmLogger) {
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    super(options.model, baseUrl, logger);
    this.model = options.model;
    this.baseUrl = baseUrl;
    this.temperature = options.temperature ?? 0.1;
  }

  protected buildRequest(messages: ChatMessage[]): HttpRequestSpec {
    return {
      url: `${this.baseUrl}/api/chat`,
      headers: { "Content-Type": "application/json" },
      body: {
        model: this.model,
        messages,
        stream: false,
        options: { temperature: this.temperature },
      },
    };
  }

  protected parseResponse(data: any): string {
    const content = data?.message?.content;
    if (typeof content !== "string") {
      throw new Error("missing message.content");
    }
    return content;
  }
}
