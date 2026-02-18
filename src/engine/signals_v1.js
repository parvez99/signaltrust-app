//# defaultSignalConfigV1, runSignalsV1, signal funcs
import {
    safeJsonParse,
    summarizeRole,
  } from "../lib/utils.js"
import { json } from "../lib/http.js"
import { requireSession } from "../lib/session.js";


import {
    detectSectionRanges,
    sliceSection,
} from "../engine/normalize_v1.js"
export function defaultSignalConfigV1() {
    return {
      enabled: {
        timeline_overlap: true,
        gap_gt_6mo: true,
        gap_after_edu_to_first_role: true,
        duplicate_roles: true,
        duplicate_resume_upload: true,
      }
    };
}

export function runSignalsV1(profile, config) {
    const out = [];
    if (config.enabled.timeline_overlap) out.push(signalTimelineOverlap(profile));
    if (config.enabled.gap_gt_6mo) out.push(signalGapGt6Months(profile));
    if (config.enabled.gap_after_edu_to_first_role) out.push(signalGapAfterEducationToFirstRole(profile));
    if (config.enabled.duplicate_roles) out.push(signalDuplicateRoles(profile)); // ✅ add
    if (config.enabled.duplicate_resume_upload) out.push(signalDuplicateResumeUpload(profile));
    return out;
}
  
export function signalTitle(id) {
    const map = {
      timeline_overlap: "Overlapping Roles",
      gap_gt_6mo: "Unexplained Gap > 6 Months",
      gap_after_edu_to_first_role: "Gap after education before first role",
      duplicate_roles: "Duplicate Role Entries", // ✅ add
      duplicate_resume_upload: "Duplicate Resume Upload (Cross-Upload)",
    };
    return map[id] || id;
}

export function signalDuplicateRoles(profile) {
    // ✅ Use the raw resume text (attached in apiTrustRun)
    const text = String(profile.__source_text || "").trim();
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
        suggested_questions: []
      });
    }
  
    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[–—]/g, "-")          // normalize dash variants
        .replace(/[•●·▪︎◦]/g, " ")      // bullets
        .replace(/\s+/g, " ")
        .trim();
  
    const isRoleLike = (s) =>
      /\b(19|20)\d{2}\b\s*-\s*((19|20)\d{2}\b|present)\b/i.test(s);
  
    // Split into normalized lines
    const linesAll = text.split("\n").map(x => x.trim()).filter(Boolean);
  
    // ✅ Limit to experience section only (prevents counting repeats in summary/projects)
    const ranges = detectSectionRanges(linesAll);
    const expLines = sliceSection(linesAll, ranges, "experience");
    const lines = (expLines && expLines.length) ? expLines : linesAll;
  
    // Count duplicates of role-like lines
    const counts = new Map();
  
    for (const rawLine of lines) {
      const line = norm(rawLine);
      if (!line) continue;
      if (!isRoleLike(line)) continue;
  
      // If someone pasted the same dated line twice on ONE line,
      // split it into chunks by inserting a newline before repeated year-range patterns.
      const exploded = line
        .replace(/\b((19|20)\d{2}\b\s*-\s*((19|20)\d{2}\b|present)\b)/gi, "\n$1")
        .split("\n")
        .map(x => x.trim())
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
        suggested_questions: []
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
        "Can you confirm the correct timeline for the duplicated role entry?"
      ]
    });
}

/**
 * Signal 1: Overlapping Full-Time Roles (Tier A)
 * MVP assumption: employment_type unknown -> inferred full_time => medium confidence.
 * If later we extract explicit contract/part-time, confidence adjusts.
 */
export function signalTimelineOverlap(profile) {
    const roles = Array.isArray(profile.experience) ? profile.experience : [];
    const pairs = [];
  
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) {
        const role1 = roles[i];
        const role2 = roles[j];
  
        const overlapDays = calcOverlapDays(
          role1.start_date, role1.end_date,
          role2.start_date, role2.end_date
        );
  
        if (overlapDays > 60) {
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
        hard_trigger: true,
        status: "not_triggered",
        evidence: {},
        explanation: "No overlapping roles detected (MVP).",
        suggested_questions: []
      });
    }
  
    const top = pairs.sort((x, y) => y.overlapDays - x.overlapDays)[0];
    const conf = confidenceFromDatePrecision(top.role1, top.role2, "medium", top.overlapDays);
    const deduction = conf === "high" ? 30 : conf === "medium" ? 20 : 12;
  
    const explanation =
      `Two roles overlap by ~${top.overlapDays} days. This can reduce timeline trust if both were full-time.`;
  
    const evidence = {
      overlap_days: top.overlapDays,
      role_1: summarizeRole(top.role1),
      role_2: summarizeRole(top.role2)
    };
  
    return makeSignal({
      signal_id: "timeline_overlap",
      title: "Overlapping Roles",
      category: "timeline_integrity",
      severity_tier: "A",
      confidence: conf,
      deduction,
      hard_trigger: true,
      status: "triggered",
      evidence,
      explanation,
      suggested_questions: [
        "Were these roles held simultaneously? If yes, was one part-time/contract?",
        "Which role was your primary employment during the overlap period?"
      ]
    });
}

