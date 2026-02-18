import { pageShell } from "./ui.js";
import { escapeHtml } from "./http.js";

export function consoleShell({ title, who, active = "profiles", body = "" }) {
  const name = escapeHtml(who || "Recruiter");

  const navItem = (key, label, href) => {
    const isActive = key === active;
    return `
      <a href="${href}" class="nav-item ${isActive ? "active" : ""}">
        ${label}
      </a>
    `;
  };

  return pageShell({
    title,
    rightPill: `Trust Engine • ${name}`,
    fullWidth: true,
    body: `
      <style>
        .console {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 14px;
          margin-top: 14px;
        }
        .sidebar {
          position: sticky;
          top: 14px;
          align-self: start;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: rgba(255,255,255,.92);
          box-shadow: 0 8px 20px rgba(11,18,32,.06);
          padding: 12px;
        }
        .brand {
          font-weight: 900;
          letter-spacing: .2px;
          margin-bottom: 10px;
        }
        .nav {
          display: grid;
          gap: 6px;
          margin-top: 8px;
        }
        .nav-item {
          display: block;
          padding: 10px 10px;
          border-radius: 12px;
          border: 1px solid transparent;
          color: rgba(11,18,32,.86);
          text-decoration: none;
          background: rgba(11,18,32,.02);
        }
        .nav-item:hover {
          background: rgba(11,18,32,.05);
          border-color: rgba(11,18,32,.08);
        }
        .nav-item.active {
          background: rgba(12,122,75,.10);
          border-color: rgba(12,122,75,.25);
          color: #0c7a4b;
          font-weight: 800;
        }
        .content { min-width: 0; }
        .topbar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .topbar .spacer { flex: 1; }
        .console-wrap {
            width: 100%;
            max-width: none;     /* optional: cap for ultra-wide monitors */
            margin: 0 auto;        /* centered only when screen is huge */
            padding: 0 14px;       /* keeps it off the edges */
        }
        @media (min-width: 1200px) {
            .console-wrap { max-width: 1600px; }
        }
        .sidebrand {
            font-weight: 900;
            letter-spacing: .2px;
            margin-bottom: 10px;
        }
      </style>

      <div class="console-wrap">
        <div class="console">
            <aside class="sidebar">
            <div class="sidebrand">NextOffer</div>
            <div class="fine">Recruiter Console</div>
            <div class="divider"></div>

            <div class="nav">
                ${navItem("home", "Trust Home", "/trust")}
                ${navItem("profiles", "Profiles", "/trust/profiles")}
                ${navItem("signals", "Signals", "/trust/signals")}
                ${navItem("api", "API Keys", "/trust/api")}
            </div>

            <div class="divider"></div>
            <button class="btn btn-ghost" id="logout" type="button" style="width:100%;">Logout</button>
            </aside>

            <main class="content">
            <div class="topbar">
                <div class="fine">${escapeHtml(title || "")}</div>
                <span class="spacer"></span>
                <a class="btn btn-ghost" href="/trust">Upload</a>
            </div>

            ${body}

            <script>
                document.getElementById('logout')?.addEventListener('click', async () => {
                await fetch('/auth/logout', { method: 'POST' });
                window.location.replace('/');
                });
            </script>
            </main>
        </div>
    </div>
    `
  });
}
