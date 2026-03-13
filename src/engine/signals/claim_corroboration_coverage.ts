import { makeSignal } from "../signals_v1";

export function signalClaimCorroborationCoverage(profile: any, ctx: any) {

  const text = String(ctx?.sourceText || "");

  // crude claim estimation
  const claimKeywords = text
    .toLowerCase()
    .split(/\W+/)
    .filter(w =>
      [
        "aws",
        "kubernetes",
        "docker",
        "terraform",
        "python",
        "java",
        "react",
        "node",
        "sql",
        "machine",
        "learning"
      ].includes(w)
    );

  const totalClaims = claimKeywords.length;

  const gh = profile?.__github_public || null;
  const keywordHits = gh?.keyword_hits || {};

  let corroborated = 0;

  for (const kw of claimKeywords) {
    if (keywordHits[kw] > 0) corroborated++;
  }

  const coverage = totalClaims > 0
    ? Math.round((corroborated / totalClaims) * 100)
    : 0;

  if (coverage > 50) {
    return makeSignal({
      signal_id: "claim_corroboration_coverage",
      category: "external_evidence",
      severity_tier: "C",
      confidence: "medium",
      deduction: -5,
      hard_trigger: false,
      status: "triggered",
      evidence: {
        total_claims: totalClaims,
        corroborated_claims: corroborated,
        coverage_percent: coverage
      },
      explanation: `External signals support ~${coverage}% of detected resume claims.`,
      suggested_questions: []
    });
  }

  if (coverage < 20 && totalClaims > 3) {
    return makeSignal({
      signal_id: "claim_corroboration_coverage",
      category: "external_evidence",
      severity_tier: "B",
      confidence: "medium",
      deduction: 6,
      hard_trigger: false,
      status: "triggered",
      evidence: {
        total_claims: totalClaims,
        corroborated_claims: corroborated,
        coverage_percent: coverage
      },
      explanation: `Only ~${coverage}% of resume claims could be corroborated by external signals.`,
      suggested_questions: [
        "Which projects best demonstrate your experience with these technologies?"
      ]
    });
  }

  return makeSignal({
    signal_id: "claim_corroboration_coverage",
    category: "external_evidence",
    severity_tier: "C",
    confidence: "low",
    deduction: 0,
    hard_trigger: false,
    status: "not_triggered",
    evidence: {},
    explanation: "Not enough external evidence available to estimate claim corroboration.",
    suggested_questions: []
  });
}