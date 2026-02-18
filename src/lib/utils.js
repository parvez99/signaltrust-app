//# safeDateLabel(), normalizeWhitespace(), safeJsonParse()
// Safe Date formatting
export function safeDateLabel(s) {
  if (!s) return "Never";
  // If SQLite format "YYYY-MM-DD HH:MM:SS", convert to ISO-like
  const normalized = String(s).includes("T") ? String(s) : String(s).replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return String(s); // fall back to raw
  return d.toISOString(); // stable in Workers
}

export function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }
  
export function summarizeRole(r) {
    let company = (r?.company?.raw || "").trim();
    let title = (r?.title?.raw || "").trim();
  
    const looksLikeTitle = (s) =>
      /\b(engineer|sre|developer|manager|lead|principal|staff|analyst|architect|devops|platform)\b/i.test(s);
  
    // If company looks like a title and title looks like a company-ish token, swap for display
    if (looksLikeTitle(company) && !looksLikeTitle(title) && title.length) {
      const tmp = company;
      company = title;
      title = tmp;
    }
  
    return {
      company,
      title,
      start: r?.start_date?.raw || "",
      end: r?.end_date?.raw || ""
    };
}
  
// --- Helpers for normalization ---
export function normalizeWhitespace(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}