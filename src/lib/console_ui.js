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
    rightPill: `Trust Engine • ${name}`,
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
          margin-top: 14px;
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
          grid-template-columns: 248px 1fr;
        }
        .rail-inner{
          padding: 12px;
        }

        .brand{
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom: 10px;
          min-height: 36px;
        }
        .brand-mark{
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight: 900;
          background: rgba(0,170,170,.14);
          border: 1px solid rgba(0,170,170,.35);
          color: rgba(0,120,120,1);
          flex: 0 0 auto;
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

        .nav-item{
          display:flex;
          align-items:center;
          gap:10px;
          padding: 10px 10px;
          border-radius: 14px;
          border: 1px solid transparent;
          color: rgba(11,18,32,.86);
          text-decoration:none;
          background: rgba(11,18,32,.02);
          transition: background .12s ease, border-color .12s ease, transform .12s ease;
        }
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

        .nav-ico{
          width: 28px;
          height: 28px;
          border-radius: 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          background: rgba(11,18,32,.04);
          border: 1px solid rgba(11,18,32,.08);
          flex: 0 0 auto;
          font-size: 13px;
        }
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
          margin-bottom: 12px;
          position: sticky;
          top: 14px;
          z-index: 5;
          background: rgba(246,251,251,.78);
          backdrop-filter: blur(6px);
          padding: 10px 10px;
          border-radius: 16px;
          border: 1px solid var(--border);
        }
        .content-topbar .spacer{ flex: 1; }
        .content-title{
          font-size: 13px;
          color: rgba(11,18,32,.62);
          font-weight: 700;
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
          .console{ grid-template-columns: 72px 1fr; }
          .main-workspace{ grid-template-columns: 1fr; }
          .pane-body{ max-height: none; }
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
                  <div class="brand-sub">Recruiter Console</div>
                </div>
              </div>

              <div class="divider"></div>

              <nav class="nav" aria-label="Console navigation">
                ${navItem("home", "Trust Home", "/trust", "⌂")}
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
              <a class="btn btn-primary" href="/trust">Upload</a>
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
            </script>
          </main>
        </div>
      </div>
    `,
  });
}