/**
 * @file src/index/indexManager.ts
 * @version 0.6.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import { walkFiles, getIgnoreFilesPresent } from "../utils/fileWalker";
import { LlmClient } from "../llm/types";

export interface IndexedFile {
  filename: string;
  path: string; // relative to project root, forward-slash normalized
  summary: string; // what's in the file
  purpose: string; // why it exists / its role in the project
  /** Basename of the dump part file holding this file's full content (e.g. "index.2.dump"). Absent if dumping was disabled. */
  dumpPart?: string;
  /** Line count of this file's content as written to the dump. Absent if dumping was disabled. */
  dumpLineCount?: number;
}

export interface WorkspaceIndex {
  generatedAt: string;
  root: string;
  fileCount: number;
  files: IndexedFile[];
  /** Dump part basenames in write order, e.g. ["index.1.dump", "index.2.dump"]. Absent if dumping was disabled. */
  dumpParts?: string[];
  /** The DEVX_DUMP_MAX_BYTES cap in effect when dumpParts was built, kept for reference/debugging. */
  dumpMaxBytesPerPart?: number;
  /** Which ignore files (.gitignore / .dockerignore / .<cmd>ignore) were found at the root and respected. */
  ignoreFilesUsed?: string[];
  /** Number of files/directories pruned from the walk by DEFAULT_IGNORE or an ignore-file rule. */
  ignoredCount?: number;
}

import { CLI_COMMAND_NAME } from "../generated/brand";

const INCLUDE_SUMMARY = false; // Set to false to skip LLM summarization and only store filename/path in the index.

const DEVX_DIR = `.${CLI_COMMAND_NAME}`;
const INDEX_FILE = "index.json";
// Legacy pre-split dump filename, and legacy separate-manifest filename — no longer written,
// but still read/cleaned up for backward compatibility with a .devx dir built by an older
// version of this tool.
const LEGACY_DUMP_FILE = "index.dump";
const LEGACY_MANIFEST_FILE = "index.dump.manifest.json";
const DUMP_PART_RE = /^index\.\d+\.dump$/;

// Default cap on each dump part file's size. Overridable per-run via the
// DEVX_DUMP_MAX_BYTES env var (in bytes) — lower it if a single dump file is too
// large for the LLM/tooling to handle comfortably, raise it to produce fewer parts.
const DEFAULT_MAX_DUMP_BYTES = .5 * 1024 * 1024; // 500 kB

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

export function getDevxDir(cwd: string): string {
  return path.join(cwd, DEVX_DIR);
}

/** Legacy single-file dump path. Only used as a read-time fallback; buildIndex no longer writes here. */
export function getDumpPath(cwd: string): string {
  return path.join(cwd, DEVX_DIR, LEGACY_DUMP_FILE);
}

export function getDumpPartPath(cwd: string, partNumber: number): string {
  return path.join(cwd, DEVX_DIR, `index.${partNumber}.dump`);
}

