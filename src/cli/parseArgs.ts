
/**
 * @file src/cli/parseArgs.ts
 * @version 0.3.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";

export type CommandName =
  | "design"
  | "implement"
  | "fix"
  | "refactor"
  | "test"
  | "chat"
  | "continue"
  | "index"
  | "ssh"
  | "copy"
  | "doc"
  | "predeploy"
  | "hash"
  | "hash32";

export interface ParsedCli {
  command: CommandName;
  /** Resolved content for each flag: either file contents (if the value was a real path) or the raw literal string. */
  values: Record<string, string>;
  /** Raw (unresolved) values as given on the command line. */
  rawValues: Record<string, string>;
}

const KNOWN_COMMANDS: CommandName[] = [
  "design",
  "implement",
  "fix",
  "refactor",
  "test",
  "chat",
  "continue",
  "index",
  "ssh",
  "copy",
  "doc",
  "predeploy",
  "hash",
  "hash32"
];

/**
 * Flags that must NEVER be auto-resolved to file content, even if a file happens to
 * exist at that path — they're connection details or a source path meant to be used
 * as-is (e.g. -copy holds the path to upload, not something to read and inline).
 * -secret is raw-only for the same reason -password is: it must never be silently
 * swapped out for the contents of some unrelated same-named file on disk.
 */
const RAW_ONLY_FLAGS = new Set(["target", "user", "password", "copy", "remote", "doc", "secret"]);

/**
 * Resolves a CLI value: if it points to an existing file, read and return the file's
 * content; otherwise treat it as a literal inline description.
 */
function resolveValue(value: string): string {
  const asPath = path.resolve(process.cwd(), value);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
    return fs.readFileSync(asPath, "utf-8");
  }
  return value;
}

/**
 * Parses argv into { command, values }. Supports the devx flag style:
 *   devx -design requirement.md -architecture arch.md
 *   devx -implement design.md -component all
 *   devx -fix "issue detail text"
 *   devx -refactor "refactor detail text"
 *   devx -test "detail" -component compo1
 *   devx -ssh -task "deploy the docker workspace" -target host1,host2 -user root -password secret
 *   devx -copy build/ -target host1,host2 -user root -password secret -remote ~/app
 *   devx -hash 32 -secret "my-api-key"
 *
 * Every flag is single-dash. The first flag name is also used to pick the subcommand.
 */
export function parseArgs(argv: string[]): ParsedCli {
  const args = argv.slice(2);
  if (args.length === 0) {
    throw new Error("No arguments provided. Run 'devx --help' for usage.");
  }

  const rawValues: Record<string, string> = {};
  let currentFlag: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentFlag) {
      rawValues[currentFlag] = buffer.join(" ").trim();
    }
    buffer = [];
  };

  for (const token of args) {
    if (token.startsWith("-")) {
      flush();
      currentFlag = token.replace(/^-+/, "").toLowerCase();
    } else {
      if (!currentFlag) {
        throw new Error(`Unexpected argument "${token}" before any flag.`);
      }
      buffer.push(token);
    }
  }
  flush();

  const firstFlag = Object.keys(rawValues)[0] as CommandName | undefined;
  if (!firstFlag || !KNOWN_COMMANDS.includes(firstFlag)) {
    throw new Error(
      `Unrecognized command "-${firstFlag ?? ""}". Expected one of: ${KNOWN_COMMANDS.map((c) => "-" + c).join(", ")}`
    );
  }

  const values: Record<string, string> = {};
  for (const [flag, val] of Object.entries(rawValues)) {
    values[flag] = val && !RAW_ONLY_FLAGS.has(flag) ? resolveValue(val) : val;
  }

  return { command: firstFlag, values, rawValues };
}

