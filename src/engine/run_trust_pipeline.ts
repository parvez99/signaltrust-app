import { OpenAIWorkerAdapter } from "../../infra/openai-worker-adapter"
import {
  PROMPT_EXTRACT_VERSION,
  PROFILE_SCHEMA_VERSION,
  ENGINE_VERSION,
} from "../../core/versioning/versions"
import { sha256Hex, normalizeForDocHash } from "../lib/crypto.js"
import { normalizeResumeTextToProfileV1 } from "./normalize_v1.js"
// OLD imports 
// import { runSignalsV1, defaultSignalConfigV1 } from "./signals_v1.js"
//import { scoreAndBucketV1 } from "./scoring_v1.js"

// New imports (02-26-26)
import { runSignalsV1, defaultSignalConfigV1 } from "../../core/domain/signals"
import { scoreAndBucketV1 } from "../../core/domain/scoring"

import { extractGithubUsername } from "../../core/github/extract"
import { enrichGithubPublic } from "../../core/github/enrich"

export async function runTrustPipeline(args: {
  candidateId: string
  sourceText: string
  sourceFilename?: string | null
  trustProfileId?: string | null
  now: string
  env: Env
}) {
  const { candidateId, sourceText, sourceFilename, trustProfileId, now, env } = args

  const llm = new OpenAIWorkerAdapter({ apiKey: env.OPENAI_API_KEY })

  let profileLLMLegacy: any = null
  let llmNormalizedProfile: any = null

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

    // ✅ Keep the real LLM normalized profile for UI (schema-based)
    llmNormalizedProfile = normalized

    // ✅ Also keep a legacy-mapped version (optional; useful for debugging)
    profileLLMLegacy = {
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
  
    profileLLMLegacy = null
    llmNormalizedProfile = null
  }

  // 3️⃣ Run signals on deterministic normalization (best month precision)
  const config = defaultSignalConfigV1()

  const profileForSignals = normalizeResumeTextToProfileV1({
    candidateId,
    sourceText,
    sourceFilename: sourceFilename ?? "",
    now,
  })
    console.log("DEBUG_SOURCE_TEXT_HAS_GITHUB", sourceText.includes("github"));
    console.log("DEBUG_EXTRACTED_GH", extractGithubUsername(sourceText));
    console.log("DEBUG_TRUST_PROFILE_ID", trustProfileId);
    // 3.2️⃣ GitHub public enrichment (best-effort, cached per trust_profile_id)
    try {
      const ghUsername = extractGithubUsername(sourceText)

      // Debug (view in `wrangler tail`)
      console.log("DEBUG_GH_USERNAME", ghUsername)
      console.log("DEBUG_TRUST_PROFILE_ID", trustProfileId)

      if (ghUsername) {
        // If we have a trust profile id, cache in DB
        if (trustProfileId) {
          const cached: any = await env.DB.prepare(
            `SELECT github_login, account_created_at, public_repos, followers,
                    top_languages_json, keyword_hits_json, last_activity_at, activity_score,
                    fetched_at
            FROM trust_github_public_enrichment
            WHERE trust_profile_id = ?1`
          )
            .bind(trustProfileId)
            .first()

          const cacheFreshHours = 24
          const fetchedAt = cached?.fetched_at ? Date.parse(String(cached.fetched_at)) : NaN
          const isFresh = Number.isFinite(fetchedAt)
            ? (Date.now() - fetchedAt) < cacheFreshHours * 60 * 60 * 1000
            : false

          if (cached && isFresh) {
            ;(profileForSignals as any).__github_public = {
              github_login: cached.github_login,
              account_created_at: cached.account_created_at ?? null,
              public_repos: cached.public_repos ?? null,
              followers: cached.followers ?? null,
              top_languages: safeJson(cached.top_languages_json, []),
              keyword_hits: safeJson(cached.keyword_hits_json, {}),
              last_activity_at: cached.last_activity_at ?? null,
              activity_score: Number(cached.activity_score ?? 0),
              claimed_keywords: [],
            }
            console.log("DEBUG_GH_CACHE_HIT", cached.github_login)
          } else {
            console.log("DEBUG_GH_HAS_TOKEN", !!(env as any).GITHUB_PUBLIC_TOKEN);
            console.log("DEBUG_GH_TOKEN_PREFIX", ((env as any).GITHUB_PUBLIC_TOKEN || "").slice(0, 6));
            const { enrichment, raw } = await enrichGithubPublic({
              username: ghUsername,
              token: (env as any).GITHUB_PUBLIC_TOKEN || null,
              resumeText: sourceText,
            })

            ;(profileForSignals as any).__github_public = enrichment

            await env.DB.prepare(
              `INSERT INTO trust_github_public_enrichment
                (trust_profile_id, github_login, account_created_at, public_repos, followers,
                top_languages_json, keyword_hits_json, last_activity_at, activity_score,
                raw_json, fetched_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
              ON CONFLICT(trust_profile_id) DO UPDATE SET
                github_login=excluded.github_login,
                account_created_at=excluded.account_created_at,
                public_repos=excluded.public_repos,
                followers=excluded.followers,
                top_languages_json=excluded.top_languages_json,
                keyword_hits_json=excluded.keyword_hits_json,
                last_activity_at=excluded.last_activity_at,
                activity_score=excluded.activity_score,
                raw_json=excluded.raw_json,
                fetched_at=excluded.fetched_at,
                updated_at=excluded.updated_at`
            )
              .bind(
                trustProfileId,
                enrichment.github_login,
                enrichment.account_created_at,
                enrichment.public_repos,
                enrichment.followers,
                JSON.stringify(enrichment.top_languages || []),
                JSON.stringify(enrichment.keyword_hits || {}),
                enrichment.last_activity_at,
                enrichment.activity_score,
                JSON.stringify(raw),
                now,
                now
              )
              .run()

            console.log("DEBUG_GH_CACHE_WRITE", enrichment.github_login)
          }
        } else {
          // No trust_profile_id (resumeText-only run) → enrich but do not cache
          const { enrichment } = await enrichGithubPublic({
            username: ghUsername,
            token: (env as any).GITHUB_PUBLIC_TOKEN || null,
            resumeText: sourceText,
          })
          ;(profileForSignals as any).__github_public = enrichment
          console.log("DEBUG_GH_NO_CACHE", enrichment.github_login)
        }
      }
    } catch (e) {
      console.log("DEBUG_GH_ERROR", String((e as any)?.message || e))
      // best-effort
    }
    // 3.5️⃣ Enrich deterministic profile with duplicate-upload info (doc_hash)
  try {
    const docHash = await sha256Hex(normalizeForDocHash(sourceText))

    const row: any = await env.DB.prepare(
      `SELECT
         COUNT(*) as c,
         MIN(created_at) as first_seen_at,
         MAX(created_at) as last_seen_at
       FROM trust_candidate_profiles
       WHERE created_by_candidate_id = ?1
         AND doc_hash = ?2`
    ).bind(candidateId, docHash).first()

    const total = Number(row?.c || 0)

    // If this pipeline run happens after ingest insert, the current upload is included in COUNT(*)
    const priorCount = Math.max(0, total - 1)
    const signalCtx = { sourceText, sourceFilename: sourceFilename ?? null } as any;

    signalCtx.__dup_doc = {
      doc_hash: docHash,
      prior_count: priorCount,
      first_seen_at: row?.first_seen_at ?? null,
      last_seen_at: row?.last_seen_at ?? null,
    }
  } catch {
    // Non-fatal: duplicate-upload signal will just show "no doc hash available"
  }

  const triggeredSignals = runSignalsV1(profileForSignals, config, {
    sourceText,
    sourceFilename: sourceFilename ?? null,
  })

  // 4️⃣ Score
  const scoring = scoreAndBucketV1(triggeredSignals)

  // Optional but recommended: use deterministic profile for report rendering
  return {
    engineVersion: ENGINE_VERSION,
    extractionSource,
    extractionError,
    llm: llmMeta,

    // ✅ what UI wants to render (schema-based)
    llmNormalizedProfile,

    // ✅ what signals/scoring actually used
    deterministicProfile: profileForSignals,

    // ✅ (optional) useful for debugging LLM mapping
    llmLegacyProfile: profileLLMLegacy,

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

function safeJson(input: any, fallback: any) {
  try {
    if (input == null) return fallback
    if (typeof input === "object") return input
    const s = String(input)
    if (!s.trim()) return fallback
    return JSON.parse(s)
  } catch {
    return fallback
  }
}