/** Resolves the configured max size (bytes) for a single dump part, from DEVX_DUMP_MAX_BYTES or the default. */
export function getMaxDumpBytesPerPart(): number {
  const raw = process.env.DEVX_DUMP_MAX_BYTES;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_DUMP_BYTES;
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

// Removes dump artifacts from a previous run (legacy single file, numbered parts, and the
// now-retired separate manifest file) before writing a fresh set — otherwise a re-index that
// produces fewer parts would leave stale, unreferenced part files behind.
function clearOldDumpArtifacts(cwd: string): void {
  const devxDir = getDevxDir(cwd);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(devxDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === LEGACY_DUMP_FILE || name === LEGACY_MANIFEST_FILE || DUMP_PART_RE.test(name)) {
      try {
        fs.unlinkSync(path.join(devxDir, name));
      } catch {
        // best-effort cleanup; a failure here shouldn't abort the index build
      }
    }
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
  /** When true, also write the raw content of every indexed file to `.${cli}/index.*.dump`. */
  dumpContent?: boolean;
  /** Overrides DEVX_DUMP_MAX_BYTES for this run (mainly useful for tests). */
  maxDumpBytesPerPart?: number;
}

/**
 * Incrementally appends dump entries across size-capped part files, rolling over to a new
 * part whenever the next entry would push the current one past maxBytesPerPart. A single
 * file's content is never split across two parts — if one file's own content already
 * exceeds the cap, it simply becomes the sole (oversized) occupant of its part.
 */
class DumpWriter {
  private partNumber = 1;
  private currentPartBytes = 0;
  private currentPartStarted = false;
  private readonly partsUsed: string[] = [];

  constructor(private readonly cwd: string, private readonly maxBytesPerPart: number) {}

  private currentPartPath(): string {
    return getDumpPartPath(this.cwd, this.partNumber);
  }

  private ensureCurrentPartFile(): string {
    const partPath = this.currentPartPath();
    const baseName = path.basename(partPath);
    if (!this.partsUsed.includes(baseName)) {
      fs.writeFileSync(partPath, "", "utf-8");
      this.partsUsed.push(baseName);
    }
    return partPath;
  }

  /** Appends one file's dump entry (header + body), rolling over to a new part if needed. Returns the part's basename. */
  append(relPath: string, body: string): string {
    const entryText = dumpHeader(relPath) + body;
    const entryBytes = Buffer.byteLength(entryText, "utf-8");

    if (this.currentPartStarted && this.currentPartBytes > 0 && this.currentPartBytes + entryBytes > this.maxBytesPerPart) {
      this.partNumber++;
      this.currentPartBytes = 0;
      this.currentPartStarted = false;
    }

    const partPath = this.ensureCurrentPartFile();
    this.currentPartStarted = true;
    fs.appendFileSync(partPath, entryText, "utf-8");
    this.currentPartBytes += entryBytes;

    return path.basename(partPath);
  }

  parts(): string[] {
    return [...this.partsUsed];
  }
}

export async function buildIndex(
  cwd: string,
  llm: LlmClient,
  options: BuildIndexOptions = {}
): Promise<WorkspaceIndex> {
  const maxFiles = options.maxFiles ?? MAX_FILES_DEFAULT;

  const ignoreFilesUsed = getIgnoreFilesPresent(cwd);
  let ignoredCount = 0;
  const allFiles = walkFiles(cwd, { onIgnored: () => { ignoredCount++; } })
    .map((f) => path.relative(cwd, f))
    .filter((relPath) => !SKIP_EXTENSIONS.has(path.extname(relPath).toLowerCase()))
    .slice(0, maxFiles);

  const files: IndexedFile[] = [];

  const dumpContent = options.dumpContent ?? true;
  const maxDumpBytesPerPart = options.maxDumpBytesPerPart ?? getMaxDumpBytesPerPart();
  const devxDir = getDevxDir(cwd);
  let dumpWriter: DumpWriter | null = null;

  if (dumpContent) {
    fs.mkdirSync(devxDir, { recursive: true });
    // Clear any dump artifacts from a previous run before writing fresh ones, so a re-index
    // that produces fewer parts doesn't leave stale, unreferenced part files behind.
    clearOldDumpArtifacts(cwd);
    dumpWriter = new DumpWriter(cwd, maxDumpBytesPerPart);
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
      const entry: IndexedFile = {
        filename: path.basename(relPath),
        path: relPath,
        summary: "(binary or unreadable file)",
        purpose: "Unknown — content could not be read as text.",
      };
      if (dumpWriter) {
        entry.dumpPart = dumpWriter.append(relPath, "(binary or unreadable file — content omitted)\n");
        entry.dumpLineCount = 0;
      }
      files.push(entry);
      continue;
    }

    let dumpPart: string | undefined;
    let dumpLineCount: number | undefined;
    if (dumpWriter) {
      const body = content + (content.endsWith("\n") ? "" : "\n");
      dumpPart = dumpWriter.append(relPath, body);
      dumpLineCount = content ? content.split("\n").length : 0;
    }

    if (INCLUDE_SUMMARY) {
        const { summary, purpose } = await summarizeFile(llm, relPath, content);
        files.push({ filename: path.basename(relPath), path: relPath, summary, purpose, dumpPart, dumpLineCount });
        } else {
        const { summary, purpose } = heuristicSummary(relPath, content);
        files.push({ filename: path.basename(relPath), path: relPath, summary, purpose, dumpPart, dumpLineCount });
    }
  }

  const index: WorkspaceIndex = {
    generatedAt: new Date().toISOString(),
    root: cwd,
    fileCount: files.length,
    files,
    dumpParts: dumpWriter ? dumpWriter.parts() : undefined,
    dumpMaxBytesPerPart: dumpWriter ? maxDumpBytesPerPart : undefined,
    ignoreFilesUsed: ignoreFilesUsed.length ? ignoreFilesUsed : undefined,
    ignoredCount: ignoredCount || undefined,
  };

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

