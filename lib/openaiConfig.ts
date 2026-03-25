export function getConfiguredOpenAIApiKey(): string | undefined {
  const directKey = process.env.OPENAI_API_KEY?.trim();
  if (directKey) return directKey;

  const legacyKey = process.env.IMMUNOLOGYSCOUT_OPENAI_API_KEY?.trim();
  return legacyKey || undefined;
}

export function getDefaultSynthesisModel(): string {
  return process.env.OPENAI_MODEL || process.env.SYNTHESIS_MODEL || "gpt-4.1-mini";
}
