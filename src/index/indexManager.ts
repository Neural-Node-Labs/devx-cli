/**
 * @file src/index/indexManager.ts
 * @version 0.3.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { walkFiles } from "../utils/fileWalker";
import { LlmClient } from "../llm/types";

export interface IndexedFile {
  filename: string;
  path: string; // relative to project root, forward-slash normalized
  summary: string; // what's in the file
  purpose: string; // why it exists / its role in the project
}

export interface WorkspaceIndex {
  generatedAt: string;
  root: string;
  fileCount: number;
  files: IndexedFile[];
}

import { CLI_COMMAND_NAME } from "../generated/brand";

const INCLUDE_SUMMARY = false; // Set to false to skip LLM summarization and only store filename/path in the index.

const DEVX_DIR = `.${CLI_COMMAND_NAME}`;
const INDEX_FILE = "index.json";
const DUMP_FILE = "index.dump";

// Separator written before each file's content in the dump file.
function dumpHeader(relPath: string): string {
  return `\n${"=".repeat(80)}\nFILE: ${relPath}\n${"=".repeat(80)}\n`;
}

// Skip binary/asset extensions — not worth summarizing, and risk garbling the LLM prompt.
const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".tar", ".gz", ".7z",
  ".lock", ".map",
  ".mp3", ".mp4", ".mov", ".avi",
  ".pdf",".env", ".log", ".db", ".sqlite", ".bin",
]);

const MAX_FILES_DEFAULT = 300;
const MAX_CONTENT_CHARS = 3000;

export function getIndexPath(cwd: string): string {
  return path.join(cwd, DEVX_DIR, INDEX_FILE);
}

export function getDumpPath(cwd: string): string {
  return path.join(cwd, DEVX_DIR, DUMP_FILE);
}

export function loadIndex(cwd: string): WorkspaceIndex | null {
  const indexPath = getIndexPath(cwd);
  if (!fs.existsSync(indexPath)) return null;
  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.files)) return parsed as WorkspaceIndex;
    return null;
  } catch {
    return null;
  }
}

function heuristicSummary(relPath: string, content: string): { summary: string; purpose: string } {
  const firstLines = content.split("\n").slice(0, 5).join(" ").trim().slice(0, 200);
  const ext = path.extname(relPath);
  return {
    summary: firstLines || `(empty ${ext || "file"})`,
    purpose: "Purpose not determined (heuristic fallback — LLM summarization unavailable or failed).",
  };
}

async function summarizeFile(
  llm: LlmClient,
  relPath: string,
  content: string
): Promise<{ summary: string; purpose: string }> {
  const truncated =
    content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) + "\n...(truncated)" : content;

  const prompt = `You are indexing a codebase. Given the file path and content below, respond with ONLY a single-line JSON object
of the exact shape {"summary": "...", "purpose": "..."} — no markdown fences, no extra text.
"summary" = a concise (<25 words) description of what is in the file.
"purpose" = a concise (<20 words) description of why this file exists / its role in the project.

FILE PATH: ${relPath}

FILE CONTENT:
${truncated}`;

  try {
    const reply = await llm.chat([{ role: "user", content: prompt }]);
    const jsonStart = reply.indexOf("{");
    const jsonEnd = reply.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("no JSON object found in reply");
    const parsed = JSON.parse(reply.slice(jsonStart, jsonEnd + 1));
    if (typeof parsed.summary === "string" && typeof parsed.purpose === "string") {
      return { summary: parsed.summary, purpose: parsed.purpose };
    }
    throw new Error("malformed summary JSON");
  } catch {
    return heuristicSummary(relPath, content);
  }
}

export interface BuildIndexOptions {
  maxFiles?: number;
  onProgress?: (current: number, total: number, relPath: string) => void;
  /** When true, also write the raw content of every indexed file to `.${cli}/index.dump`. */
  dumpContent?: boolean;
}

export async function buildIndex(
  cwd: string,
  llm: LlmClient,
  options: BuildIndexOptions = {}
): Promise<WorkspaceIndex> {
  const maxFiles = options.maxFiles ?? MAX_FILES_DEFAULT;

  const allFiles = walkFiles(cwd)
    .map((f) => path.relative(cwd, f))
    .filter((relPath) => !SKIP_EXTENSIONS.has(path.extname(relPath).toLowerCase()))
    .slice(0, maxFiles);

  const files: IndexedFile[] = [];

  const dumpContent = options.dumpContent ?? true;
  const dumpPath = getDumpPath(cwd);
  if (dumpContent) {
    // Truncate/create the dump file up front; content is appended per-file below
    // rather than buffered in memory, since indexed repos can be large.
    const devxDir = path.join(cwd, DEVX_DIR);
    fs.mkdirSync(devxDir, { recursive: true });
    fs.writeFileSync(dumpPath, "", "utf-8");
  }

  for (let i = 0; i < allFiles.length; i++) {
    const relPath = allFiles[i].split(path.sep).join("/");
    const fullPath = path.join(cwd, allFiles[i]);
    options.onProgress?.(i + 1, allFiles.length, relPath);

    let content = "";
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch {
      // Unreadable (likely binary) — index it with a minimal placeholder rather than skipping silently.
      files.push({
        filename: path.basename(relPath),
        path: relPath,
        summary: "(binary or unreadable file)",
        purpose: "Unknown — content could not be read as text.",
      });
      if (dumpContent) {
        fs.appendFileSync(dumpPath, dumpHeader(relPath) + "(binary or unreadable file — content omitted)\n", "utf-8");
      }
      continue;
    }

    if (dumpContent) {
      fs.appendFileSync(dumpPath, dumpHeader(relPath) + content + (content.endsWith("\n") ? "" : "\n"), "utf-8");
    }

    if (INCLUDE_SUMMARY) {
        const { summary, purpose } = await summarizeFile(llm, relPath, content);
        files.push({ filename: path.basename(relPath), path: relPath, summary, purpose });
        } else {
        const { summary, purpose } = heuristicSummary(relPath, content);
        files.push({ filename: path.basename(relPath), path: relPath, summary, purpose });
    }
  }

  const index: WorkspaceIndex = {
    generatedAt: new Date().toISOString(),
    root: cwd,
    fileCount: files.length,
    files,
  };

  const devxDir = path.join(cwd, DEVX_DIR);
  fs.mkdirSync(devxDir, { recursive: true });
  fs.writeFileSync(getIndexPath(cwd), JSON.stringify(index, null, 2), "utf-8");

  return index;
}

/** Simple substring search across filename/path/summary/purpose. */
export function searchIndex(index: WorkspaceIndex, query: string, limit = 15): IndexedFile[] {
  const q = query.toLowerCase();
  return index.files
    .filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q) ||
        f.purpose.toLowerCase().includes(q)
    )
    .slice(0, limit);
}