/**
* Signal 2: Unexplained Gap > 6 Months (Tier B)
*/
export function signalGapGt6Months(profile) {
    const roles = (Array.isArray(profile.experience) ? profile.experience : [])
      .filter(r => r?.start_date?.iso); // must have a start date
  
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
        suggested_questions: []
      });
    }
  
    // Sort by start date asc
    const sorted = roles.slice().sort((a, b) => isoToMs(a.start_date.iso) - isoToMs(b.start_date.iso));
  
    let maxGap = 0;
    let gap = null;
  
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
  
      const curEnd = cur.end_date?.iso ? cur.end_date.iso : null;
      if (!curEnd) continue; // current role or missing end => can't compute gap safely
  
      const curEndLatest = latestPossibleEndMs(cur.end_date);
      const nextStartEarliest = earliestPossibleStartMs(next.start_date);
      
      if ([curEndLatest, nextStartEarliest].some(x => Number.isNaN(x))) continue;
      
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
        suggested_questions: []
      });
    }
  
    // Confidence heuristic: higher if end+start are month/day precision
    const conf = confidenceFromDatePrecision(gap.from, gap.to, /*prefer=*/"medium");
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
        to_role: summarizeRole(gap.to)
      },
      explanation: `There is an employment gap of ~${gap.gapDays} days between roles.`,
      suggested_questions: [
        `Can you walk through what you were doing between ${gap.from.end_date?.raw || "end date"} and ${gap.to.start_date?.raw || "start date"}?`,
        "Was this a planned break, study period, or job search?"
      ]
    });
}
  
  // --- Evidence & utility ---
export function makeSignal(s) {
    return {
      signal_id: s.signal_id,
      title: s.title || signalTitle(s.signal_id),
      category: s.category,
      severity_tier: s.severity_tier,
      confidence: s.confidence,
      deduction: s.deduction,
      hard_trigger: !!s.hard_trigger,
      status: s.status,
      evidence: s.evidence || {},
      explanation: s.explanation || "",
      suggested_questions: s.suggested_questions || []
    };
}
  
export function isoToMs(iso) {
    if (!iso) return NaN;
    const d = new Date(iso);
    return d.getTime();
}
  
export function daysBetweenMs(aMs, bMs) {
    return Math.floor((bMs - aMs) / (1000 * 60 * 60 * 24));
}
  
export function endOfMonthUtc(year, month1to12) {
    // month is 1-12
    const firstNext = Date.UTC(year, month1to12, 1); // JS month is 0-based; this is next month day 1
    return firstNext - 24 * 60 * 60 * 1000; // minus 1 day
}
  
export function latestPossibleEndMs(d) {
    if (!d) return NaN;
    if (d.iso === null) return Date.now(); // "Present"
    const ms = isoToMs(d.iso);
    if (Number.isNaN(ms)) return NaN;
  
    if (d.precision === "year") {
      const y = parseInt(d.iso.slice(0, 4), 10);
      return Date.UTC(y, 11, 31); // Dec 31
    }
    if (d.precision === "month") {
      const y = parseInt(d.iso.slice(0, 4), 10);
      const m = parseInt(d.iso.slice(5, 7), 10);
      return endOfMonthUtc(y, m);
    }
    return ms; // day precision or whatever you stored
}
  
export function earliestPossibleStartMs(d) {
    if (!d || !d.iso) return NaN;
    const ms = isoToMs(d.iso);
    if (Number.isNaN(ms)) return NaN;
  
    if (d.precision === "year") {
      const y = parseInt(d.iso.slice(0, 4), 10);
      return Date.UTC(y, 0, 1); // Jan 1
    }
    if (d.precision === "month") {
      const y = parseInt(d.iso.slice(0, 4), 10);
      const m = parseInt(d.iso.slice(5, 7), 10);
      return Date.UTC(y, m - 1, 1); // first of month
    }
    return ms;
}
  
export function calcOverlapDays(aStart, aEnd, bStart, bEnd) {
    const as = isoToMs(aStart?.iso);
    const ae = aEnd?.iso ? isoToMs(aEnd.iso) : Date.now();
    const bs = isoToMs(bStart?.iso);
    const be = bEnd?.iso ? isoToMs(bEnd.iso) : Date.now();
    if ([as, ae, bs, be].some(x => Number.isNaN(x))) return 0;
  
    const start = Math.max(as, bs);
    const end = Math.min(ae, be);
    const diff = end - start;
    if (diff <= 0) return 0;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}
  
