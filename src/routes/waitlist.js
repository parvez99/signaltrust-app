
import { json } from "../lib/http.js"

export async function handleWaitlist(request, env) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  
    const email = (body.email || "").toString().trim().toLowerCase();
    const role = (body.role || "").toString().trim();
    const targetCountry = (body.target_country || "").toString().trim();
    const currentLocation = (body.current_location || "").toString().trim();
    const honeypot = (body.company || "").toString().trim();
  
    if (honeypot) return json({ ok: true }, 200); // silently accept bot traffic
  
    if (!email || !email.includes("@") || email.length > 200) {
      return json({ error: "Please enter a valid email." }, 400);
    }
    if (!role || !targetCountry) {
      return json({ error: "Please select role and target country." }, 400);
    }
  
    // Store in D1
    await env.DB.prepare(
      `INSERT INTO waitlist (email, role, target_country, current_location, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         role=excluded.role,
         target_country=excluded.target_country,
         current_location=excluded.current_location`
    ).bind(email, role, targetCountry, currentLocation).run();
    
    // event trail on successful signup
    try {
      const emailDomain = email.split("@")[1] || "";
      await env.DB.prepare(
        "INSERT INTO events (event_name, role, target_country, email_domain, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind("waitlist_signup", role, targetCountry, emailDomain).run();
    } catch (e) {
      // don’t fail signup if analytics insert fails
      console.warn("events_insert_failed", e?.message || e);
    }
  
  
    return json({ ok: true }, 200);
}
export async function handleWaitlistCount(env) {
    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM waitlist;").first();
    return json({ count: row?.count ?? 0 }, 200);
}