import "server-only";
import OpenAI from "openai";

let openAIClient: OpenAI | null = null;

export function hasOpenAIApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAIClient(): OpenAI {
  if (typeof window !== "undefined") {
    throw new Error("OpenAI client should never run on the client");
  }

  if (openAIClient) {
    return openAIClient;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}

export function getDefaultSynthesisModel(): string {
  return (
    process.env.OPENAI_MODEL ||
    process.env.SYNTHESIS_MODEL ||
    "gpt-4.1-mini"
  );
}
