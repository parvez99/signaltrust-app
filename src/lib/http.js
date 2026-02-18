//# json(), redirect(), baseUrl, parseCookies, serializeCookie, escapeHtml

export function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "content-type": "application/json; charset=UTF-8" },
    });
  }

  export function redirect(location, status = 302, extraHeaders = {}) {
    return new Response(null, {
      status,
      headers: { Location: location, ...extraHeaders },
    });
  }

  export function getBaseUrl(request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }

  export function parseCookies(cookieHeader) {
    const out = {};
    cookieHeader.split(";").forEach(part => {
      const [k, ...rest] = part.trim().split("=");
      if (!k) return;
      out[k] = decodeURIComponent(rest.join("=") || "");
    });
    return out;
  }

  export function serializeCookie(name, value, opts = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
    if (opts.path) parts.push(`Path=${opts.path}`);
    if (opts.httpOnly) parts.push("HttpOnly");
    if (opts.secure) parts.push("Secure");
    if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
    return parts.join("; ");
  }

  export function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }