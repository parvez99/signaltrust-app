import type { SignalResult } from "../signals_v1";
export function signalInterviewWasteProbability(
    _profile: any,
    ctx?: any
  ): SignalResult {
  
    const signals = ctx?.triggeredSignals || [];
  
    let risk = 0;
  
    for (const s of signals) {
        if (s.status !== "triggered") continue;
      
        if (s.signal_id === "timeline_overlap") risk += 30;
        if (s.signal_id === "career_velocity_anomaly") risk += 25;
        if (s.signal_id === "duplicate_role_entries") risk += 15;
        if (s.signal_id === "employer_existence_validation") risk += 20;
        if (s.signal_id === "claim_corroboration_coverage") risk += 10;
      }
  
    if (risk < 50) {
        return {
          signal_id: "interview_waste_probability",
          title: "Interview Waste Probability",
          category: "recruiter_efficiency",
          severity_tier: "B",
          confidence: "low",
          deduction: 0,
          hard_trigger: false,
          status: "not_triggered",
          evidence: { risk_score: risk },
          explanation: "No strong signals suggesting the interview would be unproductive.",
          suggested_questions: []
        };
      }
  
    const result: SignalResult = {
      signal_id: "interview_waste_probability",
      title: "Interview Waste Probability",
      category: "recruiter_efficiency",
      severity_tier: "B",
      confidence: "medium",
      deduction: 5,
      hard_trigger: false,
      status: "triggered",
      evidence: { risk_score: risk },
      explanation:
        "Multiple credibility signals suggest the interview may not be productive.",
      suggested_questions: [
        "Can you walk through your recent career timeline?",
        "Which projects best demonstrate your experience?"
      ]
    };
  
    return result;
  }