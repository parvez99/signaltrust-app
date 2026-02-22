import { parseCookies } from "../lib/http.js";
import { SESSION_COOKIE } from "../lib/constants.js";
import { hmacSha256Hex } from "../lib/crypto.js";
import { timingSafeEqualHex } from "../lib/crypto.js";
import { serializeCookie } from "../lib/http.js";
import { getBaseUrl } from "../lib/http.js";
import { upsertCandidate } from "../db/candidates.js";
import { redirect } from "../lib/http.js";
/******* GitHub auth functions : START *********/
export async function githubStart(request, env) {
    const baseUrl = getBaseUrl(request);
    const state = crypto.randomUUID();
  
    // Store short-lived state in a cookie (simple anti-CSRF for OAuth)
    const stateCookie = serializeCookie("oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    });
  
    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", `${baseUrl}/auth/github/callback`);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", "read:user user:email");
  
    return redirect(authUrl.toString(), 302, { "Set-Cookie": stateCookie });
}

export async function githubCallback(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
  
    if (!code || !state) return new Response("Missing code/state", { status: 400 });
  
    // Validate state cookie
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    const expectedState = cookies["oauth_state"];
    if (!expectedState || expectedState !== state) {
      return new Response("Invalid OAuth state", { status: 400 });
    }
  
    const baseUrl = getBaseUrl(request);
  
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${baseUrl}/auth/github/callback`,
        state,
      }),
    });
  
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return new Response(`OAuth token exchange failed`, { status: 400 });
    }
  
    // Fetch user profile
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "SignalTrust AI",
        Accept: "application/vnd.github+json",
      },
    });
    const ghUser = await userRes.json();
  
    const githubId = String(ghUser.id || "");
    const githubUsername = String(ghUser.login || "");
    if (!githubId || !githubUsername) return new Response("GitHub user fetch failed", { status: 400 });
  
    // Fetch primary email (optional; may be private)
    let email = null;
    try {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "SignalTrust AI",
          Accept: "application/vnd.github+json",
        },
      });
      if (emailsRes.ok) {
        const emails = await emailsRes.json();
        const primary = Array.isArray(emails) ? emails.find(e => e.primary) : null;
        email = primary?.email || null;
      }
    } catch {
      // ignore
    }
  
    // Upsert candidate
    const candidateId = await upsertCandidate(env, { githubId, githubUsername, email });
  
    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(); // 14 days
  
    await env.DB.prepare(
      `INSERT INTO sessions (id, candidate_id, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(sessionId, candidateId, expiresAt).run();
  
    // Signed cookie = sessionId.signature
    const sig = await hmacSha256Hex(env.SESSION_SECRET, sessionId);
    const cookieVal = `${sessionId}.${sig}`;
  
    const sessionCookie = serializeCookie(SESSION_COOKIE, cookieVal, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  
    // Clear oauth_state
    const clearState = serializeCookie("oauth_state", "", {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
    });
  
    const headers = new Headers();
    headers.set("Location", "/app");
    headers.append("Set-Cookie", sessionCookie);
    headers.append("Set-Cookie", clearState);
  
    return new Response(null, { status: 302, headers });
}
  /******* GitHub auth functions: END  **********/
  // Logout user 
export async function logout(request, env) {
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    const raw = cookies[SESSION_COOKIE];
  
    // Best-effort: delete session from DB
    if (raw) {
      const [sessionId, sig] = raw.split(".");
      if (sessionId && sig) {
        const expected = await hmacSha256Hex(env.SESSION_SECRET, sessionId);
        if (timingSafeEqualHex(expected, sig)) {
          await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
        }
      }
    }
  
    // Clear cookie (must match path, samesite, secure)
    const clear = serializeCookie(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
    });
  
    return new Response(null, { status: 204, headers: { "Set-Cookie": clear } });
}