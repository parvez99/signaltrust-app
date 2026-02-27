// core/domain/signals.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { summarizeRole } from "../../src/lib/utils.js";
import { detectSectionRanges, sliceSection } from "../../src/engine/normalize_v1.js";

export type SignalTier = "A" | "B" | "C";
export type SignalStatus = "triggered" | "not_triggered";
export type SignalConfidence = "low" | "medium" | "high";

export type SignalResult = {
  signal_id: string;
  title: string;
  category: string;
  severity_tier: SignalTier;
  confidence: SignalConfidence;
  deduction: number;
  hard_trigger: boolean;
  status: SignalStatus;
  evidence: Record<string, any>;
  explanation: string;
  suggested_questions: string[];
};

export type SignalConfigV1 = {
  enabled: Record<string, boolean>;
};

export type RunSignalsCtx = {
  sourceText?: string;
  sourceFilename?: string | null;
};

export function defaultSignalConfigV1(): SignalConfigV1 {
  return {
    enabled: {
      timeline_overlap: true,
      gap_gt_6mo: true,
      gap_after_edu_to_first_role: true,
      duplicate_roles: true,
      duplicate_resume_upload: true,
            // NEW
      career_velocity: true,
      //date_precision_confidence: true,
      //skill_timeline_mismatch: true,
    },
  };
}

export function runSignalsV1(profile: any, config: SignalConfigV1, ctx: RunSignalsCtx = {}): SignalResult[] {
  const out: SignalResult[] = [];

  if (config.enabled.timeline_overlap) out.push(signalTimelineOverlap(profile));
  if (config.enabled.gap_gt_6mo) out.push(signalGapGt6Months(profile));
  if (config.enabled.gap_after_edu_to_first_role) out.push(signalGapAfterEducationToFirstRole(profile));
  if (config.enabled.duplicate_roles) out.push(signalDuplicateRoles(profile, ctx));
  if (config.enabled.duplicate_resume_upload) out.push(signalDuplicateResumeUpload(profile, ctx));

    // NEW
  if (config.enabled.career_velocity) out.push(signalCareerVelocity(profile));
//   if (config.enabled.date_precision_confidence) out.push(signalDatePrecisionConfidence(profile));
//   if (config.enabled.skill_timeline_mismatch) out.push(signalSkillTimelineMismatch(profile, ctx));
  // ✅ Anti-double-counting: early-career "gap after edu" overlaps with "gap between roles"
  return dedupeEarlyCareerGaps(out);
}

// --- helper ---
function dedupeEarlyCareerGaps(signals: SignalResult[]): SignalResult[] {
  const gapB = signals.find((s) => s?.signal_id === "gap_gt_6mo" && s?.status === "triggered");
  const gapC = signals.find((s) => s?.signal_id === "gap_after_edu_to_first_role" && s?.status === "triggered");

  if (!gapB || !gapC) return signals;

  const bTo = (gapB?.evidence as any)?.to_role || {};
  const cTo = (gapC?.evidence as any)?.to_role || {};

  const key = (r: any) =>
    [String(r?.company || "").toLowerCase().trim(), String(r?.title || "").toLowerCase().trim()]
      .filter(Boolean)
      .join("|");

  const sameToRole = key(bTo) && key(bTo) === key(cTo);
  if (!sameToRole) return signals;

  return signals.map((s) => {
    if (s?.signal_id !== "gap_after_edu_to_first_role") return s;
    return {
      ...s,
      deduction: 0,
      explanation:
        (s.explanation ? s.explanation + " " : "") +
        "(Note: This overlaps with the detected employment gap; deduction not double-counted.)",
    };
  });
}

export function signalTitle(id: string): string {
  const map: Record<string, string> = {
    timeline_overlap: "Overlapping Roles",
    gap_gt_6mo: "Unexplained Gap > 6 Months",
    gap_after_edu_to_first_role: "Gap after education before first role",
    duplicate_roles: "Duplicate Role Entries",
    duplicate_resume_upload: "Duplicate Resume Upload (Cross-Upload)",
    career_velocity: "Career Velocity Anomaly",
  };
  return map[id] || id;
}

