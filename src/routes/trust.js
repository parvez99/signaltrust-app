// ---------------------------
// 1) PAGES
// ---------------------------
import { json, escapeHtml, redirect } from "../lib/http.js"
import { pageShell } from "../lib/ui.js";
import { requireSession, isRecruiter, isAdmin } from "../lib/session.js"; 
import { normalizeResumeTextToProfileV1 } from "../engine/normalize_v1.js";
import { defaultSignalConfigV1, runSignalsV1, signalTitle } from "../engine/signals_v1";
import { scoreAndBucketV1 } from "../engine/scoring_v1";
import { safeJsonParse } from "../lib/utils.js";
import { sha256Hex, normalizeForDocHash } from "../lib/crypto.js";
import { consoleShell } from "../lib/console_ui.js";
import { runTrustPipeline } from "../engine/run_trust_pipeline"
import { createProcessingBatch } from "../db/batches.js";

export async function renderTrustHome(request, env) {
    const sess = await requireSession(request, env);
    if (!sess) return redirect("/");
  
    // Gate to recruiter/admin for MVP (optional)
    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return new Response("Forbidden", { status: 403 });
  
    const who = escapeHtml(sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter");
  
    const html = consoleShell({
      title: "Trust Engine",
      who,
      active: "upload",   // 👈 add this (explained below)
      body: `
        <div class="card">
          <h2 style="margin:0 0 6px;">Trust Report (MVP)</h2>
          <div class="fine">Upload a PDF or paste resume text. We’ll normalize → run signals → score → report.</div>
    
          <div class="divider"></div>
          <label class="label">Upload PDF (optional)</label>
          <input id="pdf" type="file" accept="application/pdf" />
    
          <div class="fine" style="margin-top:8px;">
            If you upload a PDF, we’ll extract text in the browser and send text to the server.
          </div>
    
          <label class="label">Resume text</label>
          <textarea id="resumeText" rows="16"
            placeholder="Paste resume text here…"
            style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;"></textarea>
    
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
            overflow:auto; max-height:260px;"></pre>
    
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

  const who = escapeHtml(
    sess.google_name || sess.github_username || sess.email || sess.google_email || "Recruiter"
  );

  // Look up the profile id + stored PDF key for this report
  const profileRow = await env.DB.prepare(
    `SELECT p.id AS profile_id, p.source_file_key
     FROM trust_candidate_profiles p
     JOIN trust_reports r ON r.trust_profile_id = p.id
     WHERE r.id = ?1
     LIMIT 1`
  )
    .bind(id)
    .first();

  const profileId = profileRow?.profile_id || null;

  let pdfUrl = null;
  if (profileRow?.source_file_key) {
    pdfUrl = "/api/trust/pdf?report_id=" + encodeURIComponent(id);
  }

  const html = consoleShell({
    title: "Investigation Workspace",
    who,
    active: "profiles",
    mode: "workspace",

    // CENTER PANE (Document)
    center: pdfUrl
      ? `
        <div style="padding:0;">
          <style>
            .doc-grid{
              display:grid;
              grid-template-columns: 320px 1fr;
              gap: 14px;
              align-items: stretch;
            }

            /* Sidebar */
            .doc-side{
              position: relative;
              height: calc(100vh - 120px);
              overflow: hidden;
              border-radius: 16px;
              background: rgba(255,255,255,.92);
              border: 1px solid var(--border);
              box-shadow: 0 8px 20px rgba(11,18,32,.06);
            }

            .doc-side-inner{
              height: 100%;
              overflow: auto;
              padding: 12px;
            }

            .doc-main{ min-width: 0; }

            .doc-toggle{
              position: absolute;
              top: 10px;
              right: -12px;
              width: 28px;
              height: 28px;
              border-radius: 10px;
              border: 1px solid var(--border);
              background: rgba(255,255,255,.95);
              font-weight: 900;
              cursor: pointer;
              box-shadow: 0 10px 24px rgba(11,18,32,.12);
            }

            .doc-grid.collapsed{ grid-template-columns: 54px 1fr; }
            .doc-grid.collapsed .doc-side-inner{ opacity: 0; pointer-events: none; }
            .doc-grid.collapsed .doc-side::after{
              content: "Document";
              position: absolute;
              left: 50%;
              top: 52px;
              transform: translateX(-50%);
              writing-mode: vertical-rl;
              text-orientation: mixed;
              font-weight: 900;
              font-size: 12px;
              color: rgba(11,18,32,.55);
              letter-spacing: .08em;
            }

            .doc-kv{ display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); }
            .doc-kv:last-child{ border-bottom:0; }
            .doc-k{ color: var(--muted); font-size:12px; }
            .doc-v{ font-weight:800; color: rgba(11,18,32,.86); font-size:12px;}
            .doc-sec{ margin-top:12px; }
            .doc-sec-title{ font-weight:900; margin:4px 0 8px; }

            /* --- Hard stop: nothing in the right pane should bleed out --- */
            .card { overflow: hidden; }
            .rt-panel { overflow: hidden; }
            #insights { width: 100%; min-width: 0; }
            .insight-list { width: 100%; min-width: 0; }
            .insight-row { width: 100%; min-width: 0; box-sizing: border-box; }
            .insight-left { min-width: 0; }
            .insight-left > div { min-width: 0; }
            .insight-title, .insight-sub { min-width: 0; }
            .insight-title, .insight-sub { overflow: hidden; text-overflow: ellipsis; }

            /* Enterprise typography */
            :root{
              --ink-strong: rgba(11,18,32,.88);
              --ink: rgba(11,18,32,.78);
              --ink-soft: rgba(11,18,32,.62);
            }
            body{
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              letter-spacing: .01em;
            }
            #headlineTitle{
              font-weight: 700 !important;
              color: var(--ink-strong);
              font-size: 16px !important;
            }
            .fine{ color: var(--ink-soft) !important; font-weight: 500 !important; }
            .btn{ font-weight: 600 !important; }
            .doc-sec-title{ font-weight: 650 !important; color: var(--ink-strong); letter-spacing: .01em; }
            .doc-k{ color: var(--ink-soft) !important; font-weight: 500 !important; }
            .doc-v{ color: var(--ink) !important; font-weight: 600 !important; }

            .insight-title{ font-weight: 650 !important; color: var(--ink-strong); font-size: 13px !important; }
            .insight-sub{ color: var(--ink-soft) !important; font-weight: 500 !important; font-size: 12px !important; }
            .card{ box-shadow: 0 10px 28px rgba(11,18,32,.06) !important; }

            /* Make all grid/flex containers allow children to shrink */
            .row, .workspace, .workspace-main, .workspace-right { min-width: 0; }

            /* Hide global header when report is inside modal */
            .embedded-report header,
            .embedded-report .console-header,
            .embedded-report .console-topbar{
              display:none !important;
            }
          </style>

          <div class="doc-grid" id="docGrid">
            <!-- LEFT SIDEBAR -->
            <aside class="doc-side" id="docSide">
              <button class="doc-toggle" id="docToggle" type="button" aria-label="Collapse document panel" title="Collapse">◀</button>

              <div class="doc-side-inner">
                <div class="doc-sec">
                  <div class="doc-sec-title">Candidate</div>

                  <div class="doc-kv">
                    <div class="doc-k">Name</div>
                    <div class="doc-v" id="docCandidate">—</div>
                  </div>

                  <div class="doc-kv">
                    <div class="doc-k">Email</div>
                    <div class="doc-v">
                      <a id="docEmailLink" href="#" style="display:none;"></a>
                      <span id="docEmail">—</span>
                    </div>
                  </div>

                  <div class="doc-kv">
                    <div class="doc-k">LinkedIn</div>
                    <div class="doc-v">
                      <a id="docLinkedIn" href="#" target="_blank" rel="noreferrer" style="display:none;">Open</a>
                      <span id="docLinkedInNone">—</span>
                    </div>
                  </div>

                  <div class="doc-kv">
                    <div class="doc-k">GitHub</div>
                    <div class="doc-v">
                      <a id="docGitHub" href="#" target="_blank" rel="noreferrer" style="display:none;">Open</a>
                      <span id="docGitHubNone">—</span>
                    </div>
                  </div>

                  <div class="doc-kv">
                    <div class="doc-k">Location</div>
                    <div class="doc-v" id="docLocation">—</div>
                  </div>
                </div>

                <div class="doc-sec">
                  <div class="doc-sec-title">Trust</div>

                  <div class="doc-kv">
                    <div class="doc-k">Trust score</div>
                    <div class="doc-v" id="docTrustScore">—</div>
                  </div>

                  <div class="doc-kv">
                    <div class="doc-k">Bucket</div>
                    <div class="doc-v" id="docBucket">—</div>
                  </div>

                  <div class="doc-kv">
                    <div class="doc-k">Report created</div>
                    <div class="doc-v" id="docUploaded">—</div>
                  </div>
                </div>
              </div>
            </aside>

            <!-- PDF VIEWER -->
            <section class="doc-main">
              <div class="row" style="align-items:center; gap:10px; margin-bottom:10px;">
                <div style="font-weight:900;">Resume</div>
                <span class="pill">PDF</span>
                <span class="spacer"></span>
                <a class="btn btn-sm btn-ghost" href="${pdfUrl}" target="_blank">Open</a>
              </div>

              <iframe
                src="${pdfUrl}"
                style="width:100%; height:82vh; border:0; border-radius:14px; background:#fff;">
              </iframe>
            </section>
          </div>
        </div>
      `
      : `
        <div class="card">
          <div class="fine">No PDF stored for this report.</div>
          <div class="fine" style="margin-top:6px;">Upload via Trust Home PDF picker to store it.</div>
        </div>
      `,

    // RIGHT PANE (Risk & Signals)
    body: `
      <div class="rt-wrap">
        <div class="row" style="margin-top:2px;">
          ${
            profileId
              ? `<button onclick="window.parent.closeReportModal()" class="btn btn-sm">← Back to Profiles</button>`
              : `<span class="fine">Missing profile id</span>`
          }
          <span class="spacer"></span>
          <button class="btn" id="refresh" type="button">Refresh</button>
        </div>

        <div class="card" style="margin-top:12px;">
          <div class="row" style="align-items:flex-end; gap:10px;">
            <div>
              <div class="fine">Trust Report</div>
              <div id="headlineTitle" style="margin-top:6px; font-weight:1000; font-size:18px;">Loading…</div>
            </div>

            <span class="spacer"></span>

            <div class="row" style="gap:10px; align-items:center;">
              <div id="bucketMini"></div>
              <div class="fine" id="scoreMini" style="opacity:.75;">—</div>
            </div>
          </div>

          <div class="divider" style="margin-top:12px;"></div>

          <!-- Tabs styled like screenshot #2 (not pill buttons) -->
          <style>
            /* --- Modal (fix: ensure it overlays, never inline) --- */
            .modal-backdrop{
              position: fixed;
              inset: 0;
              background: rgba(11,18,32,.45);
              display: none;
              align-items: center;
              justify-content: center;
              z-index: 9999;
              padding: 18px;
            }
            .modal-backdrop.open{ display:flex; }

            .modal-card{
              width: min(980px, 96vw);
              max-height: 86vh;
              overflow: auto;
              border-radius: 18px;
              background: rgba(255,255,255,.96);
              border: 1px solid rgba(11,18,32,.12);
              box-shadow: 0 18px 55px rgba(11,18,32,.22);
              backdrop-filter: blur(8px);
            }
            .modal-head{
              position: sticky;
              top: 0;
              background: rgba(246,251,251,.85);
              backdrop-filter: blur(8px);
              border-bottom: 1px solid rgba(11,18,32,.10);
              padding: 12px 14px;
              display:flex;
              align-items:center;
              gap: 10px;
              z-index: 2;
            }
            .modal-title{ font-weight: 1000; letter-spacing:.2px; }
            .modal-body{ padding: 14px; }

            .codebox{
              white-space: pre-wrap;
              background: rgba(11,18,32,.04);
              border: 1px solid var(--border);
              border-radius: 14px;
              padding: 12px;
              overflow: auto;
            }
            .rt-wrap{ min-width:0; width:100%; overflow:hidden; }
            .rt-wrap *{ min-width:0; }

            .rt-tabs2{
              display:flex;
              gap: 18px;
              border-bottom: 1px solid rgba(11,18,32,.10);
              margin-top: 10px;
              padding-bottom: 6px;
            }
            .rt-tab2{
              appearance:none;
              border:0;
              background:transparent;
              padding: 8px 2px;
              font-weight: 800;
              font-size: 13px;
              color: rgba(11,18,32,.58);
              cursor: pointer;
              position: relative;
            }
            .rt-tab2.active{
              color: rgba(11,18,32,.88);
            }
            .rt-tab2.active::after{
              content:"";
              position:absolute;
              left:0;
              right:0;
              bottom:-7px;
              height:2px;
              border-radius: 999px;
              background: rgba(0,170,170,.70);
            }

            .rt-panel{ margin-top: 12px; }
            .rt-panel[hidden]{ display:none; }

            .riskbar{
              height: 8px;
              border-radius: 999px;
              background: rgba(11,18,32,.06);
              overflow:hidden;
              border: 1px solid rgba(11,18,32,.06);
            }
            .riskbar > div{
              height: 100%;
              width: 0%;
              background: rgba(180,35,24,.55);
            }

            /* Summary (like screenshot #2) */
            .sum-head{
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
            }
            .sum-title{
              font-weight: 950;
              font-size: 16px;
              color: rgba(11,18,32,.90);
            }
            .sum-right{
              display:flex;
              align-items:center;
              gap:10px;
            }
            .sum-score{
              font-weight: 850;
              font-size: 13px;
              color: rgba(11,18,32,.65);
            }

            /* Insights list (accordion rows) */
            #panelAnalysis, #insights{ min-width:0; width:100%; overflow:hidden; }
            .insight-list{ display:flex; flex-direction:column; gap:8px; }

            .insight-row{
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
              padding:10px 12px;
              border:1px solid var(--border);
              border-radius:14px;
              background: rgba(255,255,255,.92);
              box-shadow: 0 8px 20px rgba(11,18,32,.05);
              cursor:pointer;
              width:100%;
              min-width:0;
              box-sizing:border-box;
            }
            .insight-left{ display:flex; align-items:center; gap:10px; min-width:0; }
            .insight-icon{
              width:22px; height:22px; border-radius:999px;
              display:flex; align-items:center; justify-content:center;
              font-weight:900; flex:0 0 auto;
              border: 1px solid rgba(180,35,24,.25);
              background: rgba(180,35,24,.10);
              color: #b42318;
            }
            .insight-icon.sevA{ border-color: rgba(180,35,24,.25); background: rgba(180,35,24,.10); color:#b42318; }
            .insight-icon.sevB{ border-color: rgba(245,158,11,.30); background: rgba(245,158,11,.12); color:#8a5a00; }
            .insight-icon.sevC{ border-color: rgba(12,122,75,.25); background: rgba(12,122,75,.10); color:#0c7a4b; }

            .insight-title{ font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; }
            .insight-sub{ color: rgba(11,18,32,.60); font-size:12px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; }

            .insight-right{ display:flex; align-items:center; gap:8px; flex:0 0 auto; }
            .chev{
              width: 18px;
              text-align:center;
              opacity:.6;
              transition: transform .12s ease, opacity .12s ease;
              font-weight: 900;
            }
            .insight-row.open .chev{ transform: rotate(180deg); opacity:.85; }

            .insight-details{
              display:none;
              margin-top:8px;
              padding:10px 12px;
              border-radius:14px;
              border:1px solid var(--border);
              background: rgba(11,18,32,.03);
            }
            .insight-row.open + .insight-details{ display:block; }

            /* Footer row like screenshot #2 */
            .insights-footer{
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:10px;
              padding-top: 10px;
            }
            .linklike{
              border:0;
              background:transparent;
              font-weight:900;
              cursor:pointer;
              padding: 8px 0;
              color: rgba(11,18,32,.86);
            }
            .mutedmeta{ color: rgba(11,18,32,.55); font-weight:700; font-size:12px; }
          </style>

          <div class="rt-tabs2" role="tablist" aria-label="Report tabs">
            <button class="rt-tab2 active" id="tabAnalysis" type="button" role="tab" aria-selected="true">Analysis</button>
            <button class="rt-tab2" id="tabDetails" type="button" role="tab" aria-selected="false">Details</button>
          </div>

          <div class="rt-panel" id="panelAnalysis" role="tabpanel">
            <!-- Summary card (single summary; AI summary stays inside) -->
            <div class="card" style="margin-top:12px;">
              <div class="sum-head">
                <div>
                  <div class="fine">Summary</div>
                  <div class="sum-title" id="summaryTitle" style="margin-top:6px;">Summary</div>
                </div>
                <div class="sum-right">
                  <div id="summaryBadge"></div>
                  <div class="sum-score" id="summaryScore">—</div>
                </div>
              </div>

              <div style="margin-top:12px;">
                <div class="row" style="align-items:center;">
                  <div class="fine" id="riskLabel">Risk</div>
                  <span class="spacer"></span>
                  <div class="fine" id="riskNumber">—</div>
                </div>
                <div class="riskbar" style="margin-top:6px;">
                  <div id="riskFill"></div>
                </div>
              </div>

              <div class="rt-summary-text" id="narrative" style="margin-top:10px; color:rgba(11,18,32,.70); line-height:1.45;"></div>

              <!-- Keep AI Summary, but inside the same Summary card -->
              <div class="divider" style="margin-top:12px;"></div>
              <div class="fine">AI Summary</div>
              <div id="aiSummaryText" style="margin-top:8px; line-height:1.5; color:rgba(11,18,32,.72);">
                <span class="fine">(loading…)</span>
              </div>
            </div>

            <!-- Insights moved BELOW AI summary -->
            <div class="card" style="margin-top:12px;">
              <div class="row" style="align-items:center; gap:10px;">
                <div class="fine" style="font-weight:700;">Insights</div>
                <span class="pill" id="insightCountPill" style="background:rgba(11,18,32,.06); border-color:var(--border); color:rgba(11,18,32,.72);">—</span>
                <span class="spacer"></span>
                <button class="btn btn-ghost" id="btnToggleInsights" type="button" aria-expanded="true">Collapse</button>
              </div>

              <div class="divider"></div>

              <div id="insightsWrap">
                <div id="insights" class="insight-list">
                  <div class="fine">Loading insights…</div>
                </div>

                <div class="divider"></div>

                <div class="insights-footer">
                  <button class="linklike" id="btnFullAnalysis" type="button" disabled>View Full Analysis</button>
                  <div class="mutedmeta" id="checkedCount"></div>
                </div>
              </div>
            </div>

            <!-- Copy actions (kept, but moved BELOW Insights, and no duplicate “selected block”) -->
            <div class="row" style="gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px;">
              <button class="btn btn-ghost" id="btnCopySummary" type="button" disabled>Copy recruiter summary</button>
              <button class="btn btn-ghost" id="btnCopyQuestions" type="button" disabled>Copy interview questions</button>
              <span class="fine" id="copyToast" style="display:none;"></span>
            </div>
          </div>

          <div class="rt-panel" id="panelDetails" role="tabpanel" hidden>
            <div class="divider"></div>
            <div class="fine">Details</div>

            <div style="display:grid; grid-template-columns:1fr; gap:10px; margin-top:10px;">
              <div class="card">
                <div class="fine">Engine</div>
                <div style="font-weight:900; margin-top:6px;" id="dEngine">—</div>
                <div class="fine" style="margin-top:6px;" id="dExtraction">—</div>
              </div>

              <details class="card">
                <summary class="fine">Show raw report JSON</summary>
                <pre class="codebox" id="dReportJson" style="margin-top:10px; white-space:pre-wrap; background:rgba(11,18,32,.04); border:1px solid var(--border); border-radius:14px; padding:12px; overflow:auto;"></pre>
              </details>

              <details class="card">
                <summary class="fine">Show raw insights JSON</summary>
                <pre class="codebox" id="dSignalsJson" style="margin-top:10px; white-space:pre-wrap; background:rgba(11,18,32,.04); border:1px solid var(--border); border-radius:14px; padding:12px; overflow:auto;"></pre>
              </details>
            </div>
          </div>

          <!-- Full Analysis Modal -->
          <div class="modal-backdrop" id="analysisModal" aria-hidden="true">
            <div class="modal-card">
              <div class="modal-head">
                <div class="modal-title">Full Analysis</div>
                <span class="spacer"></span>
                <button class="btn btn-ghost" id="btnCloseModal" type="button">Close</button>
              </div>
              <div class="modal-body">
                <div class="fine">Report</div>
                <pre class="codebox" id="mReport" style="margin-top:8px; white-space:pre-wrap; background:rgba(11,18,32,.04); border:1px solid var(--border); border-radius:14px; padding:12px; overflow:auto;"></pre>

                <div class="divider"></div>

                <div class="fine">Insights</div>
                <pre class="codebox" id="mSignals" style="margin-top:8px; white-space:pre-wrap; background:rgba(11,18,32,.04); border:1px solid var(--border); border-radius:14px; padding:12px; overflow:auto;"></pre>

                <div class="divider"></div>

                <div class="fine">Evaluation (LLM meta)</div>
                <pre class="codebox" id="mEval" style="margin-top:8px; white-space:pre-wrap; background:rgba(11,18,32,.04); border:1px solid var(--border); border-radius:14px; padding:12px; overflow:auto;">(loading…)</pre>

                <div class="divider"></div>

                <div class="fine">Normalized profile snapshot</div>
                <pre class="codebox" id="mNorm" style="margin-top:8px; white-space:pre-wrap; background:rgba(11,18,32,.04); border:1px solid var(--border); border-radius:14px; padding:12px; overflow:auto;">(loading…)</pre>
              </div>
            </div>
          </div>
        </div>

        <script>
          // Detect if this report page is opened inside the modal iframe
          // detect modal embed
          if (window.self !== window.top) {
            document.documentElement.classList.add("embedded-report");
            document.querySelector(".nav")?.remove();
          }
          const reportId = ${JSON.stringify(id)};
          let __lastReport = null;
          let __lastSignals = [];

          function pickFirst(...vals) {
            for (const v of vals) {
              if (typeof v === "string" && v.trim()) return v.trim();
            }
            return "";
          }

          function esc(s) {
            return String(s || "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;");
          }

          function pill(text, bg, bd, ink) {
            return '<span class="pill" style="background:' + bg + '; border-color:' + bd + '; color:' + ink + ';">' + text + '</span>';
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

          async function readJson(res) {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) return await res.json();
            return { error: await res.text() };
          }

          function setEmail(email) {
            const a = document.getElementById("docEmailLink");
            const s = document.getElementById("docEmail");
            const e = String(email || "").trim();
            if (!a || !s) return;

            if (e) {
              a.href = "mailto:" + e;
              a.textContent = e;
              a.style.display = "inline";
              a.style.textDecoration = "none";
              a.style.color = "rgba(0,120,120,1)";
              s.style.display = "none";
            } else {
              a.style.display = "none";
              s.style.display = "inline";
              s.textContent = "—";
            }
          }

          function prettyUrl(u) {
            const s = String(u || "").trim();
            if (!s) return "";
            try {
              const x = new URL(s);
              let out = x.hostname + x.pathname;
              if (out.endsWith("/")) out = out.slice(0, -1);
              if (out.length > 28) return out.slice(0, 28) + "...";
              return out;
            } catch (e) {
              if (s.length > 28) return s.slice(0, 28) + "...";
              return s;
            }
          }

          function setLink(anchorId, noneId, url) {
            const a = document.getElementById(anchorId);
            const n = document.getElementById(noneId);
            const u = String(url || "").trim();
            if (!a || !n) return;

            if (u) {
              const href = (u.startsWith("http://") || u.startsWith("https://")) ? u : ("https://" + u);
              a.href = href;
              a.textContent = prettyUrl(href);
              a.style.display = "inline";
              a.style.fontWeight = "650";
              a.style.color = "rgba(0,120,120,1)";
              a.style.textDecoration = "none";
              n.style.display = "none";
            } else {
              a.style.display = "none";
              n.style.display = "inline";
            }
          }

          // --- Document sidebar collapse ---
          (function initDocSidebar() {
            const grid = document.getElementById("docGrid");
            const btn = document.getElementById("docToggle");
            if (!grid || !btn) return;

            const KEY = "st_doc_sidebar_collapsed";
            const saved = localStorage.getItem(KEY);
            if (saved === "1") grid.classList.add("collapsed");

            function syncIcon() {
              const isCollapsed = grid.classList.contains("collapsed");
              btn.textContent = isCollapsed ? "▶" : "◀";
              btn.title = isCollapsed ? "Expand" : "Collapse";
              btn.setAttribute("aria-label", isCollapsed ? "Expand document panel" : "Collapse document panel");
            }

            btn.addEventListener("click", () => {
              grid.classList.toggle("collapsed");
              localStorage.setItem(KEY, grid.classList.contains("collapsed") ? "1" : "0");
              syncIcon();
            });

            syncIcon();
          })();

          function commercializeOneLiner(ttl, explanation) {
            const t = String(ttl || "").toLowerCase();
            const e = String(explanation || "");
            if (t.includes("gap")) return "Verify timeline; ask for context (career break, exam prep, notice period).";
            if (t.includes("overlap")) return "Clarify concurrent roles to reduce hiring risk.";
            if (t.includes("duplicate")) return "Confirm source consistency; potential copy/paste or reused content.";
            return e.length > 90 ? (e.slice(0, 90) + "…") : e;
          }

          function signalRow(s, idx) {
            const title = esc((s && (s.title || s.signal_id)) ? (s.title || s.signal_id) : "Signal");
            const explRaw = String((s && s.explanation) || "");
            const expl = esc(explRaw);

            const sevTier = String((s && s.severity_tier) || "C");
            const conf = String((s && s.confidence) || "low");

            const impact =
              (sevTier === "A") ? "High risk" :
              (sevTier === "B") ? "Moderate risk" :
              "Low risk";

            const confTxt =
              (conf === "high") ? "High confidence" :
              (conf === "medium") ? "Medium confidence" :
              "Low confidence";

            const meta = impact + " • " + confTxt;
            const sub = commercializeOneLiner(title, explRaw);

            const iconChar = (sevTier === "C") ? "✓" : "!";
            const iconClass =
              (sevTier === "A") ? "sevA" :
              (sevTier === "B") ? "sevB" :
              "sevC";

            return (
              '<div class="insight-item">' +
                '<div class="insight-row" data-i="' + idx + '" role="button" tabindex="0" aria-expanded="false">' +
                  '<div class="insight-left">' +
                    '<div class="insight-icon ' + iconClass + '">' + iconChar + '</div>' +
                    '<div style="min-width:0;">' +
                      '<div class="insight-title">' + title + '</div>' +
                      '<div class="insight-sub">' + esc(meta) + (sub ? (" — " + esc(sub)) : "") + '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="insight-right">' +
                    severityTag(sevTier) +
                    '<div class="chev" aria-hidden="true">▾</div>' +
                  '</div>' +
                '</div>' +

                '<div class="insight-details" id="insightDetail_' + idx + '">' +
                  (expl ? ('<div style="color:rgba(11,18,32,.75); line-height:1.5;">' + expl + '</div>') : '') +
                  ((Array.isArray(s && s.suggested_questions) && s.suggested_questions.length)
                    ? (
                        '<div style="margin-top:10px;">' +
                          '<div class="fine">Suggested questions</div>' +
                          '<ul style="margin:8px 0 0; padding-left:18px;">' +
                            s.suggested_questions.map(function(q){ return '<li>' + esc(q) + '</li>'; }).join('') +
                          '</ul>' +
                        '</div>'
                      )
                    : ''
                  ) +
                '</div>' +
              '</div>'
            );
          }

          async function copyToClipboard(text) {
            try {
              await navigator.clipboard.writeText(text);
              return true;
            } catch (e) {
              try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const ok = document.execCommand("copy");
                document.body.removeChild(ta);
                return ok;
              } catch {
                return false;
              }
            }
          }

          function showToast(msg) {
            const el = document.getElementById("copyToast");
            if (!el) return;
            el.textContent = msg;
            el.style.display = "inline";
            clearTimeout(window.__toastT);
            window.__toastT = setTimeout(function () {
              el.style.display = "none";
            }, 1400);
          }

          function buildInterviewQuestions(signals) {
            const list = Array.isArray(signals) ? signals : [];
            const seen = new Set();
            const out = [];
            const NL = String.fromCharCode(10);

            for (const s of list) {
              const title = (s && (s.title || s.signal_id)) ? (s.title || s.signal_id) : "Signal";
              const qs = Array.isArray(s && s.suggested_questions) ? s.suggested_questions : [];
              const cleanQs = qs.map(function (q) { return String(q || "").trim(); }).filter(Boolean);
              if (!cleanQs.length) continue;

              out.push("## " + title);
              for (const q of cleanQs) {
                const key = q.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                out.push("- " + q);
              }
              out.push("");
            }
            return out.join(NL).trim();
          }

          function buildRecruiterSummary(report, signals) {
            const score = Number((report && report.trust_score) || 0);
            const bucket = String((report && report.bucket) || "unknown").toUpperCase();
            const NL = String.fromCharCode(10);
            const list = Array.isArray(signals) ? signals : [];

            const top = list.slice(0, 3).map(function (s) {
              const title = (s && (s.title || s.signal_id)) ? (s.title || s.signal_id) : "Signal";
              const sev = s?.severity_tier ? s.severity_tier : "?";
              const ded = Number(s?.deduction || 0);
              const dd = (ded === 0) ? "0" : (ded > 0 ? ("-" + ded) : ("+" + Math.abs(ded)));
              return "- [Tier " + sev + "] " + title + " (" + dd + ")";
            }).join(NL) || "- None";

            const questions = buildInterviewQuestions(signals);

            return [
              "SignalTrust Summary",
              "Score: " + score + " (" + bucket + ")",
              "",
              "Top risks:",
              top,
              "",
              questions ? ("Interview questions:" + NL + questions) : ("Interview questions:" + NL + "- None"),
            ].join(NL);
          }

          function setTab(which) {
            const a = document.getElementById("tabAnalysis");
            const d = document.getElementById("tabDetails");
            const pa = document.getElementById("panelAnalysis");
            const pd = document.getElementById("panelDetails");

            const isAnalysis = which === "analysis";
            a.classList.toggle("active", isAnalysis);
            d.classList.toggle("active", !isAnalysis);

            a.setAttribute("aria-selected", isAnalysis ? "true" : "false");
            d.setAttribute("aria-selected", !isAnalysis ? "true" : "false");

            pa.hidden = !isAnalysis;
            pd.hidden = isAnalysis;
          }

          function openModal() {
            const m = document.getElementById("analysisModal");
            if (!m) return;
            m.classList.add("open");
            m.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
          }

          function closeModal() {
            const m = document.getElementById("analysisModal");
            if (!m) return;
            m.classList.remove("open");
            m.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
          }

          document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
          });

          document.getElementById("btnCloseModal")?.addEventListener("click", closeModal);
          document.getElementById("analysisModal")?.addEventListener("click", (e) => {
            if (e.target && e.target.id === "analysisModal") closeModal();
          });

          document.getElementById("tabAnalysis")?.addEventListener("click", () => setTab("analysis"));
          document.getElementById("tabDetails")?.addEventListener("click", () => setTab("details"));

          async function load() {
            const btnCopySummary = document.getElementById("btnCopySummary");
            const btnCopyQuestions = document.getElementById("btnCopyQuestions");

            const ht = document.getElementById("headlineTitle");
            if (ht) ht.textContent = "Loading…";
            const insights = document.getElementById("insights");
            if (insights) insights.innerHTML = '<div class="fine">Loading…</div>';

            const res = await fetch("/api/trust/report?id=" + encodeURIComponent(reportId));
            const data = await readJson(res);

            if (!res.ok) {
              if (ht) ht.textContent = "Failed to load";
              const narrative = document.getElementById("narrative");
              if (narrative) narrative.textContent = data.error || "Error";
              if (insights) insights.innerHTML = "";
              return;
            }

            const report = data.report;
            const signals = Array.isArray(data.signals) ? data.signals : [];
            __lastReport = report;
            __lastSignals = signals;

            // Details tab
            document.getElementById("dEngine").textContent = String(report.engine_version || "—");
            const dExtraction = document.getElementById("dExtraction");
            if (dExtraction) {
              dExtraction.textContent =
                "Created: " + (report.created_at || "—") +
                " • Bucket: " + (report.bucket || "—") +
                " • Hard: " + (report.hard_triggered ? "Yes" : "No");
            }
            document.getElementById("dReportJson").textContent = JSON.stringify(report, null, 2);
            document.getElementById("dSignalsJson").textContent = JSON.stringify(signals, null, 2);

            const score = Number(report.trust_score || 0);
            const bucket = String(report.bucket || "unknown");

            // Header
            if (ht) ht.textContent = "Risk & Signals";
            const scoreMini = document.getElementById("scoreMini");
            if (scoreMini) scoreMini.textContent = "Score " + String(score);

            const bucketMini = document.getElementById("bucketMini");
            if (bucketMini) bucketMini.innerHTML = bucketBadge(bucket);

            // Summary badge + score (right side of summary card header)
            const summaryBadge = document.getElementById("summaryBadge");
            if (summaryBadge) summaryBadge.innerHTML = bucketBadge(bucket);
            const summaryScore = document.getElementById("summaryScore");
            if (summaryScore) summaryScore.textContent = String(score);

            // Risk bar (inverse of trust)
            const risk = Math.max(0, Math.min(100, 100 - score));
            const riskNumber = document.getElementById("riskNumber");
            if (riskNumber) riskNumber.textContent = String(risk);

            const riskFill = document.getElementById("riskFill");
            if (riskFill) {
              riskFill.style.width = risk + "%";
              if (bucket === "green") riskFill.style.background = "rgba(12,122,75,.55)";
              else if (bucket === "yellow") riskFill.style.background = "rgba(245,158,11,.65)";
              else if (bucket === "red") riskFill.style.background = "rgba(180,35,24,.60)";
              else riskFill.style.background = "rgba(11,18,32,.25)";
            }

            const narrativeEl = document.getElementById("narrative");
            if (narrativeEl) narrativeEl.textContent = report?.narrative || "";

            // AI Summary (kept)
            const aiText = document.getElementById("aiSummaryText");
            if (aiText) aiText.innerHTML = '<span class="fine">(loading…)</span>';
            try {
              const res2 = await fetch("/api/trust/ai-summary", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ trust_report_id: reportId })
              });
              const j2 = await res2.json();
              if (res2.ok && aiText) {
                const NL = String.fromCharCode(10);
                aiText.innerHTML = esc(j2.summary || "(No summary returned)").replaceAll(NL, "<br/>");
              } else if (aiText) {
                aiText.innerHTML = '<span class="fine">(AI summary unavailable)</span>';
              }
            } catch (e) {
              if (aiText) aiText.innerHTML = '<span class="fine">(AI summary unavailable)</span>';
            }

            // Insights expand/collapse
            const btnToggle = document.getElementById("btnToggleInsights");
            const wrap = document.getElementById("insightsWrap");

            function setInsightsOpen(open) {
              if (!wrap || !btnToggle) return;
              wrap.style.display = open ? "block" : "none";
              btnToggle.textContent = open ? "Collapse" : "Expand";
              btnToggle.setAttribute("aria-expanded", open ? "true" : "false");
            }
            btnToggle?.addEventListener("click", () => {
              const isOpen = wrap && wrap.style.display !== "none";
              setInsightsOpen(!isOpen);
            });

            // default: collapsed for green, open for yellow/red
            setInsightsOpen(bucket !== "green");

            const insightCountPillEl = document.getElementById("insightCountPill");
            if (insightCountPillEl) insightCountPillEl.textContent = (signals.length + " insights");

            if (insights) {
              if (!signals.length) {
                insights.innerHTML = '<div class="fine">No insights triggered.</div>';
              } else {
                insights.className = "insight-list";
                insights.innerHTML = signals.map((s, i) => signalRow(s, i)).join("");

                insights.querySelectorAll(".insight-row").forEach(row => {
                  function toggle() {
                    const i = row.getAttribute("data-i");
                    const detail = document.getElementById("insightDetail_" + i);
                    if (!detail) return;

                    const isOpen = row.classList.contains("open");
                    row.classList.toggle("open", !isOpen);
                    row.setAttribute("aria-expanded", (!isOpen) ? "true" : "false");
                  }

                  row.addEventListener("click", toggle);
                  row.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
                  });
                });
              }
            }

            // Checked part like screenshot #2
            const checked = document.getElementById("checkedCount");
            if (checked) {
              // if your API later returns totals, drop them in here:
              const totalChecked = Number(report?.checked_count || report?.signals_checked_total || 0);
              if (totalChecked > 0) checked.textContent = signals.length + " Flagged  " + totalChecked + " Checked";
              else checked.textContent = signals.length + " Flagged";
            }

            // Full analysis modal hook
            const btnFull = document.getElementById("btnFullAnalysis");
            if (btnFull) {
              btnFull.disabled = false;
              btnFull.onclick = async function () {
                document.getElementById("mReport").textContent = JSON.stringify(report, null, 2);
                document.getElementById("mSignals").textContent = JSON.stringify(signals, null, 2);

                const evalId = report.trust_evaluation_id;
                const mEval = document.getElementById("mEval");
                const mNorm = document.getElementById("mNorm");

                if (!evalId) {
                  if (mEval) mEval.textContent = "(no evaluation attached)";
                  if (mNorm) mNorm.textContent = "(no evaluation attached)";
                  openModal();
                  return;
                }

                try {
                  if (mEval) mEval.textContent = "(loading…)";
                  if (mNorm) mNorm.textContent = "(loading…)";

                  const r1 = await fetch("/api/trust/evaluation?id=" + encodeURIComponent(evalId));
                  const j1 = await readJson(r1);
                  if (r1.ok) {
                    if (mEval) mEval.textContent = JSON.stringify(j1.evaluation, null, 2);
                  } else {
                    if (mEval) mEval.textContent = "Failed to load evaluation: " + (j1.error || "error");
                  }

                  const r2 = await fetch("/api/trust/evaluation/normalized?id=" + encodeURIComponent(evalId));
                  const j2 = await readJson(r2);
                  if (r2.ok) {
                    if (mNorm) mNorm.textContent = JSON.stringify(j2, null, 2);
                  } else {
                    if (mNorm) mNorm.textContent = "Failed to load normalized profile: " + (j2.error || "error");
                  }
                } catch (e) {
                  if (mEval) mEval.textContent = "Error: " + String(e?.message || e);
                  if (mNorm) mNorm.textContent = "Error: " + String(e?.message || e);
                }

                openModal();
              };
            }

            // Copy buttons
            const questionsText = buildInterviewQuestions(__lastSignals);
            if (btnCopyQuestions) {
              btnCopyQuestions.disabled = !questionsText;
              btnCopyQuestions.onclick = questionsText
                ? async function () {
                    const text = buildInterviewQuestions(__lastSignals);
                    const ok = await copyToClipboard(text);
                    showToast(ok ? "Copied interview questions" : "Copy failed");
                  }
                : null;
            }

            if (btnCopySummary) {
              btnCopySummary.disabled = false;
              btnCopySummary.onclick = async function () {
                const text = buildRecruiterSummary(__lastReport, __lastSignals);
                const ok = await copyToClipboard(text);
                showToast(ok ? "Copied recruiter summary" : "Copy failed");
              };
            }

            // Left sidebar trust
            const docUploaded = document.getElementById("docUploaded");
            if (docUploaded) docUploaded.textContent = report.created_at || "—";

            const docTrustScore = document.getElementById("docTrustScore");
            if (docTrustScore) docTrustScore.textContent = String(report?.trust_score ?? "—");

            const docBucket = document.getElementById("docBucket");
            if (docBucket) docBucket.innerHTML = bucketBadge(report?.bucket);

            // Left sidebar candidate identity (best-effort from normalized profile)
            const evalId = report?.trust_evaluation_id;
            if (evalId) {
              try {
                const rNorm = await fetch("/api/trust/evaluation/normalized?id=" + encodeURIComponent(evalId));
                const jNorm = await readJson(rNorm);

                const llm = jNorm?.llm_normalized_profile || {};
                const det = jNorm?.deterministic_profile || {};
                const cand = llm?.candidate || {};

                const name = pickFirst(cand.name);
                const email = pickFirst(cand.email);
                const location = pickFirst(llm?.roles?.[0]?.location, det?.person?.location?.raw);
                const linkedin = pickFirst(cand.linkedin);

                const ghLogin = pickFirst(det?.__github_public?.github_login);
                const github = ghLogin ? ("https://github.com/" + ghLogin) : "";

                const candEl = document.getElementById("docCandidate");
                if (candEl) candEl.textContent = name || "—";

                const locEl = document.getElementById("docLocation");
                if (locEl) locEl.textContent = location || "—";

                setEmail(email);
                setLink("docLinkedIn", "docLinkedInNone", linkedin);
                setLink("docGitHub", "docGitHubNone", github);
              } catch (e) {
                // ignore
              }
            }
          }
          if (window.self !== window.top) {
            const links = document.querySelectorAll("a[href]");
            links.forEach(a => {
              a.addEventListener("click", e => {
                if (a.href.includes("/trust/profile")) {
                  e.preventDefault();
                  window.parent.closeReportModal();
                }
              });
            });
          }
          document.getElementById("refresh")?.addEventListener("click", load);
          load();
        </script>
      </div>
    `,
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
  
    const html = consoleShell({
      title: "...",
      who,
      active: "profiles",
      body: `
        <style>
          .riskbar{
            height: 8px;
            border-radius: 999px;
            background: rgba(11,18,32,.06);
            overflow:hidden;
            border: 1px solid rgba(11,18,32,.06);
          }
          .riskbar > div{
            height: 100%;
            width: 0%;
            background: rgba(180,35,24,.55);
            transition: width 220ms ease;
          }
        </style>
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
          <div style="margin-top:10px;">
            <div class="riskbar"><div id="riskFill"></div></div>
          </div>
          <div class="card" id="aiSummaryCard" style="display:none; margin-top:12px;">
            <div class="fine">AI Summary</div>
            <div id="aiSummaryText" style="margin-top:8px; line-height:1.6;"></div>
          </div>
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
            return '<span class="pill" style="background:' + bg + '; border-color:' + bd + '; color:' + ink + ';">' + text + "</span>";
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
                  "<div>" +
                    '<div class="row" style="gap:8px; flex-wrap:wrap; align-items:center;">' +
                      bucketBadge(r.bucket) +
                      pill("Score: " + (r.trust_score ?? 0), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                      pill("Hard: " + (r.hard_triggered ? "Yes" : "No"), "rgba(11,18,32,.06)", "var(--border)", "var(--muted)") +
                    "</div>" +
                    '<div class="fine" style="margin-top:6px;">Created: ' + esc(r.created_at) + " • Engine: " + esc(r.engine_version) + "</div>" +
                  "</div>" +
                  '<div class="row" style="gap:8px;">' +
                    '<a class="btn" href="/trust/report?id=' + encodeURIComponent(r.id) + '">Open</a>' +
                  "</div>" +
                "</div>" +
              "</div>"
            );
          }

          async function load() {
            document.getElementById("headline").textContent = "Loading…";
            document.getElementById("reports").textContent = "Loading…";

            const res = await fetch("/api/trust/profile?id=" + encodeURIComponent(trustProfileId));
            const data = await readJson(res);

            if (!res.ok) {
              document.getElementById("headline").textContent = "Failed to load";
              document.getElementById("reports").textContent = "";
              return;
            }

            const p = data.profile;
            document.getElementById("headline").textContent = p.source_filename || p.id;
            document.getElementById("meta").textContent =
              "Created: " + (p.created_at || "") + " • Source: " + (p.source_type || "") + " • Extractor: " + (p.extractor || "");

            const reports = data.reports || [];

            // ✅ Update risk bar from latest report (if any)
            const latest = reports[0] || null;
            if (latest) {
              try {
                const r = await fetch("/api/trust/ai-summary", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ trust_report_id: latest.id })
                });
                const j = await r.json();
                const card = document.getElementById("aiSummaryCard");
                const text = document.getElementById("aiSummaryText");
                if (r.ok && card && text) {
                  card.style.display = "block";
                  text.textContent = j.summary || "(No summary returned)";
                }
              } catch {}
            }
            const rf = document.getElementById("riskFill");
            if (rf && latest) {
              const pct = Math.max(0, Math.min(100, Number(latest.trust_score || 0)));
              rf.style.width = pct + "%";
              rf.style.background =
                latest.bucket === "green" ? "rgba(12,122,75,.55)" :
                latest.bucket === "yellow" ? "rgba(245,158,11,.55)" :
                "rgba(180,35,24,.55)";
            } else if (rf) {
              rf.style.width = "0%";
            }

            document.getElementById("reports").innerHTML =
              reports.length
                ? '<div style="display:grid; grid-template-columns:1fr; gap:10px;">' + reports.map(reportRow).join("") + "</div>"
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
            <div style="margin-bottom:16px;">
              <input type="file" id="bulkUploadInput" multiple accept="application/pdf" style="display:none;" />
              <button type="button" onclick="document.getElementById('bulkUploadInput').click()">
                Upload Resumes
              </button>
              <div id="batchStatus" style="margin-top:8px;"></div>
            </div>
            <div class="row" style="align-items:center;">
            <div>
                <h2 style="margin:2px 0 0;font-size:20px;">Trust Profiles</h2>
            </div>
            <span class="spacer"></span>

            <div class="row" style="gap:8px;">
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
            .leaderboard-table{
              width:100%;
              border-collapse:collapse;
              margin-top:8px;
            }

            .leaderboard-table th{
              text-align:left;
              padding:10px 12px;
              font-size:13px;
              color:var(--muted);
              border-bottom:1px solid var(--border);
            }

            .leaderboard-table td{
              padding:10px 10px;
              border-bottom:1px solid var(--border);
              vertical-align:middle;
            }
            .leaderboard-row{
              display:grid;
              grid-template-columns:80px 120px 1fr 120px 100px 90px;
              align-items:center;
              gap:12px;
              padding:14px 10px;
              border-top:1px solid var(--border);
            }

            .score-col{
              font-size:22px;
              font-weight:700;
              letter-spacing:-0.02em;
            }

            .score-green{
              color:#1a7f4b;
            }

            .score-yellow{
              color:#a16207;
            }

            .score-red{
              color:#b91c1c;
            }

            .candidate-name{
              font-weight:700;
              font-size:15px;
            }

            .signals-col{
              font-size:13px;
              color:rgba(11,18,32,.75);
            }
            .risk-badge{
              font-size:12px;
              padding:3px 8px;
            }
            .uploads-col{
              width:90px;
            }
            .leaderboard-table td:last-child{
              width:110px;
            }
            .leaderboard-table tbody tr{
              cursor:pointer;
            }
            .leaderboard-table tbody tr:hover{
              background:rgba(18,187,191,.06);
            }
            .rank-col{
              width:50px;
              font-size:20px;
            }
            .leaderboard-table thead th{
              font-size:12px;
              letter-spacing:.04em;
              color:rgba(11,18,32,.6);
              font-weight:600;
            }
            .rank-badge{
              width:26px;
              height:26px;
              border-radius:50%;
              display:flex;
              align-items:center;
              justify-content:center;
              background:rgba(15,23,42,.06);
              font-weight:700;
              font-size:12px;
            }

            .rank-1{
              background:#fde68a;
            }

            .rank-2{
              background:#e5e7eb;
            }

            .rank-3{
              background:#fcd34d;
            }

            .rank-other{
              background:rgba(11,18,32,.08);
            }
            td div:first-child {
              font-weight:700;
            }
            .insights-bar{
              display:flex;
              gap:12px;
              margin:14px 0 18px 0;
              flex-wrap:wrap;
            }

            .insight-pill{
              padding:8px 12px;
              border-radius:10px;
              font-size:13px;
              background:rgba(11,18,32,.05);
              border:1px solid rgba(11,18,32,.08);
            }
            .rank-col{
              width:32px;
              text-align:center;
              font-size:14px;
            }
            .report-modal{
              position:fixed;
              inset:0;
              background:rgba(0,0,0,.35);
              backdrop-filter: blur(3px);
              display:none;
              align-items:center;
              justify-content:center;
              z-index:999;
            }

            .report-modal-content{
              width:92%;
              height:92%;
              background:white;
              border-radius:16px;
              overflow:hidden;
              display:flex;
              flex-direction:column;
              box-shadow:0 30px 80px rgba(0,0,0,.35);
              transform: translateY(10px) scale(.98);
              opacity:0;
              transition: all .18s ease;
            }

            .report-modal-header{
              padding:12px 16px;
              border-bottom:1px solid var(--border);
              display:flex;
              justify-content:space-between;
              align-items:center;
              font-weight:600;
            }

            .report-frame{
              flex:1;
              width:100%;
              border:0;
            }
            .signal-preview{
              font-size:12px;
              font-weight:600;
              margin-right:6px;
            }

            .signal-preview.ok{
              color:#1a7f4b;
            }

            .signal-preview.red{
              color:#b42318;
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
        <div id="insightsBar" class="insights-bar"></div>
        <div id="listWrap">

          <table class="leaderboard-table">
            <thead>
              <tr>
                <th class="rank-col">Rank</th>
                <th class="score-col" onclick="toggleScoreSort()" style="cursor:pointer;" id="scoreHeader">
                  Score ↓
                </th>
                <th>Risk</th>
                <th>Candidate</th>
                <th class="signals-col">Signals</th>
                <th class="uploads-col">Uploaded</th>
                <th></th>
              </tr>
            </thead>

            <tbody id="list">
              <tr>
                <td colspan="6" class="fine">Loading…</td>
              </tr>
            </tbody>

          </table>

        </div>

        <script>
          document.getElementById("bulkUploadInput").addEventListener("change", () => {
            const input = document.getElementById("bulkUploadInput");

            if (input.files && input.files.length > 0) {
              uploadBulk();
            }
          });
          function renderSignalPreview(signalIds, triggeredCount){

            if (!triggeredCount || triggeredCount === 0) {
              return '<span class="signal-preview ok">✓ Clean</span>';
            }

            return '<span class="signal-preview red">⚠ ' + triggeredCount + ' signals</span>';
          }
          
          function openQuickReport(reportId){
            const modal = document.getElementById("reportModal");
            const frame = document.getElementById("reportFrame");
            if (!modal) return;
            const content = modal.querySelector(".report-modal-content");
            if (!content) return;

            frame.src = "/trust/report?id=" + reportId;

            modal.style.display = "flex";

            requestAnimationFrame(()=>{
              content.style.transform = "translateY(0) scale(1)";
              content.style.opacity = "1";
            });
          }

          function closeReportModal(){
            const modal = document.getElementById("reportModal");
            const frame = document.getElementById("reportFrame");
            if (!modal) return;
            const content = modal.querySelector(".report-modal-content");
            if (!content) return;

            content.style.transform = "translateY(10px) scale(.98)";
            content.style.opacity = "0";

            setTimeout(()=>{
              frame.src = "";
              modal.style.display = "none";
            },150);
          }
          function renderInsights(items) {
            const el = document.getElementById("insightsBar");
            if (!el) return;

            let totalSignals = 0;
            let riskyCandidates = 0;

            items.forEach(item => {
              const count = item?.latest_report?.triggered_count || 0;
              if (count > 0) {
                totalSignals += count;
                riskyCandidates += 1;
              }
            });

            let html = "";

            if (totalSignals > 0) {
              html += '<div class="insight-pill">⚠ ' + totalSignals + ' total signals detected</div>';
              html += '<div class="insight-pill">⚠ ' + riskyCandidates + ' candidates need review</div>';
            } else {
              html = '<div class="insight-pill">✔ No major risk signals detected</div>';
            }

            el.innerHTML = html;
          }
          function toggleScoreSort() {
            scoreSortDirection = scoreSortDirection === "desc" ? "asc" : "desc";
            document.getElementById("scoreHeader").textContent =
              scoreSortDirection === "desc" ? "Score ↓" : "Score ↑";
            render();
          }
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
            console.log("ROW_LATEST", latest);

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
            const rank = item.rank || "";
            const scoreClass =
            latest?.bucket === "green"
              ? "score-green"
              : latest?.bucket === "yellow"
              ? "score-yellow"
              : "score-red";
            return (
              '<tr data-report="' + esc(latest.id) + '" onclick="openQuickReport(this.dataset.report)" style="cursor:pointer;">' +

                '<td class="rank-col">' +
                  '<span class="rank-badge rank-other">' + rank + '</span>' +
                '</td>' +

                '<td class="score ' + scoreClass + '">' +
                  (latest ? latest.trust_score : '-') +
                '</td>' +

                '<td>' +
                  (latest ? bucketBadge(latest.bucket) : '') +
                '</td>' +

                '<td class="candidate">' +
                  '<div style="font-weight:700">' + esc(item.candidate_name || item.filename || item.id) + '</div>' +
                  (
                    item.candidate_name && item.filename
                      ? '<div class="fine">' + esc(item.filename) + '</div>'
                      : ''
                  ) +
                '</td>' +

                '<td class="signals-col">' +
                  renderSignalPreview(latest?.signal_ids || [], latest?.triggered_count || 0) +
                '</td>' +

                '<td class="uploads-col">' +
                  (item.ingest_count || 1) +
                '</td>' +
                '<td class="fine">Open</td>' +

              '</tr>'
            );
          }
        let scoreSortDirection = "desc";
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

          const items = applyFilters(allItems)
            .sort((a, b) => {
              const aScore = a.latest_report?.trust_score || 0;
              const bScore = b.latest_report?.trust_score || 0;
              return scoreSortDirection === "desc" ? bScore - aScore : aScore - bScore;
            })
            .map((item, index) => ({ ...item, rank: index + 1 }));
          renderInsights(items);
          el.innerHTML = items.length
            ? items.map(row).join("")
            : '<tr><td colspan="7" class="fine">No candidates yet.<br/>Upload resumes to get started.</td></tr>'

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
    <script src="/client/pdf_extract.js"></script>
    <script type="module" src="/client/trust_page.js"></script>
    <div id="reportModal" class="report-modal">
      <div class="report-modal-content">

        <div class="report-modal-header">
          <span>Candidate Report</span>
          <button onclick="closeReportModal()" class="btn btn-sm">Close</button>
        </div>

        <iframe id="reportFrame" src="" class="report-frame"></iframe>

      </div>
    </div>
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
    const fileKey = body.file_key || null;
    const sourceType = (body.source || "paste").toString().slice(0, 50);
    const extractor = (body.extractor || "manual").toString().slice(0, 80);
  
    if (!text || text.trim().length < 100) {
      return json({ error: "text too short" }, 400);
    }
  
    const now = new Date().toISOString();
  
    // Normalize now (portable pure function)
    const normalized = normalizeResumeTextToProfileV1({
      candidateId: sess.candidate_id,
      sourceText: text,
      sourceFilename: filename,
      now,
    });
    const docHashV = "v1";
    const docHash = await sha256Hex(normalizeForDocHash(text));
    if (!docHash) {
      return json({ error: "doc_hash_missing" }, 500);
    }

    // ✅ DEDUPE: if same candidate uploads identical content, reuse existing profile id
    const existing = await env.DB.prepare(
      `SELECT id
       FROM trust_candidate_profiles
       WHERE created_by_candidate_id = ?1 AND doc_hash = ?2
       ORDER BY created_at DESC
       LIMIT 1`
    ).bind(sess.candidate_id, docHash).first();

    if (existing?.id) {
      // Return latest report id too (so UI can skip /run if already evaluated)
      const latest = await env.DB.prepare(
        `SELECT id
         FROM trust_reports
         WHERE trust_profile_id = ?1
         ORDER BY created_at DESC
         LIMIT 1`
      ).bind(existing.id).first();
      if (fileKey) {
        await env.DB.prepare(
          `UPDATE trust_candidate_profiles
           SET source_file_key = COALESCE(source_file_key, ?1),
               updated_at = ?2
           WHERE id = ?3`
        ).bind(fileKey, now, existing.id).run();
      }
      return json({
        ok: true,
        trust_profile_id: existing.id,
        duplicate: true,
        latest_report_id: latest?.id ?? null,
      });
    }

    // No duplicate: create a new profile row
    const trustProfileId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO trust_candidate_profiles
       (id, org_id, created_by_candidate_id, source_type, source_filename, source_text, normalized_json,
        doc_hash, doc_hash_v,
        source_file_key,
        created_at, updated_at, extractor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(created_by_candidate_id, doc_hash)
       DO UPDATE SET
         updated_at = excluded.updated_at,
         source_filename = excluded.source_filename,
         source_file_key = excluded.source_file_key`
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
      fileKey,      // ✅ NEW
      now,
      now,
      extractor
    ).run();

    const row = await env.DB.prepare(
      `SELECT id FROM trust_candidate_profiles
       WHERE created_by_candidate_id = ?1 AND doc_hash = ?2
       ORDER BY created_at DESC
       LIMIT 1`
    ).bind(sess.candidate_id, docHash).first();

    return json({
      ok: true,
      trust_profile_id: row?.id ?? trustProfileId,
      // if row.id differs from the new UUID, it means conflict happened
      duplicate: row?.id ? row.id !== trustProfileId : false,
    });
}

function generateRiskNarrative(report, signals) {
  const score = Number(report?.trust_score ?? 0);
  const bucket = String(report?.bucket || "unknown");
  const hard = !!report?.hard_triggered;

  const list = Array.isArray(signals) ? signals : [];
  const top = list
    .slice()
    .sort((a, b) => {
      const sevRank = (t) => (t === "A" ? 0 : t === "B" ? 1 : 2);
      const r = sevRank(a.severity_tier) - sevRank(b.severity_tier);
      if (r !== 0) return r;
      return Number(b.deduction || 0) - Number(a.deduction || 0);
    })
    .slice(0, 2);

  if (!top.length) {
    return `No major risk signals were triggered. Overall trust looks ${bucket} (score ${score}).`;
  }

  const reasons = top.map(s => `${s.title || s.signal_id}`).join(" and ");
  const hardTxt = hard ? "Hard-triggered risk present. " : "";
  return `${hardTxt}Overall trust looks ${bucket} (score ${score}) mainly due to ${reasons}.`;
}

export async function apiTrustRun(request, env) {
  // Read raw body once
  const raw = await request.text().catch(() => "")
  let body = null

  try {
    body = raw ? JSON.parse(raw) : null
  } catch (e) {
    return json(
      {
        error: "Invalid JSON",
        rawPreview: raw.slice(0, 300),
      },
      400
    )
  }

  const trustProfileId =
    typeof body?.trust_profile_id === "string" ? body.trust_profile_id : null

  // Accept resumeText / resume_text / text
  let resumeText =
    (typeof body?.resumeText === "string" ? body.resumeText : "") ||
    (typeof body?.resume_text === "string" ? body.resume_text : "") ||
    (typeof body?.text === "string" ? body.text : "")

  // If resumeText missing but trust_profile_id provided, load from D1 and run pipeline
  if (!resumeText.trim() && trustProfileId) {
    let row = null

    try {
      row = await env.DB.prepare(
        `SELECT created_by_candidate_id, source_text, source_filename
         FROM trust_candidate_profiles
         WHERE id = ?1`
      )
        .bind(trustProfileId)
        .first()
    } catch (e) {
      return json(
        {
          error: "DB query failed",
          message: String(e),
          trust_profile_id: trustProfileId,
        },
        500
      )
    }

    if (!row || !row.source_text || !String(row.source_text).trim()) {
      return json(
        {
          error: "Trust profile not found or missing source_text",
          trust_profile_id: trustProfileId,
        },
        404
      )
    }

    resumeText = String(row.source_text)

    const now = new Date().toISOString()

    const result = await runTrustPipeline({
      candidateId: row.created_by_candidate_id,
      sourceText: resumeText,
      sourceFilename: row.source_filename || null,
      trustProfileId: trustProfileId,
      now,
      env,
    })

    // 1) Create trust_report row
    const trustReportId = crypto.randomUUID()

    await env.DB.prepare(
      `INSERT INTO trust_reports
      (id, trust_profile_id, trust_score, bucket, hard_triggered,
        summary_json, engine_version, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    ).bind(
      trustReportId,
      trustProfileId, // <-- make sure this exists in both paths (see note below)
      Number(result?.scoring?.trust_score ?? 0),
      String(result?.scoring?.bucket ?? "yellow"),
      result?.scoring?.hard_triggered ? 1 : 0,
      JSON.stringify(result?.scoring?.summary ?? { tier_a_count: 0, tier_b_count: 0, tier_c_count: 0 }),
      String(result?.engineVersion ?? "trust_engine_unknown"),
      now
    ).run()

    // 2) Insert trust_signals (store only signals that apply)
    for (const sig of (result.triggeredSignals || [])) {
      const deduction = Number(sig?.deduction || 0)
      const hard = !!sig?.hard_trigger

      // If status is explicitly present, trust it.
      // Otherwise infer "triggered" more safely (supports "triggered but 0 deduction" info signals).
      const hasExplicitStatus = typeof sig?.status === "string"
      const inferredTriggered =
        (deduction > 0) ||
        hard ||
        (sig?.evidence && Object.keys(sig.evidence).length > 0)

      const status = hasExplicitStatus
        ? sig.status
        : (inferredTriggered ? "triggered" : "not_triggered")

      const applies = status === "triggered"
      if (!applies) continue

      await env.DB.prepare(
        `INSERT INTO trust_signals
        (id, trust_report_id, signal_id, category, severity_tier,
          confidence, deduction, hard_trigger,
          status, evidence_json, explanation, questions_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
      ).bind(
        crypto.randomUUID(),
        trustReportId,
        String(sig.signal_id),
        String(sig.category),
        String(sig.severity_tier),
        String(sig.confidence || "low"),
        deduction,
        hard ? 1 : 0,
        status,
        JSON.stringify(sig.evidence || {}),
        String(sig.explanation || ""),
        JSON.stringify(sig.suggested_questions || []),
        now
      ).run()
    }
      // 2.5) Persist evaluation artifact (LLM normalized + deterministic profile)
    const evalId = crypto.randomUUID()

    await env.DB.prepare(
      `INSERT INTO trust_evaluations
       (id, trust_profile_id, trust_report_id,
        engine_version, signals_version, profile_schema_version, prompt_version, model,
        extraction_source, extraction_error,
        llm_meta_json, llm_normalized_json, deterministic_profile_json,
        created_at)
       VALUES (?1, ?2, ?3,
               ?4, ?5, ?6, ?7, ?8,
               ?9, ?10,
               ?11, ?12, ?13,
               ?14)`
    ).bind(
      evalId,
      trustProfileId,
      trustReportId,

      String(result?.engineVersion ?? "trust_engine_unknown"),
      "signals_v1",
      "normalized_profile_schema_v1", // your schema identity (keep simple for now)
      String((result?.llm?.promptVersion) ?? "prompt_extract_v?"), // optional; see note below
      String(result?.llm?.modelUsed ?? "gpt-4o-mini"),

      String(result?.extractionSource ?? "fallback"),
      result?.extractionError ? String(result.extractionError) : null,

      JSON.stringify(result?.llm ?? null),
      JSON.stringify(result?.llmNormalizedProfile ?? null),
      JSON.stringify(result?.deterministicProfile ?? null),

      now
    ).run()
    // 3) Return report id to frontend
    return json({
      ok: true,
      trust_report_id: trustReportId,
      trust_evaluation_id: evalId,
    })
  }

  // Original path: run using provided resumeText
  if (!resumeText.trim()) {
    return json(
      {
        error: "Missing resumeText",
        hint: "Send { resumeText: string } OR { trust_profile_id: string }",
        receivedKeys: body ? Object.keys(body) : null,
        rawPreview: raw.slice(0, 300),
      },
      400
    )
  }

  const candidateId = body?.candidateId || crypto.randomUUID()
  const sourceFilename = body?.sourceFilename || null
  const now = new Date().toISOString()

  const result = await runTrustPipeline({
    candidateId,
    sourceText: resumeText,
    sourceFilename,
    trustProfileId: null,
    now,
    env,
  })

  return json({
    ok: true,
    mode: "by_resumeText",
    result,
  })
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

          1 AS ingest_count,

          (SELECT COUNT(1) FROM trust_reports r WHERE r.trust_profile_id = p.id) AS report_count,

          (SELECT r2.id FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_report_id,
          (SELECT r2.trust_score FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_trust_score,
          (SELECT r2.bucket FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_bucket,
          (SELECT r2.created_at FROM trust_reports r2 WHERE r2.trust_profile_id = p.id ORDER BY r2.created_at DESC LIMIT 1) AS latest_report_created_at,

          (SELECT COUNT(1)
          FROM trust_signals s
          WHERE s.trust_report_id = (
            SELECT r2.id
            FROM trust_reports r2
            WHERE r2.trust_profile_id = p.id
            ORDER BY r2.created_at DESC LIMIT 1
          )
          AND s.status = 'triggered'
          ) AS latest_triggered_count,

          (SELECT GROUP_CONCAT(signal_id, ',')
          FROM trust_signals s
          WHERE s.trust_report_id = (
            SELECT r2.id
            FROM trust_reports r2
            WHERE r2.trust_profile_id = p.id
            ORDER BY r2.created_at DESC LIMIT 1
          )
          AND s.status = 'triggered'
          ) AS latest_signal_ids

        FROM trust_candidate_profiles p
        ORDER BY p.created_at DESC
        LIMIT 50
        `
      ).all();
      
  
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
      `SELECT
          r.id,
          r.trust_profile_id,
          r.trust_score,
          r.bucket,
          r.hard_triggered,
          r.summary_json,
          r.engine_version,
          r.created_at,
          (
            SELECT e.id
            FROM trust_evaluations e
            WHERE e.trust_report_id = r.id
            ORDER BY e.created_at DESC
            LIMIT 1
          ) AS trust_evaluation_id
       FROM trust_reports r
       WHERE r.id = ?`
    ).bind(id).first();
  
    if (!report) return json({ error: "report not found" }, 404);
  
    const { results } = await env.DB.prepare(
      `SELECT signal_id, category, severity_tier, confidence, deduction, hard_trigger, status,
              evidence_json, explanation, questions_json, created_at
       FROM trust_signals
       WHERE trust_report_id = ?
         AND (status = 'triggered')
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
    const narrative = generateRiskNarrative(report, signals);
    return json({
      report: {
        id: report.id,
        trust_profile_id: report.trust_profile_id,
        trust_score: report.trust_score,
        bucket: report.bucket,
        hard_triggered: !!report.hard_triggered,
        summary: safeJsonParse(report.summary_json) || {},
        engine_version: report.engine_version,
        created_at: report.created_at,
        narrative,
        trust_evaluation_id: report.trust_evaluation_id || null
      },
      signals
    });
}

export async function apiTrustDebugProfile(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) return json({ error: "id required" }, 400);

  const row = await env.DB.prepare(
    "SELECT id, normalized_json FROM trust_candidate_profiles WHERE id = ?"
  ).bind(id).first();

  if (!row) return json({ error: "not found" }, 404);

  return json({ id: row.id, profile: safeJsonParse(row.normalized_json) });
}

export async function apiTrustEvaluation(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return json({ error: "unauthorized" }, 401);

  const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
  if (!allowed) return json({ error: "forbidden" }, 403);

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) return json({ error: "id required" }, 400);

  const row = await env.DB.prepare(
    `SELECT id, trust_profile_id, trust_report_id,
            engine_version, signals_version, profile_schema_version, prompt_version, model,
            extraction_source, extraction_error,
            llm_meta_json,
            created_at
     FROM trust_evaluations
     WHERE id = ?1`
  ).bind(id).first();

  if (!row) return json({ error: "evaluation not found" }, 404);

  return json({
    evaluation: {
      ...row,
      llm_meta: safeJsonParse(row.llm_meta_json) || null,
    }
  });
}

export async function apiTrustEvaluationNormalized(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return json({ error: "unauthorized" }, 401);

  const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
  if (!allowed) return json({ error: "forbidden" }, 403);

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) return json({ error: "id required" }, 400);

  const row = await env.DB.prepare(
    `SELECT id, llm_normalized_json, deterministic_profile_json
     FROM trust_evaluations
     WHERE id = ?1`
  ).bind(id).first();

  if (!row) return json({ error: "evaluation not found" }, 404);

  return json({
    evaluation_id: row.id,
    llm_normalized_profile: safeJsonParse(row.llm_normalized_json) || null,
    deterministic_profile: safeJsonParse(row.deterministic_profile_json) || null,
  });
}

export async function apiTrustUpload(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return json({ error: "unauthorized" }, 401);

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || file.type !== "application/pdf") {
    return json({ error: "PDF required" }, 400);
  }

  const key = `resumes/${sess.candidate_id}/${crypto.randomUUID()}.pdf`;

  await env.RESUME_BUCKET.put(
    key,
    await file.arrayBuffer(),
    { httpMetadata: { contentType: "application/pdf" } }
  );

  return json({ ok: true, file_key: key });
}

export async function apiRecruiterUpload(request, env) {
  try{
    console.log("UPLOAD VERSION v2 FIXED");
    console.log("QUEUE EXISTS?", !!env.RESUME_QUEUE);
    console.log("UPLOAD API HIT");

    const sess = await requireSession(request, env);
    if (!sess) return json({ error: "unauthorized" }, 401);

    const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
    if (!allowed) return json({ error: "forbidden" }, 403);

    const formData = await request.formData();
    const files = formData.getAll("files");
    const texts = formData.getAll("texts");

    if (!files || files.length === 0) {
      return json({ error: "No files uploaded" }, 400);
    }

    const now = new Date().toISOString();

    // ✅ Generate jobId HERE (important)
    const jobId = crypto.randomUUID();

    // ✅ Create job row (required for FK)
    await env.DB.prepare(`
      INSERT INTO jobs (
        id,
        title,
        company,
        location,
        source,
        job_url,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        jobId,
        "Bulk Upload Job",
        null,
        null,
        "manual",
        null,
        now
      )
      .run();

    // ✅ Create batch
    const batchId = await createProcessingBatch(env.DB, jobId, files.length);

    const uploaded = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
    
      if (!file || file.type !== "application/pdf") continue;
    
      const buffer = await file.arrayBuffer();
      const candidateId = crypto.randomUUID();
      const r2Key = `jobs/${jobId}/${candidateId}_${file.name}`;
    
      await env.RESUME_BUCKET.put(r2Key, buffer, {
        httpMetadata: { contentType: file.type }
      });
    
      await env.RESUME_QUEUE.send({
        jobId,
        batchId,
        candidateId,
        filename: file.name,
        r2Key,
        extractedText: texts[i] || ""
      });
    
      uploaded.push({
        candidateId,
        filename: file.name
      });
    }

    return json({
      success: true,
      jobId,
      batchId,
      total: uploaded.length,
      uploaded
    });
  }catch(e){
      console.error("🔥 FULL ERROR STACK:", e.stack);
      throw e;
  }
}

