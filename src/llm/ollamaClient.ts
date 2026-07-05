import { ChatMessage, OllamaChatOptions } from "../types";
import { LlmLogger } from "../agent/llmLogger";

/**
 * Minimal client for a local Ollama server running a DeepSeek model
 * (e.g. deepseek-coder-v2, deepseek-r1, deepseek-v2).
 *
 * Ollama exposes an OpenAI-ish /api/chat endpoint:
 *   POST {baseUrl}/api/chat
 *   { model, messages, stream: false, options: { temperature } }
 */
export class OllamaClient {
  private model: string;
  private baseUrl: string;
  private temperature: number;
  private logger?: LlmLogger;
  private iterationCounter = 0;

  constructor(options: OllamaChatOptions, logger?: LlmLogger) {
    this.model = options.model;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.temperature = options.temperature ?? 0.2;
    this.logger = logger;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    this.iterationCounter++;
    const payload = {
      model: this.model,
      messages,
      stream: false,
      options: { temperature: this.temperature },
    };
    const startedAt = Date.now();
    let response = "";
    let errorMsg: string | undefined;

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        errorMsg =
          `Ollama request failed (${res.status} ${res.statusText}). ` +
          `Is 'ollama serve' running and is model "${this.model}" pulled? ${text}`;
      } else {
        const data: any = await res.json();
        const content = data?.message?.content;
        if (typeof content !== "string") {
          response = JSON.stringify(data);
          errorMsg = `Unexpected Ollama response shape: ${JSON.stringify(data).slice(0, 500)}`;
        } else {
          response = content;
        }
      }
    } catch (err: any) {
      errorMsg = err.message;
    }

    this.logger?.logExchange({
      iteration: this.iterationCounter,
      model: this.model,
      baseUrl: this.baseUrl,
      request: payload,
      response,
      latencyMs: Date.now() - startedAt,
      error: errorMsg,
    });

    if (errorMsg) {
      throw new Error(errorMsg);
    }
    return response;
  }
}