export function makeSignal(s: Partial<SignalResult> & Pick<SignalResult, "signal_id" | "category" | "severity_tier" | "confidence" | "deduction" | "status">): SignalResult {
  return {
    signal_id: s.signal_id,
    title: s.title || signalTitle(s.signal_id),
    category: s.category,
    severity_tier: s.severity_tier,
    confidence: s.confidence,
    deduction: Number(s.deduction || 0),
    hard_trigger: !!s.hard_trigger,
    status: s.status,
    evidence: (s.evidence || {}) as any,
    explanation: s.explanation || "",
    suggested_questions: s.suggested_questions || [],
  };
}

export function signalDuplicateRoles(profile: any, ctx: RunSignalsCtx = {}): SignalResult {
  const text = String(ctx.sourceText || profile.__source_text || "").trim();
  if (!text) {
    return makeSignal({
      signal_id: "duplicate_roles",
      title: "Duplicate Role Entries",
      category: "timeline_integrity",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No source_text available to detect duplicates (MVP).",
      suggested_questions: [],
    });
  }

  const norm = (s: string) =>
    String(s || "")
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/[•●·▪︎◦]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isRoleLike = (s: string) => /\b(19|20)\d{2}\b\s*-\s*((19|20)\d{2}\b|present)\b/i.test(s);

  const linesAll = text.split("\n").map((x) => x.trim()).filter(Boolean);

  // ✅ Limit to experience section only (prevents counting repeats in summary/projects)
  const ranges = detectSectionRanges(linesAll);
  const expLines = sliceSection(linesAll, ranges, "experience");
  const lines = expLines && expLines.length ? expLines : linesAll;

  const counts = new Map<string, number>();

  for (const rawLine of lines) {
    const line = norm(rawLine);
    if (!line) continue;
    if (!isRoleLike(line)) continue;

    const exploded = line
      .replace(/\b((19|20)\d{2}\b\s*-\s*((19|20)\d{2}\b|present)\b)/gi, "\n$1")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    for (const one of exploded) {
      if (!isRoleLike(one)) continue;
      counts.set(one, (counts.get(one) || 0) + 1);
    }
  }

  const duplicates = [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([k, c]) => ({ text: k, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (!duplicates.length) {
    return makeSignal({
      signal_id: "duplicate_roles",
      title: "Duplicate Role Entries",
      category: "timeline_integrity",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No duplicated role lines detected in the Experience section.",
      suggested_questions: [],
    });
  }

  return makeSignal({
    signal_id: "duplicate_roles",
    title: "Duplicate Role Entries",
    category: "timeline_integrity",
    severity_tier: "B",
    confidence: "medium",
    deduction: 8,
    hard_trigger: false,
    status: "triggered",
    evidence: { duplicates },
    explanation: "Some role entries appear duplicated in the resume text (possible formatting/copy-paste).",
    suggested_questions: [
      "It looks like one or more roles are repeated—was this intentional or a formatting duplicate?",
      "Can you confirm the correct timeline for the duplicated role entry?",
    ],
  });
}

/**
 * Signal 1: Overlapping Full-Time Roles (Tier A)
 */
export function signalTimelineOverlap(profile: any): SignalResult {
  const roles = Array.isArray(profile.experience) ? profile.experience : [];
  const pairs: Array<{ role1: any; role2: any; overlapDays: number }> = [];

  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const role1 = roles[i];
      const role2 = roles[j];

      const overlapDays = calcOverlapDays(role1.start_date, role1.end_date, role2.start_date, role2.end_date);

      const role1YearOnly =
        role1.start_date?.precision === "year" && (role1.end_date?.precision === "year" || !role1.end_date?.iso);
      const role2YearOnly =
        role2.start_date?.precision === "year" && (role2.end_date?.precision === "year" || !role2.end_date?.iso);

      const bothYearOnly = role1YearOnly && role2YearOnly;
      const minDays = bothYearOnly ? 365 : 60;

      if (overlapDays > minDays) {
        pairs.push({ role1, role2, overlapDays });
      }
    }
  }

  if (!pairs.length) {
    return makeSignal({
      signal_id: "timeline_overlap",
      title: "Overlapping Roles",
      category: "timeline_integrity",
      severity_tier: "A",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No overlapping roles detected (MVP).",
      suggested_questions: [],
    });
  }

  const top = pairs.sort((x, y) => y.overlapDays - x.overlapDays)[0];
  const conf = confidenceFromDatePrecision(top.role1, top.role2, "medium", top.overlapDays);
  const deduction = conf === "high" ? 30 : conf === "medium" ? 20 : 12;

  return makeSignal({
    signal_id: "timeline_overlap",
    title: "Overlapping Roles",
    category: "timeline_integrity",
    severity_tier: "A",
    confidence: conf,
    deduction,
    hard_trigger: true,
    status: "triggered",
    evidence: {
      overlap_days: top.overlapDays,
      role_1: summarizeRole(top.role1),
      role_2: summarizeRole(top.role2),
    },
    explanation: `Two roles overlap by ~${top.overlapDays} days. This can reduce timeline trust if both were full-time.`,
    suggested_questions: [
      "Were these roles held simultaneously? If yes, was one part-time/contract?",
      "Which role was your primary employment during the overlap period?",
    ],
  });
}

function gapIsCoveredByEducation(profile: any, fromMs: number, toMs: number): boolean {
  const edu = Array.isArray(profile.education) ? profile.education : [];
  if (!edu.length) return false;

  for (const e of edu) {
    const s = e?.start_date?.iso ? earliestPossibleStartMs(e.start_date) : Number.NaN;
    const en = e?.end_date?.iso ? latestPossibleEndMs(e.end_date) : Number.NaN;
    if ([s, en].some((x) => Number.isNaN(x))) continue;

    const overlaps = s <= toMs && en >= fromMs;
    if (overlaps) return true;
  }
  return false;
}

/**
 * Signal 2: Unexplained Gap > 6 Months (Tier B)
 */
export function signalGapGt6Months(profile: any): SignalResult {
  const roles = (Array.isArray(profile.experience) ? profile.experience : []).filter((r: any) => r?.start_date?.iso);
  if (roles.length < 2) {
    return makeSignal({
      signal_id: "gap_gt_6mo",
      title: "Unexplained Gap > 6 Months",
      category: "timeline_integrity",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "Not enough dated roles to compute gaps (MVP).",
      suggested_questions: [],
    });
  }

  const sorted = roles.slice().sort((a: any, b: any) => isoToMs(a.start_date.iso) - isoToMs(b.start_date.iso));

  let maxGap = 0;
  let gap: { from: any; to: any; gapDays: number } | null = null;

  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];

    const curEnd = cur.end_date?.iso ? cur.end_date.iso : null;
    if (!curEnd) continue;

    const curEndLatest = latestPossibleEndMs(cur.end_date);
    const nextStartEarliest = earliestPossibleStartMs(next.start_date);

    if ([curEndLatest, nextStartEarliest].some((x) => Number.isNaN(x))) continue;

    if (gapIsCoveredByEducation(profile, curEndLatest, nextStartEarliest)) continue;

    const gapDays = daysBetweenMs(curEndLatest, nextStartEarliest);
    if (gapDays > maxGap) {
      maxGap = gapDays;
      gap = { from: cur, to: next, gapDays };
    }
  }

  if (!gap || maxGap <= 180) {
    return makeSignal({
      signal_id: "gap_gt_6mo",
      title: "Unexplained Gap > 6 Months",
      category: "timeline_integrity",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No gap > 6 months detected (MVP).",
      suggested_questions: [],
    });
  }

  const conf = confidenceFromDatePrecision(gap.from, gap.to, "medium");
  const deduction = conf === "high" ? 15 : conf === "medium" ? 10 : 6;

  return makeSignal({
    signal_id: "gap_gt_6mo",
    title: "Unexplained Gap > 6 Months",
    category: "timeline_integrity",
    severity_tier: "B",
    confidence: conf,
    deduction,
    hard_trigger: false,
    status: "triggered",
    evidence: {
      gap_days: gap.gapDays,
      from_role: summarizeRole(gap.from),
      to_role: summarizeRole(gap.to),
    },
    explanation: `There is an employment gap of ~${gap.gapDays} days between roles.`,
    suggested_questions: [
      `Can you walk through what you were doing between ${gap.from.end_date?.raw || "end date"} and ${gap.to.start_date?.raw || "start date"}?`,
      "Was this a planned break, study period, or job search?",
    ],
  });
}

