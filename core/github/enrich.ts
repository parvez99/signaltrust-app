// core/github/enrich.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

import { extractClaimKeywords } from "./extract";

export type GithubPublicEnrichment = {
  github_login: string;
  account_created_at: string | null;
  public_repos: number | null;
  followers: number | null;
  top_languages: Array<{ language: string; repo_count: number }>;
  keyword_hits: Record<string, number>; // keyword -> count in repo name/description
  last_activity_at: string | null;
  activity_score: number; // 0..100
  claimed_keywords: string[]; // derived from resume text
};

type FetchOpts = { token?: string | null };

async function ghFetchJson(url: string, opts: FetchOpts): Promise<any> {
  const headers: Record<string, string> = {
    "User-Agent": "signaltrust",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`GITHUB_PUBLIC_API_${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function daysBetween(aIso: string, bIso: string) {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

export async function enrichGithubPublic(args: {
  username: string;
  token?: string | null;
  resumeText?: string | null;
}): Promise<{ enrichment: GithubPublicEnrichment; raw: any }> {
  const username = String(args.username || "").trim();
  if (!username) throw new Error("GITHUB_USERNAME_MISSING");

  const token = args.token || null;
  const resumeText = args.resumeText || "";

  const user = await ghFetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`, { token });
  const repos = await ghFetchJson(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
    { token }
  );

  const reposArr: any[] = Array.isArray(repos) ? repos : [];

  // last activity = latest pushed_at
  let lastActivity: string | null = null;
  for (const r of reposArr) {
    const pushed = typeof r?.pushed_at === "string" ? r.pushed_at : null;
    if (!pushed) continue;
    if (!lastActivity || Date.parse(pushed) > Date.parse(lastActivity)) lastActivity = pushed;
  }

  // language distribution (by repo count)
  const langCount = new Map<string, number>();
  for (const r of reposArr) {
    const lang = typeof r?.language === "string" ? r.language.trim() : "";
    if (!lang) continue;
    langCount.set(lang, (langCount.get(lang) || 0) + 1);
  }
  const top_languages = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([language, repo_count]) => ({ language, repo_count }));

  // keyword hits in repo name/description (cheap heuristic)
  const keywords = [
    "kubernetes", "k8s", "helm", "terraform", "aws", "eks",
    "prometheus", "grafana", "operator", "devops", "sre", "observability",
  ];

  const keyword_hits: Record<string, number> = {};
  for (const k of keywords) keyword_hits[k] = 0;

  for (const r of reposArr) {
    const blob = `${r?.name || ""} ${r?.description || ""}`.toLowerCase();
    for (const k of keywords) {
      if (blob.includes(k)) keyword_hits[k] += 1;
    }
  }

  // activity_score: simple + stable
  const nowIso = new Date().toISOString();
  const createdAt = typeof user?.created_at === "string" ? user.created_at : null;

  const accountAgeDays = createdAt ? daysBetween(createdAt, nowIso) : null;
  const ageScore = accountAgeDays == null ? 0 : clamp(Math.floor(accountAgeDays / 365) * 6, 0, 30);

  const recencyDays = lastActivity ? daysBetween(lastActivity, nowIso) : null;
  let recencyScore = 0;
  if (recencyDays != null) {
    if (recencyDays <= 14) recencyScore = 40;
    else if (recencyDays <= 30) recencyScore = 32;
    else if (recencyDays <= 90) recencyScore = 22;
    else if (recencyDays <= 180) recencyScore = 12;
    else recencyScore = 4;
  }

  const repoN = typeof user?.public_repos === "number" ? user.public_repos : 0;
  const followersN = typeof user?.followers === "number" ? user.followers : 0;
  const volumeScore = clamp(Math.floor(repoN / 10) * 6 + Math.floor(followersN / 25) * 4, 0, 30);

  const activity_score = clamp(ageScore + recencyScore + volumeScore, 0, 100);

  const enrichment: GithubPublicEnrichment = {
    github_login: String(user?.login || username),
    account_created_at: createdAt,
    public_repos: typeof user?.public_repos === "number" ? user.public_repos : null,
    followers: typeof user?.followers === "number" ? user.followers : null,
    top_languages,
    keyword_hits,
    last_activity_at: lastActivity,
    activity_score,
    claimed_keywords: extractClaimKeywords(resumeText),
  };

  const raw = { user, repos: reposArr.slice(0, 100) };
  return { enrichment, raw };
}