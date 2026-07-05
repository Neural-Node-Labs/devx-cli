/**
 * @file src/llm/types.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ChatMessage } from "../types";

/** Every provider client (Ollama, DeepSeek, Claude, OpenAI, Grok, OpenRouter, Kimi) implements this. */
export interface LlmClient {
  chat(messages: ChatMessage[]): Promise<string>;
}
