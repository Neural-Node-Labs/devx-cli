/**
 * @file src/devxState/historyManager.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";

export type TaskStatus = "completed" | "incomplete" | "error";

export interface TaskHistoryEntry {
  timestamp: string;
  command: string;
  /** Short (truncated) preview of what was asked — metadata for resuming, not a chat transcript. */
  requestPreview: string;
  status: TaskStatus;
  iterations: number;
  /** The agent's own summary / final answer / stop reason. */
  summary: string;
}

import { CLI_COMMAND_NAME } from "../generated/brand";

const DEVX_DIR = `.${CLI_COMMAND_NAME}`;
const HISTORY_FILE = "history.md";
const META_REGEX = /<!--devx:meta\n([\s\S]*?)\n-->/g;

const MAX_PREVIEW_CHARS = 160;
const MAX_SUMMARY_CHARS = 600;

export function getHistoryPath(cwd: string): string {
  return path.join(cwd, DEVX_DIR, HISTORY_FILE);
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

/**
 * Appends a task summary/status entry to .devx/history.md. Deliberately does NOT store
 * full chat transcripts or full task prompts — only short previews and the agent's own
 * final summary, so history.md stays a readable task log rather than a conversation dump.
 */
export function appendHistoryEntry(cwd: string, entry: Omit<TaskHistoryEntry, "timestamp">): void {
  const timestamp = new Date().toISOString();
  const full: TaskHistoryEntry = { timestamp, ...entry };
  const preview = truncate(full.requestPreview, MAX_PREVIEW_CHARS);
  const summary = truncate(full.summary, MAX_SUMMARY_CHARS);

  const statusLabel =
    full.status === "completed" ? "COMPLETED" : full.status === "error" ? "ERROR" : "INCOMPLETE";

  const meta = JSON.stringify({
    timestamp,
    command: full.command,
    status: full.status,
    iterations: full.iterations,
    requestPreview: preview,
    summary,
  });

  const block =
    `## Task — ${timestamp}\n` +
    `- Command: \`${full.command}\`\n` +
    `- Status: **${statusLabel}**\n` +
    `- Iterations used: ${full.iterations}\n\n` +
    `**Request:** ${preview}\n\n` +
    `**Summary:** ${summary}\n\n` +
    `<!--devx:meta\n${meta}\n-->\n\n---\n\n`;

  const devxDir = path.join(cwd, DEVX_DIR);
  fs.mkdirSync(devxDir, { recursive: true });
  const historyPath = getHistoryPath(cwd);

  if (!fs.existsSync(historyPath)) {
    fs.writeFileSync(historyPath, `# devx task history\n\n`, "utf-8");
  }
  fs.appendFileSync(historyPath, block, "utf-8");
}

/** Reads and parses all structured entries from history.md, oldest first. */
export function readHistoryEntries(cwd: string): TaskHistoryEntry[] {
  const historyPath = getHistoryPath(cwd);
  if (!fs.existsSync(historyPath)) return [];

  const content = fs.readFileSync(historyPath, "utf-8");
  const entries: TaskHistoryEntry[] = [];
  let match: RegExpExecArray | null;
  META_REGEX.lastIndex = 0;
  while ((match = META_REGEX.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      entries.push({
        timestamp: parsed.timestamp,
        command: parsed.command,
        requestPreview: parsed.requestPreview,
        status: parsed.status,
        iterations: parsed.iterations,
        summary: parsed.summary,
      });
    } catch {
      // skip malformed entries rather than failing the whole read
    }
  }
  return entries;
}

/** Returns the most recent entry whose status is not "completed", or null if none / no history. */
export function getLastUnfinishedTask(cwd: string): TaskHistoryEntry | null {
  const entries = readHistoryEntries(cwd);
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].status !== "completed") return entries[i];
    break; // most recent entry is completed -> nothing pending to continue
  }
  return null;
}
