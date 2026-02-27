// core/github/extract.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Extract a GitHub username from free-form resume text.
 * We keep this intentionally conservative to avoid false positives.
 */
export function extractGithubUsername(text: string): string | null {
    const t = String(text || "");
    if (!t.trim()) return null;
  
    // 1) URL forms: github.com/<user> or github.com/<user>/...
    //    Exclude obvious non-user prefixes.
    const urlRe = /github\.com\s*\/?\s*([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)/gi;
    const deny = new Set(["topics", "orgs", "organizations", "apps", "marketplace", "features", "pricing", "about", "collections", "login", "signup", "settings"]);
  
    let m: RegExpExecArray | null = null;
    while ((m = urlRe.exec(t)) !== null) {
      const u = (m[1] || "").trim();
      if (!u) continue;
      if (deny.has(u.toLowerCase())) continue;
      return u;
    }
  
    // 2) Label forms: "GitHub: username" / "Github - username"
    const labelRe = /\bgithub\b\s*[:\-]\s*([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\b/i;
    const lm = t.match(labelRe);
    if (lm && lm[1]) return lm[1].trim();
  
    return null;
  }
  
  /**
   * Very simple keyword claim extractor for plausibility matching.
   * This is NOT a verifier — just weak evidence used for scoring.
   */
  export function extractClaimKeywords(text: string): string[] {
    const t = String(text || "").toLowerCase();
    const keywords = [
      "kubernetes", "k8s", "helm", "terraform",
      "aws", "eks", "gcp", "azure",
      "prometheus", "grafana",
      "go", "golang", "python",
      "node", "typescript", "react",
    ];
  
    const out: string[] = [];
    for (const k of keywords) {
      if (t.includes(k)) out.push(k);
    }
    return [...new Set(out)];
  }