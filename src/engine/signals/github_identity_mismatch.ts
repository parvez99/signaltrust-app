import type { SignalResult } from "../signals_v1";

export function signalGithubIdentityMismatch(profile: any, ctx?: any): SignalResult {

  const gh = profile?.__github_public;

  if (!gh || !gh.github_login) {
    return {
      signal_id: "github_identity_mismatch",
      title: "GitHub Identity Mismatch",
      category: "external_verification",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No GitHub profile detected.",
      suggested_questions: []
    };
  }

  const resumeName =
    profile?.person?.full_name?.raw?.toLowerCase() || "";

  const ghLogin = gh.github_login.toLowerCase();

  if (!resumeName || ghLogin.includes(resumeName.split(" ")[0])) {
    return {
      signal_id: "github_identity_mismatch",
      title: "GitHub Identity Mismatch",
      category: "external_verification",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "GitHub identity appears consistent with resume.",
      suggested_questions: []
    };
  }

  return {
    signal_id: "github_identity_mismatch",
    title: "GitHub Identity Mismatch",
    category: "external_verification",
    severity_tier: "B",
    confidence: "medium",
    deduction: 12,
    hard_trigger: false,
    status: "triggered",
    evidence: {
      resume_name: resumeName,
      github_login: ghLogin
    },
    explanation:
      "GitHub account referenced may belong to a different identity than the resume.",
    suggested_questions: [
      "Is this GitHub account yours?",
      "Which repositories represent your personal contributions?"
    ]
  };
}