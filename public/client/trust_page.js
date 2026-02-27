// src/client/trust_page.js
// Depends on window.extractPdfText provided by /client/pdf_extract.js

// ✅ IMPORTANT: prevent Worker bundle from executing DOM code
if (typeof document === "undefined") {
    // running inside Cloudflare Worker / build-time context — do nothing
  } else {
  
    const status = document.getElementById("status");
    const btn = document.getElementById("run");
    const ta = document.getElementById("resumeText");
  
    const previewToggle = document.getElementById("showExtracted");
    const preview = document.getElementById("extractPreview");
    const extractMeta = document.getElementById("extractMeta");
    const previewBtn = document.getElementById("previewBtn");
  
    let lastExtracted = "";
  
    async function readJson(res) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return await res.json();
      return { error: await res.text() };
    }
  
    function normalizeExtractedText(t) {
      t = (t || "")
        .replace(/\r/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/[–—]/g, "-")
        .replace(/\n[ ]+/g, "\n")
        .replace(/[ ]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
  
      // Force bullets onto their own lines
      t = t.replace(/\s*•\s*/g, "\n• ");
  
      // Force section headers onto own lines
      t = t.replace(
        /\b(Professional Summary|Summary|Experience|Work Experience|Education|Skills|Projects|Certifications)\b/g,
        "\n$1\n"
      );
  
      // Force year ranges onto new lines
      t = t.replace(
        /\b((19|20)\d{2}\s*-\s*(\d{4}|Present|present))\b/g,
        "\n$1 "
      );
  
      t = t.replace(/\n{3,}/g, "\n\n");
      return t.trim();
    }
  
    function setBusy(on, msg) {
      if (btn) {
        btn.disabled = !!on;
        btn.style.opacity = on ? "0.7" : "1";
      }
      if (status) status.textContent = msg || "";
    }
  
    async function extractIfPdfSelected() {
        const file = document.getElementById("pdf")?.files?.[0] || null;
        if (!file) return null;
      
        if (!window.extractPdfText) {
          alert("PDF extractor not loaded yet. Try again in 1–2 seconds.");
          return null;
        }
      
        setBusy(true, "Extracting PDF text…");
      
        let text = "";
        let filename = file.name || "resume.pdf";
      
        try {
          const raw = await window.extractPdfText(file);
          text = normalizeExtractedText(raw);
      
          if (ta) ta.value = text;
          lastExtracted = text;
      
          if (preview) preview.textContent = text;
          if (extractMeta) extractMeta.textContent = `${filename} • ${text.length} chars`;
      
          if (previewToggle) previewToggle.checked = true;
          if (preview) preview.style.display = "block";
      
          setBusy(false, "Preview ready ✅");
        } catch (e) {
          alert(e?.message || String(e));
          setBusy(false, "");
          return null;
        }
      
        return { text, filename };
    }
      
  
    async function run() {
      const file = document.getElementById("pdf")?.files?.[0] || null;
      const pasted = (ta?.value || "").trim();
  
      let text = pasted;
      let filename = "pasted.txt";
      let source = "paste";
      let extractor = "manual";
  
      if (file) {
        const extracted = await extractIfPdfSelected();
        if (!extracted) return;
  
        text = extracted.text;
        filename = extracted.filename;
        source = "pdf";
        extractor = "pdfjs-dist";
      }
  
      if (!text || text.trim().length < 100) {
        alert("Need at least ~100 chars of extracted/pasted text.");
        return;
      }
  
      setBusy(true, "Ingesting…");
      const ingestRes = await fetch("/api/trust/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, filename, source, extractor })
      });
  
      const ingest = await readJson(ingestRes);
      // ✅ If duplicate and we already have a report, skip running pipeline again
      if (ingest.duplicate && ingest.latest_report_id) {
        setBusy(false, "Already evaluated ✅");
        window.location.href =
          "/trust/report?id=" + encodeURIComponent(ingest.latest_report_id);
        return;
      }
      if (!ingestRes.ok) {
        setBusy(false, "");
        alert(ingest.error || "Ingest failed");
        return;
      }
  
      setBusy(true, "Running signals…");
      const runRes = await fetch("/api/trust/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trust_profile_id: ingest.trust_profile_id })
      });
  
      const runData = await readJson(runRes);
      if (!runRes.ok) {
        setBusy(false, "");
        alert(runData.error || "Run failed");
        return;
      }
  
      setBusy(false, "Done ✅");
      window.location.href = "/trust/report?id=" + encodeURIComponent(runData.trust_report_id);
    }
  
    btn?.addEventListener("click", run);
  
    previewBtn?.addEventListener("click", async () => {
      await extractIfPdfSelected();
    });
  
    previewToggle?.addEventListener("change", () => {
      const on = previewToggle.checked;
      if (preview) preview.style.display = on ? "block" : "none";
      if (on && preview) preview.textContent = lastExtracted || "(No PDF extracted yet)";
    });
  
    document.getElementById("logout")?.addEventListener("click", async () => {
      await fetch("/auth/logout", { method: "POST" });
      window.location.replace("/");
    });
  
  } // ✅ end guard
  