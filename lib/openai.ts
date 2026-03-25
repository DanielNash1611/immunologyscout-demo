import "server-only";
import OpenAI from "openai";
import { getConfiguredOpenAIApiKey, getDefaultSynthesisModel } from "./openaiConfig";

let openAIClient: OpenAI | null = null;

export function hasOpenAIApiKey(): boolean {
  return Boolean(getConfiguredOpenAIApiKey());
}

export function getOpenAIClient(): OpenAI {
  if (typeof window !== "undefined") {
    throw new Error("OpenAI client should never run on the client");
  }

  if (openAIClient) {
    return openAIClient;
  }

  const apiKey = getConfiguredOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}
export { getConfiguredOpenAIApiKey, getDefaultSynthesisModel };
