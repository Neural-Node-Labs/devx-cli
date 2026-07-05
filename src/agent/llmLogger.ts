import fs from "fs";
import path from "path";

/**
 * Writes every LLM request/response pair to a log file (default: llm.log in cwd)
 * as newline-delimited JSON, so a full session can be replayed/audited later.
 */
export class LlmLogger {
  private filePath: string;

  constructor(logDir: string, fileName = "llm.log") {
    this.filePath = path.resolve(logDir, fileName);
  }

  logExchange(entry: {
    iteration: number;
    model: string;
    baseUrl: string;
    request: unknown;
    response: string;
    latencyMs: number;
    error?: string;
  }): void {
    const record = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    try {
      fs.appendFileSync(this.filePath, JSON.stringify(record) + "\n", "utf-8");
    } catch (err: any) {
      // Logging must never crash the agent loop.
      console.error(`devx: failed to write to ${this.filePath}: ${err.message}`);
    }
  }

  getPath(): string {
    return this.filePath;
  }
}
