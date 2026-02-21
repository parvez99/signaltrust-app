import { PROFILE_SCHEMA_VERSION } from "../../versioning/versions"

export function buildExtractProfileSystemPrompt(): string {
  return [
    "You are a resume normalization engine for a hiring integrity product.",
    "Convert resume text into structured JSON that matches the provided schema EXACTLY.",
    "",
    "Rules:",
    "- Do NOT hallucinate. If missing, use null.",
    "- Do NOT guess company names, titles, dates, or degrees.",
    "- If dates are ambiguous, keep them partial (YYYY or YYYY-MM) and set datePrecision accordingly.",
    "- For each role and education entry, set confidence between 0 and 1 based on how clearly it appears in the text.",
    "- extractionConfidence (0..1) should reflect overall parsing reliability.",
    "- parsingWarnings should contain short strings describing ambiguities or missing critical fields.",
    "- Output MUST be valid JSON matching the schema. No extra keys, no commentary."
  ].join("\n")
}

export function buildExtractProfileUserPrompt(resumeText: string, promptVersion: string, extractor: string): string {
  return [
    `Schema version: ${PROFILE_SCHEMA_VERSION}`,
    `Prompt version: ${promptVersion}`,
    `Source extractor: ${extractor}`,
    "",
    "Resume text (verbatim):",
    "-----",
    resumeText,
    "-----",
    "",
    "Return only the JSON object."
  ].join("\n")
}