export function signalGapAfterEducationToFirstRole(profile: any): SignalResult {
  const edu = Array.isArray(profile.education) ? profile.education : [];
  const roles = Array.isArray(profile.experience) ? profile.experience : [];

  const eduWithEnd = edu.filter((e: any) => e?.end_date?.iso);
  const rolesWithStart = roles.filter((r: any) => r?.start_date?.iso);

  if (!eduWithEnd.length || !rolesWithStart.length) {
    return makeSignal({
      signal_id: "gap_after_edu_to_first_role",
      title: "Gap after education before first role",
      category: "timeline_integrity",
      severity_tier: "C",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "Not enough education/experience data to compute this gap (MVP).",
      suggested_questions: [],
    });
  }

  let latestEdu: any = null;
  let latestEduEndMs = -Infinity;

  for (const e of eduWithEnd) {
    const endMs = latestPossibleEndMs(e.end_date);
    if (!Number.isNaN(endMs) && endMs > latestEduEndMs) {
      latestEduEndMs = endMs;
      latestEdu = e;
    }
  }

  let firstRole: any = null;
  let firstRoleStartMs = Infinity;

  for (const r of rolesWithStart) {
    const startMs = earliestPossibleStartMs(r.start_date);
    if (Number.isNaN(startMs)) continue;
    if (startMs < latestEduEndMs) continue;
    if (startMs < firstRoleStartMs) {
      firstRoleStartMs = startMs;
      firstRole = r;
    }
  }

  if (!firstRole || !Number.isFinite(firstRoleStartMs)) {
    return makeSignal({
      signal_id: "gap_after_edu_to_first_role",
      title: "Gap after education before first role",
      category: "timeline_integrity",
      severity_tier: "C",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No post-education role found to compute this gap (MVP).",
      suggested_questions: [],
    });
  }

  const gapDays = daysBetweenMs(latestEduEndMs, firstRoleStartMs);

  if (!(gapDays > 180)) {
    return makeSignal({
      signal_id: "gap_after_edu_to_first_role",
      title: "Gap after education before first role",
      category: "timeline_integrity",
      severity_tier: "C",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No significant gap detected between latest education end and first role.",
      suggested_questions: [],
    });
  }

  const eduPrec = latestEdu?.end_date?.precision || "unknown";
  const rolePrec = firstRole?.start_date?.precision || "unknown";
  const bothTight = (p: string) => p === "day" || p === "month";

  const conf: SignalConfidence =
    bothTight(eduPrec) && bothTight(rolePrec) ? "high" : eduPrec !== "unknown" && rolePrec !== "unknown" ? "medium" : "low";

  const deduction = conf === "high" ? 8 : conf === "medium" ? 5 : 3;

  return makeSignal({
    signal_id: "gap_after_edu_to_first_role",
    title: "Gap after education before first role",
    category: "timeline_integrity",
    severity_tier: "C",
    confidence: conf,
    deduction,
    hard_trigger: false,
    status: "triggered",
    evidence: {
      gap_days: gapDays,
      from_education: {
        institution: latestEdu?.institution?.raw || "",
        end: latestEdu?.end_date?.raw || "",
      },
      to_role: summarizeRole(firstRole),
    },
    explanation: `There appears to be a ~${gapDays} day gap between finishing education and starting the first listed role.`,
    suggested_questions: [
      "What were you doing between finishing education and starting your first role?",
      "Was this internship / job search / relocation / exam prep?",
    ],
  });
}

