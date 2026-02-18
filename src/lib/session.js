//# requireSession(), isAdmin(), isRecruiter()
import { parseCookies } from "./http.js";
import { hmacSha256Hex, timingSafeEqualHex } from "./crypto.js";
import { SESSION_COOKIE } from "./constants.js";

export async function requireSession(request, env) {
    const cookies = parseCookies(request.headers.get("Cookie") || "");
    const raw = cookies[SESSION_COOKIE];
    if (!raw) return null;
  
    const [sessionId, sig] = raw.split(".");
    if (!sessionId || !sig) return null;
  
    const expected = await hmacSha256Hex(env.SESSION_SECRET, sessionId);
    if (!timingSafeEqualHex(expected, sig)) return null;
  
    const session = await env.DB.prepare(
      `SELECT s.id, s.candidate_id, s.expires_at, c.github_username, c.email, c.google_email, c.google_name
       FROM sessions s
       JOIN candidates c ON c.id = s.candidate_id
       WHERE s.id = ?`
    ).bind(sessionId).first();
  
    if (!session) return null;
    if (new Date(session.expires_at).getTime() < Date.now()) return null;
  
    return session;
}

export function isAdmin(sess, env) {
    const email = sess.email || sess.google_email;
    if (!email) return false;
  
    const allowed = (env.ADMIN_EMAILS || "")
      .split(",")
      .map(e => e.trim().toLowerCase());
  
    return allowed.includes(email.toLowerCase());
}
  
export function isRecruiter(sess, env) {
    const email = sess.email || sess.google_email;
    if (!email) return false;
  
    const allowed = (env.RECRUITER_EMAILS || "")
      .split(",")
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
  
    return allowed.includes(email.toLowerCase());
}