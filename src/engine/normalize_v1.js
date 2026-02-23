//# normalizeResumeTextToProfileV1 + helpers
// ---------------------------
// 3) NORMALIZATION (MVP STUB)
// ---------------------------

/**
 * normalizeResumeTextToProfileV1
 * Portable: pure function, no env access.
 * MVP: heuristic extraction from pasted text.
 * Later: swap internals with robust parser/LLM, keep output schema stable.
 */
import { normalizeWhitespace } from "../lib/utils.js"
import { parseSingleYearFromLine } from "../engine/signals_v1.js"

function coalesceWrappedMonthYearLines(lines) {
  const out = [];
  const monthRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b\.?$/i;
  const yearRangeRe = /^\s*(19|20)\d{2}\b\s*-\s*((19|20)\d{2}\b|present)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const cur = String(lines[i] || "").trim();
    const next = i + 1 < lines.length ? String(lines[i + 1] || "").trim() : "";

    // If current line ends with a month (often after a dash), and next line starts with "YYYY - ..."
    // merge them: "… - Oct" + "2023 - Present" => "… - Oct 2023 - Present"
    if (cur && next && monthRe.test(cur) && yearRangeRe.test(next)) {
      out.push(cur + " " + next);
      i++; // skip next
      continue;
    }

    out.push(cur);
  }

  return out;
}

export function detectSectionRanges(lines) {
    const headerMatchers = [
      { key: "experience", re: /^(work experience|experience|employment|career history|professional experience)\b/i },
      { key: "education", re: /^(education|academics|academic background|education & certifications)\b/i },
      { key: "skills", re: /^(technical skills|skills|core skills|technologies)\b/i },
      { key: "projects", re: /^(projects|personal projects)\b/i },
      { key: "certifications", re: /^(certifications|certificates)\b/i },
      { key: "summary", re: /^(summary|profile|professional summary)\b/i },
    ];
  
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      const l = (lines[i] || "").trim();
      if (!l) continue;
      for (const h of headerMatchers) {
        if (h.re.test(l)) { hits.push({ key: h.key, idx: i, line: l }); break; }
      }
    }
  
    hits.sort((a, b) => a.idx - b.idx);
  
    const ranges = {};
    for (let i = 0; i < hits.length; i++) {
      const cur = hits[i];
      const next = hits[i + 1];
      const start = cur.idx + 1;
      const end = next ? next.idx : lines.length;
      if (!ranges[cur.key]) ranges[cur.key] = { start, end, header_idx: cur.idx, header_line: cur.line };
    }
    return ranges;
}
 
export function sliceSection(lines, ranges, key) {
    const r = ranges[key];
    if (!r) return [];
    return lines.slice(r.start, r.end).map(s => (s || "").trim()).filter(Boolean);
}

