import { pageShell } from "./ui.js";
import { escapeHtml } from "./http.js";

/**
 * Drop-in replacement:
 * - keeps existing signature working: consoleShell({ title, who, active, body })
 * - adds optional workspace layout: pass { mode: "workspace", center: "...", right: "..." }
 *   If right is omitted, it will use `body` as the right pane.
 */
export function consoleShell({
  title,
  who,
  active = "profiles",
  body = "",
  // new (optional)
  mode = "single", // "single" (default) | "workspace"
  center = "",     // workspace center pane HTML (e.g., PDF viewer)
  right = "",      // workspace right pane HTML (defaults to `body`)
}) {
  const name = escapeHtml(who || "Recruiter");

  const navItem = (key, label, href, icon) => {
    const isActive = key === active;
    return `
      <a href="${href}" class="nav-item ${isActive ? "active" : ""}" aria-current="${isActive ? "page" : "false"}">
        <span class="nav-ico" aria-hidden="true">${icon || "•"}</span>
        <span class="nav-label">${label}</span>
      </a>
    `;
  };

  const isWorkspace = mode === "workspace" || !!center || !!right;
  const rightHtml = right || body;

  return pageShell({
    title,
    rightPill: "",
    fullWidth: true,
    body: `
      <style>
        /* Layout */
        .console-wrap{
          width: 100%;
          max-width: none;
          margin: 0 auto;
          padding: 0 14px;
        }
        @media (min-width: 1200px){
          .console-wrap{ max-width: 1680px; }
        }

        .console{
          display: grid;
          grid-template-columns: 72px 1fr;
          gap: 14px;
          margin-top: 4px;
          align-items: start;
          transition: grid-template-columns .16s ease;
        }

        /* Left rail (collapsible) */
        .rail{
          position: sticky;
          top: 14px;
          align-self: start;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: rgba(255,255,255,.92);
          box-shadow: 0 8px 20px rgba(11,18,32,.06);
          overflow: hidden;
          width: 100%;              /* key: rail fills the grid column */
          backdrop-filter: blur(6px);
        }
        /* when rail is expanded, push content instead of overlapping */
        .console.rail-open{
          grid-template-columns: 208px 1fr;
        }
        .rail-inner{ padding: 10px; }

        .brand{
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom: 10px;
          min-height: 36px;
        }
        .brand-mark{
          width:28px;
          height:28px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:8px;
          font-weight:800;
          font-size:12px;
          background:rgba(11,18,32,.06);
        }
        .brand-text{
          display:flex;
          flex-direction:column;
          gap:2px;
          min-width: 0;
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity .16s ease, transform .16s ease;
        }
        .console.rail-open .brand-text{
          opacity: 1;
          transform: translateX(0);
        }
        .brand-title{
          font-weight: 900;
          letter-spacing: .2px;
          white-space: nowrap;
          overflow:hidden;
          text-overflow: ellipsis;
        }
        .brand-sub{
          font-size: 12px;
          color: rgba(11,18,32,.55);
          white-space: nowrap;
          overflow:hidden;
          text-overflow: ellipsis;
        }

        .nav{
          display: grid;
          gap: 6px;
          margin-top: 10px;
        }

        .nav-item{ padding: 8px 8px; border-radius: 12px; }
        .nav-item:hover{
          background: rgba(11,18,32,.05);
          border-color: rgba(11,18,32,.08);
          transform: translateY(-1px);
        }
        .nav-item.active{
          background: rgba(0,170,170,.14);
          border-color: rgba(0,170,170,.35);
          color: rgba(0,120,120,1);
          font-weight: 800;
        }

        .nav-ico{ width: 26px; height: 26px; border-radius: 10px; font-size: 12px; }
        .nav-label{
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity .16s ease, transform .16s ease;
          white-space: nowrap;
        }
        .console.rail-open .nav-label{
          opacity: 1;
          transform: translateX(0);
        }

        .rail-actions{
          margin-top: 10px;
        }

        /* Keep existing button styling, but tighten a bit */
        .btn{
          background: rgba(0,170,170,.14);
          border: 1px solid rgba(0,170,170,.35);
          color: rgba(0,120,120,1);
          font-weight: 800;
          transition: all .15s ease;
        }
        .btn:hover{
          background: rgba(0,170,170,.22);
          border-color: rgba(0,170,170,.50);
        }
        .btn-ghost{
          background: rgba(11,18,32,.04);
          border: 1px solid rgba(11,18,32,.08);
          color: rgba(11,18,32,.75);
        }
        .btn-ghost:hover{
          background: rgba(11,18,32,.08);
        }
        .btn-primary{
          background: rgba(0,170,170,.22);
          border-color: rgba(0,170,170,.55);
        }
        .btn-primary:hover{
          background: rgba(0,170,170,.32);
        }

        /* Content area */
        .content{
          min-width: 0;
        }

        .content-topbar{
          display:flex;
          align-items:center;
          gap: 10px;
          margin-bottom: 6px;
          position: sticky;
          top: 8px;
          z-index: 5;
          background: rgba(246,251,251,.78);
          backdrop-filter: blur(6px);
          padding:8px 10px;
          border-radius: 16px;
          border: 1px solid var(--border);
        }
        .content-topbar .spacer{ flex: 1; }
        .content-title{
          font-size: 13px;
          color: rgba(11,18,32,.62);
          font-weight: 700;
        }
        .content-topbar .pill{
          margin-right:6px;
        }
        /* Main area modes */
        .main-single{
          min-width: 0;
        }

        .main-workspace{
          display: grid;
          grid-template-columns: 1fr 520px;
          gap: 14px;
          min-width: 0;
          align-items: start;
        }

        .pane{
          border: 1px solid var(--border);
          border-radius: 18px;
          background: rgba(255,255,255,.92);
          box-shadow: 0 8px 20px rgba(11,18,32,.06);
          overflow: hidden;
          min-width: 0;
          backdrop-filter: blur(6px);
        }

        .pane-head{
          padding: 12px 14px;
          border-bottom: 1px solid rgba(11,18,32,.08);
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }
        .pane-title{
          font-weight: 900;
          letter-spacing: .2px;
        }
        .pane-body{
          padding: 14px;
          overflow: auto;
          max-height: calc(100vh - 14px - 14px - 70px - 90px);
          /* 2x margins + sticky topbar approx */
        }

        /* Better mobile stacking */
        @media (max-width: 980px){
          .console{ grid-template-columns: 64px 1fr; }
          .main-workspace{ grid-template-columns: 1fr; }
          .pane-body{ max-height: none; }
        }
        .embedded-report .upload-btn{
          display:none !important;
        }
        .upload-wrapper {
          position: relative;
        }

        .upload-menu {
          position: absolute;
          right: 0;
          top: 42px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.12);
          width: 240px;
          overflow: hidden;
          z-index: 100;
          border: 1px solid var(--border);
        }

        .upload-item {
          padding: 12px 14px;
          cursor: pointer;
          font-size: 14px;
        }

        .upload-item:hover {
          background: rgba(11,18,32,.05);
        }
      </style>

      <div class="console-wrap">
        <div class="console">
          <aside class="rail">
            <div class="rail-inner">
              <div class="brand">
                <div class="brand-mark">ST</div>
                <div class="brand-text">
                  <div class="brand-title">SignalTrust</div>
                  <div class="brand-sub">AI Hiring Intelligence</div>
                </div>
              </div>

              <div class="divider"></div>

              <nav class="nav" aria-label="Console navigation">
                ${navItem("upload", "Upload", "/trust", "⌂")}
                ${navItem("profiles", "Profiles", "/trust/profiles", "⧉")}
                ${navItem("signals", "Signals", "/trust/signals", "⟡")}
                ${navItem("api", "API Keys", "/trust/api", "⚿")}
              </nav>

              <div class="divider"></div>

              <div class="rail-actions">
                <button class="btn btn-ghost" id="logout" type="button" style="width:100%;">Logout</button>
              </div>
            </div>
          </aside>

          <main class="content">
            <div class="content-topbar">
              <div class="content-title">${escapeHtml(title || "")}</div>
              <span class="spacer"></span>
              ${mode !== "workspace" ? `
                <div class="upload-wrapper">
                  <button class="btn btn-primary" onclick="toggleUploadMenu()">Upload ▾</button>
              
                  <div id="uploadMenu" class="upload-menu" style="display:none;">
                    <div class="upload-item" onclick="handleUpload('single')">📄 Upload Single Resume</div>
                    <div class="upload-item" onclick="handleUpload('bulk')">📦 Bulk Upload</div>
                  </div>
                </div>
              ` : ''}
            </div>

            ${
              isWorkspace
                ? `
                  <section class="main-workspace">
                    <div class="pane">
                      <div class="pane-head">
                        <div class="pane-title">Document</div>
                        <div class="fine">Resume</div>
                      </div>
                      <div class="pane-body">
                        ${
                          center ||
                          `
                          <div style="border:1px dashed rgba(11,18,32,.18); border-radius:14px; padding:18px; color: rgba(11,18,32,.62); background: rgba(11,18,32,.02);">
                            PDF viewer will go here (Phase 2).<br/>
                            For now, we’re upgrading the console layout without touching any signal/scoring logic.
                          </div>
                          `
                        }
                      </div>
                    </div>

                    <div class="pane">
                      <div class="pane-head">
                        <div class="pane-title">Risk & Signals</div>
                        <div class="fine">Trust Report</div>
                      </div>
                      <div class="pane-body">
                        ${rightHtml}
                      </div>
                    </div>
                  </section>
                `
                : `
                  <section class="main-single">
                    ${body}
                  </section>
                `
            }

          <script>
            const rail = document.querySelector('.rail');
            const consoleEl = document.querySelector('.console');

            rail?.addEventListener('mouseenter', () => consoleEl?.classList.add('rail-open'));
            rail?.addEventListener('mouseleave', () => consoleEl?.classList.remove('rail-open'));

            document.getElementById('logout')?.addEventListener('click', async () => {
              await fetch('/auth/logout', { method: 'POST' });
              window.location.replace('/');
            });

            // 🔥 ADD EVERYTHING BELOW THIS

            window.toggleUploadMenu = function toggleUploadMenu() {
              const menu = document.getElementById("uploadMenu");
              if (!menu) return;
              menu.style.display = menu.style.display === "none" ? "block" : "none";
            }

            window.handleUpload = function handleUpload(type) {
              const menu = document.getElementById("uploadMenu");
              if (menu) menu.style.display = "none";

              if (type === "single") openSingleUpload();
              if (type === "bulk") openBulkUpload();
            }

            function openSingleUpload() {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf";
              input.multiple = false;

              input.onchange = function () {
                const file = input.files[0];
                if (file) uploadSingleFile(file);
              };

              input.click();
            }

            function openBulkUpload() {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf";
              input.multiple = true;

              input.onchange = function () {
                const files = Array.from(input.files || []);
                if (files.length) uploadBulkFiles(files);
              };

              input.click();
            }

            async function uploadSingleFile(file) {
              const form = new FormData();
              form.append("file", file);

              await fetch("/api/trust/upload", {
                method: "POST",
                body: form
              });

              location.reload();
            }

            async function uploadBulkFiles(files) {
              const form = new FormData();
              files.forEach(f => form.append("files", f));

              const res = await fetch("/api/recruiter/upload", {
                method: "POST",
                body: form
              });

              const text = await res.text();
              let data;

              try {
                data = JSON.parse(text);
              } catch (err) {
                console.error("Upload returned non-JSON:", text);
                alert("Upload failed — server did not return JSON");
                return;
              }

              if (!res.ok) {
                console.error("UPLOAD_FAILED", data);
                alert(data.error || "Upload failed");
                return;
              }

              const batchId = data.batchId || data.batch_id;

              if (!batchId) {
                console.error("No batch id returned", data);
                alert("Batch creation failed");
                return;
              }

              trackBatchProgress(batchId);
            }
            const processingMessages = [
              "🔍 Analyzing career timeline...",
              "🧠 Running trust signals...",
              "🧩 Connecting career dots...",
              "📄 Reading between the lines...",
              "🕵️ Checking for inconsistencies...",
              "⚖️ Weighing experience vs claims...",
              "📊 Scoring candidate trust...",
              "🧪 Running deep verification checks...",
              "👀 Looking for suspicious patterns...",
              "🤖 Asking: does this story add up?",
              "☕ Fueling AI with coffee...",
              "🚀 Almost there..."
            ];
            function trackBatchProgress(batchId) {
              const el = document.getElementById("batchStatus");
              if (!el) return;

              const interval = setInterval(async () => {
                try {
                  const res = await fetch("/api/batches/" + batchId);
                  const data = await res.json();

                  const processed = data.processed_resumes || 0;
                  const total = data.total_resumes || 0;

                  const randomMsg = processingMessages[
                    Math.floor(Math.random() * processingMessages.length)
                  ];

                  el.innerHTML =
                    '<div class="fine">' +
                    '⚙️ Processing: <b>' + processed + '</b> / ' + total + '<br/>' +
                    '<span style="opacity:.7;">' + randomMsg + '</span>' +
                    '</div>';

                  if (processed >= total) {
                    clearInterval(interval);
                    el.innerHTML = '<div class="fine">✅ Processing complete</div>';
                    load(); // refresh table
                  }
                } catch (err) {
                  console.error("Batch tracking failed", err);
                  clearInterval(interval);
                }
              }, 2000);
            }
            // Optional: close dropdown on outside click
            document.addEventListener("click", function(e) {
              const menu = document.getElementById("uploadMenu");
              const btn = document.querySelector(".btn-primary");

              if (!menu || !btn) return;

              if (!btn.contains(e.target) && !menu.contains(e.target)) {
                menu.style.display = "none";
              }
            });
          </script>
          </main>
        </div>
      </div>
    `,
  });
}