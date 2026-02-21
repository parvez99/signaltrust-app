export interface Env {
    OPENAI_API_KEY: string
  }

  import type {
    LLMAdapter,
    ExtractProfileInput,
    ExtractProfileOutput,
    LLMModel,
  } from "../core/llm/adapter"
  
  import { normalizedProfileSchema } from "../core/llm/schemas/normalizedProfileSchema"
  import { buildExtractProfileSystemPrompt, buildExtractProfileUserPrompt } from "../core/llm/prompts/extractProfile"
  import { postProcessProfile } from "../core/llm/postprocess"
  import type { NormalizedProfile } from "../core/domain/profile"
  
  type OpenAIResponsesUsage = {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
  
  export class OpenAIWorkerAdapter implements LLMAdapter {
    private apiKey: string
    private baseUrl: string
  
    constructor(opts: { apiKey: string; baseUrl?: string }) {
      this.apiKey = opts.apiKey
      this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1"
    }
  
    async extractProfile(input: ExtractProfileInput): Promise<ExtractProfileOutput> {
      const model: LLMModel = "gpt-4o-mini"
      const started = Date.now()
  
      const system = buildExtractProfileSystemPrompt()
      const user = buildExtractProfileUserPrompt(input.resumeText, input.promptVersion, input.extractor)
  
      const payload = {
        model,
        // Keep this deterministic
        temperature: 0,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Strict schema output
        response_format: {
          type: "json_schema",
          json_schema: normalizedProfileSchema,
        },
      }
  
      // Retry strategy:
      // 1) Normal attempt
      // 2) If invalid/empty parse: retry once with an additional instruction
      const first = await this.callResponses(payload)
      let parsed = this.extractParsedJson(first) as NormalizedProfile | null
  
      if (!parsed) {
        const retryPayload = {
          ...payload,
          input: [
            { role: "system", content: system },
            {
              role: "user",
              content:
                user +
                "\n\nIMPORTANT: Your last output was invalid or did not match schema. Return ONLY valid JSON matching the schema.",
            },
          ],
        }
        const second = await this.callResponses(retryPayload)
        parsed = this.extractParsedJson(second) as NormalizedProfile | null
  
        if (!parsed) {
          // Hard fail: surface a clean error (caller decides fallback)
          throw new Error("LLM_EXTRACT_PROFILE_FAILED_SCHEMA")
        }
  
        const profile = postProcessProfile(this.patchMeta(parsed, model, input.promptVersion, input.extractor))
        return {
          normalizedProfile: profile,
          modelUsed: model,
          usage: this.mapUsage(second.usage),
          latencyMs: Date.now() - started,
        }
      }
  
      const profile = postProcessProfile(this.patchMeta(parsed, model, input.promptVersion, input.extractor))
      return {
        normalizedProfile: profile,
        modelUsed: model,
        usage: this.mapUsage(first.usage),
        latencyMs: Date.now() - started,
      }
    }
  
    // Stub other interface methods for now (we’ll implement in later steps)
    async generateReport(): Promise<any> {
      throw new Error("NOT_IMPLEMENTED")
    }
    async proposeSignals(): Promise<any> {
      throw new Error("NOT_IMPLEMENTED")
    }
    async escalateReview(): Promise<any> {
      throw new Error("NOT_IMPLEMENTED")
    }
  
    private async callResponses(body: unknown): Promise<any> {
      const res = await fetch(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
  
      const text = await res.text()
  
      if (!res.ok) {
        // Helpful for debugging. Don’t log PII in production logs.
        throw new Error(`OPENAI_ERROR_${res.status}: ${text.slice(0, 400)}`)
      }
  
      try {
        return JSON.parse(text)
      } catch {
        throw new Error("OPENAI_NON_JSON_RESPONSE")
      }
    }
  
    /**
     * Tries to retrieve parsed JSON from Responses API result.
     * Depending on SDK/shape, `output_parsed` may exist; otherwise look for JSON in output content.
     */
    private extractParsedJson(resp: any): unknown | null {
      // Common case: parsed output is provided
      if (resp?.output_parsed) return resp.output_parsed
  
      // Fallback: walk output items and find text that looks like JSON
      const items = resp?.output
      if (!Array.isArray(items)) return null
  
      for (const item of items) {
        const content = item?.content
        if (!Array.isArray(content)) continue
        for (const c of content) {
          const txt = c?.text
          if (typeof txt === "string") {
            const trimmed = txt.trim()
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              try {
                return JSON.parse(trimmed)
              } catch {
                // ignore
              }
            }
          }
        }
      }
      return null
    }
  
    private patchMeta(
      p: NormalizedProfile,
      model: string,
      promptVersion: string,
      extractor: "pdf-text" | "ocr" | "unknown"
    ): NormalizedProfile {
      // Ensure meta exists even if model did something odd (schema should prevent this)
      p.meta = p.meta ?? ({} as any)
      p.meta.source = p.meta.source ?? ({} as any)
  
      p.meta.source.extractor = extractor
      p.meta.source.model = model
      p.meta.source.promptVersion = promptVersion
  
      return p
    }
  
    private mapUsage(u: OpenAIResponsesUsage | undefined) {
      if (!u) return undefined
      return {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        totalTokens: u.total_tokens,
      }
    }
  }
  