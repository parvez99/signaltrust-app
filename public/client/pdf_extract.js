// src/client/pdf_extract.js
// Browser-only. Guard so Wrangler/Workers build doesn't crash.

if (typeof document === "undefined") {
    // Running in Worker/build context — do nothing.
  } else {
  
    // Load pdfjs from CDN
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    };
    document.head.appendChild(script);
  
    function groupItemsIntoLines(items) {
      // Items have transform [a,b,c,d,e,f] where f is Y, e is X.
      // We'll group by Y (within tolerance), then sort by X.
      const rows = [];
      const Y_TOL = 2.5;
  
      for (const it of items) {
        const str = (it.str || "").trim();
        if (!str) continue;
  
        const x = it.transform?.[4] ?? 0;
        const y = it.transform?.[5] ?? 0;
  
        let row = rows.find(r => Math.abs(r.y - y) <= Y_TOL);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push({ x, str });
      }
  
      // Higher Y is higher on page, so sort desc
      rows.sort((a, b) => b.y - a.y);
  
      const lines = rows.map(r => {
        r.items.sort((a, b) => a.x - b.x);
  
        // Add space between chunks, but avoid "GoogleSenior" joins
        let line = "";
        for (const part of r.items) {
          if (!line) line = part.str;
          else {
            const needsSpace =
              !line.endsWith(" ") &&
              !part.str.startsWith(" ") &&
              /[A-Za-z0-9)]$/.test(line) &&
              /^[A-Za-z0-9(]/.test(part.str);
            line += (needsSpace ? " " : "") + part.str;
          }
        }
        return line.trim();
      });
  
      return lines.filter(Boolean);
    }
  
    window.extractPdfText = async function extractPdfText(file) {
      // Wait until pdfjsLib is available
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const start = Date.now();
          const t = setInterval(() => {
            if (window.pdfjsLib) { clearInterval(t); resolve(); }
            if (Date.now() - start > 5000) { clearInterval(t); reject(new Error("pdfjsLib not loaded")); }
          }, 50);
        });
      }
  
      const arrayBuffer = await file.arrayBuffer();
      if (!window.pdfjsLib) {
        throw new Error("pdfjsLib not loaded yet. Please try again in 1–2 seconds.");
      }
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
      let outLines = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const lines = groupItemsIntoLines(content.items || []);
        outLines.push(...lines, ""); // blank line between pages
      }
  
      return outLines.join("\n").trim();
    };
  
  }
  