//# baseStyles(), pageShell()
import { escapeHtml } from "./http.js";
export function baseStyles() {
    return `
    *, *::before, *::after { box-sizing: border-box; }
    :root{
      color-scheme: light;
      --bg:#f6fbfb;
      --card:#ffffff;
      --ink:#0b1220;
      --muted:rgba(11,18,32,.62);
      --border:rgba(11,18,32,.10);
      --sea:#12bbbf;
      --sea2:#7fe7dc;
      --olive:#6aa86a;
      --shadow: 0 14px 40px rgba(11,18,32,.08);
      --radius:18px;
    }
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;color:var(--ink);
         background:radial-gradient(1200px 600px at 30% -10%, rgba(18,187,191,.18), transparent 60%), var(--bg);}
    a{color:var(--sea);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:980px;margin:0 auto;padding:28px 18px 60px;}
    .nav{display:flex;align-items:center;justify-content:space-between;gap:14px;}
    .brand{font-weight:900;letter-spacing:.2px}
    .pill{font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;color:var(--muted);background:rgba(255,255,255,.6)}
    .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow)}
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}
    @media (max-width:860px){.grid{grid-template-columns:1fr}}
    h1{font-size:44px;line-height:1.05;margin:0 0 12px}
    .sub{font-size:16px;line-height:1.55;color:var(--muted);max-width:56ch}
    label{font-size:12px;color:var(--muted);display:block;margin:10px 0 6px}
    input,select,textarea{
      width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);
      background:rgba(255,255,255,.9);color:var(--ink);outline:none
    }
    input:focus,select:focus,textarea:focus{
      border-color:rgba(18,187,191,.55);
      box-shadow:0 0 0 4px rgba(18,187,191,.14)
    }
    .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .btn{
      display:inline-block;padding:10px 14px;border-radius:14px;border:1px solid var(--border);
      background:rgba(255,255,255,.7);color:var(--ink);
      cursor:pointer;transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;
      text-decoration:none
    }
    .btn:hover{transform:translateY(-1px);border-color:rgba(18,187,191,.55);box-shadow:0 10px 22px rgba(11,18,32,.10)}
    .btn-primary{border:0;background:linear-gradient(90deg,var(--sea),var(--sea2));color:#07303a;font-weight:900}
    .fine{font-size:12px;color:var(--muted)}
    .ok{color:#0c7a4b;font-size:13px;margin-top:10px}
    .err{color:#b42318;font-size:13px;margin-top:10px}
    .btn-ghost{background:transparent}
    .btn-danger{border:0;background:linear-gradient(90deg,#ff6b6b,#ffd0d0);color:#3b0b0b;font-weight:900}
    .spacer{flex:1}
    .divider{height:1px;background:var(--border);margin:14px 0}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media (max-width:860px){.grid2{grid-template-columns:1fr}}
    .label{font-size:12px;color:var(--muted);display:block;margin:10px 0 6px}
    .input{width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,.9);color:var(--ink);outline:none}
  
    `;
  }

export function pageShell({ title, body, rightPill = "MVP • Early access", fullWidth = false }) {
    const wrapClass = fullWidth ? "wrap wrap-full" : "wrap";
  
    return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${baseStyles()}
      .wrap-full { max-width: none !important; width: 100% !important; }
    </style>
  </head>
  <body>
    <div class="${wrapClass}">
      <div class="nav">
        <div class="brand"><a href="/" style="color:inherit;text-decoration:none">SignalTrust</a></div>
        <div class="pill">${escapeHtml(rightPill)}</div>
      </div>
      ${body}
    </div>
  </body>
  </html>`;
}
  