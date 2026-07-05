/**
 * @file src/llm/factory.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { LlmClient } from "./types";
import { LlmLogger } from "../agent/llmLogger";
import { OllamaClient } from "./ollamaClient";
import { OpenAiCompatibleClient } from "./openAiCompatibleClient";
import { ClaudeClient } from "./claudeClient";
import { BRAND_NAME } from "../generated/brand";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export const SUPPORTED_PROVIDERS = ["ollama", "deepseek", "claude", "openai", "grok", "openrouter", "kimi"] as const;
export type LlmProvider = (typeof SUPPORTED_PROVIDERS)[number];

function requireApiKey(providerLabel: string, envVarNames: string[]): string {
  for (const name of envVarNames) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(
    `Missing API key for provider "${providerLabel}". Set one of: ${envVarNames.join(", ")}.`
  );
}

/**
 * Builds the configured LlmClient based on DEVX_PROVIDER (default "ollama") and related
 * env vars. DEVX_MODEL / DEVX_BASE_URL / DEVX_API_KEY are generic overrides that work for
 * any provider; each provider also has its own conventional env var names as fallbacks so
 * existing credentials (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) work without renaming them.
 */
export function createLlmClient(logger?: LlmLogger): LlmClient {
  const providerRaw = (process.env.DEVX_PROVIDER || "ollama").toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(providerRaw as LlmProvider)) {
    throw new Error(
      `Unknown DEVX_PROVIDER "${providerRaw}". Expected one of: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }
  const provider = providerRaw as LlmProvider;
  const modelOverride = process.env.DEVX_MODEL;
  const baseUrlOverride = process.env.DEVX_BASE_URL;
  const apiKeyOverride = process.env.DEVX_API_KEY;

  switch (provider) {


    case "ollama": {
      const baseUrl = baseUrlOverride || process.env.DEVX_OLLAMA_URL || "http://localhost:11434";
      return new OllamaClient({ model: modelOverride || "deepseek-coder-v2", baseUrl }, logger);
    }

    case "deepseek": {

      const apiKey = apiKeyOverride || requireApiKey("deepseek", ["DEEPSEEK_API_KEY", "DEVX_API_KEY"]);
      const baseUrl = baseUrlOverride || "https://api.deepseek.com";
      return new OpenAiCompatibleClient(
        { baseUrl, apiKey, model: modelOverride || "deepseek-chat" },
        logger
      );
    }

    case "openai": {
      const apiKey = apiKeyOverride || requireApiKey("openai", ["OPENAI_API_KEY", "DEVX_API_KEY"]);
      const baseUrl = baseUrlOverride || "https://api.openai.com/v1";
      return new OpenAiCompatibleClient({ baseUrl, apiKey, model: modelOverride || "gpt-4o-mini" }, logger);
    }

    case "grok": {
      const apiKey = apiKeyOverride || requireApiKey("grok", ["XAI_API_KEY", "GROK_API_KEY", "DEVX_API_KEY"]);
      const baseUrl = baseUrlOverride || "https://api.x.ai/v1";
      return new OpenAiCompatibleClient({ baseUrl, apiKey, model: modelOverride || "grok-2-latest" }, logger);
    }

    case "openrouter": {
      const apiKey = apiKeyOverride || requireApiKey("openrouter", ["OPENROUTER_API_KEY", "DEVX_API_KEY"]);
      const baseUrl = baseUrlOverride || "https://openrouter.ai/api/v1";
      return new OpenAiCompatibleClient(
        {
          baseUrl,
          apiKey,
          model: modelOverride || "openrouter/auto",
          extraHeaders: { "X-Title": BRAND_NAME },
        },
        logger
      );
    }

    case "kimi": {
      const apiKey = apiKeyOverride || requireApiKey("kimi", ["MOONSHOT_API_KEY", "KIMI_API_KEY", "DEVX_API_KEY"]);
      const baseUrl = baseUrlOverride || "https://api.moonshot.cn/v1";
      return new OpenAiCompatibleClient({ baseUrl, apiKey, model: modelOverride || "moonshot-v1-8k" }, logger);
    }

    case "claude": {
      const apiKey = apiKeyOverride || requireApiKey("claude", ["ANTHROPIC_API_KEY", "DEVX_API_KEY"]);
      const baseUrl = baseUrlOverride || "https://api.anthropic.com";
      if (!modelOverride) {
        throw new Error(
          'DEVX_MODEL is required for provider "claude" (e.g. DEVX_MODEL=claude-sonnet-4-5) — ' +
            "Anthropic has no single implied default model here."
        );
      }
      return new ClaudeClient({ baseUrl, apiKey, model: modelOverride }, logger);
    }
  }
}
