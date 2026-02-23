import { requireSession, isAdmin } from "../lib/session.js";
import { safeDateLabel } from "../lib/utils.js"
import { json, escapeHtml } from "../lib/http.js"
export async function renderAdminWaitlist(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
  
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
  
    const { results } = await env.DB.prepare(
      "SELECT email, role, target_country, current_location, created_at FROM waitlist ORDER BY created_at DESC LIMIT 200;"
    ).all();
  
    const rows = (results || []).map(r => `
      <tr>
        <td>${escapeHtml(r.email || "")}</td>
        <td>${escapeHtml(r.role || "")}</td>
        <td>${escapeHtml(r.target_country || "")}</td>
        <td>${escapeHtml(r.current_location || "")}</td>
        <td>${escapeHtml(r.created_at || "")}</td>
      </tr>
    `).join("");
  
    const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SignalTrust — Admin Waitlist</title>
    <style>
      :root { color-scheme: dark; }
      body { margin:0; font-family: ui-sans-serif, system-ui; background:#0b1020; color:#e8ecff; }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 18px 60px; }
      table { width:100%; border-collapse: collapse; margin-top: 14px; }
      th, td { border-bottom: 1px solid rgba(255,255,255,.10); padding: 10px 8px; text-align:left; font-size: 13px; }
      th { opacity: .85; font-size: 12px; }
      a { color: #9fb6ff; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div><a href="/">← Back</a></div>
      <h2 style="margin:12px 0 6px;">Admin: Waitlist (latest 200)</h2>
      <div style="opacity:.75; font-size:12px;">Keep this link private.</div>
      <table>
        <thead>
          <tr>
            <th>Email</th><th>Role</th><th>Target</th><th>Location</th><th>Created</th>
          </tr>
        </thead>
        <tbody>${rows || "<tr><td colspan='5'>No entries yet.</td></tr>"}</tbody>
      </table>
    </div>
  </body>
  </html>`;
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}

// Admin candidate handler function
export async function apiAdminCandidates(request, env) {
    const sess = await requireSession(request, env);
    if (!sess || !isAdmin(sess, env))
      return json({ error: "forbidden" }, 403);
  
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") || "").toLowerCase();
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(url.searchParams.get("page_size") || "20", 10), 100);
    const offset = (page - 1) * pageSize;
  
    let sql = `
      SELECT c.id, c.github_username, c.google_name,
             p.role, p.target_country, p.current_location,
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
        lower(p.current_location) LIKE ?
      )`;
      const like = `%${query}%`;
      binds.push(like, like, like);
    }
  
    sql += ` ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`;
    binds.push(pageSize, offset);
  
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
  
    return json({
      page,
      page_size: pageSize,
      items: results || [],
    });
}
export async function renderAdminCandidates(request, env) {
    const sess = await requireSession(request, env);
    if (!sess || !isAdmin(sess, env)) return new Response("Forbidden", { status: 403 });
  
    const url = new URL(request.url);
    const query = (url.searchParams.get("query") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(5, parseInt(url.searchParams.get("page_size") || "20", 10)));
    const offset = (page - 1) * pageSize;
  
    // Count total
    let countSql = `SELECT COUNT(*) as cnt FROM candidate_profiles p WHERE p.is_searchable = 1`;
    const countBinds = [];
    if (query) {
      countSql += ` AND (
        lower(p.role) LIKE ? OR
        lower(p.target_country) LIKE ? OR
        lower(p.current_location) LIKE ?
      )`;
      const like = `%${query.toLowerCase()}%`;
      countBinds.push(like, like, like);
    }
    const countRow = await env.DB.prepare(countSql).bind(...countBinds).first();
    const total = countRow?.cnt ?? 0;
  
    // Page data
    let sql = `
      SELECT c.id, c.github_username, c.google_name,
             p.role, p.target_country, p.current_location,
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
        lower(p.current_location) LIKE ?
      )`;
      const like = `%${query.toLowerCase()}%`;
      binds.push(like, like, like);
    }
    sql += ` ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`;
    binds.push(pageSize, offset);
  
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    const items = results || [];
  
    const rows = items.map(r => {
      const name = r.google_name || r.github_username || "Candidate";
      return `
        <tr>
          <td><a href="/c/${escapeHtml(r.id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a></td>
          <td>${escapeHtml(r.role || "")}</td>
          <td>${escapeHtml(r.target_country || "")}</td>
          <td>${escapeHtml(r.current_location || "")}</td>
          <td>${escapeHtml(String(r.profile_completeness ?? ""))}</td>
          <td>${escapeHtml(safeDateLabel(r.updated_at))}</td>
        </tr>
      `;
    }).join("");
  
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const mkUrl = (p) => {
      const u = new URL(request.url);
      u.searchParams.set("page", String(p));
      u.searchParams.set("page_size", String(pageSize));
      if (query) u.searchParams.set("query", query);
      else u.searchParams.delete("query");
      return u.pathname + "?" + u.searchParams.toString();
    };
  
    const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SignalTrust — Admin Candidates</title>
    <style>
      :root { color-scheme: dark; }
      body { margin:0; font-family: ui-sans-serif, system-ui; background:#0b1020; color:#e8ecff; }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 18px 60px; }
      a { color: #9fb6ff; text-decoration: none; }
      .card { margin-top:14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.10);
              border-radius: 16px; padding: 14px; }
      input { width: 100%; padding: 12px 12px; border-radius: 12px; border:1px solid rgba(255,255,255,.12);
              background: rgba(10,14,28,.9); color:#e8ecff; outline:none; }
      table { width:100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border-bottom: 1px solid rgba(255,255,255,.10); padding: 10px 8px; text-align:left; font-size: 13px; }
      th { opacity: .85; font-size: 12px; }
      .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top: 10px; }
      .btn { padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12);
             background: rgba(10,14,28,.9); color:#e8ecff; cursor:pointer; }
      .muted { opacity:.7; font-size:12px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div><a href="/">← Home</a></div>
      <h2 style="margin:12px 0 6px;">Admin: Searchable candidates</h2>
      <div class="muted">Total searchable: <b>${total}</b> • Page <b>${page}</b> / <b>${totalPages}</b></div>
  
      <div class="card">
        <form method="GET" action="/admin/candidates">
          <input name="query" value="${escapeHtml(query)}" placeholder="Search role / target / location (e.g. uae, sre, pune)" />
          <div class="row">
            <button class="btn" type="submit">Search</button>
            <a class="btn" href="/admin/candidates">Clear</a>
            <span class="muted">Page size: ${pageSize}</span>
          </div>
        </form>
  
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Role</th><th>Target</th><th>Location</th><th>%</th><th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="muted">No searchable candidates found.</td></tr>`}
          </tbody>
        </table>
  
        <div class="row" style="justify-content:space-between;">
          <div class="row">
            ${page > 1 ? `<a class="btn" href="${mkUrl(page - 1)}">← Prev</a>` : `<span class="btn" style="opacity:.4; cursor:not-allowed;">← Prev</span>`}
            ${page < totalPages ? `<a class="btn" href="${mkUrl(page + 1)}">Next →</a>` : `<span class="btn" style="opacity:.4; cursor:not-allowed;">Next →</span>`}
          </div>
          <div class="muted">Tip: click a name to open preview</div>
        </div>
      </div>
    </div>
  </body>
  </html>`;
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}