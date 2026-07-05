/**
 * @file test-suite/chat.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-chat` — devx -chat [instruction or question]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";
import { buildChatTask } from "../src/commands/chat";

test("chat: parses the instruction literally", () => {
  const parsed = parseArgs(["node", "devx", "-chat", "what does the auth module do?"]);
  assert.strictEqual(parsed.command, "chat");
  assert.strictEqual(parsed.values["chat"], "what does the auth module do?");
});

test("chat: task includes the user's message verbatim", () => {
  const task = buildChatTask(parseArgs(["node", "devx", "-chat", "what does the auth module do?"]));
  assert.match(task, /USER MESSAGE:/);
  assert.match(task, /what does the auth module do\?/);
});

test("chat: task allows answering directly OR investigating with tools OR taking action", () => {
  const task = buildChatTask(parseArgs(["node", "devx", "-chat", "hello"]));
  assert.match(task, /answer it directly/i);
  assert.match(task, /index_lookup_tool/);
  assert.match(task, /write_tool/);
  assert.match(task, /run_command/);
});
