import { ParsedCli } from "../cli/parseArgs";

/**
 * devx -chat [instruction]
 * A flexible entry point: the instruction may be a question, a request to explore the
 * codebase, or an actionable task. The agent decides whether it needs to use tools at all.
 */
export function buildChatTask(parsed: ParsedCli): string {
  const instruction = parsed.values["chat"];

  return `You are having a conversational/task session with the user inside their project.

USER MESSAGE:
${instruction || "(no message provided)"}

INSTRUCTIONS:
1. If this is just a question you can answer from general knowledge, answer it directly as your
   Final Answer without necessarily using any tools.
2. If it references the codebase ("what does X do", "where is Y", "why does Z happen"), use
   index_lookup_tool / glob_tool / grep_tool / read_tool to investigate before answering, so your
   answer is grounded in what's actually in the project rather than assumed.
3. If it's an actionable request (fix something, add something, refactor something), treat it like
   any other devx task: search, make the change with write_tool, and validate with run_command
   before declaring it done.
4. Give a Final Answer that directly addresses the user's message. If you took actions, briefly
   summarize what you did and how it was validated.`;
}
