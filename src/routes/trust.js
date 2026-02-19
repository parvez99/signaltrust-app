// ---------------------------
// 1) PAGES
// ---------------------------
import { json, escapeHtml, redirect } from "../lib/http.js"
import { pageShell } from "../lib/ui.js";
import { requireSession, isRecruiter, isAdmin } from "../lib/session.js"; 
import { normalizeResumeTextToProfileV1 } from "../engine/normalize_v1.js";
import { defaultSignalConfigV1, runSignalsV1, signalTitle } from "../engine/signals_v1.js";
import { scoreAndBucketV1 } from "../engine/scoring_v1.js";
import { safeJsonParse } from "../lib/utils.js";
import { sha256Hex, normalizeForDocHash } from "../lib/crypto.js";
import { consoleShell } from "../lib/console_ui.js";


export async function renderTrustHome(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    // Gate to recruiter/admin for MVP (optional)
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const who = escapeHtml(sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter");
  
    const html = pageShell({
      title: "NextOffer — Trust Engine (MVP)",
      rightPill: `Trust Engine • ${who}`,
      body: `
        <div class="row" style="margin-top:14px;">
          <a class="btn btn-ghost" href="/">← Home</a>
          <a class="btn" href="/trust/profiles">Profiles</a>
          <span class="spacer"></span>
          <a class="btn" href="/r/search">Recruiter Search</a>
          <button class="btn btn-ghost" id="logout" type="button">Logout</button>
        </div>
  
        <div class="card" style="margin-top:14px;">
          <h2 style="margin:0 0 6px;">Trust Report (MVP)</h2>
          <div class="fine">Paste resume text (for now). We’ll normalize → run signals → score → report.</div>
  
          <div class="divider"></div>
          <label class="label">Upload PDF (optional)</label>
          <input id="pdf" type="file" accept="application/pdf" />

          <div class="fine" style="margin-top:8px;">
            If you upload a PDF, we’ll extract text in the browser and send text to the server.
          </div>
          <label class="label">Resume text</label>
          <textarea id="resumeText" rows="16" placeholder="Paste resume text here…" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;"></textarea>
  
          <div class="divider"></div>

          <div class="row" style="align-items:center; gap:10px;">
            <label class="fine" style="display:flex; align-items:center; gap:8px;">
            <input id="showExtracted" type="checkbox" />
                Preview extracted PDF text
            </label>
            <span class="fine" id="extractMeta"></span>
         </div>

         <pre id="extractPreview"
            style="display:none; white-space:pre-wrap; background:rgba(11,18,32,.04);
            border:1px solid var(--border); border-radius:14px; padding:10px;
            overflow:auto; max-height:260px;">
         </pre>
            <div class="row" style="margin-top:12px;">
            <button class="btn btn-ghost" id="previewBtn" type="button">Preview extracted text</button>
            <button class="btn btn-primary" id="run" type="button">Generate Trust Report</button>
            <span class="fine" id="status"></span>
          </div>
  
          <div class="divider"></div>
          <div class="fine">
            Tip: MVP signals running: <b>Overlapping roles</b>, <b>Unexplained gap &gt; 6 months</b>.
          </div>
        </div>
  
    <script src="/client/pdf_extract.js"></script>
    <script type="module" src="/client/trust_page.js"></script>
      `
    });
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}
export async function renderTrustReportPage(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) return new Response("Missing report id", { status: 400 });
  
    const who = escapeHtml(sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter");
  
    const html = pageShell({
      title: "NextOffer — Trust Report",
      rightPill: `Trust Report • ${who}`,
      body: `
        <div class="row" style="margin-top:14px;">
          <a class="btn btn-ghost" href="/trust">← Back</a>
          <span class="spacer"></span>
          <button class="btn" id="refresh" type="button">Refresh</button>
          <button class="btn btn-ghost" id="logout" type="button">Logout</button>
        </div>
  
        <div class="card" style="margin-top:14px;">
          <div class="fine">Trust Report</div>
          <h2 style="margin:6px 0 0;" id="headline">Loading…</h2>
          <div class="fine" id="meta"></div>
  
          <div class="divider"></div>
  
          <div id="summary" class="row" style="gap:10px; flex-wrap:wrap;"></div>
  
          <div class="divider"></div>
  
          <div style="display:grid; grid-template-columns: 1fr; gap:10px;" id="signals">
            <div class="fine">Loading signals…</div>
          </div>
        </div>
  
        <script>
          const reportId = ${JSON.stringify(id)};
  
          function esc(s) {
            return String(s || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }
  
          function pill(text, bg, bd, ink) {
            return '<span class="pill" style="background:'+bg+'; border-color:'+bd+'; color:'+ink+';">' + text + '</span>';
          }
  
          async function readJson(res) {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) return await res.json();
            return { error: await res.text() };
          }
  
          function bucketBadge(bucket) {
            const b = String(bucket || "unknown");
            if (b === "green") return pill("Green", "rgba(12,122,75,.10)", "rgba(12,122,75,.25)", "#0c7a4b");
            if (b === "yellow") return pill("Yellow", "rgba(245,158,11,.12)", "rgba(245,158,11,.28)", "#8a5a00");
            if (b === "red") return pill("Red", "rgba(180,35,24,.10)", "rgba(180,35,24,.25)", "#b42318");
            return pill(b, "rgba(11,18,32,.06)", "var(--border)", "var(--muted)");
          }
  
          function severityTag(tier) {
            const t = String(tier || "");
            if (t === "A") return pill("Tier A", "rgba(180,35,24,.08)", "rgba(180,35,24,.22)", "#b42318");
            if (t === "B") return pill("Tier B", "rgba(245,158,11,.10)", "rgba(245,158,11,.26)", "#8a5a00");
            return pill("Tier C", "rgba(11,18,32,.06)", "var(--border)", "var(--muted)");
          }
  
          function confTag(c) {
            const x = String(c || "");
            if (x === "high") return pill("High confidence", "rgba(12,122,75,.10)", "rgba(12,122,75,.25)", "#0c7a4b");
            if (x === "medium") return pill("Medium confidence", "rgba(245,158,11,.10)", "rgba(245,158,11,.26)", "#8a5a00");
            return pill("Low confidence", "rgba(11,18,32,.06)", "var(--border)", "var(--muted)");
          }
  
          function signalCard(s) {
            const title = esc(s.title || s.signal_id);
            const expl = esc(s.explanation || "");
            const ded = Number(s.deduction || 0);
            const questions = Array.isArray(s.suggested_questions) ? s.suggested_questions : [];
            const ev = s.evidence || null;
  
            const evHtml = ev
              ? '<details style="margin-top:10px;"><summary class="fine">Evidence</summary>' +
                '<pre style="white-space:pre-wrap; background:rgba(11,18,32,.04); border:1px solid var(--border); border-radius:14px; padding:10px; overflow:auto;">' +
                esc(JSON.stringify(ev, null, 2)) +
                '</pre></details>'
              : '';
  
            const qHtml = questions.length
              ? '<div style="margin-top:10px;"><div class="fine">Suggested questions</div><ul style="margin:8px 0 0; padding-left:18px;">' +
                questions.map(q => '<li>' + esc(q) + '</li>').join('') +
                '</ul></div>'
              : '';
  
            return (
              '<div style="padding:12px; border:1px solid var(--border); border-radius:16px; background:rgba(255,255,255,.92); box-shadow:0 8px 20px rgba(11,18,32,.06);">' +
                '<div class="row" style="justify-content:space-between; gap:10px;">' +
                  '<div style="font-weight:900;">' + title + '</div>' +
                  '<div class="row" style="gap:8px;">' +
                    severityTag(s.severity_tier) +
                    confTag(s.confidence) +
                    (ded ? pill("-" + ded, "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") : "") +
                  '</div>' +
                '</div>' +
                '<div style="margin-top:8px; color:rgba(11,18,32,.72); line-height:1.5;">' + expl + '</div>' +
                qHtml +
                evHtml +
              '</div>'
            );
          }
  
          async function load() {
            document.getElementById("headline").textContent = "Loading…";
            document.getElementById("signals").innerHTML = '<div class="fine">Loading…</div>';
  
            const res = await fetch("/api/trust/report?id=" + encodeURIComponent(reportId));
            const data = await readJson(res);
  
            if (!res.ok) {
              document.getElementById("headline").textContent = "Failed to load";
              document.getElementById("meta").textContent = data.error || "Error";
              document.getElementById("signals").innerHTML = "";
              return;
            }
  
            const report = data.report;
            const signals = data.signals || [];
  
            const score = Number(report.trust_score || 0);
            const bucket = String(report.bucket || "unknown");
            const hard = report.hard_triggered ? "Yes" : "No";
  
            document.getElementById("headline").innerHTML =
              "Trust score: <b>" + score + "</b> " + bucketBadge(bucket);
  
            document.getElementById("meta").textContent =
              "Hard-triggered: " + hard + " • Engine: " + (report.engine_version || "") + " • Created: " + (report.created_at || "");
  
            const sum = report.summary || {};
            const summaryEl = document.getElementById("summary");
            summaryEl.innerHTML = [
              pill("Tier A: " + (sum.tier_a_count ?? 0), "rgba(180,35,24,.08)", "rgba(180,35,24,.22)", "#b42318"),
              pill("Tier B: " + (sum.tier_b_count ?? 0), "rgba(245,158,11,.10)", "rgba(245,158,11,.26)", "#8a5a00"),
              pill("Tier C: " + (sum.tier_c_count ?? 0), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)")
            ].join("");
  
            document.getElementById("signals").innerHTML =
              signals.length ? signals.map(signalCard).join("") : '<div class="fine">No signals triggered.</div>';
          }
  
          document.getElementById("refresh").addEventListener("click", load);
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
export async function renderTrustProfilePage(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) return new Response("Missing profile id", { status: 400 });
  
    const who = escapeHtml(sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter");
  
    const html = pageShell({
      title: "NextOffer — Trust Profile",
      rightPill: `Trust Engine • ${who}`,
      body: `
        <div class="row" style="margin-top:14px;">
          <a class="btn btn-ghost" href="/trust/profiles">← Profiles</a>
          <span class="spacer"></span>
          <button class="btn" id="run" type="button">Run report</button>
          <button class="btn btn-ghost" id="logout" type="button">Logout</button>
        </div>
  
        <div class="card" style="margin-top:14px;">
          <div class="fine">Trust profile</div>
          <h2 style="margin:6px 0 0;" id="headline">Loading…</h2>
          <div class="fine" id="meta"></div>
          <div class="divider"></div>
  
          <div id="reports" class="fine">Loading reports…</div>
        </div>
  
        <script>
          const trustProfileId = ${JSON.stringify(id)};
  
          function esc(s) {
            return String(s || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }
  
          function pill(text, bg, bd, ink) {
            return '<span class="pill" style="background:'+bg+'; border-color:'+bd+'; color:'+ink+';">' + text + '</span>';
          }
  
          function bucketBadge(bucket) {
            const b = String(bucket || "unknown");
            if (b === "green") return pill("Green", "rgba(12,122,75,.10)", "rgba(12,122,75,.25)", "#0c7a4b");
            if (b === "yellow") return pill("Yellow", "rgba(245,158,11,.12)", "rgba(245,158,11,.28)", "#8a5a00");
            if (b === "red") return pill("Red", "rgba(180,35,24,.10)", "rgba(180,35,24,.25)", "#b42318");
            return pill(b, "rgba(11,18,32,.06)", "var(--border)", "var(--muted)");
          }
  
          async function readJson(res) {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) return await res.json();
            return { error: await res.text() };
          }
  
          function reportRow(r) {
            return (
              '<div style="padding:12px; border:1px solid var(--border); border-radius:16px; background:rgba(255,255,255,.92); box-shadow:0 8px 20px rgba(11,18,32,.06);">' +
                '<div class="row" style="justify-content:space-between; gap:10px; align-items:flex-start;">' +
                  '<div>' +
                    '<div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">' +
                      bucketBadge(r.bucket) +
                      pill('Score: ' + (r.trust_score ?? 0), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                      pill('Hard: ' + (r.hard_triggered ? "Yes" : "No"), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                    '</div>' +
                    '<div class="fine" style="margin-top:6px;">Created: ' + esc(r.created_at) + ' • Engine: ' + esc(r.engine_version) + '</div>' +
                  '</div>' +
                  '<div class="row" style="gap:8px;">' +
                    '<a class="btn" href="/trust/report?id=' + encodeURIComponent(r.id) + '">Open</a>' +
                  '</div>' +
                '</div>' +
              '</div>'
            );
          }
  
          async function load() {
            document.getElementById("headline").textContent = "Loading…";
            document.getElementById("reports").textContent = "Loading…";
  
            const res = await fetch("/api/trust/profile?id=" + encodeURIComponent(trustProfileId));
            const data = await readJson(res);
  
            if (!res.ok) {
              document.getElementById("headline").textContent = "Failed to load";
              document.getElementById("meta").textContent = data.error || "Error";
              document.getElementById("reports").textContent = "";
              return;
            }
  
            const p = data.profile;
            document.getElementById("headline").textContent = p.source_filename || p.id;
            document.getElementById("meta").textContent =
              "Created: " + (p.created_at || "") + " • Source: " + (p.source_type || "") + " • Extractor: " + (p.extractor || "");
  
            const reports = data.reports || [];
            document.getElementById("reports").innerHTML =
              reports.length
                ? '<div style="display:grid; grid-template-columns:1fr; gap:10px;">' + reports.map(reportRow).join("") + '</div>'
                : '<div class="fine">No reports yet. Click “Run report”.</div>';
          }
  
          document.getElementById("run").addEventListener("click", async () => {
            const btn = document.getElementById("run");
            btn.disabled = true;
            btn.textContent = "Running…";
            try {
              const res = await fetch("/api/trust/run", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ trust_profile_id: trustProfileId })
              });
              const data = await readJson(res);
              if (!res.ok) throw new Error(data.error || "run failed");
              window.location.href = "/trust/report?id=" + encodeURIComponent(data.trust_report_id);
            } catch (e) {
              alert(String(e?.message || e));
            } finally {
              btn.disabled = false;
              btn.textContent = "Run report";
            }
          });
  
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
export async function renderTrustProfilesPage(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const who = escapeHtml(
      sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter"
    );
  
    const html = consoleShell({
      title: "Profiles",
      who,
      active: "profiles",
      body: `
        <div class="card">
            <div class="row" style="align-items:center;">
            <div>
                <div class="fine">Last 20 ingests</div>
                <h2 style="margin:6px 0 0;">Profiles</h2>
            </div>
            <span class="spacer"></span>

            <div class="row" style="gap:8px;">
                <a class="btn btn-sm" href="/trust">Upload</a>
                <button class="btn btn-sm" id="refresh" type="button">Refresh</button>
            </div>
            </div>
  
          <div class="divider"></div>
          <style>
            .bucket-row{
                display:grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 10px;
                margin: 10px 0 12px;
            }
            /* Buckets slightly smaller */
            .bucket-card{
                border-radius: 14px;
                padding: 9px 11px;       /* smaller */
            }
            .bucket-card:hover{
                transform: translateY(-1px);
                border-color: rgba(0,170,170,.35);
            }

            .bucket-card[data-active="1"]{
                background: rgba(0,170,170,.10);
                border-color: rgba(0,170,170,.45);
            }
            .bucket-title{ font-size: 11px; }
            .bucket-count{ font-size: 17px; }

            @media (max-width: 900px){
            .bucket-row{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }

            /* Layout: left controls + right search */
            .filter-bar{
                display:flex;
                gap:14px;
                align-items:flex-start;
                justify-content:space-between;
                flex-wrap:wrap;
                margin-bottom:12px;
                padding:10px;
                border:1px solid var(--border);
                border-radius:14px;
                background:rgba(255,255,255,.86);
                backdrop-filter: blur(6px);
            }
            .filter-leftcol{
                display:flex;
                flex-direction:column;
                gap:10px;
                min-width: 520px;
                flex: 1 1 520px;
            }
            .filter-rightcol{
                display:flex;
                justify-content:flex-end;
                flex: 0 1 360px;
                min-width: 300px;
            }
            .filter-left{
                display:flex;
                flex-wrap:wrap;
                gap:10px;
                align-items:center;
            }
            /* Search row tighter */
            #q{
                height:30px;
                padding:6px 10px;
                border-radius:12px;
                width: 220px;
            }

            /* ✅ make the list itself scroll */
            #listWrap {
                max-height: calc(100vh - 320px);
                overflow: auto;
                padding-right: 6px;
            }
            /* Make Clear button match chip height */
            #clearFilters.btn{
                padding:7px 10px;
                border-radius:12px;
            }
            #refresh.btn{
                padding:7px 10px;
                border-radius:12px;
            }
            .filters2 { margin-top: 8px; }

            /* Search tighter and right-aligned */
            .searchbox{
                display:flex;
                align-items:center;
                justify-content:flex-end;
                gap:10px;
                flex-wrap:wrap;
            }
            .searchbox input{
                width: 220px;
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 8px 10px;
                background: rgba(255,255,255,.9);
            }

            .filter-pill-row{
                display:flex;
                gap:8px;
                align-items:center;
                flex-wrap:wrap;
                margin-bottom: 8px;
            }
            /* +Filter buttons slightly smaller */
            .filter-pill{
                padding: 6px 10px;       /* smaller */
                font-size: 12px;
            }
            .filter-pill:hover{
                background: rgba(0,170,170,.08);
                border-color: rgba(0,170,170,.30);
            }

            .filter-panel{
                border: 1px solid var(--border);
                border-radius: 14px;
                padding: 10px;
                background: rgba(255,255,255,.92);
                box-shadow: 0 8px 20px rgba(11,18,32,.06);
                margin: 6px 0 10px;
            }
            .panel-title{
                font-size: 12px;
                font-weight: 900;
                color: rgba(11,18,32,.65);
                margin-bottom: 8px;
            }
            .panel-row{
                display:flex;
                flex-wrap:wrap;
                gap:8px;
            }
            /* Mini chips slightly smaller */
            .mini-chip{
              padding: 5px 10px;
              font-size: 12px;
            }
            .mini-chip:hover{
                background: rgba(0,170,170,.08);
                border-color: rgba(0,170,170,.30);
            }
            .mini-chip[data-active="1"]{
                background: rgba(0,170,170,.14);
                border-color: rgba(0,170,170,.40);
                color: rgba(0,110,110,1);
            }
            .active-filters{
                display:flex;
                flex-wrap:wrap;
                gap:8px;
                margin: 6px 0 10px;
            }
            .active-chip{
                display:inline-flex;
                align-items:center;
                gap:8px;
                border:1px solid rgba(0,170,170,.35);
                background: rgba(0,170,170,.10);
                color: rgba(0,110,110,1);
                padding: 6px 10px;
                border-radius: 999px;
                font-weight: 900;
                cursor: pointer;
                }
                .active-chip .x{
                font-weight: 900;
                opacity: .8;
            }
            .active-chip:hover{
                background: rgba(0,170,170,.16);
            }

          </style>
            <div class="filter-bar">
                <!-- LEFT: buckets + filter controls -->
                <div class="filter-leftcol">
                    <div class="bucket-row" id="bucketRow">
                    <button class="bucket-card" data-bucket="all" type="button">
                        <div class="bucket-title">All Profiles</div>
                        <div class="bucket-count" id="countAll">—</div>
                    </button>

                    <button class="bucket-card" data-bucket="green" type="button">
                        <div class="bucket-title">Green</div>
                        <div class="bucket-count" id="countGreen">—</div>
                    </button>

                    <button class="bucket-card" data-bucket="yellow" type="button">
                        <div class="bucket-title">Yellow</div>
                        <div class="bucket-count" id="countYellow">—</div>
                    </button>

                    <button class="bucket-card" data-bucket="red" type="button">
                        <div class="bucket-title">Red</div>
                        <div class="bucket-count" id="countRed">—</div>
                    </button>
                    </div>

                    <!-- +Filters directly under buckets -->
                    <div class="filter-pill-row">
                    <button class="filter-pill" id="openScore" type="button">+ Score</button>
                    <button class="filter-pill" id="openSignals" type="button">+ Signals</button>
                    <button class="filter-pill" id="openMore" type="button">+ More</button>
                    </div>

                    <div class="active-filters" id="activeFilters"></div>

                    <div class="filter-panel" id="panelScore" style="display:none;">
                    <div class="panel-title">Score</div>
                    <div class="panel-row">
                        <button class="mini-chip" data-score="score80" type="button">≥ 80</button>
                        <button class="mini-chip" data-mode="hasSignals" type="button">Has signals</button>
                        <button class="mini-chip" data-mode="duplicateOnly" type="button">Duplicate</button>
                    </div>
                    </div>

                    <div class="filter-panel" id="panelSignals" style="display:none;">
                    <div class="panel-title">Signals</div>
                    <div class="panel-row">
                        <button class="mini-chip" data-sig="duplicate_resume_upload" type="button">Duplicate upload</button>
                        <button class="mini-chip" data-sig="timeline_overlap" type="button">Overlap</button>
                        <button class="mini-chip" data-sig="gap_gt_6mo" type="button">Gap</button>
                    </div>
                    </div>

                    <div class="filter-panel" id="panelMore" style="display:none;">
                    <div class="panel-title">More filters</div>
                    <div class="fine">Reserved for dates, owner, tags, etc. (later)</div>
                    </div>
                </div>

                <!-- RIGHT: search -->
                <div class="filter-rightcol">
                    <div class="searchbox">
                    <span class="fine" id="filterSummary">0/0</span>
                    <span class="fine">Search</span>
                    <input id="q" type="text" placeholder="filename…" />
                    <button class="btn btn-ghost btn-sm" id="clearFilters" type="button">Clear</button>
                    </div>
                </div>
            </div> <!-- END of FILTER Group -->
        </div> <!-- END of BODY -->
        <div id="listWrap">
            <div id="list" class="fine">Loading…</div>
        </div>

        <script>
          function esc(s) {
            return String(s || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }
  
          function pill(text, bg, bd, ink) {
            return '<span class="pill" style="background:'+bg+'; border-color:'+bd+'; color:'+ink+';">' + text + '</span>';
          }
  
            function computeCounts(items) {
            const counts = { all: items.length, green: 0, yellow: 0, red: 0 };
            for (const it of items) {
                const b = String(it?.latest_report?.bucket || "");
                if (b === "green") counts.green++;
                else if (b === "yellow") counts.yellow++;
                else if (b === "red") counts.red++;
            }
            return counts;
            }

            function setActiveBucket(bucket) {
            state.bucket = bucket || "all";
            document.querySelectorAll(".bucket-card").forEach(btn => {
                btn.dataset.active = (btn.dataset.bucket === state.bucket) ? "1" : "0";
            });
            render();
            }


          function bucketBadge(bucket) {
            const b = String(bucket || "unknown");
            if (b === "green") return pill("Green", "rgba(12,122,75,.10)", "rgba(12,122,75,.25)", "#0c7a4b");
            if (b === "yellow") return pill("Yellow", "rgba(245,158,11,.12)", "rgba(245,158,11,.28)", "#8a5a00");
            if (b === "red") return pill("Red", "rgba(180,35,24,.10)", "rgba(180,35,24,.25)", "#b42318");
            return pill(b, "rgba(11,18,32,.06)", "var(--border)", "var(--muted)");
          }
  
        function togglePanel(id) {
            const panels = ["panelScore", "panelSignals", "panelMore"];
            for (const p of panels) {
                const el = document.getElementById(p);
                if (!el) continue;
                el.style.display = (p === id && el.style.display === "none") ? "block" : "none";
            }
            }

            function renderActiveFilters() {
            const el = document.getElementById("activeFilters");
            if (!el) return;

            const chips = [];

            if (state.score === "score80") chips.push({ key:"score80", label:"Score ≥ 80", onRemove: () => { state.score=""; }});
            if (state.mode === "hasSignals") chips.push({ key:"hasSignals", label:"Has signals", onRemove: () => { state.mode=""; }});
            if (state.mode === "duplicateOnly") chips.push({ key:"duplicateOnly", label:"Duplicate", onRemove: () => { state.mode=""; }});

            for (const sig of (state.sigs || [])) {
                chips.push({ key:"sig:"+sig, label:sig, onRemove: () => { state.sigs = state.sigs.filter(x => x !== sig); }});
            }

            el.innerHTML = chips.map(c =>
            '<button class="active-chip" data-k="' + esc(c.key) + '" type="button">' +
                esc(c.label) + ' <span class="x">×</span>' +
            '</button>'
            ).join("");

            // attach handlers
            el.querySelectorAll(".active-chip").forEach(btn => {
                btn.addEventListener("click", () => {
                const k = btn.getAttribute("data-k") || "";
                const chip = chips.find(x => x.key === k);
                chip?.onRemove?.();
                syncMiniChipStates();
                render();
                });
            });
            }

            function syncMiniChipStates() {
            // score chips
            document.querySelectorAll('.mini-chip[data-score]').forEach(b => {
                b.dataset.active = (b.dataset.score === state.score) ? "1" : "0";
            });
            // mode chips
            document.querySelectorAll('.mini-chip[data-mode]').forEach(b => {
                b.dataset.active = (b.dataset.mode === state.mode) ? "1" : "0";
            });
            // signal chips
            document.querySelectorAll('.mini-chip[data-sig]').forEach(b => {
                const sig = b.dataset.sig;
                b.dataset.active = (state.sigs || []).includes(sig) ? "1" : "0";
            });

            renderActiveFilters();
        }

          async function readJson(res) {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) return await res.json();
            return { error: await res.text() };
          }
  
          function hasSignal(item, signalId) {
            const ids = item?.latest_report?.signal_ids;
            return Array.isArray(ids) && ids.includes(signalId);
          }
  
          function row(item) {
            const latest = item.latest_report;
  
            const dupPill = hasSignal(item, "duplicate_resume_upload")
              ? pill("Duplicate upload", "rgba(245,158,11,.12)", "rgba(245,158,11,.28)", "#8a5a00")
              : "";
  
            const latestHtml = latest
              ? '<div class="row" style="gap:8px; flex-wrap:wrap;">' +
                  bucketBadge(latest.bucket) +
                  pill('Score: ' + latest.trust_score, "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                  pill('Reports: ' + (item.report_count || 0), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                  pill('Signals: ' + (latest.triggered_count || 0), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                  (dupPill ? dupPill : "") +
                  pill('Uploads: ' + (item.ingest_count || 1), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                '</div>'
              : '<div class="fine">No reports yet</div>';
  
            return (
              '<div style="padding:12px; border:1px solid var(--border); border-radius:16px; background:rgba(255,255,255,.92); box-shadow:0 8px 20px rgba(11,18,32,.06);">' +
                '<div class="row" style="justify-content:space-between; gap:10px; align-items:flex-start;">' +
                  '<div>' +
                    '<div style="font-weight:900;">' + esc(item.filename || item.id) + '</div>' +
                    '<div class="fine">Created: ' + esc(item.created_at) + ' • Source: ' + esc(item.source_type) + ' • Extractor: ' + esc(item.extractor) + '</div>' +
                    '<div style="margin-top:8px;">' + latestHtml + '</div>' +
                  '</div>' +
                  '<div class="row" style="gap:8px;">' +
                    '<a class="btn" href="/trust/profile?id=' + encodeURIComponent(item.id) + '">Open</a>' +
                  '</div>' +
                '</div>' +
              '</div>'
            );
          }
  
        let allItems = [];
        let state = {
        bucket: "all",   // all | green | yellow | red
        score: "",       // "" | "score80"
        mode: "",        // "" | "hasSignals" | "duplicateOnly"
        sigs: [],        // signal ids
        q: ""
        };

        function applyFilters(items) {
        const q = (state.q || "").toLowerCase().trim();

        return items.filter(it => {
            const latest = it.latest_report;
            const bucket = String(latest?.bucket || "unknown");
            const score = Number(latest?.trust_score || 0);
            const sigIds = latest?.signal_ids || [];

            // status
            if (state.bucket !== "all" && bucket !== state.bucket) return false;

            // score
            if (state.score === "score80" && score < 80) return false;

            // quick modes
            if (state.mode === "hasSignals" && (!latest || Number(latest.triggered_count || 0) <= 0)) return false;
            if (state.mode === "duplicateOnly" && !sigIds.includes("duplicate_resume_upload")) return false;

            // signal chips (OR semantics)
            if (state.sigs.length) {
            const ok = state.sigs.some(s => sigIds.includes(s));
            if (!ok) return false;
            }

            // search
            if (q && !String(it.filename || "").toLowerCase().includes(q)) return false;

            return true;
        });
        }

        function render() {
        const el = document.getElementById("list");
        const items = applyFilters(allItems);
        el.innerHTML = items.length
            ? '<div style="display:grid; grid-template-columns: 1fr; gap:10px;">' + items.map(row).join("") + '</div>'
            : '<div class="fine">No matches.</div>';

        const s = document.getElementById("filterSummary");
        if (s) s.textContent = items.length + "/" + allItems.length;

        renderActiveFilters();
        }

        async function load() {
        const el = document.getElementById("list");
        if (!el) return;
        el.textContent = "Loading…";

        const res = await fetch("/api/trust/profiles");
        const data = await readJson(res);
        if (!res.ok) {
            el.textContent = data.error || "Failed";
            return;
        }
        allItems = data.items || [];
        const c = computeCounts(allItems);
        document.getElementById("countAll").textContent = String(c.all);
        document.getElementById("countGreen").textContent = String(c.green);
        document.getElementById("countYellow").textContent = String(c.yellow);
        document.getElementById("countRed").textContent = String(c.red);
        syncMiniChipStates();
        render();
        }
        
        // Bucket cards
        document.querySelectorAll(".bucket-card").forEach(btn => {
        btn.addEventListener("click", () => setActiveBucket(btn.dataset.bucket));
        });
        setActiveBucket("all");

        // Panels (+ Score / + Signals / + More)
        document.getElementById("openScore")?.addEventListener("click", () => togglePanel("panelScore"));
        document.getElementById("openSignals")?.addEventListener("click", () => togglePanel("panelSignals"));
        document.getElementById("openMore")?.addEventListener("click", () => togglePanel("panelMore"));

        // Mini chips: score
        document.querySelectorAll('.mini-chip[data-score]').forEach(btn => {
        btn.addEventListener("click", () => {
            const v = btn.dataset.score || "";
            state.score = (state.score === v) ? "" : v;
            syncMiniChipStates();
            render();
        });
        });

        // Mini chips: mode (mutually exclusive)
        document.querySelectorAll('.mini-chip[data-mode]').forEach(btn => {
        btn.addEventListener("click", () => {
            const v = btn.dataset.mode || "";
            state.mode = (state.mode === v) ? "" : v;
            syncMiniChipStates();
            render();
        });
        });

        // Mini chips: signals (multi-select)
        document.querySelectorAll('.mini-chip[data-sig]').forEach(btn => {
        btn.addEventListener("click", () => {
            const sig = btn.dataset.sig || "";
            const on = (state.sigs || []).includes(sig);
            state.sigs = on ? state.sigs.filter(x => x !== sig) : [...state.sigs, sig];
            syncMiniChipStates();
            render();
        });
        });

        // Search
        document.getElementById("q")?.addEventListener("input", (e) => {
        state.q = e.target.value || "";
        render();
        });

        // Clear
        document.getElementById("clearFilters")?.addEventListener("click", () => {
        state = { bucket: "all", score: "", mode: "", sigs: [], q: "" };

        // reset UI
        setActiveBucket("all");
        const q = document.getElementById("q");
        if (q) q.value = "";

        // close panels
        ["panelScore","panelSignals","panelMore"].forEach(id => {
            const p = document.getElementById(id);
            if (p) p.style.display = "none";
        });

        syncMiniChipStates();
        render();
        });

        // Refresh
        document.getElementById("refresh")?.addEventListener("click", load);

        // Initial
        syncMiniChipStates();
        load();
    </script>
            `
    });
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
}
export async function renderTrustSignalsPage(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const who = escapeHtml(
      sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter"
    );
  
    const card = (id, name, tier, desc) => `
      <div style="padding:14px; border:1px solid var(--border); border-radius:14px; background:rgba(255,255,255,.92); box-shadow:0 8px 20px rgba(11,18,32,.06);">
        <div style="font-weight:900;">${escapeHtml(name)}</div>
        <div class="fine">${escapeHtml(tier)} • <span style="font-family:ui-monospace;">${escapeHtml(id)}</span></div>
        <div style="margin-top:8px; color:rgba(11,18,32,.72); line-height:1.5;">${escapeHtml(desc)}</div>
      </div>
    `;
  
    const html = consoleShell({
      title: "Signals",
      who,
      active: "signals",
      body: `
        <div class="card">
          <div class="fine">Signal catalog (MVP)</div>
          <h2 style="margin:6px 0 0;">Signals</h2>
          <div class="divider"></div>
  
          <div style="display:grid; grid-template-columns: 1fr; gap:10px;">
            ${card("timeline_overlap", "Overlapping Roles", "Tier A", "Triggers when two roles overlap by >60 days. Hard triggers Red if high confidence.")}
            ${card("gap_gt_6mo", "Unexplained Gap > 6 Months", "Tier B", "Triggers when there is a gap >180 days between roles with a known end date.")}
            ${card("gap_after_edu_to_first_role", "Gap after education before first role", "Tier C", "Triggers when gap >180 days between latest education end and first role start.")}
            ${card("duplicate_roles", "Duplicate Role Entries", "Tier B", "Triggers when repeated role-like dated lines appear in Experience section (format/copy-paste issue).")}
            ${card("duplicate_resume_upload", "Duplicate Resume Upload (Cross-Upload)", "Tier B", "Triggers when doc_hash matches previously uploaded resume for same candidate.")}
          </div>
        </div>
      `
    });
  
    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
    });
  }
  
  
function signalCard(id, name, tier, desc) {
    return `
      <div style="padding:14px; border:1px solid var(--border); border-radius:14px;">
        <div style="font-weight:800;">${name}</div>
        <div class="fine">${tier}</div>
        <div style="margin-top:6px;">${desc}</div>
        <div style="margin-top:8px;" class="fine">Signal ID: ${id}</div>
      </div>
    `;
}
  

  // ---------------------------
  // 2) APIs
  // ---------------------------
  
export async function apiTrustIngest(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return json({ error: "forbidden" }, 403);
  
    let body = {};
    try { body = await request.json(); } catch {}
  
    const text = (body.text || "").toString();
    const filename = (body.filename || "pasted.txt").toString().slice(0, 200);
  
    const sourceType = (body.source || "paste").toString().slice(0, 50);
    const extractor = (body.extractor || "manual").toString().slice(0, 80);
  
    if (!text || text.trim().length < 100) {
      return json({ error: "text too short" }, 400);
    }
  
    const now = new Date().toISOString();
    const trustProfileId = crypto.randomUUID();
  
    // Normalize now (portable pure function)
    const normalized = normalizeResumeTextToProfileV1({
      candidateId: sess.candidate_id,
      sourceText: text,
      sourceFilename: filename,
      now,
    });
    const docHashV = "v1";
    const docHash = await sha256Hex(normalizeForDocHash(text));
    await env.DB.prepare(
        `INSERT INTO trust_candidate_profiles
         (id, org_id, created_by_candidate_id, source_type, source_filename, source_text, normalized_json,
          doc_hash, doc_hash_v,
          created_at, updated_at, extractor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
      trustProfileId,
      null,
      sess.candidate_id,
      sourceType,
      filename,
      text,
      JSON.stringify(normalized),
      docHash,
      docHashV,
      now,
      now,
      extractor
    ).run();
  
    return json({ ok: true, trust_profile_id: trustProfileId });
}
export async function apiTrustRun(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return json({ error: "forbidden" }, 403);
  
    let body = {};
    try { body = await request.json(); } catch {}
    const trustProfileId = (body.trust_profile_id || "").toString().trim();
    if (!trustProfileId) return json({ error: "trust_profile_id required" }, 400);
  
    // Load normalized profile
    const row = await env.DB.prepare(
      `SELECT id, normalized_json, source_text, created_at, doc_hash FROM trust_candidate_profiles WHERE id = ?`
    ).bind(trustProfileId).first();
    if (!row) return json({ error: "trust profile not found" }, 404);
  
    let profile;
    try { 
      profile = JSON.parse(row.normalized_json); 
    }catch { return json({ error: "stored normalized_json invalid" }, 500); }

    
    try{
      // Run signals (pure functions)
      const engineVersion = "trust_engine_v1_mvp";
      const orgConfig = defaultSignalConfigV1(); // toggles later
        // ✅ attach raw resume text for signals that need it (e.g., duplicate detection)
        profile.__source_text = row.source_text || "";
        // Cross-upload duplicate check (same candidate, same doc_hash)
        const docHash = (row.doc_hash || "").toString().trim();
        if (docHash) {
        const dupRow = await env.DB.prepare(
            `
            SELECT
            COUNT(1) AS prior_count,
            MIN(created_at) AS first_seen_at,
            MAX(created_at) AS last_seen_at
            FROM trust_candidate_profiles
            WHERE created_by_candidate_id = ?
            AND doc_hash = ?
            AND id != ?
            `
        ).bind(sess.candidate_id, docHash, trustProfileId).first();

        profile.__dup_doc = {
            doc_hash: docHash,
            prior_count: Number(dupRow?.prior_count || 0),
            first_seen_at: dupRow?.first_seen_at || null,
            last_seen_at: dupRow?.last_seen_at || null
        };
        } else {
            profile.__dup_doc = null;
        }
        const lastSeen = profile.__dup_doc?.last_seen_at ? Date.parse(profile.__dup_doc.last_seen_at) : null;
        const nowMs = Date.now();
        const minutesSinceLast = lastSeen ? Math.floor((nowMs - lastSeen) / 60000) : null;
        
        if (profile.__dup_doc) {
            profile.__dup_doc.minutes_since_last = minutesSinceLast;
        }
      const signals = runSignalsV1(profile, orgConfig);
      // Score + bucket
      const scored = scoreAndBucketV1(signals);
  
      // Persist report + signals
      const reportId = crypto.randomUUID();
      const now = new Date().toISOString();
  
      await env.DB.prepare(
        `INSERT INTO trust_reports
        (id, trust_profile_id, trust_score, bucket, hard_triggered, summary_json, engine_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        reportId,
        trustProfileId,
        scored.trust_score,
        scored.bucket,
        scored.hard_triggered ? 1 : 0,
        JSON.stringify(scored.summary),
        engineVersion,
        now
      ).run();
  
      // Insert triggered signals only (MVP keeps it simple)
      for (const s of signals.filter(x => x.status === "triggered")) {
        const sid = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO trust_signals
          (id, trust_report_id, signal_id, category, severity_tier, confidence, deduction, hard_trigger,
            status, evidence_json, explanation, questions_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          sid,
          reportId,
          s.signal_id,
          s.category,
          s.severity_tier,
          s.confidence,
          s.deduction,
          s.hard_trigger ? 1 : 0,
          s.status,
          JSON.stringify(s.evidence || {}),
          s.explanation || "",
          JSON.stringify(s.suggested_questions || []),
          now
        ).run();
      }
  
      return json({ ok: true, trust_report_id: reportId });
  
    }catch (e){
      // ✅ This will show stack in wrangler tail
      console.error("trust_run_failed", e && e.stack ? e.stack : e);
      return json({ error: "trust_run_failed", detail: String(e?.message || e) }, 500);
    }
}
export async function apiTrustProfile(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return json({ error: "forbidden" }, 403);
  
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) return json({ error: "id required" }, 400);
  
    const profile = await env.DB.prepare(
      `SELECT id, source_filename, source_type, extractor, created_at
       FROM trust_candidate_profiles
       WHERE id = ? AND created_by_candidate_id = ?`
    ).bind(id, sess.candidate_id).first();
  
    if (!profile) return json({ error: "profile not found" }, 404);
  
    const { results } = await env.DB.prepare(
      `SELECT id, trust_score, bucket, hard_triggered, engine_version, created_at
       FROM trust_reports
       WHERE trust_profile_id = ?
       ORDER BY created_at DESC
       LIMIT 20`
    ).bind(id).all();
  
    return json({
      profile,
      reports: (results || []).map(r => ({
        id: r.id,
        trust_score: r.trust_score,
        bucket: r.bucket,
        hard_triggered: !!r.hard_triggered,
        engine_version: r.engine_version,
        created_at: r.created_at
      }))
    });
}
export async function apiTrustProfiles(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return json({ error: "forbidden" }, 403);
  
    const { results } = await env.DB.prepare(
        `
        SELECT
          p.id,
          p.source_filename,
          p.source_type,
          p.extractor,
          p.created_at,
      
          (SELECT COUNT(1)
           FROM trust_candidate_profiles p2
           WHERE p2.created_by_candidate_id = p.created_by_candidate_id
             AND p2.source_filename = p.source_filename
          ) AS ingest_count,
      
          (SELECT COUNT(1) FROM trust_reports r WHERE r.trust_profile_id = p.id) AS report_count,
          (SELECT r2.id FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_report_id,
          (SELECT r2.trust_score FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_trust_score,
          (SELECT r2.bucket FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_bucket,
          (SELECT r2.created_at FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_report_created_at,
          (SELECT COUNT(1) FROM trust_signals s WHERE s.trust_report_id = (SELECT r2.id FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1)) AS latest_triggered_count,
          (SELECT GROUP_CONCAT(signal_id, ',') FROM (SELECT s.signal_id FROM trust_signals s WHERE s.trust_report_id = (SELECT r2.id FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) ORDER BY CASE s.severity_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, s.deduction DESC, s.created_at ASC LIMIT 5)) AS latest_signal_ids
      
        FROM trust_candidate_profiles p
        WHERE p.created_by_candidate_id = ?
          AND p.created_at = (
            SELECT MAX(p3.created_at)
            FROM trust_candidate_profiles p3
            WHERE p3.created_by_candidate_id = p.created_by_candidate_id
              AND p3.source_filename = p.source_filename
          )
        ORDER BY p.created_at DESC
        LIMIT 20
        `
      ).bind(sess.candidate_id).all();
      
  
    return json({
      items: (results || []).map(r => ({
        id: r.id,
        filename: r.source_filename,
        source_type: r.source_type,
        extractor: r.extractor,
        created_at: r.created_at,
        report_count: Number(r.report_count || 0),
        ingest_count: Number(r.ingest_count || 1),
        latest_report: r.latest_report_id ? {
          id: r.latest_report_id,
          trust_score: r.latest_trust_score,
          bucket: r.latest_bucket,
          created_at: r.latest_report_created_at,
          triggered_count: Number(r.latest_triggered_count || 0),
          signal_ids: (r.latest_signal_ids || "").split(",").map(x => x.trim()).filter(Boolean),
        } : null
      }))
    });
}  
export async function apiTrustReport(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);
  
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return json({ error: "forbidden" }, 403);
  
    const url = new URL(request.url);
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) return json({ error: "id required" }, 400);
  
    const report = await env.DB.prepare(
      `SELECT id, trust_profile_id, trust_score, bucket, hard_triggered, summary_json, engine_version, created_at
       FROM trust_reports WHERE id = ?`
    ).bind(id).first();
  
    if (!report) return json({ error: "report not found" }, 404);
  
    const { results } = await env.DB.prepare(
      `SELECT signal_id, category, severity_tier, confidence, deduction, hard_trigger, status,
              evidence_json, explanation, questions_json, created_at
       FROM trust_signals
       WHERE trust_report_id = ?
       ORDER BY severity_tier ASC, deduction DESC, created_at ASC`
    ).bind(id).all();
  
    const signals = (results || []).map(r => ({
      signal_id: r.signal_id,
      title: signalTitle(r.signal_id),
      category: r.category,
      severity_tier: r.severity_tier,
      confidence: r.confidence,
      deduction: r.deduction,
      hard_trigger: !!r.hard_trigger,
      status: r.status,
      evidence: safeJsonParse(r.evidence_json) || {},
      explanation: r.explanation || "",
      suggested_questions: safeJsonParse(r.questions_json) || []
    }));
  
    return json({
      report: {
        id: report.id,
        trust_profile_id: report.trust_profile_id,
        trust_score: report.trust_score,
        bucket: report.bucket,
        hard_triggered: !!report.hard_triggered,
        summary: safeJsonParse(report.summary_json) || {},
        engine_version: report.engine_version,
        created_at: report.created_at
      },
      signals
    });
}
export { apiTrustDebugProfile } from "../engine/signals_v1.js";
  