export function signalDuplicateResumeUpload(profile: any, ctx: RunSignalsCtx = {}): SignalResult {
    const dup = (ctx as any)?.__dup_doc || (profile as any)?.__dup_doc || null;

  if (!dup || !dup.doc_hash) {
    return makeSignal({
      signal_id: "duplicate_resume_upload",
      title: "Duplicate Resume Upload (Cross-Upload)",
      category: "integrity",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: {},
      explanation: "No doc hash available to check cross-upload duplicates (MVP).",
      suggested_questions: [],
    });
  }

  const c = Number(dup.prior_count || 0);
  if (c <= 0) {
    return makeSignal({
      signal_id: "duplicate_resume_upload",
      title: "Duplicate Resume Upload (Cross-Upload)",
      category: "integrity",
      severity_tier: "B",
      confidence: "low",
      deduction: 0,
      hard_trigger: false,
      status: "not_triggered",
      evidence: { doc_hash: dup.doc_hash },
      explanation: "No prior matching resume content found for this candidate.",
      suggested_questions: [],
    });
  }

  const deduction = c >= 4 ? 12 : c >= 2 ? 8 : 6;

  return makeSignal({
    signal_id: "duplicate_resume_upload",
    title: "Duplicate Resume Upload (Cross-Upload)",
    category: "integrity",
    severity_tier: "B",
    confidence: "high",
    deduction,
    hard_trigger: false,
    status: "triggered",
    evidence: {
      doc_hash: dup.doc_hash,
      prior_count: c,
      first_seen_at: dup.first_seen_at,
      last_seen_at: dup.last_seen_at,
    },
    explanation: "This resume content matches one or more previously uploaded resumes for the same candidate.",
    suggested_questions: [
      "Looks like this resume content was uploaded before—was this intended (re-submit), or did you mean to upload an updated version?",
      "What changed since the last version?",
    ],
  });
}

