/**
 * @file src/commands/predeploy.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -predeploy [instruction]
 * Ensures the workspace has everything it needs to run locally and/or in Docker:
 * Dockerfile, .dockerignore, docker-compose.yml, env templates, start scripts, etc.
 * The instruction is optional context (e.g. "just Docker, no compose" or "prepare for
 * a single VPS deployment") — if omitted, the agent covers both local and Docker readiness.
 */
export function buildPredeployTask(parsed: ParsedCli): string {
  const instruction = parsed.values["predeploy"];

  return `You are making the CURRENT WORKSPACE fully ready to deploy — locally and/or via Docker —
by creating or fixing whatever files are actually missing or broken for that purpose.

INSTRUCTION / CONTEXT FROM USER:
${instruction || "(none given — cover both local run readiness and Docker readiness by default)"}

INSTRUCTIONS:
1. Explore the workspace first (index_lookup_tool/glob_tool/grep_tool/read_tool) to determine:
   - Language/runtime + version (check .nvmrc, package.json "engines", pyproject.toml, go.mod, etc.)
   - Package manager and how dependencies are installed
   - Entry point(s) and how the app is actually started today (check package.json scripts, Makefile, etc.)
   - Ports the app listens on, and any health-check endpoint it already exposes
   - Required environment variables / config (check existing .env, .env.example, config-loading code)
   - Any existing Dockerfile, docker-compose.yml, .dockerignore, Procfile, or CI/deploy config, and
     whether it's actually correct and up to date with the current code (don't assume it's fine — check).
   - Whether this is a single-service app or has multiple services (API + DB + cache, etc.) implying
     docker-compose.yml is warranted rather than a single Dockerfile.
2. Create or fix whatever is missing or incorrect, using write_tool ("edit" for existing files that are
   close but wrong, "overwrite" for new files or files that need a full rewrite):
   - Dockerfile — correct base image for the actual runtime/version found, installs dependencies, copies
     source, exposes the actual port(s), and runs the actual start command (multi-stage build if it
     meaningfully reduces image size for a compiled/bundled language).
   - .dockerignore — excludes node_modules/.git/build artifacts/env files/etc. as appropriate.
   - docker-compose.yml — only if there's real evidence of multiple services needed (DB, cache, etc.) or
     the user's instruction asks for it; wire up service dependencies, volumes, and env vars correctly.
   - .env.example — one line per environment variable the code actually reads, with a safe placeholder
     value (never a real secret), so a new developer knows what to set locally or in Docker.
   - Any missing local-run convenience: e.g. a package.json script to run/build if one is genuinely
     missing and would help, but don't restructure scripts that already work.
3. VALIDATE what you produced actually works — don't just write files and assume:
   - If Docker is available (check with run_command, e.g. "docker --version"), try building the image
     ("docker build -t <name> .") and, if that succeeds, briefly run the container and check it starts
     without crashing (and hits its health endpoint if one exists), then clean up (stop/remove it).
   - If Docker isn't available in this environment, validate what you can locally instead (install deps,
     run the build, run the start command briefly, check it doesn't immediately crash) and say clearly
     in your Final Answer that the Docker build itself was NOT validated here.
   - Fix anything that fails validation before declaring done.
4. Give a Final Answer listing exactly which files were created/modified, what you validated and how,
   and anything you could not verify (e.g. no Docker daemon available, a required external service like a
   real database wasn't reachable in this environment) so the user knows what still needs a manual check.`;
}
