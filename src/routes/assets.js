import trustPageRaw from "../client/trust_page.js?raw";
import pdfExtractRaw from "../client/pdf_extract.js?raw";

function asText(x) {
  // handles: string, { default: string }, or other module wrappers
  if (typeof x === "string") return x;
  if (x && typeof x.default === "string") return x.default;
  return String(x); // last resort (should not hit if raw works)
}

export async function handleAssets(request) {
  const { pathname } = new URL(request.url);

  if (pathname === "/client/trust_page.js") {
    return new Response(asText(trustPageRaw), {
      headers: {
        "content-type": "application/javascript; charset=UTF-8",
        "cache-control": "no-store",
      },
    });
  }

  if (pathname === "/client/pdf_extract.js") {
    return new Response(asText(pdfExtractRaw), {
      headers: {
        "content-type": "application/javascript; charset=UTF-8",
        "cache-control": "no-store",
      },
    });
  }

  return null;
}


