import { makeSignal } from "../signals_v1";

export function signalEmployerExistence(profile: any) {
  const roles = Array.isArray(profile.experience) ? profile.experience : [];

  const suspicious: string[] = [];

  for (const r of roles) {
    const company = r?.company?.raw || r?.company || "";

    if (!company) continue;

    const clean = String(company).toLowerCase().trim();

    // Simple heuristics for MVP
    if (
      clean.length < 3 ||
      clean.includes("lorem") ||
      clean.includes("test") ||
      clean.includes("fake")
    ) {
      suspicious.push(company);
    }
  }

  if (!suspicious.length) {
    return makeSignal({
      signal_id: "employer_existence_validation",
      category: "external_verification",
      severity_tier: "C",
      confidence: "medium",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      explanation: "No suspicious employer names detected.",
      suggested_questions: [],
    });
  }

  return makeSignal({
    signal_id: "employer_existence_validation",
    category: "external_verification",
    severity_tier: "B",
    confidence: "medium",
    deduction: 6,
    hard_trigger: false,
    status: "triggered",
    evidence: {
      suspicious_employers: suspicious,
    },
    explanation:
      "Some employer names appear unusual or unverifiable and may require confirmation.",
    suggested_questions: [
      "Can you confirm the legal name of this company?",
      "Was this organization registered under a different name?",
    ],
  });
}