import { json } from "../lib/http.js";
import { requireSession } from "../lib/session.js";
import { escapeHtml } from "../lib/http.js"
import { pageShell } from "../lib/ui.js";
import { isRecruiter } from "../lib/session.js";
import { SESSION_COOKIE } from "../lib/constants.js";
import { isAdmin } from "../lib/session.js";

export async function apiRecruiterCandidates(request, env) {
    const sess = await requireSession(request, env);
    if (!sess || !(isRecruiter(sess, env) || isAdmin(sess, env))) {
      return json({ error: "forbidden" }, 403);
    }
  
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") || "").toLowerCase();
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(url.searchParams.get("page_size") || "20", 10), 50);
    const offset = (page - 1) * pageSize;
  
    let sql = `
      SELECT c.id,
             c.github_username, c.google_name,
             p.role, p.target_country, p.current_location,
             p.visa_status, p.needs_sponsorship,
             p.profile_completeness, p.updated_at
      FROM candidate_profiles p
      JOIN candidates c ON c.id = p.candidate_id
      WHERE p.is_searchable = 1
    `;
  
    const binds = [];
  
    if (query) {
      sql += ` AND (
        lower(p.role) LIKE ? OR
        lower(p.target_country) LIKE ? OR
        lower(p.current_location) LIKE ? OR
        lower(coalesce(p.visa_status,'')) LIKE ?
      )`;
      const like = `%${query}%`;
      binds.push(like, like, like, like);
    }
  
    sql += ` ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`;
    binds.push(pageSize, offset);
  
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
  
    const items = (results || []).map(r => ({
      id: r.id,
      name: r.google_name || r.github_username || "Candidate",
      role: r.role || "",
      target_country: r.target_country || "",
      current_location: r.current_location || "",
      visa_status: r.visa_status || "",
      needs_sponsorship: r.needs_sponsorship ? 1 : 0,
      profile_completeness: r.profile_completeness || 0,
      updated_at: r.updated_at || null,
      preview_url: `/c/${r.id}`,
    }));
  
    return json({ page, page_size: pageSize, items });
}
//Recruiter UI page /r/search
export async function renderRecruiterSearch(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const who = escapeHtml(sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter");
  
    const html = pageShell({
      title: "NextOffer — Recruiter Search",
      rightPill: `Recruiter • ${who}`,
      body: `
        <div class="row" style="margin-top:14px;">
          <a class="btn btn-ghost" href="/">← Home</a>
          <span class="spacer"></span>
          <a class="btn" href="/r/requests">My requests</a>
          <a class="btn" href="/app">Dashboard</a>
          <button class="btn btn-ghost" id="logout" type="button">Logout</button>
        </div>
  
        <div class="card" style="margin-top:14px;">
          <h2 style="margin:0 0 6px;">Search candidates</h2>
          <div class="fine">Search by role, target country, location, visa status.</div>
  
          <div class="divider"></div>
  
          <div class="row" style="align-items:stretch;">
            <input class="input" id="q" placeholder="e.g. sre uae, backend dublin, devops eu..." />
            <button class="btn btn-primary" id="go" type="button">Search</button>
          </div>
  
          <div id="meta" class="fine" style="margin-top:10px;"></div>
  
          <div style="overflow:auto; margin-top:12px;">
            <table style="width:100%; border-collapse:collapse; min-width:900px;">
              <thead>
                <tr>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Candidate</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Role</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Target</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Location</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Visa</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Sponsor</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">%</th>
                </tr>
              </thead>
              <tbody id="tbody">
                <tr>
                  <td colspan="7" style="padding:10px 8px; border-bottom:1px solid var(--border); color:var(--muted);">
                    Type a query and click Search.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
  
        <script>
          const q = document.getElementById('q');
          const go = document.getElementById('go');
          const tbody = document.getElementById('tbody');
          const meta = document.getElementById('meta');
  
          function escapeHtmlClient(s) {
            return String(s || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }
  
          async function readJson(res) {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) return await res.json();
            return { error: await res.text() };
          }
  
          function setLoading(on) {
            if (on) {
              meta.textContent = 'Loading…';
              tbody.innerHTML = '<tr><td colspan="7" style="padding:10px 8px; color:var(--muted);">Loading…</td></tr>';
              go.disabled = true;
            } else {
              go.disabled = false;
            }
          }
  
          async function run() {
            const query = (q.value || '').trim();
            setLoading(true);
  
            try {
              const res = await fetch('/api/recruiter/candidates?query=' + encodeURIComponent(query) + '&page=1&page_size=20');
              const data = await readJson(res);
  
              if (!res.ok) {
                meta.textContent = 'Error: ' + (data.error || 'request failed');
                tbody.innerHTML = '<tr><td colspan="7" style="padding:10px 8px; color:var(--muted);">No data.</td></tr>';
                return;
              }
  
              const items = data.items || [];
              meta.textContent = 'Showing ' + items.length + ' candidates';
  
              const rows = items.map(x => {
                const sponsor = x.needs_sponsorship ? 'Yes' : 'No';
                return (
                  '<tr>' +
                    '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' +
                      '<a href="' + escapeHtmlClient(x.preview_url) + '" target="_blank" rel="noopener noreferrer">' +
                        escapeHtmlClient(x.name) +
                      '</a>' +
                    '</td>' +
                    '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + escapeHtmlClient(x.role) + '</td>' +
                    '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + escapeHtmlClient(x.target_country) + '</td>' +
                    '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + escapeHtmlClient(x.current_location) + '</td>' +
                    '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + escapeHtmlClient(x.visa_status) + '</td>' +
                    '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + escapeHtmlClient(sponsor) + '</td>' +
                    '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + escapeHtmlClient(String(x.profile_completeness || 0)) + '</td>' +
                  '</tr>'
                );
              }).join('');
  
              tbody.innerHTML = rows || '<tr><td colspan="7" style="padding:10px 8px; color:var(--muted);">No matches.</td></tr>';
            } finally {
              setLoading(false);
            }
          }
  
          go.addEventListener('click', run);
          q.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  
          document.getElementById('logout').addEventListener('click', async () => {
            await fetch('/auth/logout', { method: 'POST' });
            window.location.replace('/');
          });
        </script>
      `
    });
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}
// Recruiter UI page /r/requests
/* 
A real “My Requests” page (/r/requests) that shows:

candidate name + preview link

status (pending/approved/rejected)

contact email only when approved (already supported by your /api/recruiter/intro-requests)

a tiny refresh + nice UI
*/
export async function renderRecruiterRequests(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const who = escapeHtml(sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter");
  
    const html = pageShell({
      title: "NextOffer — My Intro Requests",
      rightPill: `Recruiter • ${who}`,
      body: `
        <div class="row" style="margin-top:14px;">
          <a class="btn btn-ghost" href="/">← Home</a>
          <span class="spacer"></span>
          <a class="btn" href="/r/search">Search</a>
          <a class="btn" href="/app">Dashboard</a>
          <button class="btn" id="refresh" type="button">Refresh</button>
          <button class="btn btn-ghost" id="logout" type="button">Logout</button>
        </div>
  
        <div class="card" style="margin-top:14px;">
          <h2 style="margin:0 0 6px;">My intro requests</h2>
          <div class="fine">Approved requests reveal contact email. Pending waits for candidate decision.</div>
  
          <div class="divider"></div>
  
          <div id="meta" class="fine">Loading…</div>
  
          <div style="overflow:auto; margin-top:12px;">
            <table style="width:100%; border-collapse:collapse; min-width:980px;">
              <thead>
                <tr>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Candidate</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Status</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Requested</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Message</th>
                  <th style="text-align:left; font-size:12px; color:var(--muted); padding:10px 8px; border-bottom:1px solid var(--border);">Contact (approved only)</th>
                </tr>
              </thead>
              <tbody id="tbody">
                <tr>
                  <td colspan="5" style="padding:10px 8px; border-bottom:1px solid var(--border); color:var(--muted);">
                    Loading…
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
  
        <script>
          const meta = document.getElementById('meta');
          const tbody = document.getElementById('tbody');
  
          function esc(s) {
            return String(s || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }
  
          function tag(status) {
            const st = String(status || "unknown");
            const map = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
            const label = map[st] || st;
            const pillBg =
              st === "approved" ? "rgba(12,122,75,.10)" :
              st === "rejected" ? "rgba(180,35,24,.10)" :
              "rgba(11,18,32,.06)";
            const pillBd =
              st === "approved" ? "rgba(12,122,75,.25)" :
              st === "rejected" ? "rgba(180,35,24,.25)" :
              "var(--border)";
            const pillInk =
              st === "approved" ? "#0c7a4b" :
              st === "rejected" ? "#b42318" :
              "var(--muted)";
  
            return (
              '<span style="display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px;' +
                'border:1px solid ' + pillBd + '; background:' + pillBg + '; color:' + pillInk + '; font-size:12px; font-weight:700;">' +
                esc(label) +
              '</span>'
            );
          }
  
          async function readJson(res) {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) return await res.json();
            return { error: await res.text() };
          }
  
          function setLoading(on) {
            if (on) {
              meta.textContent = "Loading…";
              tbody.innerHTML = '<tr><td colspan="5" style="padding:10px 8px; color:var(--muted);">Loading…</td></tr>';
            }
          }
  
          async function load() {
            setLoading(true);
  
            const res = await fetch('/api/recruiter/intro-requests');
            const data = await readJson(res);
  
            if (!res.ok) {
              meta.textContent = "Error: " + (data.error || "request failed");
              tbody.innerHTML = '<tr><td colspan="5" style="padding:10px 8px; color:var(--muted);">No data.</td></tr>';
              return;
            }
  
            const items = data.items || [];
            meta.textContent = "Showing " + items.length + " requests";
  
            if (!items.length) {
              tbody.innerHTML = '<tr><td colspan="5" style="padding:10px 8px; color:var(--muted);">No requests yet.</td></tr>';
              return;
            }
  
            tbody.innerHTML = items.map(x => {
              const contact = x.contact_email
                ? '<code style="background:rgba(11,18,32,.06); padding:4px 8px; border-radius:10px; border:1px solid var(--border);">' + esc(x.contact_email) + '</code>'
                : '<span class="fine">Hidden</span>';
  
              const msg = x.message ? esc(x.message) : '<span class="fine">—</span>';
              const name = esc(x.candidate_name || "Candidate");
  
              return (
                '<tr>' +
                  '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' +
                    '<a href="' + esc(x.preview_url) + '" target="_blank" rel="noopener noreferrer">' + name + '</a>' +
                  '</td>' +
                  '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + tag(x.status) + '</td>' +
                  '<td style="padding:10px 8px; border-bottom:1px solid var(--border); color:var(--muted); font-size:12px;">' + esc(x.created_at || "") + '</td>' +
                  '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + msg + '</td>' +
                  '<td style="padding:10px 8px; border-bottom:1px solid var(--border);">' + contact + '</td>' +
                '</tr>'
              );
            }).join('');
          }
  
          document.getElementById('refresh').addEventListener('click', load);
  
          document.getElementById('logout').addEventListener('click', async () => {
            await fetch('/auth/logout', { method: 'POST' });
            window.location.replace('/');
          });
  
          load();
        </script>
      `
    });
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}
  
  //Recruiter API: create intro request
export async function apiRecruiterCreateIntroRequest(request, env) {
    const sess = await requireSession(request, env);
    if (!sess || !(isRecruiter(sess, env) || isAdmin(sess, env))) {
      return json({ error: "forbidden" }, 403);
    }
  
    let body = {};
    try { body = await request.json(); } catch {}
    const candidateId = (body.candidate_id || "").toString().trim();
    const message = (body.message || "").toString().trim().slice(0, 500);
  
    if (!candidateId) return json({ error: "candidate_id required" }, 400);
  
    // Candidate must be searchable
    const ok = await env.DB.prepare(
      "SELECT is_searchable FROM candidate_profiles WHERE candidate_id = ?"
    ).bind(candidateId).first();
    if (!ok?.is_searchable) return json({ error: "candidate not searchable" }, 404);
  
    const recruiterEmail = (sess.email || sess.google_email || "").toLowerCase();
    if (!recruiterEmail) return json({ error: "recruiter email missing" }, 400);
  
    // De-dupe: only one pending per recruiter+candidate
    const existing = await env.DB.prepare(
      `SELECT id, status FROM intro_requests
       WHERE candidate_id = ? AND recruiter_email = ?
       ORDER BY created_at DESC LIMIT 1`
    ).bind(candidateId, recruiterEmail).first();
  
    if (existing?.status === "pending") {
      return json({ ok: true, id: existing.id, status: "pending" }, 200);
    }
  
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
  
    await env.DB.prepare(
      `INSERT INTO intro_requests (id, candidate_id, recruiter_email, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(id, candidateId, recruiterEmail, message || null, now, now).run();
  
    return json({ ok: true, id, status: "pending" }, 200);
}

export async function apiRecruiterIntroRequests(request, env) {
    const sess = await requireSession(request, env);
    if (!sess || !(isRecruiter(sess, env) || isAdmin(sess, env))) {
      return json({ error: "forbidden" }, 403);
    }
  
    const recruiterEmail = (sess.email || sess.google_email || "").toLowerCase();
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.candidate_id, r.message, r.status, r.created_at,
              c.github_username, c.google_name,
              c.email, c.google_email
       FROM intro_requests r
       JOIN candidates c ON c.id = r.candidate_id
       WHERE r.recruiter_email = ?
       ORDER BY r.created_at DESC
       LIMIT 50`
    ).bind(recruiterEmail).all();
  
    const items = (results || []).map(x => ({
      id: x.id,
      candidate_id: x.candidate_id,
      candidate_name: x.google_name || x.github_username || "Candidate",
      status: x.status,
      created_at: x.created_at,
      message: x.message || "",
      preview_url: `/c/${x.candidate_id}`,
      // Only reveal contact after approval
      contact_email: x.status === "approved" ? (x.email || x.google_email || null) : null,
    }));
  
    return json({ items });
}

//one tiny API helper: GET /api/recruiter/intro-request/status?candidate_id=...
export async function apiRecruiterIntroRequestStatus(request, env) {
    const sess = await requireSession(request, env);
    if (!sess || !(isRecruiter(sess, env) || isAdmin(sess, env))) {
      return json({ error: "forbidden" }, 403);
    }
  
    const url = new URL(request.url);
    const candidateId = (url.searchParams.get("candidate_id") || "").trim();
    if (!candidateId) return json({ error: "candidate_id required" }, 400);
  
    const recruiterEmail = (sess.email || sess.google_email || "").toLowerCase();
    if (!recruiterEmail) return json({ error: "recruiter email missing" }, 400);
  
    const row = await env.DB.prepare(
      `SELECT id, status, created_at
       FROM intro_requests
       WHERE candidate_id = ? AND recruiter_email = ?
       ORDER BY created_at DESC
       LIMIT 1`
    ).bind(candidateId, recruiterEmail).first();
  
    // none means recruiter never requested intro for this candidate
    return json({ item: row || null });
}

export async function apiMeIntroRequests(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return json({ error: "unauthorized" }, 401);

  const { results } = await env.DB.prepare(
    `SELECT id, recruiter_email, message, status, created_at
     FROM intro_requests
     WHERE candidate_id = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(sess.candidate_id).all();

  return json({ items: results || [] });
}

export async function apiMeDecideIntroRequest(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return json({ error: "unauthorized" }, 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const id = (body.id || "").toString().trim();
  const decision = (body.decision || "").toString().trim(); // 'approved' or 'rejected'

  if (!id) return json({ error: "id required" }, 400);
  if (!(decision === "approved" || decision === "rejected")) {
    return json({ error: "decision must be approved|rejected" }, 400);
  }

  const reqRow = await env.DB.prepare(
    `SELECT id, candidate_id, status FROM intro_requests WHERE id = ?`
  ).bind(id).first();

  if (!reqRow || reqRow.candidate_id !== sess.candidate_id) {
    return json({ error: "not found" }, 404);
  }
  if (reqRow.status !== "pending") {
    return json({ error: "already decided" }, 409);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE intro_requests SET status = ?, updated_at = ?
     WHERE id = ? AND candidate_id = ?`
  ).bind(decision, now, id, sess.candidate_id).run();

  return json({ ok: true, status: decision });
}