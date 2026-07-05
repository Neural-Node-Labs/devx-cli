/**
 * @file src/llm/openAiCompatibleClient.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ChatMessage } from "../types";
import { LlmLogger } from "../agent/llmLogger";
import { BaseHttpLlmClient, HttpRequestSpec } from "./baseClient";

export interface OpenAiCompatibleOptions {
  /** Base URL up to (not including) "/chat/completions", e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  /** Extra headers some providers want (e.g. OpenRouter's HTTP-Referer/X-Title). */
  extraHeaders?: Record<string, string>;
}

/**
 * Client for any provider exposing an OpenAI-compatible /chat/completions endpoint.
 * This covers DeepSeek, OpenAI (GPT), xAI (Grok), OpenRouter, and Moonshot (Kimi) — all of
 * them accept the same {model, messages, temperature} request shape and return
 * {choices: [{message: {content}}]}, so one client implementation serves all five.
 */
export class OpenAiCompatibleClient extends BaseHttpLlmClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private extraHeaders: Record<string, string>;

  constructor(options: OpenAiCompatibleOptions, logger?: LlmLogger) {
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    super(options.model, baseUrl, logger);
    this.baseUrl = baseUrl;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.temperature = options.temperature ?? 0.2;
    this.extraHeaders = options.extraHeaders ?? {};
  }

  protected buildRequest(messages: ChatMessage[]): HttpRequestSpec {
    return {
      url: `${this.baseUrl}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...this.extraHeaders,
      },
      body: {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: this.temperature,
      },
    };
  }

  protected parseResponse(data: any): string {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("missing choices[0].message.content");
    }
    return content;
  }
}
