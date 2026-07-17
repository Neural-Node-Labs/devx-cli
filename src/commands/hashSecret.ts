
/**
 * @file src/commands/hashSecret.ts
 * @version 0.1.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ParsedCli } from "../cli/parseArgs";
import { CLI_COMMAND_NAME } from "../generated/brand";

export type HashBits = 32 | 64;

export interface HashResult {
  bits: HashBits;
  /** Hex-encoded, keyed hash — truncated to `bits` bits (bits/4 hex chars). */
  hash: string;
  keyPath: string;
}

const DEVX_DIR = `.${CLI_COMMAND_NAME}`;
const KEY_FILE = "hash.key";
const VALID_BITS: HashBits[] = [32, 64];

/**
 * Returns the workspace's local HMAC key (32 random bytes, hex-encoded), creating it
 * on first use. This key never leaves the machine and is not written anywhere else —
 * it's what makes the resulting hash "secret": without this file, nobody can reproduce
 * or reverse the hash for a given input, even if they know the input value.
 *
 * .devx/ is already covered by .gitignore, so the key is never committed.
 */
function ensureHashKey(cwd: string): { key: Buffer; keyPath: string } {
  const dir = path.join(cwd, DEVX_DIR);
  const keyPath = path.join(dir, KEY_FILE);

  if (fs.existsSync(keyPath)) {
    const hex = fs.readFileSync(keyPath, "utf-8").trim();
    return { key: Buffer.from(hex, "hex"), keyPath };
  }

  fs.mkdirSync(dir, { recursive: true });
  const key = crypto.randomBytes(32);
  // 0o600: readable/writable by the owner only — this is key material.
  fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
  return { key, keyPath };
}

/**
 * devx -hash [32|64] -secret [value]
 *
 * A direct utility — no LLM/agent loop involved. Computes a keyed HMAC-SHA256 of
 * -secret using a workspace-local key (see ensureHashKey), truncated to the requested
 * bit width. Use this to reference or compare a sensitive value (an API key, a
 * password, a token) without ever printing or storing the value itself — two runs
 * with the same secret in the same workspace produce the same hash; the same secret
 * hashed elsewhere (no key file) produces a different, unrelated hash.
 */
export function runHashCommand(parsed: ParsedCli, cwd: string): HashResult {
  const bitsRaw = parsed.values["hash"];
  const secret = parsed.values["secret"];

  if (!bitsRaw) {
    throw new Error(`Missing -hash value: specify the hash width, one of ${VALID_BITS.join(" or ")}.`);
  }
  const bits = Number(bitsRaw) as HashBits;
  if (!VALID_BITS.includes(bits)) {
    throw new Error(`Invalid -hash value "${bitsRaw}": expected one of ${VALID_BITS.join(" or ")}.`);
  }
  if (!secret) {
    throw new Error("Missing -secret: provide the value to hash (e.g. -secret \"my-api-key\").");
  }

  const { key, keyPath } = ensureHashKey(cwd);
  const digestHex = crypto.createHmac("sha256", key).update(secret, "utf-8").digest("hex");
  const hexChars = bits / 4; // 4 bits per hex character
  const hash = digestHex.slice(0, hexChars);

  return { bits, hash, keyPath };
}
