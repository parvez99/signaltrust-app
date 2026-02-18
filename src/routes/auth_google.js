import { parseCookies } from "../lib/http.js";
import { hmacSha256Hex } from "../lib/crypto.js";
import { serializeCookie } from "../lib/http.js";
import { getBaseUrl } from "../lib/http.js";
import { upsertCandidateGoogle } from "../db/candidates.js";
import { redirect } from "../lib/http.js";
import { SESSION_COOKIE } from "../lib/constants.js";
export async function googleStart(request, env) {
    const baseUrl = getBaseUrl(request);
    const state = crypto.randomUUID();
  
    const stateCookie = serializeCookie("oauth_state_google", state, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 10 * 60,
    });
  
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", `${baseUrl}/auth/google/callback`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("access_type", "online");
    authUrl.searchParams.set("prompt", "select_account");
  
    return redirect(authUrl.toString(), 302, { "Set-Cookie": stateCookie });
}
  
export async function googleCallback(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
  
    if (!code || !state) return new Response("Missing code/state", { status: 400 });
  
    // Validate state cookie
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    const expectedState = cookies["oauth_state_google"];
    if (!expectedState || expectedState !== state) {
      return new Response("Invalid OAuth state", { status: 400 });
    }
  
    const baseUrl = getBaseUrl(request);
  
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${baseUrl}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
  
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return new Response("Google token exchange failed", { status: 400 });
    }
  
    // Fetch user info (safe + simple; avoids JWT verification for now)
    const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  
    if (!userRes.ok) {
      return new Response("Google userinfo failed", { status: 400 });
    }
  
    const gu = await userRes.json();
    const googleId = String(gu.sub || "");
    const email = gu.email ? String(gu.email) : null;
    const name = gu.name ? String(gu.name) : null;
  
    if (!googleId) return new Response("Google user invalid", { status: 400 });
  
    // Upsert candidate
    const candidateId = await upsertCandidateGoogle(env, { googleId, email, name });
  
    // Create session (same as GitHub)
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  
    await env.DB.prepare(
      `INSERT INTO sessions (id, candidate_id, expires_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(sessionId, candidateId, expiresAt).run();
  
    const sig = await hmacSha256Hex(env.SESSION_SECRET, sessionId);
    const cookieVal = `${sessionId}.${sig}`;
  
    const sessionCookie = serializeCookie(SESSION_COOKIE, cookieVal, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
  
    const clearState = serializeCookie("oauth_state_google", "", {
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