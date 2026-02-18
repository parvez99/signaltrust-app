//# landing + static-ish pages
import { requireSession } from "../lib/session.js";
import { pageShell } from "../lib/ui.js";
import { safeDateLabel } from "../lib/utils.js"
import { redirect, escapeHtml } from "../lib/http.js"
import { isRecruiter } from "../lib/session.js";
import { isAdmin } from "../lib/session.js";

export async function renderLanding(request, env) {
    const sess = await requireSession(request, env);
    const isLoggedIn = !!sess;
    
    const authBlock = isLoggedIn
    ? `
      <div style="margin-bottom:12px; font-size:13px; opacity:.85;">
        Logged in as <b>${escapeHtml(sess.github_username || sess.google_name || sess.email || sess.google_email || "User")}</b>
      </div>
  
      <a class="btn btn-primary" href="/app" style="width:100%;">Continue to App</a>
      <button class="btn" id="logoutBtn" type="button" style="width:100%;">Logout</button>
    `
    : `
      <div class="row" style="flex-direction:column; align-items:stretch;">
        <a class="btn btn-primary" href="/auth/github/start" style="width:100%;">Continue with GitHub</a>
        <a class="btn btn-primary" href="/auth/google/start" style="width:100%;">Continue with Google</a>
      </div>
    `;
      const body = `
      <div class="grid" style="margin-top:16px;">
        <div class="card">
          <h1>Looking for your next role globally?</h1>
          <div class="sub">
            NextOffer helps globally mobile professionals become <b>hire-ready</b> for visa + relocation roles 
            and helps recruiters find ready candidates fast.
          </div>
  
          <div class="card" style="margin-top:14px; background: rgba(23,190,187,.06); border-color: rgba(23,190,187,.18);">
            <div class="row">
              <span class="pill" style="border-color: rgba(23,190,187,.25); background: rgba(23,190,187,.08);">
                Private beta.
              </span>
              <span class="fine">Currently onboarding select tech recruiters and candidates.</span>
            </div>
          </div>
        </div>
  
        <div class="card">
          ${authBlock}
  
        </div>
      </div>
  
  <script>
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST' });
        window.location.replace('/');
      });
    }
  </script>
    `;
  
    return pageShell({ title: "NextOffer — Find your next role globally", body });  
  
}
export async function renderWaitlistPage(env) {
    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM waitlist;").first();
    const count = row?.count ?? 0;
  
    const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NextOffer — Waitlist</title>
    <style>
      :root { color-scheme: dark; }
      body { margin:0; font-family: ui-sans-serif, system-ui; background:#0b1020; color:#e8ecff; }
      .wrap { max-width: 820px; margin: 0 auto; padding: 28px 18px 60px; }
      a { color: #9fb6ff; text-decoration: none; }
      .card { margin-top:18px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.10);
              border-radius: 16px; padding: 16px; }
      .big { font-size: 44px; font-weight: 800; margin: 6px 0 0; }
      .sub { color: rgba(232,236,255,.78); line-height: 1.5; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div><a href="/">← Back</a></div>
      <div class="card">
        <div style="opacity:.85;">Total early access signups</div>
        <div class="big">${count}</div>
        <div class="sub">
          We’re onboarding in small batches (tech-first). If you joined, you’re in.
        </div>
      </div>
    </div>
  </body>
  </html>`;
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}
export function renderThanksPage(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") || "";
    const target = url.searchParams.get("target") || "";
  
    const safeRole = escapeHtml(role);
    const safeTarget = escapeHtml(target);
  
    const shareUrl = "https://getnextoffer.com";
    const tweetText = encodeURIComponent(
      "Just joined NextOffer early access — global hire-readiness + mobility for tech roles. 🚀"
    );
    const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(
      shareUrl
    )}`;
  
    const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NextOffer — You're on the list</title>
    <style>
      :root { color-scheme: dark; }
      body { margin:0; font-family: ui-sans-serif, system-ui; background:#0b1020; color:#e8ecff; }
      .wrap { max-width: 820px; margin: 0 auto; padding: 28px 18px 60px; }
      a { color: #9fb6ff; text-decoration: none; }
      .card { margin-top:18px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.10);
              border-radius: 18px; padding: 18px; }
      .big { font-size: 36px; font-weight: 850; margin: 6px 0 0; }
      .sub { color: rgba(232,236,255,.78); line-height: 1.55; margin-top: 10px; }
      .row { display:flex; gap:12px; flex-wrap:wrap; margin-top: 14px; }
      .btn { display:inline-block; padding: 10px 12px; border-radius: 12px;
             border: 1px solid rgba(255,255,255,.12); background: rgba(10,14,28,.9); }
      .btn-primary { border:0; background: linear-gradient(90deg, #7aa2ff, #a678ff); color:#0b1020; font-weight: 800; }
      .tag { display:inline-flex; gap:8px; align-items:center; padding: 6px 10px; border-radius:999px;
             border: 1px dashed rgba(255,255,255,.18); opacity: .9; font-size: 12px; margin-top: 12px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div><a href="/">← Back to home</a></div>
  
      <div class="card">
        <div style="opacity:.85;">NextOffer Early Access</div>
        <div class="big">✅ You’re on the list.</div>
  
        <div class="sub">
          We’re onboarding in small batches (tech-first). If selected, you’ll get an invite with the next steps.
        </div>
  
        ${(safeRole || safeTarget) ? `<div class="tag">Captured: ${safeRole ? `<b>${safeRole}</b>` : ""}${safeRole && safeTarget ? " • " : ""}${safeTarget ? `<b>${safeTarget}</b>` : ""}</div>` : ""}
  
        <div class="row">
          <a class="btn btn-primary" href="/waitlist">View waitlist count</a>
          <a class="btn" href="${tweetHref}" target="_blank" rel="noopener noreferrer">Share on X</a>
          <a class="btn" href="#" id="copy">Copy link</a>
        </div>
  
        <div class="sub" style="margin-top:14px;">
          Want to help shape the MVP? Reply to the invite when it comes — we’ll prioritize early feedback.
        </div>
      </div>
    </div>
  
  <script>
    document.getElementById('copy').addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText("${shareUrl}");
        e.target.textContent = "Copied ✅";
        setTimeout(() => e.target.textContent = "Copy link", 1200);
      } catch {
        alert("Could not copy. Link: ${shareUrl}");
      }
    });
  </script>
  </body>
  </html>`;
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}
export async function renderApp(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return redirect("/");

  const profile = await env.DB.prepare(
    `SELECT role, target_country, current_location,
            profile_completeness, is_searchable, updated_at
     FROM candidate_profiles
     WHERE candidate_id = ?`
  ).bind(sess.candidate_id).first();

  const completion = profile?.profile_completeness || 0;
  const searchable = profile?.is_searchable ? "Yes" : "No";
  const updated = safeDateLabel(profile?.updated_at);

  const eligible = completion >= 70;

  const html = pageShell({
    title: "NextOffer — Dashboard",
    rightPill: "Candidate • Dashboard",
    body: `
      <div class="row" style="margin-top:14px;">
        <a class="btn btn-ghost" href="/">← Home</a>
        <span class="spacer"></span>
        <button class="btn btn-ghost" id="logout" type="button">Logout</button>
      </div>
  
      <div class="card">
        <h2 style="margin:0 0 6px;">
          Hello, ${escapeHtml(sess.github_username || sess.google_name || "User")} 👋
        </h2>
  
        <div class="row" style="gap:14px; margin-top:8px; flex-wrap:wrap;">
          <span class="pill">Completion: <b>${completion}%</b></span>
          <span class="pill">Searchable: <b>${searchable}</b></span>
          <span class="pill">Updated: <b>${escapeHtml(updated)}</b></span>
        </div>
  
        <div class="row" style="margin-top:14px;">
          <a class="btn" href="/app/profile">Edit Profile</a>
  
          ${
            eligible
              ? (profile?.is_searchable
                  ? `<button class="btn btn-danger" id="disableSearch" type="button">Pause Search</button>`
                  : `<button class="btn btn-primary" id="enableSearch" type="button">Make Profile Searchable</button>`
                )
              : `<button class="btn btn-primary" type="button" disabled>Make Profile Searchable</button>`
          }
  
          <a class="btn" href="/waitlist">Waitlist count</a>
          <a class="btn" href="/r/requests" style="display:none;" id="myReqLink">My requests</a>
        </div>
  
        ${
          !eligible
            ? `<div class="err" style="margin-top:12px;">
                Complete profile to become searchable.
              </div>`
            : ""
        }
      </div>
  
      <div class="card" style="margin-top:14px;">
        <div class="row" style="justify-content:space-between;">
          <div>
            <h3 style="margin:0;">Intro Requests</h3>
            <div class="fine" style="margin-top:6px;">Approve or reject recruiter intro requests.</div>
          </div>
        </div>
  
        <div id="introList" style="margin-top:12px;">Loading...</div>
      </div>
  
  <script>
    // ---- Shared helpers (client-side) ----
    function esc(s) {
      return String(s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
    async function readJson(res) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return await res.json();
      return { error: await res.text() };
    }
  
    // ---- Logout ----
    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST' });
        window.location.replace('/');
      });
    }
  
    // ---- Searchable enable/disable ----
    const enableBtn = document.getElementById('enableSearch');
    if (enableBtn) {
      enableBtn.addEventListener('click', async () => {
        const res = await fetch('/api/me/searchable', { method: 'POST' });
        if (res.ok) return location.reload();
        const data = await readJson(res);
        alert(data?.error || "Could not enable searchable.");
      });
    }
  
    const disableBtn = document.getElementById('disableSearch');
    if (disableBtn) {
      disableBtn.addEventListener('click', async () => {
        const res = await fetch('/api/me/searchable', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_searchable: 0 })
        });
        if (res.ok) return location.reload();
        const data = await readJson(res);
        alert(data?.error || "Could not disable searchable.");
      });
    }
  
    // ---- Intro requests: load + decide ----
    async function decideIntro(id, decision) {
      await fetch("/api/me/intro-requests/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: id, decision: decision })
      });
      await loadIntroRequests();
    }
  
    function renderReqCard(x) {
      var msg = esc(x.message || "");
      var who = esc(x.recruiter_email || "Recruiter");
      var when = esc(x.created_at || "");
  
      var actions = "";
      if (x.status === "pending") {
        actions =
          '<div class="row" style="margin-top:10px;">' +
            '<button class="btn btn-primary" type="button" data-id="' + esc(x.id) + '" data-decision="approved">Approve</button>' +
            '<button class="btn btn-danger" type="button" data-id="' + esc(x.id) + '" data-decision="rejected">Reject</button>' +
          '</div>';
      } else {
        actions = '<div class="fine" style="margin-top:10px;">Status: <b>' + esc(x.status) + '</b></div>';
      }
  
      return (
        '<div style="padding:12px; border:1px solid var(--border); border-radius: var(--r16); background: rgba(255,255,255,.75); box-shadow: 0 6px 18px rgba(11,27,42,.06); margin-top:10px;">' +
          '<div class="row" style="justify-content:space-between; gap:10px;">' +
            '<div><b>' + who + '</b></div>' +
            '<div class="fine">' + when + '</div>' +
          '</div>' +
          (msg ? '<div style="margin-top:8px;">' + msg + '</div>' : '<div class="fine" style="margin-top:8px;">No message.</div>') +
          actions +
        '</div>'
      );
    }
  
    async function loadIntroRequests() {
      const container = document.getElementById("introList");
      container.innerHTML = '<div class="fine">Loading…</div>';
  
      const res = await fetch("/api/me/intro-requests");
      const data = await readJson(res);
  
      if (!res.ok) {
        container.innerHTML = '<div class="err">Failed to load intro requests.</div>';
        return;
      }
  
      const items = data.items || [];
      if (items.length === 0) {
        container.innerHTML = '<div class="fine">No intro requests yet.</div>';
        return;
      }
  
      var html = "";
      for (var i = 0; i < items.length; i++) {
        html += renderReqCard(items[i]);
      }
      container.innerHTML = html;
  
      container.querySelectorAll("button[data-id]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const id = btn.getAttribute("data-id");
          const decision = btn.getAttribute("data-decision");
          decideIntro(id, decision);
        });
      });
    }
  
    loadIntroRequests();
  </script>
  `
  });
  

  return new Response(html, {
    headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
  });
}

// Public candidate preview (Light theme via pageShell)
export async function renderCandidatePublic(request, env) {
    const url = new URL(request.url);
    const id = url.pathname.split("/")[2] || "";
    if (!id) return new Response("Not found", { status: 404 });
  
    // Only show if searchable
    const row = await env.DB.prepare(
      `SELECT c.id, c.github_username, c.google_name,
              p.role, p.target_country, p.current_location,
              p.visa_status, p.needs_sponsorship, p.profile_completeness, p.updated_at, p.is_searchable
       FROM candidates c
       JOIN candidate_profiles p ON p.candidate_id = c.id
       WHERE c.id = ?`
    ).bind(id).first();
  
    if (!row) return new Response("Not found", { status: 404 });
    if (!row.is_searchable) return new Response("Not found", { status: 404 });
  
    const name = row.google_name || row.github_username || "Candidate";
    const sponsor = row.needs_sponsorship ? "Yes" : "No";
  
    const sess = await requireSession(request, env);
    const canRequest = sess && (isRecruiter(sess, env) || isAdmin(sess, env));
  
    const html = pageShell({
      title: `${name} — NextOffer`,
      rightPill: "Public profile",
      body: `
        <div class="row" style="margin-top:14px;">
          <a class="btn btn-ghost" href="/">← Home</a>
        </div>
  
        <div class="card" style="margin-top:14px;">
          <h2 style="margin:0 0 6px;">${escapeHtml(name)}</h2>
          <div class="fine">
            Hire-ready mobility profile • Completion <b>${escapeHtml(String(row.profile_completeness || 0))}%</b>
            • Updated <b>${escapeHtml(safeDateLabel(row.updated_at))}</b>
          </div>
  
          <div class="divider"></div>
  
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <div class="fine">Role</div>
              <div style="margin-top:4px;">${escapeHtml(row.role || "")}</div>
            </div>
  
            <div>
              <div class="fine">Target</div>
              <div style="margin-top:4px;">${escapeHtml(row.target_country || "")}</div>
            </div>
  
            <div>
              <div class="fine">Current location</div>
              <div style="margin-top:4px;">${escapeHtml(row.current_location || "")}</div>
            </div>
  
            <div>
              <div class="fine">Visa status</div>
              <div style="margin-top:4px;">${escapeHtml(row.visa_status || "")}</div>
            </div>
  
            <div>
              <div class="fine">Needs sponsorship</div>
              <div style="margin-top:4px;">${escapeHtml(sponsor)}</div>
            </div>
          </div>
  
          ${
            canRequest
              ? `
                <div class="divider"></div>
  
                <div class="card" style="background: rgba(18,187,191,.06); border-color: rgba(18,187,191,.18); box-shadow:none;">
                  <div class="row" style="justify-content:space-between; gap:10px;">
                    <div>
                      <div style="font-weight:900;">Request an intro</div>
                      <div class="fine" style="margin-top:4px;">
                        Candidate approves before contact is revealed.
                      </div>
                    </div>
                    <span class="pill">Recruiter</span>
                  </div>
  
                  <label style="margin-top:12px;">Optional message</label>
                  <textarea id="introMsg" placeholder="Short note (optional)…" rows="3"></textarea>
  
                  <div class="row" style="margin-top:10px;">
                    <button class="btn btn-primary" id="requestIntro" type="button">Request Intro</button>
                    <div id="introStatus" class="fine"></div>
                  </div>
                </div>
              `
              : `
                <div class="divider"></div>
                <div class="fine">Recruiter access required to request intro.</div>
              `
          }
        </div>
  
        <script>
          const candidateId = "${escapeHtml(row.id)}";
  
          function esc(s) {
            return String(s || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }
  
          function setBtnDisabled(btn, disabled, label) {
            if (!btn) return;
            btn.disabled = !!disabled;
            if (label) btn.textContent = label;
            btn.style.opacity = disabled ? "0.6" : "1";
            btn.style.cursor = disabled ? "not-allowed" : "pointer";
          }
  
          async function readJson(res) {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) return await res.json();
            return { error: await res.text() };
          }
  
          async function refreshIntroStatus() {
            const btn = document.getElementById("requestIntro");
            const status = document.getElementById("introStatus");
            const msgBox = document.getElementById("introMsg");
            if (!btn || !status) return;
  
            status.textContent = "Checking…";
            setBtnDisabled(btn, true, "Request Intro");
  
            const res = await fetch(
              "/api/recruiter/intro-request/status?candidate_id=" + encodeURIComponent(candidateId)
            );
            const data = await readJson(res);
  
            if (!res.ok) {
              status.textContent = "❌ Could not load status.";
              setBtnDisabled(btn, false, "Request Intro");
              return;
            }
  
            const item = data.item;
  
            if (!item) {
              status.textContent = "No request yet.";
              setBtnDisabled(btn, false, "Request Intro");
              return;
            }
  
            if (item.status === "pending") {
              status.innerHTML = '⏳ Pending approval. <a href="/r/requests">View my requests →</a>';
              setBtnDisabled(btn, true, "Pending");
              if (msgBox) msgBox.disabled = true;
              return;
            }
  
            if (item.status === "approved") {
              status.innerHTML = '✅ Approved. <a href="/r/requests">View contact →</a>';
              setBtnDisabled(btn, true, "Approved");
              if (msgBox) msgBox.disabled = true;
              return;
            }
  
            if (item.status === "rejected") {
              status.innerHTML = '❌ Rejected. <a href="/r/requests">View my requests →</a>';
              setBtnDisabled(btn, true, "Rejected");
              if (msgBox) msgBox.disabled = true;
              return;
            }
  
            status.textContent = "Status: " + String(item.status || "unknown");
            setBtnDisabled(btn, false, "Request Intro");
          }
  
          async function sendIntroRequest() {
            const btn = document.getElementById("requestIntro");
            const status = document.getElementById("introStatus");
            const msg = (document.getElementById("introMsg")?.value || "").trim();
            if (!btn || !status) return;
  
            status.textContent = "Sending…";
            setBtnDisabled(btn, true, "Sending…");
  
            const res = await fetch("/api/recruiter/intro-request", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ candidate_id: candidateId, message: msg })
            });
  
            const data = await readJson(res);
  
            if (!res.ok) {
              status.textContent = "❌ " + (data.error || "Failed");
              setBtnDisabled(btn, false, "Request Intro");
              return;
            }
  
            status.innerHTML = '✅ Request sent (pending). <a href="/r/requests">View my requests →</a>';
            await refreshIntroStatus();
          }
  
          const btn = document.getElementById("requestIntro");
          if (btn) btn.addEventListener("click", sendIntroRequest);
  
          refreshIntroStatus();
        </script>
      `
    });
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}