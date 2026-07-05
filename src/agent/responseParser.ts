/**
 * @file src/agent/responseParser.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
import { ParsedAction } from "../types";

/**
 * Parses a model reply following the ReAct protocol defined in promptBuilder.ts.
 * Tolerant of minor formatting drift (extra whitespace, code fences around JSON, etc.),
 * since local models don't follow formats as reliably as hosted frontier models.
 */
export function parseAgentResponse(raw: string): ParsedAction {
  const text = raw.trim();

  const finalMatch = text.match(/Final Answer:\s*([\s\S]*)/i);
  const actionMatch = text.match(/Action:\s*([^\n]+)/i);
  const actionInputMatch = text.match(/Action Input:\s*([\s\S]*)/i);
  const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\n(?:Action|Final Answer):|$)/i);

  const thought = thoughtMatch ? thoughtMatch[1].trim() : undefined;

  if (finalMatch && !actionMatch) {
    return {
      type: "final",
      thought,
      finalAnswer: finalMatch[1].trim(),
      raw: text,
    };
  }

  if (actionMatch) {
    const tool = actionMatch[1].trim().replace(/[`*]/g, "");
    let toolInput: any = {};
    if (actionInputMatch) {
      toolInput = extractJson(actionInputMatch[1]);
    }
    return {
      type: "action",
      thought,
      tool,
      toolInput,
      raw: text,
    };
  }

  // Fallback: couldn't parse the expected format at all.
  return {
    type: "final",
    thought: "Could not parse a structured action from the model's reply.",
    finalAnswer: `(unparsed model output)\n${text}`,
    raw: text,
  };
}

function extractJson(blob: string): any {
  let candidate = blob.trim();
  // Strip markdown code fences if the model added them despite instructions.
  candidate = candidate.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  // Try to isolate the first balanced {...} block in case of trailing text.
  const start = candidate.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < candidate.length; i++) {
      if (candidate[i] === "{") depth++;
      if (candidate[i] === "}") depth--;
      if (depth === 0) {
        candidate = candidate.slice(start, i + 1);
        break;
      }
    }
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return { __parseError: true, raw: blob.trim() };
  }
}
