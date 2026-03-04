/* eslint-disable @typescript-eslint/no-explicit-any */

export function generateRiskNarrative(scoring: any, signals: any[] = []): string {
    const bucket = String(scoring?.bucket || "").toLowerCase();
    const score = Number(scoring?.trust_score ?? 0);
  
    const has = (id: string) => signals.some((s) => s?.signal_id === id && s?.status === "triggered");
  
    // Green + no signals
    if (bucket === "green" && (!signals || signals.filter(s => s?.status === "triggered").length === 0)) {
      return "Career trajectory appears consistent and internally coherent based on the provided resume.";
    }
  
    // Specific narratives
    if (has("career_velocity")) {
      return "Career progression appears significantly accelerated relative to typical timelines. Recommend validating scope, leveling, and responsibilities for the promoted roles.";
    }
    if (has("timeline_overlap")) {
      return "Overlapping roles were detected. Recommend confirming whether one role was part-time/contract or clarifying the exact timeline.";
    }
    if (has("gap_gt_6mo")) {
      return "A significant employment gap was detected between roles. Recommend validating what the candidate was doing during that time.";
    }
    if (has("duplicate_roles")) {
      return "Duplicate role entries were detected in the resume text. Recommend confirming the correct employment timeline.";
    }
    if (has("duplicate_resume_upload")) {
      return "This resume content appears to match a previously uploaded resume. Recommend confirming whether this was a resubmission or an updated version.";
    }
  
    // Fallback narrative
    if (bucket === "green") return `Low risk based on current signals (score ${score}).`;
    if (bucket === "yellow") return `Moderate risk based on current signals (score ${score}). Recommend targeted validation.`;
    return `Higher risk based on current signals (score ${score}). Recommend deeper verification.`;
  }