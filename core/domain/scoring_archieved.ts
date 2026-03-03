/* eslint-disable @typescript-eslint/no-explicit-any */

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

// Keep it flexible: your SignalResult is defined in signals_v1.ts,
// but for Workers build simplicity we accept "any" with expected fields.
type SignalLike = {
  status?: string;
  severity_tier?: string;
  confidence?: string;
  deduction?: number;
  hard_trigger?: boolean;
};

function weightForSignal(s: SignalLike): number {
  const tier = String(s?.severity_tier || "C").toUpperCase();
  const conf = String(s?.confidence || "low").toLowerCase();

  const tierW = tier === "A" ? 1.25 : tier === "B" ? 1.0 : 0.7;
  const confW = conf === "high" ? 1.15 : conf === "medium" ? 1.0 : 0.85;

  // hard triggers should matter more even if deduction is small
  const hardW = s?.hard_trigger ? 1.1 : 1.0;

  return tierW * confW * hardW;
}

export function scoreAndBucketV1(signals: SignalLike[] | undefined | null): RiskScoringResult {
  const triggered = (signals || []).filter((s) => s?.status === "triggered");

  let score = 100;
  let hardTriggered = false;

  let tierA = 0,
    tierB = 0,
    tierC = 0;

  for (const s of triggered) {
    const base = Number(s?.deduction || 0);
    if (!base) continue;

    const weight = weightForSignal(s);
    score -= base * weight;

    if (s?.severity_tier === "A") tierA++;
    if (s?.severity_tier === "B") tierB++;
    if (s?.severity_tier === "C") tierC++;

    // Hard trigger rule (MVP): any Tier A high confidence -> red
    if (s?.severity_tier === "A" && s?.hard_trigger && s?.confidence === "high") {
      hardTriggered = true;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let bucket: RiskBucket = "yellow";
  if (hardTriggered) bucket = "red";
  else if (score >= 90) bucket = "green";
  else if (score >= 75) bucket = "yellow";
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