export async function apiTrustPdf(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return new Response("unauthorized", { status: 401 });

  const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
  if (!allowed) return new Response("forbidden", { status: 403 });

  const url = new URL(request.url);
  const reportId = (url.searchParams.get("report_id") || "").trim();
  if (!reportId) return new Response("report_id required", { status: 400 });

  // 1) Find the stored R2 key for the report's profile
  const row = await env.DB.prepare(
    `SELECT p.source_file_key
     FROM trust_candidate_profiles p
     JOIN trust_reports r ON r.trust_profile_id = p.id
     WHERE r.id = ?1
     LIMIT 1`
  ).bind(reportId).first();

  if (!row?.source_file_key) {
    return new Response("pdf_not_found", { status: 404 });
  }

  // 2) Fetch from R2
  const obj = await env.RESUME_BUCKET.get(row.source_file_key);
  if (!obj) return new Response("pdf_missing_in_r2", { status: 404 });

  // 3) Stream back to browser (works in iframe)
  return new Response(obj.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "inline; filename=resume.pdf",
      "cache-control": "private, max-age=60",
    },
  });
}

function selectTopSignals(signals, limit = 3) {
  const tierWeight = { A: 100, B: 60, C: 30 };
  const confWeight = { high: 20, medium: 10, low: 0 };

  // Rank: severity tier -> absolute deduction -> confidence
  const ranked = [...signals].sort((a, b) => {
    const aScore =
      (tierWeight[a.severity_tier] ?? 0) +
      Math.abs(Number(a.deduction || 0)) +
      (confWeight[String(a.confidence || "").toLowerCase()] ?? 0);

    const bScore =
      (tierWeight[b.severity_tier] ?? 0) +
      Math.abs(Number(b.deduction || 0)) +
      (confWeight[String(b.confidence || "").toLowerCase()] ?? 0);

    return bScore - aScore;
  });

  // Dedupe by signal_id for stability
  const out = [];
  const seen = new Set();
  for (const s of ranked) {
    if (seen.has(s.signal_id)) continue;
    seen.add(s.signal_id);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function buildAiSummaryPrompts({ report, topSignals, allSignals }) {
  const system = [
    "You are a recruiter-facing due diligence assistant.",
    "Tone: neutral, factual, verification-oriented.",
    "Do NOT praise the candidate.",
    "Do NOT make hiring recommendations (no hire/reject).",
    "Do NOT invent facts; only use provided signals/evidence.",
    "",
    "Output rules:",
    "- Maximum 4 lines total.",
    "- Each line MUST be a bullet starting with '• '.",
    "- Each bullet should be short (<= 14 words).",
    "- Mention concrete durations/dates ONLY if present in evidence/explanation.",
    "- Focus only on the biggest trust drivers.",
  ].join("\n");

  const topBlock = (topSignals || []).map((s) => {
    const evidence = safeJsonParse(s.evidence_json) ?? {};
    return [
      `- id: ${s.signal_id}`,
      `  tier: ${s.severity_tier}`,
      `  confidence: ${s.confidence}`,
      `  deduction: ${s.deduction}`,
      `  title: ${s.title || signalTitle?.(s.signal_id) || s.signal_id}`,
      `  explanation: ${String(s.explanation || "").slice(0, 400)}`,
      `  evidence_json: ${JSON.stringify(evidence)}`,
    ].join("\n");
  }).join("\n");

  const user = [
    `Trust score: ${report.trust_score} (${report.bucket})`,
    `Hard triggered: ${report.hard_triggered ? "Yes" : "No"}`,
    "",
    "Top signals (use these, in this order):",
    topBlock || "(none)",
    "",
    "Return ONLY the bullets. No headings, no extra text.",
  ].join("\n");

  return { system, user };
}

export async function apiTrustAiSummary(request, env) {
  const sess = await requireSession(request, env);
  if (!sess) return json({ error: "unauthorized" }, 401);

  const allowed = isRecruiter(sess, env) || isAdmin(sess, env);
  if (!allowed) return json({ error: "forbidden" }, 403);

  let body = {};
  try { body = await request.json(); } catch {}

  const id = (body.trust_report_id || "").trim();
  if (!id) return json({ error: "trust_report_id required" }, 400);

  // Fetch report (include trust_score since we want it in summary)
  const report = await env.DB.prepare(
    `SELECT trust_score, bucket, hard_triggered
     FROM trust_reports
     WHERE id = ?1`
  ).bind(id).first();

  if (!report) return json({ error: "report not found" }, 404);

  // Fetch triggered signals (include fields needed for ranking + evidence)
  const { results } = await env.DB.prepare(
    `SELECT signal_id, category, severity_tier, confidence, deduction,
            evidence_json, explanation, questions_json
     FROM trust_signals
     WHERE trust_report_id = ?1
       AND status = 'triggered'`
  ).bind(id).all();

  const signals = results || [];

  // Pick top 3 drivers (stable + explainable ranking)
  const topSignals = selectTopSignals(signals, 3);

  // Build prompts (neutral, due-diligence, references top signals explicitly)
  const { system, user } = buildAiSummaryPrompts({
    report,
    topSignals,
    allSignals: signals
  });

  // ---- Optional caching (DB) ----
  // Requires migration in section (2) below.
  const model = "gpt-4o-mini";
  let promptHash = "";
  try {
    promptHash = await sha256Hex(`${model}\n${system}\n\n${user}`);
    const cached = await env.DB.prepare(
      `SELECT summary
       FROM trust_ai_summaries
       WHERE trust_report_id = ?1 AND model = ?2 AND prompt_hash = ?3
       LIMIT 1`
    ).bind(id, model, promptHash).first();

    if (cached?.summary) {
      return json({ summary: cached.summary, cached: true });
    }
  } catch {
    // If cache table doesn't exist yet, continue without caching
  }

  // Call OpenAI
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.2
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return json({ error: data?.error?.message || "OpenAI request failed" }, 502);
  }

  const summary = data?.choices?.[0]?.message?.content || "No summary generated.";

  // Write cache (best-effort)
  if (promptHash) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO trust_ai_summaries
          (id, trust_report_id, model, prompt_hash, summary, created_at)
         VALUES
          (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(
        crypto.randomUUID(),
        id,
        model,
        promptHash,
        summary,
        new Date().toISOString()
      ).run();
    } catch {
      // ignore cache write failures
    }
  }

  return json({ summary, cached: false });
}

