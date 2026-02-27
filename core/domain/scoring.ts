// core/domain/scoring.ts
import type { SignalResult } from "./signals";

export type RiskBucket = "green" | "yellow" | "red";

export type RiskScoringSummary = {
  tier_a_count: number;
  tier_b_count: number;
  tier_c_count: number;
};

export type RiskScoringResult = {
  trust_score: number;
  bucket: RiskBucket;
  hard_triggered: boolean;
  summary: RiskScoringSummary;
};

export function scoreAndBucketV1(signals: SignalResult[] | undefined | null): RiskScoringResult {
  const triggered = (signals || []).filter((s) => s.status === "triggered");

  let score = 100;
  let hardTriggered = false;

  let tierA = 0,
    tierB = 0,
    tierC = 0;

  for (const s of triggered) {
    score -= Number(s.deduction || 0);

    if (s.severity_tier === "A") tierA++;
    if (s.severity_tier === "B") tierB++;
    if (s.severity_tier === "C") tierC++;

    // Hard trigger rule (MVP): any Tier A high confidence -> red
    if (s.severity_tier === "A" && s.hard_trigger && s.confidence === "high") {
      hardTriggered = true;
    }
  }

  score = Math.max(0, Math.min(100, score));

  let bucket: RiskBucket = "yellow";
  if (hardTriggered) bucket = "red";
  else if (score >= 80) bucket = "green";
  else if (score >= 60) bucket = "yellow";
  else bucket = "red";

  return {
    trust_score: score,
    bucket,
    hard_triggered: hardTriggered,
    summary: {
      tier_a_count: tierA,
      tier_b_count: tierB,
      tier_c_count: tierC,
    },
  };
}