// -------------------- date utils --------------------

export function isoToMs(iso: string): number {
  if (!iso) return Number.NaN;
  const d = new Date(iso);
  return d.getTime();
}

export function daysBetweenMs(aMs: number, bMs: number): number {
  return Math.floor((bMs - aMs) / (1000 * 60 * 60 * 24));
}

export function endOfMonthUtc(year: number, month1to12: number): number {
  const firstNext = Date.UTC(year, month1to12, 1);
  return firstNext - 24 * 60 * 60 * 1000;
}

export function latestPossibleEndMs(d: any): number {
  if (!d) return Number.NaN;
  if (d.iso === null) return Date.now(); // "Present"
  const ms = isoToMs(d.iso);
  if (Number.isNaN(ms)) return Number.NaN;

  if (d.precision === "year") {
    const y = parseInt(String(d.iso).slice(0, 4), 10);
    return Date.UTC(y, 11, 31);
  }
  if (d.precision === "month") {
    const y = parseInt(String(d.iso).slice(0, 4), 10);
    const m = parseInt(String(d.iso).slice(5, 7), 10);
    return endOfMonthUtc(y, m);
  }
  return ms;
}

export function earliestPossibleStartMs(d: any): number {
  if (!d || !d.iso) return Number.NaN;
  const ms = isoToMs(d.iso);
  if (Number.isNaN(ms)) return Number.NaN;

  if (d.precision === "year") {
    const y = parseInt(String(d.iso).slice(0, 4), 10);
    return Date.UTC(y, 0, 1);
  }
  if (d.precision === "month") {
    const y = parseInt(String(d.iso).slice(0, 4), 10);
    const m = parseInt(String(d.iso).slice(5, 7), 10);
    return Date.UTC(y, m - 1, 1);
  }
  return ms;
}

