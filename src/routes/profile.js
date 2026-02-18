import { requireSession } from "../lib/session.js";
import { escapeHtml } from "../lib/http.js"
import { pageShell } from "../lib/ui.js";
import { json, redirect } from "../lib/http.js"

export async function renderProfilePage(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    const profile = await env.DB.prepare(
      `SELECT role, target_country, current_location, visa_status, needs_sponsorship, profile_completeness, is_searchable
       FROM candidate_profiles WHERE candidate_id = ?`
    ).bind(sess.candidate_id).first();
  
    const p = profile || {};
    const needs = (p.needs_sponsorship ?? 0) ? "checked" : "";
    const html = pageShell({
      title: "NextOffer — Profile",
      rightPill: "Candidate • Profile",
      body: `
        <div class="row" style="margin-top:14px;">
          <a class="btn btn-ghost" href="/app">← Back to App</a>
          <span class="spacer"></span>
          <a class="btn" href="/waitlist">Waitlist count</a>
        </div>
    
        <div class="card">
          <div class="fine">Candidate Profile (v0)</div>
          <h2 style="margin:8px 0 0;">Complete your hire-ready profile</h2>
          <div class="fine" style="margin-top:6px;">
            This becomes searchable once it’s complete enough (tech-first for now).
          </div>
    
          <form id="pf" style="margin-top:14px;">
            <div class="grid2">
              <div>
                <label class="label">Role</label>
                <select class="input" name="role" required>
                  <option value="">Select…</option>
                  ${renderOption("SRE / Platform", p.role)}
                  ${renderOption("Backend", p.role)}
                  ${renderOption("Frontend", p.role)}
                  ${renderOption("DevOps", p.role)}
                  ${renderOption("Data", p.role)}
                  ${renderOption("Other", p.role)}
                </select>
              </div>
    
              <div>
                <label class="label">Target country</label>
                <select class="input" name="target_country" required>
                  <option value="">Select…</option>
                  ${renderOption("EU", p.target_country)}
                  ${renderOption("UK", p.target_country)}
                  ${renderOption("UAE", p.target_country)}
                  ${renderOption("Canada", p.target_country)}
                  ${renderOption("USA", p.target_country)}
                  ${renderOption("Other", p.target_country)}
                </select>
              </div>
            </div>
    
            <label class="label" style="margin-top:12px;">Current location</label>
            <input class="input" name="current_location" value="${escapeHtml(p.current_location || "")}"
                   placeholder="Pune / Dublin / Dubai…" />
    
            <label class="label" style="margin-top:12px;">Visa status</label>
            <select class="input" name="visa_status">
              <option value="">Select…</option>
              ${renderOption("Citizen / PR", p.visa_status)}
              ${renderOption("Work visa", p.visa_status)}
              ${renderOption("Student / Graduate", p.visa_status)}
              ${renderOption("Dependent", p.visa_status)}
              ${renderOption("Other", p.visa_status)}
            </select>
    
            <div class="row" style="margin-top:12px; align-items:center;">
              <input type="checkbox" id="needs" name="needs_sponsorship" ${needs}
                     style="width:18px;height:18px; accent-color: var(--sea);" />
              <label for="needs" class="fine" style="margin:0;">
                Needs sponsorship (if relocating)
              </label>
            </div>
    
            <div class="row" style="margin-top:14px;">
              <button class="btn btn-primary" type="submit">Save profile</button>
              <a class="btn" href="/app">Back</a>
            </div>
    
            <div id="msg" style="margin-top:10px;"></div>
    
            <div class="row" style="margin-top:12px; gap:10px; flex-wrap:wrap;">
              <span class="pill">Completeness: <b id="comp">${Number(p.profile_completeness || 0)}</b>%</span>
              <span class="pill">Searchable: <b id="searchable">${(p.is_searchable || 0) ? "Yes" : "No"}</b></span>
            </div>
    
            <div class="fine" style="margin-top:10px;">
              Tip: the “Completeness” preview updates live, and becomes real after Save.
            </div>
          </form>
        </div>
    
    <script>
      const form = document.getElementById('pf');
      const msg = document.getElementById('msg');
    
      function computePreview() {
        const role = form.querySelector('[name="role"]').value.trim();
        const target = form.querySelector('[name="target_country"]').value.trim();
        const loc = form.querySelector('[name="current_location"]').value.trim();
        const visa = form.querySelector('[name="visa_status"]').value.trim();
    
        let score = 0;
        if (role) score += 25;
        if (target) score += 25;
        if (loc) score += 15;
        if (visa) score += 25;
        score += 10; // sponsorship answered (checkbox yields 0/1)
    
        document.getElementById('comp').textContent = score;
        document.getElementById('searchable').textContent = (score >= 70) ? "Yes (after save)" : "No";
      }
    
      async function readJson(res) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) return await res.json();
        return { error: await res.text() };
      }
    
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        msg.textContent = '';
    
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        payload.needs_sponsorship = document.getElementById('needs').checked ? 1 : 0;
    
        try {
          const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
    
          const data = await readJson(res);
          if (!res.ok) throw new Error(data?.error || "Something went wrong");
    
          document.getElementById('comp').textContent = data.profile_completeness;
          document.getElementById('searchable').textContent = data.is_searchable ? "Yes" : "No";
    
          msg.className = 'ok';
          msg.textContent = '✅ Saved.';
          setTimeout(() => { msg.textContent = ''; }, 1200);
        } catch (err) {
          msg.className = 'err';
          msg.textContent = '❌ ' + err.message;
        }
      });
    
      computePreview();
      form.addEventListener('input', computePreview);
      form.addEventListener('change', computePreview);
    </script>
    `
    });
    
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}