export function confidenceFromDatePrecision(roleA, roleB, prefer = "medium", overlapDays = 0) {
  const aStart = roleA?.start_date?.precision || "unknown";
  const bStart = roleB?.start_date?.precision || "unknown";
  const aEnd = roleA?.end_date?.precision || "unknown";
  const bEnd = roleB?.end_date?.precision || "unknown";

  const tight = (p) => (p === "day" || p === "month");
  const known = (p) => (p && p !== "unknown");

  // If overlap is large, treat as high confidence even if only year precision
  if (overlapDays >= 180) return "high";

  // High confidence if both roles have at least month/day precision on start OR end
  const aTight = tight(aStart) || tight(aEnd);
  const bTight = tight(bStart) || tight(bEnd);
  if (aTight && bTight) return "high";

  // Medium if both have some known precision
  const aKnown = known(aStart) || known(aEnd);
  const bKnown = known(bStart) || known(bEnd);
  if (aKnown && bKnown) return prefer;

  return "low";
}

  
export async function apiTrustDebugProfile(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) return json({ error: "id required" }, 400);
  
    const row = await env.DB.prepare(
      "SELECT id, normalized_json FROM trust_candidate_profiles WHERE id = ?"
    ).bind(id).first();
  
    if (!row) return json({ error: "not found" }, 404);
  
    return json({ id: row.id, profile: safeJsonParse(row.normalized_json) });
}
  
export function signalGapAfterEducationToFirstRole(profile) {
    const edu = Array.isArray(profile.education) ? profile.education : [];
    const roles = Array.isArray(profile.experience) ? profile.experience : [];
  
    // Need an education end and at least one role start
    const eduWithEnd = edu.filter(e => e?.end_date?.iso);
    const rolesWithStart = roles.filter(r => r?.start_date?.iso);
  
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
        suggested_questions: []
      });
    }
  
    // Latest education end (by latestPossibleEndMs)
    let latestEdu = null;
    let latestEduEndMs = -Infinity;
    for (const e of eduWithEnd) {
      const endMs = latestPossibleEndMs(e.end_date);
      if (!Number.isNaN(endMs) && endMs > latestEduEndMs) {
        latestEduEndMs = endMs;
        latestEdu = e;
      }
    }
  
    // Earliest role start (by earliestPossibleStartMs)
    let firstRole = null;
    let firstRoleStartMs = Infinity;
    for (const r of rolesWithStart) {
      const startMs = earliestPossibleStartMs(r.start_date);
      if (!Number.isNaN(startMs) && startMs < firstRoleStartMs) {
        firstRoleStartMs = startMs;
        firstRole = r;
      }
    }
  
    if (!latestEdu || !firstRole || !Number.isFinite(latestEduEndMs) || !Number.isFinite(firstRoleStartMs)) {
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
        explanation: "Could not compute education→first role gap (MVP).",
        suggested_questions: []
      });
    }
  
    const gapDays = daysBetweenMs(latestEduEndMs, firstRoleStartMs);
  
    // Only care if it’s a real positive gap
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
        suggested_questions: []
      });
    }
  
    // Confidence: if both are month/day, higher; year-only stays low/medium
    const eduPrec = latestEdu?.end_date?.precision || "unknown";
    const rolePrec = firstRole?.start_date?.precision || "unknown";
    const bothTight = (p) => (p === "day" || p === "month");
    const conf = (bothTight(eduPrec) && bothTight(rolePrec)) ? "high"
              : (eduPrec !== "unknown" && rolePrec !== "unknown") ? "medium"
              : "low";
  
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
          end: latestEdu?.end_date?.raw || ""
        },
        to_role: summarizeRole(firstRole)
      },
      explanation: `There appears to be a ~${gapDays} day gap between finishing education and starting the first listed role.`,
      suggested_questions: [
        "What were you doing between finishing education and starting your first role?",
        "Was this internship / job search / relocation / exam prep?"
      ]
    });
}
  
export function parseSingleYearFromLine(line) {
    const s = (line || "").trim();
    const m = s.match(/\b(19|20)\d{2}\b/);
    if (!m) return null;
    const y = m[0];
    return { raw: y, iso: `${y}-12-31`, precision: "year" }; // treat as end-of-year
}

export function signalDuplicateResumeUpload(profile) {
  const dup = profile.__dup_doc || null;

  // No doc hash available => cannot evaluate
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
      suggested_questions: []
    });
  }

  // No prior matches
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
      suggested_questions: []
    });
  }

  // ✅ Triggered: scale deduction with repeat count
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
      last_seen_at: dup.last_seen_at
    },
    explanation: "This resume content matches one or more previously uploaded resumes for the same candidate.",
    suggested_questions: [
      "Looks like this resume content was uploaded before—was this intended (re-submit), or did you mean to upload an updated version?",
      "What changed since the last version?"
    ]
  });
}