export function calcOverlapDays(aStart: any, aEnd: any, bStart: any, bEnd: any): number {
  const as = earliestPossibleStartMs(aStart);
  const ae = aEnd?.iso ? latestPossibleEndMs(aEnd) : Date.now();

  const bs = earliestPossibleStartMs(bStart);
  const be = bEnd?.iso ? latestPossibleEndMs(bEnd) : Date.now();

  if ([as, ae, bs, be].some((x) => Number.isNaN(x))) return 0;

  const start = Math.max(as, bs);
  const end = Math.min(ae, be);
  const diff = end - start;

  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function confidenceFromDatePrecision(roleA: any, roleB: any, prefer: SignalConfidence = "medium", overlapDays = 0): SignalConfidence {
  const aStart = roleA?.start_date?.precision || "unknown";
  const bStart = roleB?.start_date?.precision || "unknown";
  const aEnd = roleA?.end_date?.precision || "unknown";
  const bEnd = roleB?.end_date?.precision || "unknown";

  const tight = (p: string) => p === "day" || p === "month";
  const known = (p: string) => p && p !== "unknown";

  const precisions = [aStart, aEnd, bStart, bEnd];
  const anyTight = precisions.some((p) => p === "month" || p === "day");
  if (overlapDays >= 180 && anyTight) return "high";

  const aTight = tight(aStart) || tight(aEnd);
  const bTight = tight(bStart) || tight(bEnd);
  if (aTight && bTight) return "high";

  const aKnown = known(aStart) || known(aEnd);
  const bKnown = known(bStart) || known(bEnd);
  if (aKnown && bKnown) return prefer;

  return "low";
}

export function signalCareerVelocity(profile: any) {
    const roles = Array.isArray(profile.experience) ? profile.experience : [];
    const dated = roles.filter((r: any) => r?.start_date?.iso);
  
    if (dated.length < 2) {
      return makeSignal({
        signal_id: "career_velocity",
        title: "Career Velocity Anomaly",
        category: "career_plausibility",
        severity_tier: "B",
        confidence: "low",
        deduction: 0,
        hard_trigger: false,
        status: "not_triggered",
        evidence: {},
        explanation: "Not enough dated roles to assess career velocity (MVP).",
        suggested_questions: []
      });
    }
  
    // sort by earliest possible start (handles year/month precision)
    const sorted = dated.slice().sort((a: any, b: any) =>
      earliestPossibleStartMs(a.start_date) - earliestPossibleStartMs(b.start_date)
    );
  
    const first = sorted[0];
    const firstMs = earliestPossibleStartMs(first.start_date);
  
    const isSenior = (t: any) => /\b(senior|sr\.?)\b/i.test(t || "");
    const isDirectorPlus = (t: any) => /\b(director|head|vp|vice president|principal|staff)\b/i.test(t || "");
  
    let hit = null;
  
    for (const r of sorted) {
      const startMs = earliestPossibleStartMs(r.start_date);
      if (!Number.isFinite(startMs) || !Number.isFinite(firstMs)) continue;
  
      const years = (startMs - firstMs) / (1000 * 60 * 60 * 24 * 365);
      const title = (typeof r?.title === "string" ? r.title : (r?.title?.raw || ""));
  
      if (isSenior(title) && years < 2) { hit = { kind: "senior", role: r, years }; break; }
      if (isDirectorPlus(title) && years < 4) { hit = { kind: "director_plus", role: r, years }; break; }
    }
  
    if (!hit) {
      return makeSignal({
        signal_id: "career_velocity",
        title: "Career Velocity Anomaly",
        category: "career_plausibility",
        severity_tier: "B",
        confidence: "medium",
        deduction: 0,
        hard_trigger: false,
        status: "not_triggered",
        evidence: {},
        explanation: "Career progression appears within typical ranges (MVP heuristic).",
        suggested_questions: []
      });
    }
  
    const deduction = hit.kind === "director_plus" ? 12 : 10;
  
    return makeSignal({
      signal_id: "career_velocity",
      title: "Career Velocity Anomaly",
      category: "career_plausibility",
      severity_tier: "B",
      confidence: "medium",
      deduction,
      hard_trigger: false,
      status: "triggered",
      evidence: {
        years_from_first_role: Number(hit.years.toFixed(2)),
        first_role: summarizeRole(first),
        flagged_role: summarizeRole(hit.role),
        rule: hit.kind === "director_plus" ? "<4y to Director/Head/VP/etc" : "<2y to Senior"
      },
      explanation: `Rapid progression detected: "${hit.role?.title?.raw || "role"}" reached ~${hit.years.toFixed(1)} years after first listed role.`,
      suggested_questions: [
        "Can you walk through how your scope/responsibilities expanded to match this title?",
        "Was this a formal title change or an internal leveling?"
      ]
    });
}