export async function apiGetProfile(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const p = await env.DB.prepare(
      `SELECT role, target_country, current_location, visa_status, needs_sponsorship, profile_completeness, is_searchable
       FROM candidate_profiles WHERE candidate_id = ?`
    ).bind(sess.candidate_id).first();
  
    return json({ profile: p || null });
}

export async function apiUpsertProfile(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  
    const role = (body.role || "").toString().trim();
    const targetCountry = (body.target_country || "").toString().trim();
    const currentLocation = (body.current_location || "").toString().trim();
    const visaStatus = (body.visa_status || "").toString().trim();
    const needsSponsorship = body.needs_sponsorship ? 1 : 0;
    const searchText = (
      role + " " + targetCountry + " " + currentLocation + " " + visaStatus
    ).toLowerCase();
    
  
    if (!role || !targetCountry) {
      return json({ error: "Role and target country are required." }, 400);
    }
  
    const completeness = computeProfileCompleteness({
      role,
      targetCountry,
      currentLocation,
      visaStatus,
      needsSponsorship,
    });
  
    // Do NOT auto-enable
    // Only auto-disable if they fall below threshold
    let isSearchable = 0;
  
    const existing = await env.DB.prepare(
      "SELECT is_searchable FROM candidate_profiles WHERE candidate_id = ?"
    ).bind(sess.candidate_id).first();
  
    if (existing?.is_searchable && completeness >= 70) {
      isSearchable = 1;
    }
    const now = new Date().toISOString();
  
    await env.DB.prepare(
      `INSERT INTO candidate_profiles
        (candidate_id, role, target_country, current_location, visa_status, needs_sponsorship,
         profile_completeness, is_searchable, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(candidate_id) DO UPDATE SET
         role=excluded.role,
         target_country=excluded.target_country,
         current_location=excluded.current_location,
         visa_status=excluded.visa_status,
         needs_sponsorship=excluded.needs_sponsorship,
         profile_completeness=excluded.profile_completeness,
         is_searchable=excluded.is_searchable,
         updated_at=excluded.updated_at`
    ).bind(
      sess.candidate_id,
      role,
      targetCountry,
      currentLocation,
      visaStatus,
      needsSponsorship,
      completeness,
      isSearchable,
      now,
      now
    ).run();
  
    return json({ ok: true, profile_completeness: completeness, is_searchable: isSearchable });
}

// Toggle for being searchable 
export async function apiToggleSearchable(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    let body = {};
    try { body = await request.json(); } catch {}
  
    const desired = (body && body.is_searchable === 0) ? 0 : 1;
  
    const profile = await env.DB.prepare(
      "SELECT profile_completeness FROM candidate_profiles WHERE candidate_id = ?"
    ).bind(sess.candidate_id).first();
  
    if (!profile) return json({ error: "Profile not found" }, 400);
  
    if (desired === 1 && profile.profile_completeness < 70) {
      return json({ error: "Profile not complete enough" }, 409);
    }
  
    await env.DB.prepare(
      "UPDATE candidate_profiles SET is_searchable = ?, updated_at = ? WHERE candidate_id = ?"
    ).bind(desired, new Date().toISOString(), sess.candidate_id).run();
  
    return json({ ok: true, is_searchable: desired });
}

/****** Profile flow page START *******/

export function renderOption(val, selected) {
    const sel = (val === selected) ? "selected" : "";
    return `<option ${sel}>${val}</option>`;
  }
  
  /****** Profile flow page END *******/
  
  /****** Profile flow API START *******/
  
export function computeProfileCompleteness(p) {
    // Simple, explainable v0 scoring (Postgres-friendly)
    // Total = 100
    let score = 0;
    if (p.role) score += 25;
    if (p.targetCountry) score += 25;
    if (p.currentLocation) score += 15;
    if (p.visaStatus) score += 25;
    // Needs sponsorship isn’t “good or bad”, but it is useful info
    score += 10; // always count it as “answered” (since checkbox always yields 0/1)
    return Math.max(0, Math.min(100, score));
}
  
  
  /****** Profile flow API END *******/
  