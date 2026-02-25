//# baseStyles(), pageShell()
import { escapeHtml } from "./http.js";
export function baseStyles() {
    return `
    *, *::before, *::after { box-sizing: border-box; }
    :root{
      color-scheme: light;

      --bg0: #070B1A;
      --bg1: #0B1220;

      --surface: rgba(255,255,255,.92);
      --surface2: rgba(255,255,255,.86);

      --ink: rgba(15, 23, 42, .92);
      --muted: rgba(15, 23, 42, .65);

      --border: rgba(15, 23, 42, .10);

      /* Premium accent */
      --accent: #00A7A7;
      --accent2: #00D1D1;

      --danger: #B42318;
      --warn: #B45309;
      --ok: #0C7A4B;

      --shadow: 0 12px 30px rgba(2, 6, 23, .08);
      --radius: 22px;
    }

    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;
      color: var(--ink);
      background:
        radial-gradient(900px 500px at 12% 10%, rgba(0,167,167,.14), transparent 60%),
        radial-gradient(900px 500px at 86% 0%, rgba(99,102,241,.10), transparent 62%),
        linear-gradient(180deg, rgba(248,250,252,1), rgba(241,245,249,1));
    }
    a{color:var(--sea);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:980px;margin:0 auto;padding:28px 18px 60px;}
    .nav{display:flex;align-items:center;justify-content:space-between;gap:14px;}
    .brand{font-weight:900;letter-spacing:.2px}
    .pill{
      font-size:12px;
      padding:6px 10px;
      border:1px solid var(--border);
      border-radius:999px;
      color: var(--muted);
      background: rgba(255,255,255,.65);
      font-weight: 900;
      letter-spacing: .2px;
    }
    .card{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      box-shadow:
        0 12px 30px rgba(2, 6, 23, .08),
        0 1px 0 rgba(255,255,255,.65) inset;
      backdrop-filter: blur(8px);
    }
    .grid{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}
    @media (max-width:860px){.grid{grid-template-columns:1fr}}
    h1{font-size:44px;line-height:1.05;margin:0 0 12px}
    .sub{font-size:16px;line-height:1.55;color:var(--muted);max-width:56ch}
    label{font-size:12px;color:var(--muted);display:block;margin:10px 0 6px}
    input,select,textarea{
      width:100%;
      padding:12px;
      border-radius:14px;
      border:1px solid var(--border);
      background: rgba(255,255,255,.94);
      color: var(--ink);
      outline:none;
      box-shadow: 0 8px 18px rgba(2,6,23,.04);
    }
    input:focus,select:focus,textarea:focus{
      border-color: rgba(0,167,167,.45);
      box-shadow: 0 0 0 4px rgba(0,167,167,.14);
    }
        .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      height: 36px;
      padding: 0 14px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,.90);
      color: rgba(2,6,23,.86);
      font-weight: 900;
      cursor:pointer;
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
      text-decoration:none;
      box-shadow: 0 8px 18px rgba(2, 6, 23, .06);
    }

    .btn:hover{
      transform: translateY(-1px);
      border-color: rgba(0,167,167,.35);
      box-shadow: 0 12px 22px rgba(2, 6, 23, .10);
    }

    .btn:active{
      transform: translateY(0px);
      box-shadow: 0 8px 16px rgba(2, 6, 23, .08);
    }

    .btn[disabled]{
      opacity: .55;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .btn-primary{
      border-color: rgba(0,167,167,.45);
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: white;
      font-weight: 900;
      box-shadow: 0 14px 30px rgba(0,167,167,.18);
    }

    .btn-primary:hover{
      border-color: rgba(0,167,167,.70);
      box-shadow: 0 16px 34px rgba(0,167,167,.24);
    }

    .btn-ghost{
      background: rgba(255,255,255,.55);
    }

    .btn-sm{
      height: 30px;
      padding: 0 12px;
      border-radius: 12px;
      font-weight: 900;
    }
    .fine{font-size:12px;color:var(--muted)}
    .ok{color:#0c7a4b;font-size:13px;margin-top:10px}
    .err{color:#b42318;font-size:13px;margin-top:10px}
    .btn-danger{border:0;background:linear-gradient(90deg,#ff6b6b,#ffd0d0);color:#3b0b0b;font-weight:900}
    .spacer{flex:1}
    .divider{height:1px;background:var(--border);margin:14px 0}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media (max-width:860px){.grid2{grid-template-columns:1fr}}
    .label{font-size:12px;color:var(--muted);display:block;margin:10px 0 6px}
    .input{width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);background:rgba(255,255,255,.9);color:var(--ink);outline:none}
    
    .bucket-card, .filter-pill, .mini-chip{
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.86);
    box-shadow: 0 8px 18px rgba(2,6,23,.05);
    transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
  }

  .bucket-card:hover, .filter-pill:hover, .mini-chip:hover{
    transform: translateY(-1px);
    border-color: rgba(0,167,167,.35);
    box-shadow: 0 12px 24px rgba(2,6,23,.08);
  }

  .bucket-card[data-active="1"],
  .mini-chip[data-active="1"]{
    background: linear-gradient(135deg, rgba(0,167,167,.14), rgba(0,209,209,.10));
    border-color: rgba(0,167,167,.45);
    color: rgba(2,6,23,.88);
  }
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
  