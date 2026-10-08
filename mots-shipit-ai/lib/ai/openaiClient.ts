import OpenAI from "openai";

let client: OpenAI | null = null;

// Server only. Returns null when OPENAI_API_KEY isn't configured so callers can fall back.
export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 1 });
  return client;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
