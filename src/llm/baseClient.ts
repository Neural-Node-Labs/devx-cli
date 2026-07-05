/**
 * @file src/llm/baseClient.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ChatMessage } from "../types";
import { LlmClient } from "./types";
import { LlmLogger } from "../agent/llmLogger";

export interface HttpRequestSpec {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Shared plumbing for every HTTP-based LLM provider: builds the request (provider-specific,
 * via buildRequest), sends it, parses the response (provider-specific, via parseResponse),
 * and logs exactly one request/response pair per call regardless of success or failure —
 * mirroring the original Ollama-only client's behavior so llm.log stays consistent across providers.
 */
export abstract class BaseHttpLlmClient implements LlmClient {
  private iterationCounter = 0;

  constructor(
    private readonly modelLabel: string,
    private readonly baseUrlLabel: string,
    protected readonly logger?: LlmLogger
  ) {}

  protected abstract buildRequest(messages: ChatMessage[]): HttpRequestSpec;
  /** Should throw if the response shape is unexpected — the base class turns that into a logged error. */
  protected abstract parseResponse(json: any): string;

  async chat(messages: ChatMessage[]): Promise<string> {
    this.iterationCounter++;
    const { url, headers, body } = this.buildRequest(messages);
    const startedAt = Date.now();

    let response = "";
    let errorMsg: string | undefined;

    try {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        errorMsg = `Request to ${url} failed (${res.status} ${res.statusText}): ${text}`;
      } else {
        const data: any = await res.json();
        try {
          response = this.parseResponse(data);
        } catch (parseErr: any) {
          errorMsg = `Unexpected response shape from ${url}: ${parseErr.message} — raw: ${JSON.stringify(data).slice(0, 500)}`;
        }
      }
    } catch (err: any) {
      errorMsg = err.message;
    }

    this.logger?.logExchange({
      iteration: this.iterationCounter,
      model: this.modelLabel,
      baseUrl: this.baseUrlLabel,
      request: body,
      response,
      latencyMs: Date.now() - startedAt,
      error: errorMsg,
    });

    if (errorMsg) throw new Error(errorMsg);
    return response;
  }
}
