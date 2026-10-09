// Text from outside the system prompt -- a user's estimate question, or a carrier's reply --
// is data, never instructions. sanitizeForLLM() runs before any such text reaches OpenAI.
// The system prompts also say so; this guard stops the obvious attempts before the call.

export type InjectionCheck =
  | { safe: true; text: string }
  | { safe: false; text: string; reasons: string[] };

const PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  {
    reason: "ignore_instructions",
    pattern: /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the)\b[^.\n]{0,20}\b(instructions?|rules|prompts?|directions|guidelines)\b/i,
  },
  { reason: "override_rules", pattern: /\boverride\b[^.\n]{0,25}\b(rules|instructions|safety|system|guardrails?)\b/i },
  {
    reason: "reveal_prompt",
    pattern: /\b(reveal|show|print|display|repeat|output|tell me|what is|what are)\b[^.\n]{0,30}\b(system prompt|your (instructions|prompt|rules)|hidden (instructions|prompt)|initial prompt)\b/i,
  },
  {
    reason: "expose_secrets",
    pattern: /\b(expose|reveal|show|print|list|dump|give me|send me)\b[^.\n]{0,30}\b(env(ironment)?\s*var(iable)?s?|api[\s_-]?keys?|secret keys?|service[\s_-]?role|passwords?|credentials|database contents)\b/i,
  },
  {
    reason: "role_override",
    pattern: /\b(you are now|from now on,? you are|pretend (that )?you are|act as (an?|the) (ai|assistant|system|admin(istrator)?|developer|different|unrestricted|new)\b)/i,
  },
  { reason: "jailbreak", pattern: /\b(jailbreak|DAN mode|developer mode|do anything now)\b/i },
  { reason: "fake_system_turn", pattern: /(<\/?\s*system\s*>|\[\/?INST\]|^\s*(system|assistant)\s*:)/im },
];

// Zero-width and bidirectional-control characters can hide words from a reader and from the
// patterns above ("ig​nore"), so they are removed before checking and before sending.
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeForLLM(input: string): InjectionCheck {
  const text = input.normalize("NFKC").replace(INVISIBLE, "").replace(CONTROL, " ");
  const reasons = PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ reason }) => reason);
  return reasons.length === 0 ? { safe: true, text } : { safe: false, text, reasons };
}
