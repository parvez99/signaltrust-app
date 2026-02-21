import { OpenAIWorkerAdapter } from "../infra/openai-worker-adapter"
import { PROMPT_EXTRACT_VERSION, PROFILE_SCHEMA_VERSION } from "../core/versioning/versions"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const body = await req.json()

    if (!isRecord(body)) {
      return new Response("Invalid JSON body", { status: 400 })
    }

    const resumeText = body.resumeText
    if (typeof resumeText !== "string" || !resumeText.trim()) {
      return new Response("Missing resumeText", { status: 400 })
    }

    const llm = new OpenAIWorkerAdapter({ apiKey: env.OPENAI_API_KEY })

    const out = await llm.extractProfile({
      resumeText,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      promptVersion: PROMPT_EXTRACT_VERSION,
      extractor: "pdf-text",
    })

    return Response.json({
      extractionConfidence: out.normalizedProfile.meta.extractionConfidence,
      profile: out.normalizedProfile,
      modelUsed: out.modelUsed,
      usage: out.usage,
      latencyMs: out.latencyMs,
    })
  },
}
