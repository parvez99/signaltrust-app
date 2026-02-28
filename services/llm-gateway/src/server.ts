import express, { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { runTrustPipeline } from "../../../src/engine/run_trust_pipeline";

type Env = { OPENAI_API_KEY: string };

// ---- Config ----
// For MVP: store tenant keys in env as comma-separated pairs:
// TENANT_KEYS="acme=st_live_xxx,globex=st_live_yyy"
function parseTenantKeys(raw: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!raw) return m;
  for (const part of raw.split(",").map(s => s.trim()).filter(Boolean)) {
    const [tenantId, key] = part.split("=").map(s => s?.trim());
    if (tenantId && key) m.set(key, tenantId); // key -> tenantId (fast lookup)
  }
  return m;
}

const TENANT_KEY_TO_ID = parseTenantKeys(process.env.TENANT_KEYS);
const AUTH_DISABLED = (process.env.AUTH_DISABLED || "").toLowerCase() === "true";

// Simple in-memory token bucket per tenant (good enough for MVP).
// Later: replace with Redis / API Gateway / Cloudflare / Envoy rate limiting.
type Bucket = { tokens: number; lastRefillMs: number };
const buckets = new Map<string, Bucket>();

const RATE_LIMIT_RPS = Number(process.env.RATE_LIMIT_RPS || 1); // 1 req/sec default
const RATE_LIMIT_BURST = Number(process.env.RATE_LIMIT_BURST || 5); // burst 5

function allowRequest(tenantId: string): boolean {
  const now = Date.now();
  const key = tenantId || "anonymous";
  const b = buckets.get(key) ?? { tokens: RATE_LIMIT_BURST, lastRefillMs: now };

  const elapsedSec = (now - b.lastRefillMs) / 1000;
  const refill = elapsedSec * RATE_LIMIT_RPS;
  b.tokens = Math.min(RATE_LIMIT_BURST, b.tokens + refill);
  b.lastRefillMs = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

function getBearerToken(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// ---- App ----
const app = express();
app.use(express.json({ limit: "6mb" }));

// Request ID + basic logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header("x-request-id") || crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

app.get("/healthz", (_req: Request, res: Response) => res.status(200).send("ok"));

// Auth + Rate limit middleware (applies to v1)
app.use("/v1", (req: Request, res: Response, next: NextFunction) => {
  if (AUTH_DISABLED) {
    (req as any).tenantId = "auth_disabled";
    return next();
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "missing_authorization_bearer_token" });
  }

  const tenantId = TENANT_KEY_TO_ID.get(token);
  if (!tenantId) {
    return res.status(403).json({ error: "invalid_api_key" });
  }

  // Rate limit per tenant
  if (!allowRequest(tenantId)) {
    res.setHeader("Retry-After", "1");
    return res.status(429).json({ error: "rate_limited" });
  }

  (req as any).tenantId = tenantId;
  next();
});

app.post("/v1/evaluate", async (req: Request, res: Response) => {
  const requestId = (req as any).requestId as string;
  const tenantId = (req as any).tenantId as string | undefined;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY missing" });

    const resumeText = req.body?.resume_text;
    if (!resumeText || typeof resumeText !== "string") {
      return res.status(400).json({ error: "resume_text is required" });
    }

    const candidateId =
      (typeof req.body?.candidate_id === "string" && req.body.candidate_id.trim()) ||
      crypto.randomUUID();

    const sourceFilename =
      (typeof req.body?.source_filename === "string" && req.body.source_filename.trim()) || null;

    const now = new Date().toISOString();

    console.log(
      JSON.stringify({
        msg: "evaluate_start",
        requestId,
        tenantId,
        candidateId,
        sourceFilename,
        resumeBytes: Buffer.byteLength(resumeText, "utf8"),
        ts: now,
      })
    );

    const out = await runTrustPipeline({
      candidateId,
      sourceText: resumeText,
      sourceFilename,
      now,
      env: { OPENAI_API_KEY: apiKey } as Env,
    });

    console.log(
      JSON.stringify({
        msg: "evaluate_done",
        requestId,
        tenantId,
        candidateId,
        engineVersion: out.engineVersion,
        extractionSource: out.extractionSource,
        bucket: out.scoring?.bucket,
        trustScore: out.scoring?.trust_score,
        llmLatencyMs: out.llm?.latencyMs,
        tokensTotal: out.llm?.usage?.totalTokens,
        ts: new Date().toISOString(),
      })
    );

    return res.json({
      ok: true,
      requestId,
      tenantId,
      candidateId,
      engineVersion: out.engineVersion,
      extractionSource: out.extractionSource,
      extractionError: out.extractionError,
    
      llm: out.llm,
      scoring: out.scoring,
      triggeredSignals: out.triggeredSignals,
    
      // ✅ Backward compatible "profile"
      // Prefer deterministic (stable) shape; fallback to LLM normalized; then legacy.
      profile: out.deterministicProfile ?? out.llmNormalizedProfile ?? out.llmLegacyProfile ?? null,
    
      // ✅ Optional: expose both explicitly (nice for debugging / future clients)
      deterministicProfile: out.deterministicProfile ?? null,
      llmNormalizedProfile: out.llmNormalizedProfile ?? null,
      llmLegacyProfile: out.llmLegacyProfile ?? null,
    });
  } catch (e: any) {
    console.error(
      JSON.stringify({
        msg: "evaluate_error",
        requestId,
        tenantId,
        err: e?.message || "internal_error",
        ts: new Date().toISOString(),
      })
    );
    return res.status(500).json({ error: e?.message || "internal_error", requestId });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`llm-gateway listening on ${port}`));