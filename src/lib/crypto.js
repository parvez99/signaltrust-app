//# hmacSha256Hex(), timingSafeEqualHex()
export async function hmacSha256Hex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a, b) {
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return res === 0;
}

// ----------------------------------------
// sha256Hex() – generic SHA256 (non-HMAC)
// ----------------------------------------
export async function sha256Hex(message) {
  const enc = new TextEncoder();
  const data = enc.encode(message);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ----------------------------------------
// normalizeForDocHash() – stable hashing
// ----------------------------------------
export function normalizeForDocHash(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Remove volatile fields so tiny edits don't change hash
  const noEmails = t.replace(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g,
    "<email>"
  );

  const noPhones = noEmails.replace(
    /\b(\+?\d[\d\s-]{8,}\d)\b/g,
    "<phone>"
  );

  return noPhones;
}
