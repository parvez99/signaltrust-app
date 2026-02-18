import { json } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
// API Dashboard function
export async function apiDashboard(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const profile = await env.DB.prepare(
      `SELECT role, target_country, current_location,
              profile_completeness, is_searchable, updated_at
       FROM candidate_profiles
       WHERE candidate_id = ?`
    ).bind(sess.candidate_id).first();
  
    return json({
      candidate_id: sess.candidate_id,
      profile: profile || null,
    });
}
/****** Protected /app + /api/me START *******/

export async function apiMe(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const provider =
      sess.github_username ? "github" :
      sess.google_email ? "google" :
      "unknown";
  
    return json({
      candidate_id: sess.candidate_id,
      provider,
      github_username: sess.github_username || null,
      email: sess.email || sess.google_email || null,
      google_name: sess.google_name || null,
    });
}
  
  /****** Protected /app + /api/me END *******/