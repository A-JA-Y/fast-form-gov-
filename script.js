/* ============================================================
   GovForms — application logic
   All processing happens on-device with the Canvas API.
   ============================================================ */
(() => {
  "use strict";

  /* ---------- tiny helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function formatFileSize(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(
      sizes.length - 1,
      Math.floor(Math.log(bytes) / Math.log(k)),
    );
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + " " + sizes[i];
  }

  const toastsEl = $("toasts");
  function toast(msg, type = "info", ms = 3200) {
    if (!toastsEl) return;
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    toastsEl.appendChild(t);
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 400);
    }, ms);
  }

  function setStatus(el, text, kind = "") {
    if (!el) return;
    el.textContent = text;
    el.className = "status" + (kind ? " " + kind : "");
  }

  function downloadFile(file, name) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name || file.name || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const isImage = (f) =>
    !!f &&
    (f.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name));
  const isPdf = (f) =>
    !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const kbOf = (input) => {
    const v = parseFloat(input.value);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 1024) : 0;
  };
  const placeholderThumb = (label) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="12" fill="#1b2a4a"/><text x="40" y="46" font-family="monospace" font-size="16" font-weight="700" text-anchor="middle" fill="#22d3ee">${label}</text></svg>`,
    );

  /* ---------- templates (single source of truth) ---------- */
  const TEMPLATES = {
    sscexams: {
      name: "SSC CGL / CHSL / MTS / GD",
      org: "Staff Selection Commission",
      photo: { w: 200, h: 240, format: "jpeg", maxKb: 50, minKb: 20 },
      sign: { w: 240, h: 80, format: "png", maxKb: 20, minKb: 10 },
    },
    railway: {
      name: "Railway RRB (NTPC / Group D)",
      org: "Railway Recruitment Boards",
      photo: { w: 200, h: 230, format: "png" },
      sign: { w: 150, h: 50, format: "png" },
    },
    ibps: {
      name: "IBPS / SBI PO & Clerk",
      org: "Banking recruitment",
      photo: { w: 200, h: 230, format: "jpeg", maxKb: 50, minKb: 20 },
      sign: { w: 140, h: 60, format: "jpeg", maxKb: 20, minKb: 10 },
    },
    bank: {
      name: "Bank (generic)",
      org: "Other bank portals",
      photo: { w: 140, h: 160, format: "jpeg" },
      sign: { w: 120, h: 60, format: "jpeg" },
    },
    bpsc: {
      name: "BPSC",
      org: "Bihar Public Service Commission",
      photo: { w: 150, h: 180, format: "png" },
      sign: { w: 120, h: 60, format: "png" },
    },
    passport: {
      name: "Passport / Visa 2 × 2 in",
      org: "600 × 600 px at 300 DPI",
      photo: { w: 600, h: 600, format: "jpeg" },
      sign: { w: 300, h: 100, format: "png" },
    },
    mm3545: {
      name: "35 × 45 mm ID photo",
      org: "413 × 531 px at 300 DPI",
      photo: { w: 413, h: 531, format: "jpeg" },
      sign: { w: 300, h: 100, format: "png" },
    },
    custom: { name: "Custom", org: "Enter your own pixel sizes", custom: true },
  };

  /* ---------- DOM ---------- */
  const templateSel = $("template");
  const templateHint = $("templateHint");
  const customBox = $("customBox");
  const customW = $("customW");
  const customH = $("customH");
  const customSW = $("customSW");
  const customSH = $("customSH");
  const processBtn = $("processBtn");
  const downloadBtn = $("downloadBtn");
  const statusEl = $("status");
  const resultsEl = $("results");
  const zipToggle = $("zipToggle");
  const outputSpec = $("outputSpec");
  const photoFormat = $("photoFormat");
  const signFormat = $("signFormat");
  const idFormat = $("idFormat");
  const photoMaxKb = $("photoMaxKb");
  const signMaxKb = $("signMaxKb");
  const idMaxKb = $("idMaxKb");
  const signClean = $("signClean");
  const previewEmptyState = $("previewEmptyState");

  /* ---------- state ---------- */
  const defaultState = (mode) => ({ zoom: 1, px: 0, py: 0, rot: 0, mode });
  const slots = {
    photo: {
      file: null,
      bmp: null,
      url: null,
      state: defaultState("fill"),
      bg: "#ffffff",
    },
    sign: {
      file: null,
      bmp: null,
      url: null,
      state: defaultState("fit"),
      bg: "#ffffff",
    },
    id: { file: null, bmp: null, url: null },
  };
  let results = []; // [{key, file, over, label}]
  let lastSlot = null;

  /* ---------- image loading & scaling ---------- */
  function halveUntil(src, w, h, targetScale) {
    // progressive halving for high-quality downscales
    let cur = src,
      cw = w,
      ch = h;
    while (targetScale < 0.5 && cw > 64 && ch > 64) {
      const nw = Math.max(1, Math.round(cw / 2));
      const nh = Math.max(1, Math.round(ch / 2));
      const c = document.createElement("canvas");
      c.width = nw;
      c.height = nh;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(cur, 0, 0, nw, nh);
      cur = c;
      cw = nw;
      ch = nh;
      targetScale *= 2;
    }
    return { src: cur, w: cw, h: ch };
  }

  async function loadBitmap(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    try {
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () =>
          rej(new Error("That file could not be read as an image."));
        img.src = url;
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    let bmp = { src: img, w: img.naturalWidth, h: img.naturalHeight };
    const MAX = 2600;
    const longest = Math.max(bmp.w, bmp.h);
    if (longest > MAX) {
      const scale = MAX / longest;
      const stepped = halveUntil(bmp.src, bmp.w, bmp.h, scale);
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.w * scale);
      c.height = Math.round(bmp.h * scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(stepped.src, 0, 0, c.width, c.height);
      bmp = { src: c, w: c.width, h: c.height };
    }
    return { bmp, url };
  }

  /* ---------- framing geometry (resolution independent) ---------- */
  function geom(iw, ih, W, H, state) {
    const swap = state.rot % 180 !== 0;
    const rw = swap ? ih : iw;
    const rh = swap ? iw : ih;
    const base =
      state.mode === "fill"
        ? Math.max(W / rw, H / rh)
        : Math.min(W / rw, H / rh);
    const s = base * state.zoom;
    const dw = rw * s;
    const dh = rh * s;
    const overX = Math.max(0, dw - W);
    const overY = Math.max(0, dh - H);
    const dx = (W - dw) / 2 + (state.px * overX) / 2;
    const dy = (H - dh) / 2 + (state.py * overY) / 2;
    return { s, dw, dh, dx, dy, overX, overY };
  }

  function renderFrame(canvas, bmp, W, H, state, bg) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg || "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (!bmp) return ctx;
    const g = geom(bmp.w, bmp.h, W, H, state);
    const stepped = halveUntil(bmp.src, bmp.w, bmp.h, g.s);
    const drawScale = g.s * (bmp.w / stepped.w);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(g.dx + g.dw / 2, g.dy + g.dh / 2);
    ctx.rotate((state.rot * Math.PI) / 180);
    ctx.drawImage(
      stepped.src,
      (-stepped.w * drawScale) / 2,
      (-stepped.h * drawScale) / 2,
      stepped.w * drawScale,
      stepped.h * drawScale,
    );
    ctx.restore();
    return ctx;
  }

  /* ---------- signature clean-up ---------- */
  function cleanSignature(canvas) {
    const ctx = canvas.getContext("2d");
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H);
    const p = data.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) {
      const l = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;
      hist[l | 0]++;
    }
    // paper brightness ≈ median luminance (paper dominates the area)
    let acc = 0,
      median = 200;
    const half = (W * H) / 2;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= half) {
        median = i;
        break;
      }
    }
    const thr = clamp(median - 38, 110, 235);
    const floor = Math.max(0, thr - 120);
    for (let i = 0; i < p.length; i += 4) {
      const l = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;
      let v;
      if (l >= thr) v = 255;
      else {
        const t = clamp((l - floor) / (thr - floor), 0, 1);
        v = Math.round(255 * t * t);
      }
      p[i] = p[i + 1] = p[i + 2] = v;
      p[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  }

  /* ---------- encoding ---------- */
  const canvasToBlob = (canvas, mime, q) =>
    new Promise((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("Encoding failed"))),
        mime,
        q,
      ),
    );

  async function encodeUnderLimit(canvas, mime, maxBytes) {
    if (mime === "image/png") {
      const blob = await canvasToBlob(canvas, mime);
      return { blob, quality: null, over: !!maxBytes && blob.size > maxBytes };
    }
    const HI = 0.95;
    const first = await canvasToBlob(canvas, mime, HI);
    if (!maxBytes || first.size <= maxBytes)
      return { blob: first, quality: HI, over: false };
    let lo = 0.25,
      hi = HI,
      best = null,
      bestQ = null;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      const b = await canvasToBlob(canvas, mime, mid);
      if (b.size <= maxBytes) {
        best = b;
        bestQ = mid;
        lo = mid;
      } else hi = mid;
      if (hi - lo < 0.01) break;
    }
    if (!best) {
      const b = await canvasToBlob(canvas, mime, 0.25);
      return { blob: b, quality: 0.25, over: b.size > maxBytes };
    }
    return { blob: best, quality: bestQ, over: false };
  }

  function waitForJsPDF() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const check = () => {
        if (window.jspdf && window.jspdf.jsPDF)
          return resolve(window.jspdf.jsPDF);
        if (tries++ > 100)
          return reject(
            new Error("PDF library did not load. Check your connection."),
          );
        setTimeout(check, 50);
      };
      check();
    });
  }

  async function canvasToPDF(canvas, filename, opts = {}) {
    const jsPDF = await waitForJsPDF();
    const imgData = canvas.toDataURL("image/jpeg", opts.quality || 0.95);
    const mmW = opts.mmW || (canvas.width / 96) * 25.4;
    const mmH = opts.mmH || (canvas.height / 96) * 25.4;
    const pdf = new jsPDF({
      orientation: mmW > mmH ? "l" : "p",
      unit: "mm",
      format: [mmW, mmH],
      compress: true,
    });
    pdf.addImage(imgData, "JPEG", 0, 0, mmW, mmH);
    const blob = pdf.output("blob");
    return new File([blob], filename, { type: "application/pdf" });
  }

  /* ---------- dropzones ---------- */
  function setupDropzone(zone, input, onFiles) {
    if (!zone || !input) return;
    const open = () => input.click();
    zone.addEventListener("click", (e) => {
      if (e.target.closest("button, a, label, input")) return;
      open();
    });
    zone.addEventListener("keydown", (e) => {
      if (e.target !== zone) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    let depth = 0;
    zone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      depth++;
      zone.classList.add("drag");
    });
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    zone.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) zone.classList.remove("drag");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      depth = 0;
      zone.classList.remove("drag");
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) onFiles(files);
    });
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      input.value = "";
      if (files.length) onFiles(files);
    });
    zone.addEventListener("pointermove", (e) => {
      const r = zone.getBoundingClientRect();
      zone.style.setProperty("--mx", e.clientX - r.left + "px");
      zone.style.setProperty("--my", e.clientY - r.top + "px");
    });
  }
  // keep the browser from navigating away when a file is dropped outside a zone
  document.addEventListener("dragover", (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files"))
      e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault();
  });

  /* ---------- template select & cards ---------- */
  function buildTemplateOptions() {
    Object.entries(TEMPLATES).forEach(([key, t]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = t.custom
        ? "Custom dimensions…"
        : `${t.name} — ${t.photo.w}×${t.photo.h}`;
      templateSel.appendChild(opt);
    });
    const stat = $("statTemplates");
    if (stat) stat.dataset.count = String(Object.keys(TEMPLATES).length - 1);
  }

  function templateCardSVG(t) {
    const p = t.photo,
      s = t.sign;
    const ps = Math.min(100 / p.w, 106 / p.h);
    const pw = p.w * ps,
      ph = p.h * ps;
    const px = 18,
      py = 14 + (106 - ph) / 2;
    const ss = Math.min(90 / s.w, 44 / s.h);
    const sw = s.w * ss,
      sh = s.h * ss;
    const sx = 138,
      sy = 44 + (44 - sh) / 2;
    const cx = px + pw / 2,
      cy = py + ph * 0.42;
    const rx = pw * 0.22,
      ry = ph * 0.24;
    const scr = `M ${sx + sw * 0.08} ${sy + sh * 0.65} C ${sx + sw * 0.18} ${sy + sh * 0.1}, ${sx + sw * 0.26} ${sy + sh * 1.05}, ${sx + sw * 0.36} ${sy + sh * 0.55} S ${sx + sw * 0.52} ${sy + sh * 0.1}, ${sx + sw * 0.6} ${sy + sh * 0.6} S ${sx + sw * 0.8} ${sy + sh * 0.95}, ${sx + sw * 0.92} ${sy + sh * 0.4}`;
    return `<svg class="tc-svg" viewBox="0 0 240 150" aria-hidden="true">
      <rect class="r" x="${px}" y="${py}" width="${pw}" height="${ph}" rx="4"/>
      <ellipse class="face" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>
      <path class="face" d="M ${px + 2} ${py + ph} C ${px + pw * 0.2} ${py + ph * 0.72}, ${px + pw * 0.8} ${py + ph * 0.72}, ${px + pw - 2} ${py + ph}" />
      <line class="d" x1="${px}" y1="${py + ph + 8}" x2="${px + pw}" y2="${py + ph + 8}"/>
      <line class="d" x1="${px}" y1="${py + ph + 4}" x2="${px}" y2="${py + ph + 12}"/>
      <line class="d" x1="${px + pw}" y1="${py + ph + 4}" x2="${px + pw}" y2="${py + ph + 12}"/>
      <text x="${cx}" y="${py + ph + 24}" text-anchor="middle">${p.w} × ${p.h}</text>
      <rect class="r s" x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="3"/>
      <path class="scr" d="${scr}"/>
      <line class="d" x1="${sx}" y1="${sy + sh + 8}" x2="${sx + sw}" y2="${sy + sh + 8}"/>
      <line class="d" x1="${sx}" y1="${sy + sh + 4}" x2="${sx}" y2="${sy + sh + 12}"/>
      <line class="d" x1="${sx + sw}" y1="${sy + sh + 4}" x2="${sx + sw}" y2="${sy + sh + 12}"/>
      <text x="${sx + sw / 2}" y="${sy + sh + 24}" text-anchor="middle">${s.w} × ${s.h}</text>
      <text x="${px}" y="${py - 4}" fill="var(--muted)">photo</text>
      <text x="${sx}" y="${sy - 6}" fill="var(--muted)">signature</text>
    </svg>`;
  }

  function buildTemplateCards() {
    const grid = $("templateGrid");
    if (!grid) return;
    Object.entries(TEMPLATES).forEach(([key, t]) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "template-card card";
      card.dataset.key = key;
      if (t.custom) {
        card.innerHTML = `
          <div class="tc-head"><div><div class="tc-name">${t.name}</div><div class="tc-org">${t.org}</div></div></div>
          <svg class="tc-svg" viewBox="0 0 240 150" aria-hidden="true">
            <rect class="r" x="40" y="20" width="70" height="90" rx="4" stroke-dasharray="6 5"/>
            <rect class="r s" x="130" y="50" width="80" height="30" rx="3" stroke-dasharray="6 5"/>
            <text x="75" y="135" text-anchor="middle">W × H</text>
            <text x="170" y="105" text-anchor="middle">W × H</text>
          </svg>
          <div class="tc-meta"><span class="chip accent">any size</span><span class="chip">any format</span></div>`;
      } else {
        const chips = [
          `<span class="chip accent">${t.photo.format.toUpperCase()} photo</span>`,
          `<span class="chip">${t.sign.format.toUpperCase()} sign</span>`,
        ];
        if (t.photo.maxKb)
          chips.push(`<span class="chip">≤ ${t.photo.maxKb} KB</span>`);
        card.innerHTML = `
          <div class="tc-head"><div><div class="tc-name">${t.name}</div><div class="tc-org">${t.org}</div></div></div>
          ${templateCardSVG(t)}
          <div class="tc-meta">${chips.join("")}</div>`;
      }
      card.addEventListener("click", () => {
        templateSel.value = key;
        templateSel.dispatchEvent(new Event("change"));
        document
          .getElementById("studio")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        toast(`${t.name} loaded into the Studio`, "ok");
      });
      grid.appendChild(card);
    });
  }

  function markSelectedCard() {
    document.querySelectorAll(".template-card").forEach((c) => {
      c.classList.toggle("selected", c.dataset.key === templateSel.value);
    });
  }

  function currentSpec() {
    const key = templateSel.value;
    if (!key) return null;
    if (key === "custom") {
      const w = clamp(parseInt(customW.value, 10) || 200, 16, 4000);
      const h = clamp(parseInt(customH.value, 10) || 240, 16, 4000);
      const sw = clamp(parseInt(customSW.value, 10) || 240, 16, 4000);
      const sh = clamp(parseInt(customSH.value, 10) || 80, 16, 4000);
      return {
        key,
        name: "Custom",
        photo: { w, h, format: "jpeg" },
        sign: { w: sw, h: sh, format: "png" },
      };
    }
    return { key, ...TEMPLATES[key] };
  }

  function describeSpec(spec) {
    if (!spec)
      return "Select a template to pre-fill dimensions and size limits.";
    const p = spec.photo,
      s = spec.sign;
    const pk = p.maxKb ? ` · ≤ ${p.maxKb} KB` : "";
    const sk = s.maxKb ? ` · ≤ ${s.maxKb} KB` : "";
    return `Photo ${p.w}×${p.h} px · ${p.format.toUpperCase()}${pk}  —  Signature ${s.w}×${s.h} px · ${s.format.toUpperCase()}${sk}`;
  }

  function applyTemplate(fromUser = true) {
    const key = templateSel.value;
    customBox.hidden = key !== "custom";
    const spec = currentSpec();
    templateHint.textContent = describeSpec(spec);
    markSelectedCard();
    if (spec && key !== "custom" && fromUser) {
      photoFormat.value = spec.photo.format;
      signFormat.value = spec.sign.format;
      photoMaxKb.value = spec.photo.maxKb || "";
      signMaxKb.value = spec.sign.maxKb || "";
      photoMaxKb.placeholder = spec.photo.maxKb
        ? String(spec.photo.maxKb)
        : "auto";
      signMaxKb.placeholder = spec.sign.maxKb
        ? String(spec.sign.maxKb)
        : "auto";
    }
    try {
      localStorage.setItem("govforms-template", key);
    } catch (e) {}
    updateAnatomy(spec);
    outputSpec.textContent = spec
      ? `${spec.photo.w}×${spec.photo.h} / ${spec.sign.w}×${spec.sign.h}`
      : "no template";
    drawEditor("photo");
    drawEditor("sign");
    renderLive();
    document.dispatchEvent(new CustomEvent("govforms:layout"));
  }

  function updateAnatomy(spec) {
    const p = spec ? spec.photo : { w: 200, h: 240 };
    const s = spec ? spec.sign : { w: 240, h: 80 };
    const w = $("anWidth"),
      h = $("anHeight"),
      sg = $("anSig");
    if (w) w.textContent = `${p.w} px`;
    if (h) h.textContent = `${p.h} px`;
    if (sg) sg.textContent = `${s.w} × ${s.h} px`;
  }

  templateSel.addEventListener("change", () => applyTemplate(true));
  [customW, customH, customSW, customSH].forEach((el) =>
    el.addEventListener("input", () => applyTemplate(false)),
  );

  /* ---------- slot editors ---------- */
  const editors = {
    photo: {
      wrap: $("photoEditor"),
      canvas: $("photoEditorCanvas"),
      zoom: $("photoZoom"),
      out: $("photoOut"),
      dims: $("photoDims"),
      frame: $("photoFrameBox"),
    },
    sign: {
      wrap: $("signEditor"),
      canvas: $("signEditorCanvas"),
      zoom: $("signZoom"),
      out: $("signOut"),
      dims: $("signDims"),
      frame: $("signFrameBox"),
    },
  };

  function specFor(slot) {
    const spec = currentSpec();
    if (!spec) return null;
    return slot === "photo" ? spec.photo : spec.sign;
  }

  function drawEditor(slot) {
    const ed = editors[slot];
    const s = slots[slot];
    const spec = specFor(slot);
    if (!ed || !s.bmp || !spec) {
      if (ed) ed.wrap.hidden = true;
      return;
    }
    ed.wrap.hidden = false;
    const stage = ed.canvas.closest(".editor-stage");
    const maxW = Math.max(120, Math.min(stage.clientWidth - 20, 420));
    const maxH = 320;
    const aspect = spec.w / spec.h;
    let cw = maxW,
      ch = cw / aspect;
    if (ch > maxH) {
      ch = maxH;
      cw = ch * aspect;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ed.canvas.style.width = cw + "px";
    ed.canvas.style.height = ch + "px";
    renderFrame(
      ed.canvas,
      s.bmp,
      Math.round(cw * dpr),
      Math.round(ch * dpr),
      s.state,
      s.bg,
    );
    ed.cssW = cw;
    ed.cssH = ch;
    ed.zoom.value = s.state.zoom;
    ed.zoom.style.setProperty("--fill", ((s.state.zoom - 1) / 2) * 100 + "%");
  }

  let liveTimer = null;
  function renderLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      ["photo", "sign"].forEach((slot) => {
        const ed = editors[slot];
        const s = slots[slot];
        const spec = specFor(slot);
        const W = spec ? spec.w : slot === "photo" ? 200 : 240;
        const H = spec ? spec.h : slot === "photo" ? 240 : 80;
        ed.dims.textContent = `${W} × ${H} px`;
        ed.frame.classList.toggle("empty", !s.bmp || !spec);
        if (!s.bmp || !spec) {
          ed.out.width = W;
          ed.out.height = H;
          const ctx = ed.out.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#94a3b8";
          ctx.font = `${Math.max(10, Math.min(W, H) / 9)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(slot === "photo" ? "photo" : "signature", W / 2, H / 2);
          return;
        }
        renderFrame(ed.out, s.bmp, W, H, s.state, s.bg);
        if (slot === "sign" && signClean.checked) cleanSignature(ed.out);
      });
    }, 40);
  }

  function wireEditor(slot) {
    const ed = editors[slot];
    const s = slots[slot];
    let dragging = false,
      lx = 0,
      ly = 0;
    ed.canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      ed.canvas.setPointerCapture(e.pointerId);
    });
    ed.canvas.addEventListener("pointermove", (e) => {
      if (!dragging || !s.bmp) return;
      const spec = specFor(slot);
      if (!spec) return;
      const g = geom(s.bmp.w, s.bmp.h, ed.cssW, ed.cssH, s.state);
      const dx = e.clientX - lx,
        dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      if (g.overX > 0)
        s.state.px = clamp(s.state.px + (dx * 2) / g.overX, -1, 1);
      if (g.overY > 0)
        s.state.py = clamp(s.state.py + (dy * 2) / g.overY, -1, 1);
      drawEditor(slot);
      renderLive();
    });
    const stop = () => (dragging = false);
    ed.canvas.addEventListener("pointerup", stop);
    ed.canvas.addEventListener("pointercancel", stop);
    ed.canvas.addEventListener(
      "wheel",
      (e) => {
        if (!s.bmp) return;
        e.preventDefault();
        s.state.zoom = clamp(s.state.zoom - Math.sign(e.deltaY) * 0.08, 1, 3);
        drawEditor(slot);
        renderLive();
      },
      { passive: false },
    );
    ed.zoom.addEventListener("input", () => {
      s.state.zoom = parseFloat(ed.zoom.value);
      drawEditor(slot);
      renderLive();
    });
  }
  wireEditor("photo");
  wireEditor("sign");
  editors.sign.out.getContext("2d", { willReadFrequently: true });

  document.querySelectorAll("[data-rotate]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const slot = btn.dataset.rotate;
      slots[slot].state.rot = (slots[slot].state.rot + 90) % 360;
      drawEditor(slot);
      renderLive();
    }),
  );
  document.querySelectorAll("[data-resetslot]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const slot = btn.dataset.resetslot;
      slots[slot].state = defaultState(slots[slot].state.mode);
      drawEditor(slot);
      renderLive();
    }),
  );
  document.querySelectorAll(".seg-btn[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const slot = btn.dataset.slot;
      slots[slot].state.mode = btn.dataset.mode;
      slots[slot].state.px = 0;
      slots[slot].state.py = 0;
      btn.parentElement
        .querySelectorAll(".seg-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      drawEditor(slot);
      renderLive();
    }),
  );
  document
    .querySelectorAll(".swatches[data-bg] .swatch[data-color]")
    .forEach((sw) =>
      sw.addEventListener("click", () => {
        const slot = sw.closest(".swatches").dataset.bg;
        slots[slot].bg = sw.dataset.color;
        sw.parentElement
          .querySelectorAll(".swatch")
          .forEach((b) => b.classList.toggle("active", b === sw));
        drawEditor(slot);
        renderLive();
      }),
    );
  const bgCustom = $("photoBgCustom");
  if (bgCustom)
    bgCustom.addEventListener("input", () => {
      slots.photo.bg = bgCustom.value;
      bgCustom.parentElement.parentElement
        .querySelectorAll(".swatch")
        .forEach((b) =>
          b.classList.toggle("active", b === bgCustom.parentElement),
        );
      drawEditor("photo");
      renderLive();
    });
  signClean.addEventListener("change", renderLive);

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawEditor("photo");
      drawEditor("sign");
    }, 150);
  });

  /* ---------- slot files ---------- */
  const metaEls = (slot) => ({
    drop: $(slot + "Drop"),
    meta: $(slot + "Meta"),
    thumb: $(slot + "Thumb"),
    name: $(slot + "Name"),
    size: $(slot + "Size"),
  });

  async function setSlotFile(slot, file) {
    if (!file) return;
    const s = slots[slot];
    const needsImage = slot !== "id";
    if (needsImage && !isImage(file)) {
      toast("Please choose an image file (JPG, PNG or WEBP).", "err");
      return;
    }
    clearSlot(slot, true);
    const m = metaEls(slot);
    s.file = file;
    m.name.textContent = file.name;
    m.size.textContent = formatFileSize(file.size);
    m.meta.hidden = false;
    m.drop.classList.add("has-file");
    if (isImage(file)) {
      try {
        const { bmp, url } = await loadBitmap(file);
        if (s.file !== file) return; // replaced meanwhile
        s.bmp = bmp;
        s.url = url;
        m.thumb.src = url;
      } catch (err) {
        toast(err.message, "err");
        clearSlot(slot);
        return;
      }
    } else {
      m.thumb.src = placeholderThumb(isPdf(file) ? "PDF" : "FILE");
    }
    if (slot !== "id") {
      s.state = defaultState(s.state.mode);
      drawEditor(slot);
      renderLive();
    }
    updatePreviewCards();
    invalidateResults();
    document.dispatchEvent(new CustomEvent("govforms:layout"));
  }

  function clearSlot(slot, silent = false) {
    const s = slots[slot];
    const m = metaEls(slot);
    if (slot === "photo" && sheet.fromStudio) clearSheet();
    if (s.url) URL.revokeObjectURL(s.url);
    s.file = null;
    s.bmp = null;
    s.url = null;
    m.meta.hidden = true;
    m.drop.classList.remove("has-file");
    m.thumb.removeAttribute("src");
    if (editors[slot]) {
      editors[slot].wrap.hidden = true;
      renderLive();
    }
    if (!silent) {
      updatePreviewCards();
      invalidateResults();
      document.dispatchEvent(new CustomEvent("govforms:layout"));
    }
  }

  ["photo", "sign", "id"].forEach((slot) => {
    const m = metaEls(slot);
    setupDropzone(m.drop, $(slot + "File"), (files) =>
      setSlotFile(slot, files[0]),
    );
    m.drop.addEventListener("pointerenter", () => (lastSlot = slot));
    m.drop.addEventListener("focus", () => (lastSlot = slot));
  });
  document.querySelectorAll("[data-clear]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const slot = btn.dataset.clear;
      if (slots[slot]) clearSlot(slot);
      else if (slot === "sheet") clearSheet();
      else if (slot === "comp") clearComp();
    }),
  );
  document.querySelectorAll("[data-view]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const slot = btn.dataset.view;
      const labels = {
        photo: "Photo (original)",
        sign: "Signature (original)",
        id: "ID document",
      };
      openViewer(slots[slot].file, labels[slot]);
    }),
  );

  // clipboard paste → photo / signature
  document.addEventListener("paste", (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const item = items.find(
      (i) => i.kind === "file" && i.type.startsWith("image/"),
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    const target =
      lastSlot && lastSlot !== "id"
        ? lastSlot
        : !slots.photo.file
          ? "photo"
          : "sign";
    const named = new File(
      [file],
      `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`,
      { type: file.type },
    );
    setSlotFile(target, named);
    toast(
      `Pasted image into ${target === "photo" ? "Photo" : "Signature"}`,
      "ok",
    );
    document
      .getElementById("studio")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------- preview cards ---------- */
  function setPreviewImage(container, src, alt) {
    container.innerHTML = "";
    if (!src) {
      container.innerHTML = '<span class="pc-empty">Process to compare</span>';
      return;
    }
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    container.appendChild(img);
  }

  function updatePreviewCards() {
    const anyFile = slots.photo.file || slots.sign.file || slots.id.file;
    previewEmptyState.hidden = !!anyFile;
    ["photo", "sign"].forEach((slot) => {
      const card = $(slot + "Preview");
      const s = slots[slot];
      card.hidden = !s.file;
      if (!s.file) return;
      setPreviewImage($(slot + "PreviewImage"), s.url, slot);
      $(slot + "SizeBefore").textContent = formatFileSize(s.file.size);
      const r = results.find((x) => x.key === slot);
      if (!r) {
        $(slot + "SizeAfter").textContent = "—";
        $(slot + "BarBefore").style.width = "100%";
        $(slot + "BarAfter").style.width = "0%";
        $(slot + "Reduction").hidden = true;
        setPreviewImage($(slot + "PreviewAfter"), null);
      }
    });
    const idCard = $("idPreview");
    idCard.hidden = !slots.id.file;
    if (slots.id.file) {
      const box = $("idPreviewImage");
      if (slots.id.url) setPreviewImage(box, slots.id.url, "ID document");
      else
        box.innerHTML = `<span class="pc-doc">📄 ${slots.id.file.name}</span>`;
      $("idSize2").textContent = formatFileSize(slots.id.file.size);
      const r = results.find((x) => x.key === "id");
      $("idOutInfo").textContent = r
        ? `${r.file.name} · ${formatFileSize(r.file.size)}`
        : "—";
    }
  }

  function showAfter(slot, file) {
    const before = slots[slot].file.size;
    const after = file.size;
    $(slot + "SizeAfter").textContent = formatFileSize(after);
    const max = Math.max(before, after, 1);
    requestAnimationFrame(() => {
      $(slot + "BarBefore").style.width = (before / max) * 100 + "%";
      $(slot + "BarAfter").style.width = (after / max) * 100 + "%";
    });
    const red = $(slot + "Reduction");
    const diff = before - after;
    const pct = ((Math.abs(diff) / before) * 100).toFixed(1);
    red.hidden = false;
    if (diff > 0) {
      red.textContent = `✓ Reduced by ${pct}% (${formatFileSize(diff)} saved)`;
      red.classList.remove("negative");
    } else if (diff < 0) {
      red.textContent = `Increased by ${pct}% (${formatFileSize(-diff)} added — try JPEG or a KB limit)`;
      red.classList.add("negative");
    } else red.hidden = true;
    const box = $(slot + "PreviewAfter");
    if (file.type === "application/pdf") {
      box.innerHTML = `<span class="pc-doc">PDF · ${formatFileSize(after)}</span>`;
    } else {
      const url = URL.createObjectURL(file);
      setPreviewImage(box, url, slot + " processed");
      box.querySelector("img").onload = () => URL.revokeObjectURL(url);
    }
  }

  /* ---------- processing ---------- */
  function invalidateResults() {
    if (!results.length) return;
    results = [];
    resultsEl.innerHTML = "";
    downloadBtn.disabled = true;
    setStatus(
      statusEl,
      "Inputs changed — process again to refresh the output.",
    );
  }

  function extFor(fmt) {
    return fmt === "jpg" ? "jpg" : fmt === "jpeg" ? "jpeg" : fmt;
  }

  async function encodeSlot(slot, spec, fmt, maxBytes) {
    const s = slots[slot];
    const canvas = document.createElement("canvas");
    if (slot === "sign") canvas.getContext("2d", { willReadFrequently: true });
    renderFrame(canvas, s.bmp, spec.w, spec.h, s.state, s.bg);
    if (slot === "sign" && signClean.checked) cleanSignature(canvas);
    const base = slot === "photo" ? "photo" : "signature";
    if (fmt === "pdf") {
      const file = await canvasToPDF(canvas, `${base}_${spec.w}x${spec.h}.pdf`);
      return { file, over: !!maxBytes && file.size > maxBytes, quality: null };
    }
    const mime = fmt === "png" ? "image/png" : "image/jpeg";
    const { blob, over, quality } = await encodeUnderLimit(
      canvas,
      mime,
      maxBytes,
    );
    const file = new File(
      [blob],
      `${base}_${spec.w}x${spec.h}.${extFor(fmt)}`,
      { type: mime },
    );
    return { file, over, quality };
  }

  async function processId() {
    const s = slots.id;
    if (!s.file) return null;
    const wantPdf = idFormat.value === "pdf";
    const maxBytes = kbOf(idMaxKb);
    if (s.bmp) {
      if (wantPdf) {
        const c = document.createElement("canvas");
        renderFrame(
          c,
          s.bmp,
          s.bmp.w,
          s.bmp.h,
          defaultState("fill"),
          "#ffffff",
        );
        const file = await canvasToPDF(c, "id_document.pdf");
        return {
          key: "id",
          file,
          over: !!maxBytes && file.size > maxBytes,
          label: "ID document",
        };
      }
      if (maxBytes && s.file.size > maxBytes) {
        const c = document.createElement("canvas");
        renderFrame(
          c,
          s.bmp,
          s.bmp.w,
          s.bmp.h,
          defaultState("fill"),
          "#ffffff",
        );
        const { blob, over } = await encodeUnderLimit(
          c,
          "image/jpeg",
          maxBytes,
        );
        const file = new File([blob], "id_document.jpg", {
          type: "image/jpeg",
        });
        return { key: "id", file, over, label: "ID document" };
      }
    }
    const name = /\.[a-z0-9]+$/i.test(s.file.name)
      ? s.file.name
      : s.file.name + ".bin";
    const file = new File([s.file], "id_" + name, { type: s.file.type });
    return {
      key: "id",
      file,
      over: !!maxBytes && file.size > maxBytes,
      label: "ID document",
    };
  }

  function renderResults() {
    resultsEl.innerHTML = "";
    results.forEach((r, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = i * 0.08 + "s";
      const icon = r.file.type === "application/pdf" ? "#i-pdf" : "#i-photo";
      li.innerHTML = `<svg class="ic"><use href="${icon}"/></svg>
        <span class="r-name" title="${r.file.name}">${r.file.name}</span>
        <span class="r-size mono ${r.over ? "over" : ""}">${formatFileSize(r.file.size)}${r.over ? " ⚠" : ""}</span>`;
      const view = document.createElement("button");
      view.type = "button";
      view.className = "icon-btn";
      view.title = "Preview";
      view.setAttribute("aria-label", "Preview " + r.file.name);
      view.innerHTML = '<svg class="ic"><use href="#i-eye"/></svg>';
      view.addEventListener("click", () => openViewer(r.file, r.file.name));
      const dl = document.createElement("button");
      dl.type = "button";
      dl.className = "icon-btn";
      dl.title = "Download this file";
      dl.setAttribute("aria-label", "Download " + r.file.name);
      dl.innerHTML = '<svg class="ic"><use href="#i-download"/></svg>';
      dl.addEventListener("click", () => downloadFile(r.file));
      li.appendChild(view);
      li.appendChild(dl);
      resultsEl.appendChild(li);
    });
  }

  let processing = false;
  async function processAll() {
    if (processing) return;
    const spec = currentSpec();
    if (!spec) {
      setStatus(statusEl, "Choose a template first.", "err");
      templateSel.focus();
      return;
    }
    if (!slots.photo.bmp || !slots.sign.bmp) {
      setStatus(statusEl, "Upload both a photo and a signature.", "err");
      return;
    }
    processing = true;
    processBtn.classList.add("loading");
    processBtn.disabled = true;
    setStatus(statusEl, "Processing on your device…", "busy");
    const t0 = performance.now();
    try {
      const out = [];
      const p = await encodeSlot(
        "photo",
        spec.photo,
        photoFormat.value,
        kbOf(photoMaxKb),
      );
      out.push({ key: "photo", file: p.file, over: p.over, label: "Photo" });
      const sg = await encodeSlot(
        "sign",
        spec.sign,
        signFormat.value,
        kbOf(signMaxKb),
      );
      out.push({
        key: "sign",
        file: sg.file,
        over: sg.over,
        label: "Signature",
      });
      const id = await processId();
      if (id) out.push(id);
      results = out;
      renderResults();
      showAfter("photo", p.file);
      showAfter("sign", sg.file);
      updatePreviewCards();
      downloadBtn.disabled = false;
      const overs = out.filter((r) => r.over);
      const ms = Math.round(performance.now() - t0);
      if (overs.length) {
        setStatus(
          statusEl,
          `Done in ${ms} ms, but ${overs.map((r) => r.label).join(" & ")} could not fit under the KB limit. Try JPEG or a smaller target.`,
          "err",
        );
        toast("Some files exceed their KB limit", "warn");
      } else {
        setStatus(
          statusEl,
          `Done in ${ms} ms. ${out.length} file${out.length > 1 ? "s" : ""} ready to download.`,
          "ok",
        );
        toast("Processing complete", "ok");
      }
      document.dispatchEvent(new CustomEvent("govforms:layout"));
    } catch (err) {
      console.error(err);
      setStatus(statusEl, "Error: " + err.message, "err");
    } finally {
      processing = false;
      processBtn.classList.remove("loading");
      processBtn.disabled = false;
    }
  }
  processBtn.addEventListener("click", processAll);

  async function downloadAll() {
    if (!results.length) return;
    try {
      if (zipToggle.checked && window.JSZip && results.length > 1) {
        setStatus(statusEl, "Zipping…", "busy");
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.file.name, r.file));
        const blob = await zip.generateAsync({
          type: "blob",
          compression: "STORE",
        });
        downloadFile(
          new File([blob], `govforms_${templateSel.value || "files"}.zip`, {
            type: "application/zip",
          }),
        );
        setStatus(statusEl, "ZIP downloaded.", "ok");
        return;
      }
      for (const r of results) {
        downloadFile(r.file);
        await sleep(350);
      }
      setStatus(statusEl, "Files downloaded.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(statusEl, "Error: " + err.message, "err");
    }
  }
  downloadBtn.addEventListener("click", downloadAll);

  [photoFormat, signFormat, idFormat, photoMaxKb, signMaxKb, idMaxKb].forEach(
    (el) => el.addEventListener("change", invalidateResults),
  );

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      processAll();
    }
    if (e.key === "Escape" && viewerModal.classList.contains("active"))
      closeViewer();
  });

  /* ---------- viewer modal ---------- */
  const viewerModal = $("viewerModal");
  const viewerBody = $("viewerBody");
  const viewerTitle = $("viewerTitle");
  let viewerUrl = null;

  function openViewer(file, title = "Document Preview") {
    if (!file) return;
    closeViewer();
    viewerTitle.textContent = title;
    viewerUrl = URL.createObjectURL(file);
    if (isImage(file)) {
      const img = document.createElement("img");
      img.src = viewerUrl;
      img.alt = file.name;
      viewerBody.appendChild(img);
    } else if (isPdf(file)) {
      const obj = document.createElement("object");
      obj.data = viewerUrl;
      obj.type = "application/pdf";
      obj.innerHTML = `<p class="viewer-empty">Inline preview unavailable. <a target="_blank" rel="noopener" href="${viewerUrl}">Open in a new tab</a></p>`;
      viewerBody.appendChild(obj);
    } else if (
      file.type.startsWith("text/") ||
      /\.(txt|md|csv)$/i.test(file.name)
    ) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const pre = document.createElement("pre");
        pre.textContent = e.target.result;
        viewerBody.appendChild(pre);
      };
      reader.readAsText(file);
    } else {
      const p = document.createElement("p");
      p.className = "viewer-empty";
      p.textContent = `Preview not supported for "${file.type || "unknown type"}". Download it to verify.`;
      viewerBody.appendChild(p);
    }
    viewerModal.classList.add("active");
  }
  function closeViewer() {
    viewerBody.innerHTML = "";
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = null;
    viewerModal.classList.remove("active");
  }
  $("closeViewerBtn").addEventListener("click", closeViewer);
  viewerModal.addEventListener("click", (e) => {
    if (e.target === viewerModal) closeViewer();
  });

  /* ---------- merge ---------- */
  const mergeListEl = $("mergeList");
  const mergeBtn = $("mergeBtn");
  const mergeClearBtn = $("mergeClearBtn");
  const mergeStatus = $("mergeStatus");
  const mergeSummary = $("mergeSummary");
  const mergePageSize = $("mergePageSize");
  const mergeName = $("mergeName");
  const mergeItems = [];
  let mergeSeq = 0;

  function moveItem(from, to) {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= mergeItems.length ||
      to >= mergeItems.length
    )
      return;
    const [it] = mergeItems.splice(from, 1);
    mergeItems.splice(to, 0, it);
    renderMergeList();
  }

  function renderMergeList() {
    mergeListEl.innerHTML = "";
    const total = mergeItems.reduce((a, b) => a + b.file.size, 0);
    mergeSummary.textContent = mergeItems.length
      ? `${mergeItems.length} file${mergeItems.length > 1 ? "s" : ""} · ${formatFileSize(total)}`
      : "";
    mergeBtn.disabled = !mergeItems.length;
    mergeClearBtn.disabled = !mergeItems.length;
    if (!mergeItems.length) {
      mergeListEl.innerHTML =
        '<p class="merge-empty">No files yet. Add files to start merging.</p>';
      document.dispatchEvent(new CustomEvent("govforms:layout"));
      return;
    }
    mergeItems.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "merge-item";
      row.draggable = true;
      row.dataset.index = index;
      row.innerHTML = `<svg class="ic mi-grip" aria-hidden="true"><use href="#i-grip"/></svg>`;
      const thumb = document.createElement(item.url ? "img" : "div");
      thumb.className = "mi-thumb";
      if (item.url) {
        thumb.src = item.url;
        thumb.alt = "";
      } else thumb.textContent = isPdf(item.file) ? "PDF" : "FILE";
      row.appendChild(thumb);
      const meta = document.createElement("div");
      meta.className = "mi-meta";
      meta.innerHTML = `<span class="mi-name" title="${item.file.name}">${item.file.name}</span><span class="mi-size mono">${formatFileSize(item.file.size)}</span>`;
      row.appendChild(meta);
      const mk = (icon, title, cls, fn, disabled) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "icon-btn " + cls;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.disabled = !!disabled;
        b.innerHTML = `<svg class="ic"><use href="${icon}"/></svg>`;
        b.addEventListener("click", fn);
        return b;
      };
      row.appendChild(
        mk(
          "#i-up",
          "Move up",
          "mi-up",
          () => moveItem(index, index - 1),
          index === 0,
        ),
      );
      row.appendChild(
        mk(
          "#i-down",
          "Move down",
          "mi-down",
          () => moveItem(index, index + 1),
          index === mergeItems.length - 1,
        ),
      );
      row.appendChild(
        mk("#i-eye", "View file", "mi-view", () =>
          openViewer(item.file, item.file.name),
        ),
      );
      row.appendChild(
        mk("#i-x", "Remove", "danger", () => {
          if (item.url) URL.revokeObjectURL(item.url);
          mergeItems.splice(index, 1);
          renderMergeList();
        }),
      );
      // drag to reorder
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        mergeListEl
          .querySelectorAll(".merge-item")
          .forEach((r) => r.classList.remove("drop-before", "drop-after"));
      });
      row.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes("text/plain")) return;
        e.preventDefault();
        e.stopPropagation();
        const r = row.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        row.classList.toggle("drop-before", before);
        row.classList.toggle("drop-after", !before);
      });
      row.addEventListener("dragleave", () =>
        row.classList.remove("drop-before", "drop-after"),
      );
      row.addEventListener("drop", (e) => {
        const raw = e.dataTransfer.getData("text/plain");
        if (raw === "") return;
        e.preventDefault();
        e.stopPropagation();
        const from = parseInt(raw, 10);
        const r = row.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        let to = index + (before ? 0 : 1);
        if (from < to) to--;
        moveItem(from, to);
      });
      mergeListEl.appendChild(row);
    });
    document.dispatchEvent(new CustomEvent("govforms:layout"));
  }

  setupDropzone($("mergeDrop"), $("mergeFiles"), (files) => {
    let added = 0;
    files.forEach((file) => {
      if (!isImage(file) && !isPdf(file)) return;
      mergeItems.push({
        id: mergeSeq++,
        file,
        url: isImage(file) ? URL.createObjectURL(file) : null,
      });
      added++;
    });
    if (!added) {
      setStatus(mergeStatus, "Only images and PDFs can be merged.", "err");
      return;
    }
    renderMergeList();
    setStatus(
      mergeStatus,
      `${mergeItems.length} file${mergeItems.length > 1 ? "s" : ""} queued. Drag rows to reorder.`,
    );
  });
  mergeClearBtn.addEventListener("click", () => {
    mergeItems.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    mergeItems.length = 0;
    renderMergeList();
    setStatus(mergeStatus, "Select files to merge.");
  });

  async function imageToPngBytes(file) {
    const { bmp, url } = await loadBitmap(file);
    URL.revokeObjectURL(url);
    const c = document.createElement("canvas");
    c.width = bmp.w;
    c.height = bmp.h;
    c.getContext("2d").drawImage(bmp.src, 0, 0);
    const blob = await canvasToBlob(c, "image/png");
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function mergeFilesToPdf(items, pageMode, onProgress) {
    if (!window.PDFLib)
      throw new Error("PDF library did not load. Check your connection.");
    const merged = await PDFLib.PDFDocument.create();
    const A4 = [595.28, 841.89];
    const MARGIN = 24;
    for (let i = 0; i < items.length; i++) {
      const file = items[i].file;
      onProgress && onProgress(i, items.length, file.name);
      if (isPdf(file)) {
        const bytes = await file.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(bytes, {
          ignoreEncryption: true,
        });
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        continue;
      }
      if (!isImage(file)) continue;
      let img;
      const lower = file.name.toLowerCase();
      try {
        const bytes = await file.arrayBuffer();
        if (file.type === "image/png" || lower.endsWith(".png"))
          img = await merged.embedPng(bytes);
        else if (file.type === "image/jpeg" || /\.jpe?g$/.test(lower))
          img = await merged.embedJpg(bytes);
        else img = await merged.embedPng(await imageToPngBytes(file));
      } catch (err) {
        // fall back to re-encoding through the canvas (handles odd JPEG variants, WEBP, BMP…)
        img = await merged.embedPng(await imageToPngBytes(file));
      }
      const { width, height } = img.scale(1);
      if (pageMode === "a4") {
        const page = merged.addPage(A4);
        const maxW = A4[0] - MARGIN * 2;
        const maxH = A4[1] - MARGIN * 2;
        const s = Math.min(maxW / width, maxH / height, 1e9);
        const w = width * s,
          h = height * s;
        page.drawImage(img, {
          x: (A4[0] - w) / 2,
          y: (A4[1] - h) / 2,
          width: w,
          height: h,
        });
      } else {
        const page = merged.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });
      }
    }
    const bytes = await merged.save();
    return bytes;
  }

  mergeBtn.addEventListener("click", async () => {
    if (!mergeItems.length) return;
    mergeBtn.disabled = true;
    mergeBtn.classList.add("loading");
    try {
      const bytes = await mergeFilesToPdf(
        mergeItems,
        mergePageSize.value,
        (i, n, name) =>
          setStatus(mergeStatus, `Merging ${i + 1} of ${n}: ${name}`, "busy"),
      );
      const safe = (mergeName.value || "merged").replace(/[^\w\-]+/g, "_");
      const file = new File([bytes], `${safe}.pdf`, {
        type: "application/pdf",
      });
      downloadFile(file);
      setStatus(
        mergeStatus,
        `Merged PDF downloaded (${formatFileSize(file.size)}).`,
        "ok",
      );
      toast("Merged PDF ready", "ok");
    } catch (err) {
      console.error(err);
      setStatus(mergeStatus, "Error merging files: " + err.message, "err");
    } finally {
      mergeBtn.disabled = !mergeItems.length;
      mergeBtn.classList.remove("loading");
    }
  });

  /* ---------- passport photo sheet ---------- */
  const PAPERS = {
    a4: [210, 297],
    a5: [148, 210],
    letter: [215.9, 279.4],
    "4x6": [101.6, 152.4],
  };
  const PHOTO_SIZES = {
    "35x45": [35, 45],
    "51x51": [50.8, 50.8],
    "25x35": [25, 35],
    "35x35": [35, 35],
  };
  const DPI = 300;
  const sheet = {
    bmp: null,
    url: null,
    state: defaultState("fill"),
    fromStudio: false,
  };
  const sheetPaper = $("sheetPaper");
  const sheetPhoto = $("sheetPhoto");
  const sheetGap = $("sheetGap");
  const sheetCustom = $("sheetCustom");
  const sheetCW = $("sheetCW");
  const sheetCH = $("sheetCH");
  const sheetGuides = $("sheetGuides");
  const sheetPreview = $("sheetPreview");
  const sheetInfo = $("sheetInfo");
  const sheetJpgBtn = $("sheetJpgBtn");
  const sheetPdfBtn = $("sheetPdfBtn");

  function sheetLayout() {
    const [pw, ph] = PAPERS[sheetPaper.value] || PAPERS.a4;
    let cw, ch;
    if (sheetPhoto.value === "custom") {
      cw = clamp(parseFloat(sheetCW.value) || 35, 10, 150);
      ch = clamp(parseFloat(sheetCH.value) || 45, 10, 150);
    } else [cw, ch] = PHOTO_SIZES[sheetPhoto.value] || PHOTO_SIZES["35x45"];
    const gap = clamp(parseFloat(sheetGap.value) || 0, 0, 20);
    const margin = 6;
    const cols = Math.max(0, Math.floor((pw - margin * 2 + gap) / (cw + gap)));
    const rows = Math.max(0, Math.floor((ph - margin * 2 + gap) / (ch + gap)));
    const gridW = cols * cw + (cols - 1) * gap;
    const gridH = rows * ch + (rows - 1) * gap;
    return {
      pw,
      ph,
      cw,
      ch,
      gap,
      cols,
      rows,
      ox: (pw - gridW) / 2,
      oy: (ph - gridH) / 2,
    };
  }

  function drawSheet(canvas, pxPerMm) {
    const L = sheetLayout();
    canvas.width = Math.round(L.pw * pxPerMm);
    canvas.height = Math.round(L.ph * pxPerMm);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!sheet.bmp || !L.cols || !L.rows) return L;
    const cell = document.createElement("canvas");
    renderFrame(
      cell,
      sheet.bmp,
      Math.round(L.cw * pxPerMm),
      Math.round(L.ch * pxPerMm),
      sheet.state,
      "#ffffff",
    );
    const guides = sheetGuides.checked;
    ctx.strokeStyle = "#9aa4b8";
    ctx.lineWidth = Math.max(1, pxPerMm * 0.12);
    ctx.setLineDash([pxPerMm * 1.2, pxPerMm * 1.2]);
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < L.cols; c++) {
        const x = Math.round((L.ox + c * (L.cw + L.gap)) * pxPerMm);
        const y = Math.round((L.oy + r * (L.ch + L.gap)) * pxPerMm);
        ctx.drawImage(cell, x, y);
        if (guides)
          ctx.strokeRect(x + 0.5, y + 0.5, cell.width - 1, cell.height - 1);
      }
    }
    return L;
  }

  function refreshSheet() {
    sheetCustom.hidden = sheetPhoto.value !== "custom";
    const scale = Math.min(
      0.42,
      340 / (PAPERS[sheetPaper.value] || PAPERS.a4)[1],
    );
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const L = drawSheet(sheetPreview, ((DPI / 25.4) * scale * dpr) / 4.4);
    sheetPreview.style.width =
      Math.round((L.pw * scale * (DPI / 25.4)) / 4.4) + "px";
    const has = !!sheet.bmp;
    sheetJpgBtn.disabled = !has || !L.cols || !L.rows;
    sheetPdfBtn.disabled = sheetJpgBtn.disabled;
    sheetInfo.textContent = has
      ? `${L.cols * L.rows} photos of ${L.cw} × ${L.ch} mm on ${sheetPaper.value.toUpperCase()} · ${L.cols} × ${L.rows} grid · 300 DPI`
      : "Add a photo to preview the sheet.";
    document.dispatchEvent(new CustomEvent("govforms:layout"));
  }
  [sheetPaper, sheetPhoto, sheetGap, sheetCW, sheetCH, sheetGuides].forEach(
    (el) => el.addEventListener("input", refreshSheet),
  );

  async function setSheetFile(file) {
    if (!isImage(file)) return toast("Please choose an image file.", "err");
    clearSheet(true);
    try {
      const { bmp, url } = await loadBitmap(file);
      sheet.bmp = bmp;
      sheet.url = url;
      sheet.state = defaultState("fill");
      sheet.fromStudio = false;
      $("sheetThumb").src = url;
      $("sheetName").textContent = file.name;
      $("sheetSize").textContent = formatFileSize(file.size);
      $("sheetMeta").hidden = false;
      $("sheetDrop").classList.add("has-file");
      refreshSheet();
    } catch (err) {
      toast(err.message, "err");
    }
  }
  function clearSheet(silent) {
    if (sheet.url && !sheet.fromStudio) URL.revokeObjectURL(sheet.url);
    sheet.bmp = null;
    sheet.url = null;
    sheet.fromStudio = false;
    $("sheetMeta").hidden = true;
    $("sheetDrop").classList.remove("has-file");
    if (!silent) refreshSheet();
  }
  setupDropzone($("sheetDrop"), $("sheetFile"), (files) =>
    setSheetFile(files[0]),
  );
  $("sheetUseStudio").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!slots.photo.bmp) {
      toast("Upload a photo in the Studio first.", "warn");
      document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    clearSheet(true);
    sheet.bmp = slots.photo.bmp;
    sheet.url = slots.photo.url;
    sheet.state = { ...slots.photo.state };
    sheet.fromStudio = true;
    $("sheetThumb").src = slots.photo.url;
    $("sheetName").textContent = slots.photo.file.name + " (Studio framing)";
    $("sheetSize").textContent = formatFileSize(slots.photo.file.size);
    $("sheetMeta").hidden = false;
    $("sheetDrop").classList.add("has-file");
    refreshSheet();
    toast("Using the Studio photo with its current framing", "ok");
  });

  async function exportSheet(kind) {
    if (!sheet.bmp) return;
    const btn = kind === "pdf" ? sheetPdfBtn : sheetJpgBtn;
    btn.classList.add("loading");
    btn.disabled = true;
    try {
      const full = document.createElement("canvas");
      const L = drawSheet(full, DPI / 25.4);
      const stamp = `${sheetPaper.value}_${L.cw}x${L.ch}mm`;
      if (kind === "pdf") {
        const file = await canvasToPDF(full, `photo_sheet_${stamp}.pdf`, {
          mmW: L.pw,
          mmH: L.ph,
          quality: 0.92,
        });
        downloadFile(file);
      } else {
        const blob = await canvasToBlob(full, "image/jpeg", 0.92);
        downloadFile(
          new File([blob], `photo_sheet_${stamp}.jpg`, { type: "image/jpeg" }),
        );
      }
      toast("Photo sheet downloaded", "ok");
    } catch (err) {
      console.error(err);
      toast("Could not build the sheet: " + err.message, "err");
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  }
  sheetJpgBtn.addEventListener("click", () => exportSheet("jpg"));
  sheetPdfBtn.addEventListener("click", () => exportSheet("pdf"));

  /* ---------- quick compress ---------- */
  const comp = { file: null, bmp: null, url: null, out: null };
  const compBtn = $("compBtn");
  const compDownloadBtn = $("compDownloadBtn");
  const compStatus = $("compStatus");

  async function setCompFile(file) {
    if (!isImage(file)) return toast("Please choose an image file.", "err");
    clearComp(true);
    try {
      const { bmp, url } = await loadBitmap(file);
      comp.file = file;
      comp.bmp = bmp;
      comp.url = url;
      $("compThumb").src = url;
      $("compName").textContent = file.name;
      $("compSize").textContent = formatFileSize(file.size);
      $("compMeta").hidden = false;
      $("compDrop").classList.add("has-file");
      compBtn.disabled = false;
      setStatus(
        compStatus,
        `Ready: ${bmp.w} × ${bmp.h} px, ${formatFileSize(file.size)}.`,
      );
    } catch (err) {
      toast(err.message, "err");
    }
  }
  function clearComp(silent) {
    if (comp.url) URL.revokeObjectURL(comp.url);
    comp.file = comp.bmp = comp.url = comp.out = null;
    $("compMeta").hidden = true;
    $("compDrop").classList.remove("has-file");
    $("compResult").hidden = true;
    compBtn.disabled = true;
    compDownloadBtn.disabled = true;
    if (!silent) setStatus(compStatus, "Add an image to begin.");
  }
  setupDropzone($("compDrop"), $("compFile"), (files) => setCompFile(files[0]));

  compBtn.addEventListener("click", async () => {
    if (!comp.bmp) return;
    compBtn.classList.add("loading");
    compBtn.disabled = true;
    setStatus(compStatus, "Compressing…", "busy");
    try {
      const target = kbOf($("compKb"));
      const maxDim = parseInt($("compMaxDim").value, 10) || 0;
      let w = comp.bmp.w,
        h = comp.bmp.h;
      if (maxDim && Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement("canvas");
      renderFrame(c, comp.bmp, w, h, defaultState("fill"), "#ffffff");
      const fmt = $("compFormat").value;
      const mime =
        fmt === "png"
          ? "image/png"
          : fmt === "webp"
            ? "image/webp"
            : "image/jpeg";
      const { blob, quality, over } = await encodeUnderLimit(c, mime, target);
      const base = comp.file.name.replace(/\.[^.]+$/, "");
      comp.out = new File(
        [blob],
        `${base}_compressed.${fmt === "jpeg" ? "jpg" : fmt}`,
        { type: mime },
      );
      $("compBefore").textContent = formatFileSize(comp.file.size);
      $("compAfter").textContent = formatFileSize(blob.size);
      $("compQ").textContent =
        quality == null ? "lossless" : Math.round(quality * 100) + "%";
      $("compDims").textContent = `${w} × ${h} px`;
      $("compResult").hidden = false;
      compDownloadBtn.disabled = false;
      const pct = (
        ((comp.file.size - blob.size) / comp.file.size) *
        100
      ).toFixed(1);
      setStatus(
        compStatus,
        over
          ? `Could not get under ${Math.round(target / 1024)} KB at this size. Lower the max side or the target.`
          : `Done — ${pct}% smaller.`,
        over ? "err" : "ok",
      );
      document.dispatchEvent(new CustomEvent("govforms:layout"));
    } catch (err) {
      console.error(err);
      setStatus(compStatus, "Error: " + err.message, "err");
    } finally {
      compBtn.classList.remove("loading");
      compBtn.disabled = false;
    }
  });
  compDownloadBtn.addEventListener(
    "click",
    () => comp.out && downloadFile(comp.out),
  );

  /* ---------- theme ---------- */
  const themeToggle = $("themeToggle");
  if (themeToggle)
    themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      const next =
        root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("govforms-theme", next);
      } catch (e) {}
      document.dispatchEvent(
        new CustomEvent("govforms:theme", { detail: next }),
      );
    });

  /* ---------- init ---------- */
  buildTemplateOptions();
  buildTemplateCards();
  let remembered = "";
  try {
    remembered = localStorage.getItem("govforms-template") || "";
  } catch (e) {}
  if (remembered && TEMPLATES[remembered]) templateSel.value = remembered;
  applyTemplate(!!remembered);
  updatePreviewCards();
  renderMergeList();
  refreshSheet();

  // expose a little API for debugging / tests
  window.GovForms = {
    TEMPLATES,
    slots,
    setSlotFile,
    processAll,
    currentSpec,
    results: () => results,
  };
})();