export async function apiJobCandidates(request, env, jobId) {

  const rows = await env.DB.prepare(`
    SELECT
      tr.trust_profile_id,
      tr.trust_score,
      tr.bucket,
      tr.created_at
    FROM trust_reports tr
    JOIN trust_candidate_profiles tcp
      ON tcp.id = tr.trust_profile_id
    JOIN candidates c
      ON c.id = tcp.created_by_candidate_id
    WHERE c.job_id = ?
    ORDER BY tr.trust_score DESC
    LIMIT 50
  `)
  .bind(jobId)
  .all();

  return new Response(JSON.stringify({
    ok: true,
    candidates: rows.results
  }), {
    headers: { "content-type": "application/json" }
  });
}

export async function apiJobStats(request, env, jobId) {

  const rows = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN bucket='green' THEN 1 ELSE 0 END) as green,
      SUM(CASE WHEN bucket='yellow' THEN 1 ELSE 0 END) as yellow,
      SUM(CASE WHEN bucket='red' THEN 1 ELSE 0 END) as red,
      AVG(trust_score) as avg_score
    FROM trust_reports
  `).first();

  return new Response(JSON.stringify({
    ok: true,
    stats: rows
  }), {
    headers: { "content-type": "application/json" }
  });
}

export async function apiBatchStatus(request, env, batchId) {
  const row = await env.DB.prepare(`
    SELECT id, total_resumes, processed_resumes, status
    FROM processing_batches
    WHERE id = ?
  `)
  .bind(batchId)
  .first();

  if (!row) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }

  return new Response(JSON.stringify(row), {
    headers: { "content-type": "application/json" }
  });
}