export function normalizeResumeTextToProfileV1({ candidateId, sourceText, sourceFilename, now }) {
    const text = String(sourceText || "");
    const clean = normalizeWhitespace(text);
  
    const sourceId = "src_1";
    const ev = [];
    const mkEv = (excerpt) => {
      const id = "ev_" + (ev.length + 1);
      ev.push({ evidence_id: id, source_id: sourceId, page: null, text_excerpt: excerpt.slice(0, 500) });
      return id;
    };
  
    const emails = [...new Set(matchEmails(clean))].slice(0, 5);
    const phones = [...new Set(matchPhones(clean))].slice(0, 3);
  
    let lines = clean.split("\n").map(s => s.trim()).filter(Boolean);

    // ✅ Fix: merge wrapped month line + year-range line (e.g. "StackWorks - Oct" + "2023 - Present")
    lines = coalesceWrappedMonthYearLines(lines);
  
    // ✅ Section detection
    const ranges = detectSectionRanges(lines);
    const expLines = sliceSection(lines, ranges, "experience");
    const eduLines = sliceSection(lines, ranges, "education");
  
    const guessedName = guessNameFromLines(lines);
  
    // ✅ Prefer section-bounded parsing; fallback to global if section missing
    const exp = expLines.length ? extractExperienceBlocks(["experience", ...expLines], mkEv) : extractExperienceBlocks(lines, mkEv);
    const edu = eduLines.length ? extractEducationBlocks(eduLines, mkEv) : extractEducationBlocks(lines, mkEv);
  
    const parsing_quality = computeParsingQuality({ ranges, exp, edu });
  
    return {
      schema_version: "candidate_profile_v1",
      candidate_id: candidateId,
      created_at: now,
      sources: [
        {
          source_id: sourceId,
          type: "resume_text",
          filename: sourceFilename || "pasted.txt",
          sha256: null,
          ingested_at: now
        }
      ],
      parsing_quality,
      person: {
        full_name: {
          raw: guessedName || "",
          normalized: (guessedName || "").toLowerCase(),
          evidence: guessedName ? [mkEv(guessedName)] : []
        },
        contacts: {
          emails: emails.map(e => ({ value: e, domain: (e.split("@")[1] || "").toLowerCase(), evidence: [mkEv(e)] })),
          phones: phones.map(p => ({ value: p, evidence: [mkEv(p)] })),
          links: []
        },
        location: { raw: "", evidence: [] }
      },
      experience: exp,
      education: edu,
      skills: { raw_list: [], normalized_list: [], evidence: [] },
      evidence_index: ev
    };
}

export function computeParsingQuality({ ranges, exp, edu }) {
    const expCount = Array.isArray(exp) ? exp.length : 0;
    const eduCount = Array.isArray(edu) ? edu.length : 0;
  
    const expMonthOrDay = (Array.isArray(exp) ? exp : []).filter(r => {
      const p1 = r?.start_date?.precision;
      const p2 = r?.end_date?.precision;
      return (p1 === "month" || p1 === "day" || p2 === "month" || p2 === "day");
    }).length;
  
    const sectionsDetected = {
      experience: !!ranges.experience,
      education: !!ranges.education,
      skills: !!ranges.skills
    };
  
    // MVP quality heuristic
    let overall = "medium";
    if (expCount >= 2 && eduCount >= 1 && (sectionsDetected.experience || sectionsDetected.education)) overall = "medium";
    if (expCount >= 3 && eduCount >= 2 && expMonthOrDay >= 2) overall = "high";
    if (expCount === 0 || (!sectionsDetected.experience && !sectionsDetected.education)) overall = "low";
  
    return {
      sections_detected: sectionsDetected,
      experience_roles_count: expCount,
      experience_with_month_or_day_precision: expMonthOrDay,
      education_entries_count: eduCount,
      overall
    };
}

export function matchEmails(text) {
    const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    return text.match(re) || [];
}

