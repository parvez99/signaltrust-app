import { OpenAIWorkerAdapter } from "../../infra/openai-worker-adapter"
import {
  PROMPT_EXTRACT_VERSION,
  PROFILE_SCHEMA_VERSION,
  ENGINE_VERSION,
} from "../../core/versioning/versions"

import { normalizeResumeTextToProfileV1 } from "./normalize_v1.js"
import { runSignalsV1, defaultSignalConfigV1 } from "./signals_v1.js"
import { scoreAndBucketV1 } from "./scoring_v1.js"

export async function runTrustPipeline(args: {
  candidateId: string
  sourceText: string
  sourceFilename?: string | null
  now: string
  env: Env
}) {
  const { candidateId, sourceText, sourceFilename, now, env } = args

  const llm = new OpenAIWorkerAdapter({ apiKey: env.OPENAI_API_KEY })

  let profile: any
  let extractionSource: "llm" | "fallback" = "llm"
  let extractionError: string | null = null
  let llmMeta: any = null

  // 1️⃣ Try LLM extraction
  try {
    const out = await llm.extractProfile({
      resumeText: sourceText,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      promptVersion: PROMPT_EXTRACT_VERSION,
      extractor: "pdf-text",
    })

    const normalized = out.normalizedProfile

    // IMPORTANT:
    // Your signals expect profile.experience, profile.education etc.
    // So we convert LLM normalizedProfile → legacy profile shape.
    profile = {
      candidate_id: candidateId,
      __source_text: sourceText,
      __source_filename: sourceFilename ?? null,

      experience: normalized.roles?.map((r: any) => ({
        company: { raw: r.company },
        title: { raw: r.title },
        start_date: mapDate(r.startDate, r.datePrecision),
        end_date: mapDate(r.endDate, r.datePrecision),
      })) ?? [],

      education: normalized.education?.map((e: any) => ({
        institution: { raw: e.institution },
        degree: { raw: e.degree },
        field: { raw: e.field },
        start_date: mapDate(e.startDate, e.datePrecision),
        end_date: mapDate(e.endDate, e.datePrecision),
      })) ?? [],
    }

    llmMeta = {
      modelUsed: out.modelUsed,
      usage: out.usage,
      latencyMs: out.latencyMs,
      extractionConfidence: normalized.meta?.extractionConfidence,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR"
  
    const retryable =
      msg.includes("OPENAI_ERROR_429") ||
      msg.includes("OPENAI_ERROR_5") ||
      msg === "OPENAI_TIMEOUT"
  
    if (!retryable) {
      // Programming error / schema bug / bad request
      throw err
    }
  
    extractionSource = "fallback"
    extractionError = msg
  
    profile = normalizeResumeTextToProfileV1({
      candidateId,
      sourceText,
      sourceFilename: sourceFilename ?? "",
      now,
    })
  }

  // 3️⃣ Run signals on deterministic normalization (best month precision)
  const config = defaultSignalConfigV1()

  const profileForSignals = normalizeResumeTextToProfileV1({
    candidateId,
    sourceText,
    sourceFilename: sourceFilename ?? "",
    now,
  })

  const triggeredSignals = runSignalsV1(profileForSignals, config, {
    sourceText,
    sourceFilename: sourceFilename ?? null,
  })

  // 4️⃣ Score
  const scoring = scoreAndBucketV1(triggeredSignals)

  // Optional but recommended: use deterministic profile for report rendering
  profile = profileForSignals

  return {
    engineVersion: ENGINE_VERSION,
    extractionSource,
    extractionError,
    llm: llmMeta,
    profile,
    triggeredSignals,
    scoring,
  }
}

/**
 * Convert simple ISO strings into the legacy date shape
 */
function mapDate(iso: string | null, precision: string) {
  if (!iso) return null

  return {
    raw: iso,
    iso,
    precision:
      precision === "year"
        ? "year"
        : precision === "month"
        ? "month"
        : "day",
  }
}
