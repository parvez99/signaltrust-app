import type { NormalizedProfile } from "../domain/profile"

export type LLMModel = "gpt-4o-mini" | "gpt-4o" | "gpt-4.1"

export interface LLMUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface ExtractProfileInput {
  resumeText: string
  schemaVersion: "1.0"
  promptVersion: string
  extractor: "pdf-text" | "ocr" | "unknown"
}

export interface ExtractProfileOutput {
  normalizedProfile: NormalizedProfile
  modelUsed: LLMModel
  usage?: LLMUsage
  latencyMs?: number
}

export interface GenerateReportInput {
  normalizedProfile: NormalizedProfile
  trustScore: number
  bucket: "green" | "yellow" | "red"
  deterministicSignals: unknown // replace with your SignalResult[] later
  promptVersion: string
}

export interface GenerateReportOutput {
  reportMarkdown: string
  modelUsed: LLMModel
  usage?: LLMUsage
  latencyMs?: number
}

export interface ProposeSignalsInput {
  normalizedProfile: NormalizedProfile
  deterministicSignals: unknown
  promptVersion: string
}

export interface ProposeSignalsOutput {
  proposals: Array<{
    name: string
    whyItMatters: string
    evidenceHints: string[]
    confidence: number // 0..1
  }>
  modelUsed: LLMModel
  usage?: LLMUsage
  latencyMs?: number
}

export interface EscalationInput {
  normalizedProfile: NormalizedProfile
  deterministicSignals: unknown
  trustScore: number
  bucket: "green" | "yellow" | "red"
  promptVersion: string
}

export interface EscalationOutput {
  severity: "low" | "medium" | "high"
  explanation: string
  recruiterQuestions: string[]
  modelUsed: LLMModel
  usage?: LLMUsage
  latencyMs?: number
}

export interface LLMAdapter {
  extractProfile(input: ExtractProfileInput): Promise<ExtractProfileOutput>
  generateReport(input: GenerateReportInput): Promise<GenerateReportOutput>
  proposeSignals(input: ProposeSignalsInput): Promise<ProposeSignalsOutput>
  escalateReview(input: EscalationInput): Promise<EscalationOutput>
}