export function matchPhones(text) {
    // Conservative-ish phone matcher (won't be perfect)
    const re = /(\+\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/g;
    const matches = text.match(re) || [];
    // Filter out obvious year ranges etc.
    return matches
      .map(s => s.trim())
      .filter(s => s.replace(/\D/g, "").length >= 9)
      .slice(0, 10);
}

export function guessNameFromLines(lines) {
    if (!lines.length) return "";
  
    const reject = /^(technical skills|skills|experience|work experience|education|projects|certifications|summary|profile)\b/i;
  
    for (const l of lines.slice(0, 12)) {
      const s = (l || "").trim();
      if (!s) continue;
      if (reject.test(s)) continue;
  
      const w = s.split(/\s+/).filter(Boolean);
      if (w.length >= 2 && w.length <= 4 && /^[A-Za-z .'-]+$/.test(s)) {
        return s;
      }
    }
    return "";
}

export function extractExperienceBlocks(lines, mkEv) {
    const out = [];
  
    let inExperience = false;
    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] || "").trim();
      if (!line) continue;
  
      // ---- section toggles ----
      if (/^(career history|work experience|experience|employment)\b/i.test(line)) {
        inExperience = true;
        continue;
      }
      if (/^(education|achievements|projects|technical skills|skills|certifications|profile|referees)\b/i.test(line)) {
        inExperience = false;
        continue;
      }
  
      // ✅ only parse date ranges when in experience section
      if (!inExperience) continue;
  
      const dr = parseDateRangeFromLine(line);
      if (!dr) continue;
      
      // Default: the line itself (your CV has date+company+title on one line)
      let contextLine = line;
      
      let parsed = parseCompanyTitleFromDatedLine(line);
      
      // fallback if the dated line parse didn't yield anything
      if (!parsed.titleRaw && !parsed.companyRaw) {
        contextLine = findNearestContextLine(lines, i);
        parsed = parseCompanyTitleFromDatedLine(contextLine);
      }
      
      // ✅ guard: reject obvious non-job context lines
      if (looksLikeNonJobContext(contextLine)) continue;
      
      const expId = "exp_" + (out.length + 1);
      
      const titleClean = cleanTitle(parsed.titleRaw || "");
      const companyClean = (parsed.companyRaw || "").trim();
      
      out.push({
        exp_id: expId,
        company: {
          raw: companyClean,
          normalized: companyClean.toLowerCase(),
          domain_hint: null
        },
        title: {
          raw: titleClean,
          normalized: titleClean.toLowerCase(),
          seniority_band: inferSeniorityBand(titleClean)
        },
        employment_type: { raw: "", normalized: "unknown", inferred: true },
        start_date: dr.start,
        end_date: dr.end,
        is_current: dr.end.iso === null,
        location_raw: "",
        evidence: [mkEv(`${contextLine}\n${line}`.trim())]
      });
      
    }
  
    const merged = mergeDuplicateExperience(out);
  
    const seen = new Set();
    return merged.filter(x => {
      const k = [
        x.company?.normalized || "",
        x.title?.normalized || "",
        x.start_date?.iso || "",
        x.end_date?.iso || ""
      ].join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function parseCompanyTitleFromDatedLine(line) {
    const s = (line || "").trim();
    if (!s) return { titleRaw: "", companyRaw: "" };
  
    // Remove trailing date range anywhere in the line:
    // - "Jan 2022 - Present"
    // - "Jan 2022 – Mar 2023"
    // - "2020 - 2022"
    // - "2020 – Present"
    // Also handles dash variants.
    const withoutDates = s
      .replace(
        /\s*[–—-]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\s*[–—-]\s*(present|current|now|((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}))\s*$/i,
        ""
      )
      .replace(
        /\s*[–—-]\s*\d{4}\s*[–—-]\s*(present|current|now|\d{4})\s*$/i,
        ""
      )
      .trim();
  
    // Remove leading date range if the resume is "2019 - 2022 Company, Location Title"
    const cleaned = withoutDates
      .replace(/^\d{4}\s*[–—-]\s*(\d{4}|present|current|now)\s*/i, "")
      .replace(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\s*[–—-]\s*(present|current|now|((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}))\s*/i, "")
      .trim();
  
    if (!cleaned) return { titleRaw: "", companyRaw: "" };
  
    // Split on common separators between "Title, Company" or "Company — Title"
    // Prioritize patterns you actually generate in PDFs:
    // 1) "Title, Company"
    const commaParts = cleaned.split(",").map(x => x.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      const left = commaParts[0];
      const right = commaParts.slice(1).join(",").trim();
  
      // Heuristic: left looks like a title (Engineer/SRE/etc) -> treat as title, right as company
      if (/\b(engineer|sre|developer|manager|lead|principal|staff|analyst|architect|devops|platform)\b/i.test(left)) {
        return { titleRaw: left, companyRaw: right };
      }
  
      // Otherwise treat as company first (old behavior)
      return { companyRaw: left, titleRaw: right };
    }
  
    // 2) "Title @ Company"
    const at = cleaned.split(/\s+@\s+/);
    if (at.length === 2) return { titleRaw: at[0].trim(), companyRaw: at[1].trim() };
  
    // 3) "Title - Company" (with spaces)
    const dash = cleaned.split(/\s+[–—-]\s+/);
    if (dash.length === 2) return { titleRaw: dash[0].trim(), companyRaw: dash[1].trim() };
  
    // 4) Fallback: unknown
    return { companyRaw: "", titleRaw: cleaned };
}  

export function looksLikeNonJobContext(contextLine) {
    const s = (contextLine || "").trim();
    if (!s) return true;
    // reject section headers
    if (/^(education|achievements|projects|technical skills|skills|certifications|profile)\b/i.test(s)) return true;
    // reject bullets
    if (isBulletLine(s)) return true;
    // reject lines that are too short to be a job title/company
    if (s.length < 8) return true;
  
    // allow if it looks like "Company, Location Title" etc.
    // simple heuristic: contains a comma OR contains a known seniority keyword OR has at least 2 words
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return false;
  
    return false;
}

export function cleanTitle(title) {
    return (title || "")
      .split("●")[0]
      .split("•")[0]
      .trim();
}

export function mergeDuplicateExperience(exps) {
    const map = new Map();
    for (const x of exps) {
      const key = [
        (x.company?.normalized || "").trim(),
        (x.title?.normalized || "").trim(),
        x.start_date?.iso || "",
        x.end_date?.iso || ""
      ].join("|");
  
      if (!map.has(key)) map.set(key, x);
      else {
        // merge evidence
        const prev = map.get(key);
        prev.evidence = [...new Set([...(prev.evidence || []), ...(x.evidence || [])])];
        map.set(key, prev);
      }
    }
    return [...map.values()];
}
 
export function extractEducationBlocks(eduLines, mkEv) {
    const out = [];
  
    const eduLineLooksValid = (s) =>
      /\b(university|college|institute|school)\b/i.test(s) ||
      /\b(m\.?sc|msc|b\.?sc|bsc|m\.?tech|b\.?tech|mba|phd|masters|bachelors)\b/i.test(s);
  
    for (let i = 0; i < eduLines.length; i++) {
      const l = (eduLines[i] || "").trim();
      if (!l) continue;
  
      // skip bullets / noise
      if (isBulletLine(l)) continue;
  
      // sometimes degree is on next line; allow pairing
      const next = (i + 1 < eduLines.length) ? (eduLines[i + 1] || "").trim() : "";
      const combined = next && !isBulletLine(next) ? `${l}\n${next}` : l;
  
      // must look like edu
      if (!eduLineLooksValid(l) && !eduLineLooksValid(next) && !eduLineLooksValid(combined)) continue;
  
      const dr =
      parseDateRangeFromLine(l) ||
      (next ? parseDateRangeFromLine(next) : null);
      
      // Prefer SAME LINE year first, then next line year
      const singleHere = eduLineLooksValid(l) ? parseSingleYearFromLine(l) : null;
      const singleNext = (next && eduLineLooksValid(next)) ? parseSingleYearFromLine(next) : null;  
      const start_date = dr ? dr.start : { raw: "", iso: null, precision: "unknown" };
      const end_date = dr ? dr.end : (singleHere || singleNext || { raw: "", iso: null, precision: "unknown" });
    
  
      // store the full combined text as evidence (MVP)
      const rawRow = combined.trim();
  
      const eduId = "edu_" + (out.length + 1);
      out.push({
        edu_id: eduId,
        institution: { raw: l, normalized: l.toLowerCase(), country: "" },
        degree: { raw: "", normalized: "", level: "" },
        study_mode: { raw: "", normalized: "unknown", inferred: true },
        start_date,
        end_date,
        evidence: [mkEv(rawRow)]
      });
  
      // if we used next line in this record, skip it
      if (combined.includes("\n")) i++;
    }
    const seen = new Set();
    return out.filter(e => {
      const key = (e.institution?.normalized || "") + "|" + (e.end_date?.iso || "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);
}

export function isBulletLine(s) {
    const x = (s || "").trim();
    if (!x) return false;
    return /^[-*•·●▪︎◦]/.test(x) || /^\d+\.\s+/.test(x);
}

export function findNearestContextLine(lines, idx) {
    // Look upward up to 6 lines to find a non-bullet context line
    for (let j = idx - 1; j >= Math.max(0, idx - 6); j--) {
      const l = (lines[j] || "").trim();
      if (!l) continue;
      if (isBulletLine(l)) continue;
      // Skip common section headers too
      if (/^(experience|work experience|employment|professional experience|projects|education|skills)\b/i.test(l)) continue;
      return l;
    }
    return lines[idx] || "";
}

export function looksLikeBulletTitle(titleRaw) {
    const t = (titleRaw || "").trim();
    return isBulletLine(t) || t.length > 80 || /^[•·●-]/.test(t);
}

export function parseTitleCompany(line) {
    const s = (line || "").trim();
    if (!s) return { titleRaw: "", companyRaw: "" };
  
      // ✅ Pattern: "Company, Location Title"
    // Example: "Yahoo, Dublin Sr. Production Engineer"
    const m = s.match(/^(.+?),\s*([A-Za-z ]+)\s+(Sr\.?|Senior|Lead|Principal|Staff|Engineer|Developer|SRE|DevOps|Cloud|Production).*/i);
    if (m) {
      return { companyRaw: m[1].trim(), titleRaw: s.slice((m[1] + ", " + m[2]).length).trim() };
    }
  
    // Patterns: "Title - Company", "Title @ Company", "Title, Company"
    const at = s.split(/\s+@\s+/);
    if (at.length === 2) return { titleRaw: at[0].trim(), companyRaw: at[1].trim() };
  
    const dash = s.split(/\s+-\s+/);
    if (dash.length === 2) return { titleRaw: dash[0].trim(), companyRaw: dash[1].trim() };
  
    const comma = s.split(/\s*,\s*/);
    if (comma.length === 2) return { titleRaw: comma[0].trim(), companyRaw: comma[1].trim() };
  
    // Fallback: unknown
    return { titleRaw: s, companyRaw: "" };
}
 
export function inferSeniorityBand(title) {
    const t = (title || "").toLowerCase();
    if (/(chief|cto|ceo|cpo|ciso|vp|vice president|director)/.test(t)) return "exec";
    if (/(principal|staff|lead|architect)/.test(t)) return "lead";
    if (/(senior)/.test(t)) return "senior";
    if (/(intern|trainee)/.test(t)) return "intern";
    if (t) return "mid";
    return "unknown";
}

// Date parsing helpers (MVP, not exhaustive)
export function parseDateRangeFromLine(line) {
    const s = (line || "").trim();
    if (!s) return null;
  
    // Handle "Jan 2022 - Present" / "Jan 2022 – Mar 2023"
    const monthYear = /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}/ig;
    const years = /\b(19|20)\d{2}\b/g;
  
    const hasPresent = /present|current|now/i.test(s);
  
    // If contains two month-year tokens OR one month-year + present
    const my = s.match(monthYear) || [];
    if (my.length >= 2 || (my.length === 1 && hasPresent)) {
      const start = parseMonthYear(my[0]);
      const end = hasPresent ? { raw: "Present", iso: null, precision: "present" } : parseMonthYear(my[1]);
      if (start && end) return { start, end };
    }
  
    // Handle "2020 - 2022" or "2020–Present"
    const ys = s.match(years) || [];
    if (ys.length >= 2 || (ys.length === 1 && hasPresent)) {
      const start = { raw: ys[0], iso: `${ys[0]}-01-01`, precision: "year" };
      const end = hasPresent ? { raw: "Present", iso: null, precision: "present" }
        : { raw: ys[1], iso: `${ys[1]}-12-31`, precision: "year" };
      return { start, end };
    }
  
    return null;
}

export function parseMonthYear(token) {
    const t = (token || "").trim().toLowerCase();
    const m = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12"
    };
    const parts = t.split(/\s+/);
    if (parts.length !== 2) return null;
    const mm = m[parts[0].slice(0, 4)] || m[parts[0].slice(0, 3)];
    const yyyy = parts[1];
    if (!mm || !/^\d{4}$/.test(yyyy)) return null;
    return { raw: token, iso: `${yyyy}-${mm}-01`, precision: "month" };
}