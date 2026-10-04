/* ============================================================
   GovForms — application logic (v6)
   Everything runs on-device with the Canvas API.
   ============================================================ */
(() => {
  "use strict";

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn, opts) => {
    if (el) el.addEventListener(evt, fn, opts);
    return el;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const icon = (name, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const SHARE_FILES = coarse && typeof navigator.share === "function" && typeof navigator.canShare === "function";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  function formatFileSize(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + " " + sizes[i];
  }
  const kb = (bytes) => Math.round(bytes / 1024);
  function timeAgo(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    const days = Math.floor(s / 86400);
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  const toastsEl = $("toasts");
  function toast(msg, type = "info", ms = 3000, action = null) {
    if (!toastsEl) return;
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    if (action) t.setAttribute("role", "button");
    const kill = () => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 220);
    };
    t.addEventListener("click", () => {
      if (action) action();
      kill();
    });
    toastsEl.appendChild(t);
    setTimeout(kill, ms);
  }
  const actionStatus = $("actionStatus");
  function setStatus(el, text, kind = "") {
    if (!el) return;
    el.className = "status" + (kind ? " " + kind : "");
    const span = el.querySelector("span");
    if (span) span.textContent = text;
    else el.textContent = text;
    if (el.id === "status" && actionStatus) actionStatus.textContent = text;
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
  function scrollToEl(target, opts = {}) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: opts.block || "start" });
    if (opts.focus !== false) {
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    }
  }
  const isImage = (f) => !!f && (f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name));
  const isPdf = (f) => !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const kbOf = (input) => {
    const v = parseFloat(input && input.value);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 1024) : 0;
  };
  const placeholderThumb = (label) =>
    "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="12" fill="#e3e6eb"/><text x="40" y="46" font-family="monospace" font-size="15" font-weight="700" text-anchor="middle" fill="#4a5160">${label}</text></svg>`);
  const fmtLabel = (f) => (f === "png" ? "PNG" : f === "pdf" ? "PDF" : "JPG");

  /* ---------- lazy libraries ---------- */
  const LIBS = {
    jspdf: { url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", ready: () => !!(window.jspdf && window.jspdf.jsPDF) },
    pdflib: { url: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", ready: () => !!window.PDFLib },
    jszip: { url: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", ready: () => !!window.JSZip },
  };
  const libPromises = {};
  function ensureLib(name, btn, label = "Loading PDF support…") {
    const lib = LIBS[name];
    if (lib.ready()) return Promise.resolve();
    let restore = null;
    if (btn && !btn.dataset.loading) {
      const prev = btn.innerHTML;
      btn.dataset.loading = "1";
      btn.textContent = label;
      restore = () => {
        btn.innerHTML = prev;
        delete btn.dataset.loading;
      };
    }
    if (!libPromises[name]) {
      libPromises[name] = new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = lib.url;
        s.crossOrigin = "anonymous";
        s.onload = () => {
          if (lib.ready()) res();
          else {
            delete libPromises[name];
            rej(new Error("Library failed to initialise."));
          }
        };
        s.onerror = () => {
          delete libPromises[name];
          rej(new Error("Could not load a required library. Check your connection and try again."));
        };
        document.head.appendChild(s);
      });
    }
    return libPromises[name].finally(() => restore && restore());
  }

  /* ---------- catalog ---------- */
  const CATALOG = window.GOVFORMS_CATALOG || {
    categories: [],
    templates: { custom: { name: "Custom", org: "Enter your own pixel sizes", category: "custom", tags: [], custom: true } },
  };
  const TEMPLATES = CATALOG.templates;
  const hasTpl = (k) => !!k && Object.prototype.hasOwnProperty.call(TEMPLATES, k);
  const CATEGORIES = CATALOG.categories;
  const catOf = (id) => CATEGORIES.find((c) => c.id === id);
  const catName = (id) => (catOf(id) || { name: id === "custom" ? "Custom" : id }).name;
  const catShort = (id) => (catOf(id) || {}).short || catName(id);

  /* ---------- DOM ---------- */
  const templateHint = $("templateHint");
  const templateBtn = $("templateBtn");
  const templateBtnLabel = $("templateBtnLabel");
  const templateBtnSub = $("templateBtnSub");
  const templateChange = $("templateChange");
  const templatePop = $("templatePop");
  const templatePopSearch = $("templatePopSearch");
  const templatePopList = $("templatePopList");
  const customBox = $("customBox");
  const customW = $("customW");
  const customH = $("customH");
  const customSW = $("customSW");
  const customSH = $("customSH");
  const slotsHost = $("slotsHost");
  const outputFrames = $("outputFrames");
  const readinessEl = $("readiness");
  const processBtn = $("processBtn");
  const processAgain = $("processAgain");
  const statusEl = $("status");
  const resultsEl = $("results");
  const zipToggle = $("zipToggle");
  const zipRow = $("zipRow");
  const idFormat = $("idFormat");
  const idMaxKb = $("idMaxKb");
  const idMaxKbField = $("idMaxKbField");
  const dockCta = $("dockCta");
  const dockCtaIcon = $("dockCtaIcon");
  const dockCtaLabel = $("dockCtaLabel");
  const actionbar = $("actionbar");

  /* ---------- state ---------- */
  const state = { templateKey: "", results: [], lastSlot: null, category: "all", search: "", processing: false, downloading: false, gen: 0 };
  const defaultView = (mode) => ({ zoom: 1, px: 0, py: 0, rot: 0, mode });
  const slots = new Map();
  const idSlot = { file: null, bmp: null, url: null };

  /* ---------- image loading & scaling ---------- */
  function halveUntil(src, w, h, targetScale) {
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

  async function loadBitmap(file, maxSide = 2600) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    try {
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error("That file could not be read as an image."));
        img.src = url;
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    let bmp = { src: img, w: img.naturalWidth, h: img.naturalHeight };
    const longest = Math.max(bmp.w, bmp.h);
    if (maxSide && longest > maxSide) {
      const scale = maxSide / longest;
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

  /* ---------- framing geometry ---------- */
  function geom(iw, ih, W, H, view) {
    const swap = view.rot % 180 !== 0;
    const rw = swap ? ih : iw;
    const rh = swap ? iw : ih;
    const base = view.mode === "fill" ? Math.max(W / rw, H / rh) : Math.min(W / rw, H / rh);
    const s = base * view.zoom;
    const dw = rw * s;
    const dh = rh * s;
    const overX = Math.max(0, dw - W);
    const overY = Math.max(0, dh - H);
    return { s, dw, dh, dx: (W - dw) / 2 + (view.px * overX) / 2, dy: (H - dh) / 2 + (view.py * overY) / 2, overX, overY };
  }
  function renderFrame(canvas, bmp, W, H, view, bg) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg || "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (!bmp) return ctx;
    const g = geom(bmp.w, bmp.h, W, H, view);
    const stepped = halveUntil(bmp.src, bmp.w, bmp.h, g.s);
    const drawScale = g.s * (bmp.w / stepped.w);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(g.dx + g.dw / 2, g.dy + g.dh / 2);
    ctx.rotate((view.rot * Math.PI) / 180);
    ctx.drawImage(stepped.src, (-stepped.w * drawScale) / 2, (-stepped.h * drawScale) / 2, stepped.w * drawScale, stepped.h * drawScale);
    ctx.restore();
    return ctx;
  }
  function cleanSignature(canvas) {
    const ctx = canvas.getContext("2d");
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H);
    const p = data.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) hist[((p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000) | 0]++;
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

  /* ---------- encoding, KB limits and padding ---------- */
  const canvasToBlob = (canvas, mime, q) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Encoding failed"))), mime, q));

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  // Pads a JPEG with COM segments (standard, ignored by decoders) until it reaches `target` bytes.
  function padJpeg(bytes, target) {
    let need = target - bytes.length;
    if (need <= 0 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
    const segs = [];
    while (need > 0) {
      const payload = Math.min(Math.max(need - 4, 0), 65533);
      const seg = new Uint8Array(4 + payload);
      seg[0] = 0xff;
      seg[1] = 0xfe;
      seg[2] = ((payload + 2) >> 8) & 0xff;
      seg[3] = (payload + 2) & 0xff;
      seg.fill(0x20, 4);
      segs.push(seg);
      need -= seg.length;
    }
    const total = bytes.length + segs.reduce((a, s) => a + s.length, 0);
    const out = new Uint8Array(total);
    // JFIF requires APP0 right after SOI, so the padding goes after any leading APPn segments
    let head = 2;
    while (head + 4 <= bytes.length && bytes[head] === 0xff && bytes[head + 1] >= 0xe0 && bytes[head + 1] <= 0xef) head += 2 + ((bytes[head + 2] << 8) | bytes[head + 3]);
    out.set(bytes.subarray(0, head), 0);
    let o = head;
    for (const s of segs) {
      out.set(s, o);
      o += s.length;
    }
    out.set(bytes.subarray(head), o);
    return out;
  }
  // Pads a PNG with a tEXt chunk before IEND.
  function padPng(bytes, target) {
    const need = target - bytes.length;
    if (need <= 0 || bytes.length < 12) return bytes;
    const key = "Comment\0";
    const data = new Uint8Array(key.length + Math.max(0, need - 12 - key.length));
    for (let i = 0; i < key.length; i++) data[i] = key.charCodeAt(i);
    data.fill(0x20, key.length);
    const chunk = new Uint8Array(12 + data.length);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    chunk.set([0x74, 0x45, 0x58, 0x74], 4);
    chunk.set(data, 8);
    dv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
    const cut = bytes.length - 12;
    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, cut), 0);
    out.set(chunk, cut);
    out.set(bytes.subarray(cut), cut + chunk.length);
    return out;
  }

  async function encodeUnderLimit(canvas, mime, maxBytes, minBytes = 0) {
    let blob, quality;
    if (mime === "image/png") {
      blob = await canvasToBlob(canvas, mime);
      quality = null;
    } else {
      const HI = 0.95;
      const first = await canvasToBlob(canvas, mime, HI);
      if (!maxBytes || first.size <= maxBytes) {
        blob = first;
        quality = HI;
      } else {
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
        if (best) {
          blob = best;
          quality = bestQ;
        } else {
          blob = await canvasToBlob(canvas, mime, 0.25);
          quality = 0.25;
        }
      }
      if (minBytes && blob.size < minBytes) {
        const top = await canvasToBlob(canvas, mime, 1);
        if (top.size > blob.size && (!maxBytes || top.size <= maxBytes)) {
          blob = top;
          quality = 1;
        }
      }
    }
    const over = !!maxBytes && blob.size > maxBytes;
    let under = !!minBytes && blob.size < minBytes;
    let padded = false;
    if (under && (!maxBytes || minBytes <= maxBytes)) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const out = mime === "image/png" ? padPng(bytes, minBytes) : padJpeg(bytes, minBytes);
      if (out.length >= minBytes && (!maxBytes || out.length <= maxBytes)) {
        blob = new Blob([out], { type: mime });
        padded = true;
        under = false;
      }
    }
    return { blob, quality, over, under, padded };
  }

  async function canvasToPDF(canvas, filename, opts = {}) {
    await ensureLib("jspdf", opts.btn);
    const jsPDF = window.jspdf.jsPDF;
    const imgData = canvas.toDataURL("image/jpeg", opts.quality || 0.95);
    const mmW = opts.mmW || (canvas.width / 96) * 25.4;
    const mmH = opts.mmH || (canvas.height / 96) * 25.4;
    const pdf = new jsPDF({ orientation: mmW > mmH ? "l" : "p", unit: "mm", format: [mmW, mmH], compress: true });
    pdf.addImage(imgData, "JPEG", 0, 0, mmW, mmH);
    return new File([pdf.output("blob")], filename, { type: "application/pdf" });
  }

  /* ---------- dropzones ---------- */
  function setupDropzone(zone, input, onFiles) {
    if (!zone || !input) return;
    on(zone.querySelector("[data-open]"), "click", () => input.click());
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
  }
  document.addEventListener("dragover", (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault();
  });

  /* ---------- template spec ---------- */
  const normFmt = (f) => (f === "jpeg" || f === "jpg" ? "jpg" : f || "jpg");
  function currentSpec() {
    const key = state.templateKey;
    if (!hasTpl(key)) return null;
    const t = TEMPLATES[key];
    if (t.custom) {
      const w = clamp(parseInt(customW.value, 10) || 200, 16, 4000);
      const h = clamp(parseInt(customH.value, 10) || 240, 16, 4000);
      const sw = clamp(parseInt(customSW.value, 10) || 240, 16, 4000);
      const sh = clamp(parseInt(customSH.value, 10) || 80, 16, 4000);
      return { key, name: "Custom", org: "", category: "custom", custom: true, photo: { w, h, format: "jpg" }, sign: { w: sw, h: sh, format: "png" }, extras: [] };
    }
    return { key, ...t, extras: t.extras || [] };
  }
  function slotDefs(spec) {
    if (!spec) return [];
    const defs = [
      { key: "photo", name: "Photo", icon: "photo", kind: "photo", required: true, spec: spec.photo, guide: true, bg: true, clean: false, defaultMode: "fill" },
      { key: "sign", name: "Signature", icon: "pen", kind: "sign", required: !spec.signOptional, spec: spec.sign, guide: false, bg: false, clean: true, defaultMode: "fit", hint: "Sign on white paper; the background is removed automatically." },
    ];
    (spec.extras || []).forEach((e) => {
      defs.push({
        key: e.key,
        name: e.name,
        icon: e.key === "thumb" ? "thumb" : e.key === "postcard" ? "photo" : "file-text",
        kind: "extra",
        required: false,
        spec: { w: e.w, h: e.h, format: e.format, minKb: e.minKb, maxKb: e.maxKb },
        guide: !!e.guide,
        bg: e.key === "postcard",
        clean: e.key !== "postcard",
        defaultMode: e.mode || "fit",
        hint: e.hint,
      });
    });
    return defs;
  }
  const kbRange = (s) => (s.maxKb ? `${s.minKb ? s.minKb + "–" : "≤ "}${s.maxKb} KB` : "");
  const describeSize = (s) => `${s.w}×${s.h} px · ${fmtLabel(normFmt(s.format))}${s.maxKb ? " · " + kbRange(s) : ""}`;
  function describeSpec(spec) {
    if (!spec) return "Photo and signature sizes fill in automatically.";
    const parts = [`Photo ${spec.photo.w}×${spec.photo.h}`, `Signature ${spec.sign.w}×${spec.sign.h}`];
    (spec.extras || []).forEach((e) => parts.push(`${e.name} ${e.w}×${e.h}`));
    let html = esc(parts.join(" · ")) + " px";
    if (spec.note) html += `<br>${esc(spec.note)}`;
    if (spec.verify) html += ` <span class="tag warn" title="Generic passport-size defaults — verify with your notification">${icon("info")}check sizes</span>`;
    return html;
  }

  /* ---------- slot blocks ---------- */
  function createSlot(def) {
    const block = document.createElement("div");
    block.className = "upload-block";
    block.dataset.slot = def.key;
    const noun = def.kind === "photo" ? "photo" : def.kind === "sign" ? "signature" : "image";
    block.innerHTML = `
      <div class="upload-head">
        <div class="upload-title">${icon(def.icon)}<span data-title>${esc(def.name)}</span></div>
        <span class="badge" data-badge>${def.required ? "Required" : "Optional"}</span>
      </div>
      <p class="hint slot-hint" data-hint ${def.hint ? "" : "hidden"}>${esc(def.hint || "")}</p>
      <div class="dropzone" data-drop>
        <input type="file" data-input accept="image/*" hidden />
        <button type="button" class="dz-inner" data-open>
          ${icon("upload")}
          <span class="dz-text">Add ${noun}</span>
          <span class="dz-sub">JPG, PNG or WEBP</span>
          <span class="dz-paste">or paste with Ctrl+V</span>
        </button>
        <div class="dz-file" data-meta hidden>
          <img class="dz-thumb" data-thumb alt="" />
          <div class="dz-meta"><span class="dz-name" data-name></span><span class="dz-size mono" data-size></span></div>
          <button type="button" class="icon-btn" data-replace aria-label="Replace ${esc(def.name.toLowerCase())}" title="Replace">${icon("upload")}</button>
          <button type="button" class="icon-btn" data-view aria-label="Preview original ${esc(def.name.toLowerCase())}" title="Preview original">${icon("eye")}</button>
          <button type="button" class="icon-btn" data-clear aria-label="Remove ${esc(def.name.toLowerCase())}" title="Remove">${icon("x")}</button>
        </div>
      </div>
      <div class="editor" data-editor hidden>
        <p class="hint editor-hint">Drag to move, ${coarse ? "pinch" : "scroll"} to zoom.${def.guide ? " Fit the face inside the guide." : ""}</p>
        <div class="editor-stage">
          <div class="editor-frame">
            <canvas class="editor-canvas" data-canvas aria-label="Framing editor for ${esc(def.name.toLowerCase())}"></canvas>
            ${def.guide ? '<div class="editor-guides"><span class="g-head"></span></div>' : ""}
          </div>
        </div>
        <div class="editor-tools">
          <div class="editor-zoom">
            <span class="label" data-zoom-label aria-hidden="true">Zoom</span>
            <input type="range" data-zoom min="1" max="3" step="0.01" value="1" aria-label="Zoom ${esc(def.name.toLowerCase())}" />
            <span class="mono" data-zoom-val>1.0×</span>
          </div>
          <div class="editor-actions">
            <div class="seg" role="group" aria-label="Framing">
              <button type="button" class="seg-btn" data-mode="fill" aria-pressed="${def.defaultMode === "fill"}">Fill</button>
              <button type="button" class="seg-btn" data-mode="fit" aria-pressed="${def.defaultMode === "fit"}">Fit</button>
            </div>
            <button type="button" class="icon-btn" data-rotate aria-label="Rotate 90°" title="Rotate 90°">${icon("rotate")}</button>
            <button type="button" class="icon-btn" data-reset aria-label="Reset framing" title="Reset framing">${icon("reset")}</button>
            <span class="spacer"></span>
            ${
              def.bg
                ? `<div class="swatches" role="radiogroup" aria-label="Background" data-swatches>
                <button type="button" class="swatch" role="radio" aria-checked="true" data-color="#ffffff" style="--c:#ffffff" aria-label="White" title="White"></button>
                <button type="button" class="swatch" role="radio" aria-checked="false" data-color="#dbeafe" style="--c:#dbeafe" aria-label="Light blue" title="Light blue"></button>
                <button type="button" class="swatch" role="radio" aria-checked="false" data-color="#f1f5f9" style="--c:#f1f5f9" aria-label="Light grey" title="Light grey"></button>
                <label class="swatch custom" title="Custom colour" role="radio" aria-checked="false" aria-label="Custom colour"><input type="color" data-bgcustom value="#ffffff" tabindex="-1" aria-hidden="true" /></label>
              </div>`
                : def.clean
                  ? `<label class="toggle"><input type="checkbox" data-clean checked /><span class="toggle-track"><span class="toggle-thumb"></span></span><span>Clean paper background</span></label>`
                  : ""
            }
          </div>
        </div>
      </div>
      <details class="slot-options" data-options>
        <summary>${icon("sliders")}<span data-summary>Save as</span>${icon("chevron", "ic chev")}</summary>
        <div class="row-2">
          <div class="field">
            <label>Format</label>
            <div class="select-wrap"><select data-format aria-label="Output format for ${esc(def.name.toLowerCase())}">
              <option value="jpg">JPG (.jpg)</option><option value="jpeg">JPEG (.jpeg)</option><option value="png">PNG</option><option value="pdf">PDF</option>
            </select></div>
          </div>
          <div class="field">
            <label>Max size (KB)</label>
            <input type="number" data-maxkb min="2" max="10240" placeholder="auto" inputmode="numeric" pattern="[0-9]*" aria-label="Max size (KB) for ${esc(def.name.toLowerCase())}" />
          </div>
        </div>
      </details>`;
    const q = (sel) => block.querySelector(sel);
    const frame = document.createElement("div");
    frame.className = "frame empty" + (def.kind === "extra" ? " wide" : "");
    frame.dataset.slot = def.key;
    frame.innerHTML = `<div class="frame-stage"><canvas data-out width="200" height="240"></canvas></div>
      <div class="frame-foot"><span data-flabel>${esc(def.name)}</span><span class="mono" data-fdims>—</span></div>
      <div class="frame-row"><span class="frame-state" data-fstate>${icon("circle")}No file yet</span></div>`;
    const slot = {
      key: def.key,
      def,
      file: null,
      bmp: null,
      url: null,
      view: defaultView(def.defaultMode),
      bg: "#ffffff",
      cssW: 0,
      cssH: 0,
      el: {
        block,
        drop: q("[data-drop]"),
        input: q("[data-input]"),
        meta: q("[data-meta]"),
        thumb: q("[data-thumb]"),
        name: q("[data-name]"),
        size: q("[data-size]"),
        badge: q("[data-badge]"),
        hint: q("[data-hint]"),
        title: q("[data-title]"),
        editor: q("[data-editor]"),
        canvas: q("[data-canvas]"),
        zoom: q("[data-zoom]"),
        zoomVal: q("[data-zoom-val]"),
        segs: Array.from(block.querySelectorAll(".seg-btn")),
        fmt: q("[data-format]"),
        maxKb: q("[data-maxkb]"),
        clean: q("[data-clean]"),
        swatches: q("[data-swatches]"),
        bgCustom: q("[data-bgcustom]"),
        summary: q("[data-summary]"),
        frame,
        out: frame.querySelector("[data-out]"),
        fdims: frame.querySelector("[data-fdims]"),
        flabel: frame.querySelector("[data-flabel]"),
        fstate: frame.querySelector("[data-fstate]"),
      },
    };
    if (def.clean) slot.el.out.getContext("2d", { willReadFrequently: true });
    wireSlot(slot);
    return slot;
  }

  function wireSlot(slot) {
    const { el } = slot;
    setupDropzone(el.drop, el.input, (files) => setSlotFile(slot, files[0]));
    on(el.drop, "pointerenter", () => (state.lastSlot = slot.key));
    on(el.drop, "pointerleave", () => {
      if (state.lastSlot === slot.key) state.lastSlot = null;
    });
    on(el.drop, "focusin", () => (state.lastSlot = slot.key));
    on(el.drop, "focusout", (e) => {
      if (!el.drop.contains(e.relatedTarget) && state.lastSlot === slot.key) state.lastSlot = null;
    });
    on(el.block.querySelector("[data-view]"), "click", () => openViewer(slot.file, `${slot.def.name} (original)`));
    on(el.block.querySelector("[data-clear]"), "click", () => clearSlot(slot));
    on(el.block.querySelector("[data-replace]"), "click", () => el.input.click());
    const edited = () => {
      drawEditor(slot);
      renderLive();
      invalidateResults();
    };
    // pointer: drag to pan, two pointers to pinch-zoom, double-tap to reset
    const pointers = new Map();
    let pinch = null,
      lastTap = 0;
    el.canvas.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: slot.view.zoom };
      }
      if (e.pointerType === "touch" && pointers.size === 1) {
        const now = performance.now();
        if (now - lastTap < 300) {
          slot.view = defaultView(slot.view.mode);
          edited();
        }
        lastTap = now;
      }
    });
    el.canvas.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId) || !slot.bmp) return;
      const prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = geom(slot.bmp.w, slot.bmp.h, slot.cssW, slot.cssH, slot.view);
      if (pointers.size === 2 && pinch) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        slot.view.zoom = clamp((pinch.zoom * dist) / Math.max(1, pinch.dist), 1, 3);
        edited();
        return;
      }
      const dx = e.clientX - prev.x,
        dy = e.clientY - prev.y;
      if (g.overX > 0) slot.view.px = clamp(slot.view.px + (dx * 2) / g.overX, -1, 1);
      if (g.overY > 0) slot.view.py = clamp(slot.view.py + (dy * 2) / g.overY, -1, 1);
      edited();
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    el.canvas.addEventListener("pointerup", release);
    el.canvas.addEventListener("pointercancel", release);
    el.canvas.addEventListener(
      "wheel",
      (e) => {
        if (!slot.bmp) return;
        e.preventDefault();
        slot.view.zoom = clamp(slot.view.zoom - Math.sign(e.deltaY) * 0.08, 1, 3);
        edited();
      },
      { passive: false },
    );
    on(el.zoom, "input", () => {
      slot.view.zoom = parseFloat(el.zoom.value);
      edited();
    });
    on(el.block.querySelector("[data-rotate]"), "click", () => {
      slot.view.rot = (slot.view.rot + 90) % 360;
      edited();
    });
    on(el.block.querySelector("[data-reset]"), "click", () => {
      slot.view = defaultView(slot.view.mode);
      edited();
    });
    el.segs.forEach((btn) =>
      btn.addEventListener("click", () => {
        slot.view.mode = btn.dataset.mode;
        slot.view.px = slot.view.py = 0;
        el.segs.forEach((b) => b.setAttribute("aria-pressed", b === btn));
        edited();
      }),
    );
    if (el.swatches) {
      const setSwatch = (active) => el.swatches.querySelectorAll(".swatch").forEach((b) => b.setAttribute("aria-checked", b === active));
      el.swatches.querySelectorAll(".swatch[data-color]").forEach((sw) =>
        sw.addEventListener("click", () => {
          slot.bg = sw.dataset.color;
          setSwatch(sw);
          edited();
        }),
      );
      const customSwatch = el.bgCustom.parentElement;
      customSwatch.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          el.bgCustom.click();
        }
      });
      customSwatch.tabIndex = 0;
      on(el.bgCustom, "input", () => {
        slot.bg = el.bgCustom.value;
        setSwatch(customSwatch);
        edited();
      });
    }
    on(el.clean, "change", () => {
      renderLive();
      invalidateResults();
    });
    [el.fmt, el.maxKb].forEach((c) =>
      on(c, "change", () => {
        updateSlotSummary(slot);
        invalidateResults();
      }),
    );
  }

  function updateSlotSummary(slot) {
    const fmt = slot.el.fmt.value;
    const max = parseFloat(slot.el.maxKb.value);
    const dims = slotSpecDims(slot);
    let limit = "no size limit";
    if (max > 0) limit = `up to ${max} KB`;
    else if (dims.maxKb) limit = kbRange(dims);
    slot.el.summary.textContent = `Save as ${fmtLabel(fmt)} · ${limit}`;
  }
  function applySlotSpec(slot, def, resetOutputs) {
    slot.def = def;
    slot.el.title.textContent = def.name;
    slot.el.flabel.textContent = def.name;
    slot.el.badge.textContent = def.required ? "Required" : "Optional";
    slot.el.hint.textContent = def.hint || "";
    slot.el.hint.hidden = !def.hint;
    if (resetOutputs) {
      slot.el.fmt.value = normFmt(def.spec.format);
      slot.el.maxKb.value = def.spec.maxKb || "";
      slot.el.maxKb.placeholder = def.spec.maxKb ? (def.spec.minKb ? `${def.spec.minKb}–${def.spec.maxKb}` : String(def.spec.maxKb)) : "auto";
      if (!slot.file) {
        slot.view = defaultView(def.defaultMode);
        slot.el.segs.forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === def.defaultMode));
      }
    }
    updateSlotSummary(slot);
  }
  function syncSlots(resetOutputs) {
    const spec = currentSpec();
    let defs = slotDefs(spec);
    if (!defs.length) defs = slotDefs({ photo: { w: 200, h: 240, format: "jpg" }, sign: { w: 240, h: 80, format: "png" }, extras: [] });
    const keep = new Set(defs.map((d) => d.key));
    for (const [key, slot] of Array.from(slots)) {
      if (!keep.has(key)) {
        if (slot.url) URL.revokeObjectURL(slot.url);
        slot.el.block.remove();
        slot.el.frame.remove();
        slots.delete(key);
      }
    }
    defs.forEach((def) => {
      let slot = slots.get(def.key);
      if (!slot) {
        slot = createSlot(def);
        slots.set(def.key, slot);
        applySlotSpec(slot, def, true);
      } else applySlotSpec(slot, def, resetOutputs);
      slotsHost.appendChild(slot.el.block);
      outputFrames.appendChild(slot.el.frame);
    });
    slots.forEach((slot) => drawEditor(slot));
    renderLive();
  }
  function slotSpecDims(slot) {
    const spec = currentSpec();
    if (spec) {
      if (slot.key === "photo") return spec.photo;
      if (slot.key === "sign") return spec.sign;
      const e = (spec.extras || []).find((x) => x.key === slot.key);
      if (e) return e;
    }
    return slot.def.spec;
  }

  function drawEditor(slot) {
    const { el } = slot;
    if (!slot.bmp) {
      el.editor.hidden = true;
      return;
    }
    el.editor.hidden = false;
    const spec = slotSpecDims(slot);
    const stage = el.canvas.closest(".editor-stage");
    const maxW = Math.max(120, Math.min((stage.clientWidth || 360) - 24, window.innerWidth - 64, 420));
    const maxH = Math.min(320, Math.round(window.innerHeight * 0.34));
    const aspect = spec.w / spec.h;
    let cw = maxW,
      ch = cw / aspect;
    if (ch > maxH) {
      ch = maxH;
      cw = ch * aspect;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.canvas.style.width = cw + "px";
    el.canvas.style.height = ch + "px";
    renderFrame(el.canvas, slot.bmp, Math.round(cw * dpr), Math.round(ch * dpr), slot.view, slot.bg);
    slot.cssW = cw;
    slot.cssH = ch;
    el.zoom.value = slot.view.zoom;
    el.zoomVal.textContent = slot.view.zoom.toFixed(1) + "×";
  }

  // live output: quick downscaled previews while editing, a cleaned pass shortly after
  let liveTimer = null,
    liveFinal = null;
  const PREVIEW_MAX = 320;
  function previewDims(W, H) {
    const s = Math.min(1, PREVIEW_MAX / Math.max(W, H));
    return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) };
  }
  function paintPlaceholder(canvas, W, H, text) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#7c8494";
    const size = Math.max(11, Math.min(W, H) / 8);
    ctx.font = `500 ${size}px Satoshi, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = W - 16;
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/)) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    const lh = size * 1.3;
    if (lines.length * lh > H - 8) return;
    const y0 = H / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
  }
  function renderLive(withClean = false) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const spec = currentSpec();
      slots.forEach((slot) => {
        const dims = slotSpecDims(slot);
        slot.el.fdims.textContent = spec ? `${dims.w} × ${dims.h} px` : "—";
        slot.el.frame.classList.toggle("empty", !slot.bmp);
        const pv = previewDims(dims.w, dims.h);
        if (!slot.bmp) {
          paintPlaceholder(slot.el.out, pv.w, pv.h, slot.def.name);
          return;
        }
        renderFrame(slot.el.out, slot.bmp, pv.w, pv.h, slot.view, slot.bg);
        if (withClean && slot.el.clean && slot.el.clean.checked) cleanSignature(slot.el.out);
      });
      updateReadiness();
      if (!withClean) {
        clearTimeout(liveFinal);
        liveFinal = setTimeout(() => renderLive(true), 260);
      }
    }, 40);
  }

  function setFrameState(slot) {
    const st = slot.el.fstate;
    const r = state.results.find((x) => x.key === slot.key);
    if (r) {
      const size = kb(r.file.size);
      if (r.over) {
        st.className = "frame-state bad";
        st.innerHTML = `${icon("alert")}<span data-kb>${size}</span> KB · over ${kb(r.max)} KB`;
      } else if (r.under) {
        st.className = "frame-state warn";
        st.innerHTML = `${icon("alert")}<span data-kb>${size}</span> KB · under ${kb(r.min)} KB`;
      } else {
        st.className = "frame-state ok";
        st.innerHTML = `${icon("circle-check")}<span data-kb>${size}</span> KB`;
      }
      return;
    }
    if (slot.bmp) {
      st.className = "frame-state ready";
      st.innerHTML = `${icon("check")}Added`;
    } else {
      st.className = "frame-state";
      st.innerHTML = `${icon("circle")}No file yet`;
    }
  }

  async function setSlotFile(slot, file) {
    if (!file) return;
    if (!isImage(file)) {
      toast("Please choose an image file (JPG, PNG or WEBP).", "err");
      return;
    }
    clearSlot(slot, true);
    invalidateResults();
    setFrameState(slot);
    updateDock();
    slot.file = file;
    slot.el.name.textContent = file.name;
    slot.el.size.textContent = formatFileSize(file.size);
    slot.el.meta.hidden = false;
    slot.el.drop.classList.add("has-file");
    try {
      const { bmp, url } = await loadBitmap(file);
      if (slot.file !== file) {
        URL.revokeObjectURL(url);
        return;
      }
      slot.bmp = bmp;
      slot.url = url;
      slot.el.thumb.src = url;
    } catch (err) {
      if (slot.file !== file) return;
      toast(err.message, "err");
      clearSlot(slot);
      return;
    }
    slot.view = defaultView(slot.view.mode);
    invalidateResults();
    drawEditor(slot);
    renderLive();
  }
  function clearSlot(slot, silent = false) {
    if (slot.key === "photo" && sheet.fromStudio) clearSheet();
    if (slot.url) URL.revokeObjectURL(slot.url);
    slot.file = null;
    slot.bmp = null;
    slot.url = null;
    slot.el.meta.hidden = true;
    slot.el.drop.classList.remove("has-file");
    slot.el.thumb.removeAttribute("src");
    slot.el.editor.hidden = true;
    if (!silent) {
      invalidateResults();
      renderLive();
    }
  }

  /* ---------- ID document ---------- */
  const idEls = { drop: $("idDrop"), input: $("idFile"), meta: $("idMeta"), thumb: $("idThumb"), name: $("idName"), size: $("idSize"), toggle: $("idToggle"), panel: $("idPanel") };
  on(idEls.toggle, "click", () => {
    const open = idEls.panel.hidden;
    idEls.panel.hidden = !open;
    idEls.toggle.setAttribute("aria-expanded", open);
  });
  function updateIdControls() {
    const pdf = !!idSlot.file && !idSlot.bmp;
    if (idMaxKbField) idMaxKbField.hidden = pdf;
    if (idFormat) {
      const opt = idFormat.querySelector('option[value="pdf"]');
      if (opt) opt.disabled = pdf;
      if (pdf) idFormat.value = "original";
    }
  }
  async function setIdFile(file) {
    if (!file) return;
    if (!isImage(file) && !isPdf(file)) return toast("The ID document must be an image or a PDF.", "err");
    if (file.size > 50 * 1024 * 1024) return toast("That file is over 50 MB. Choose a smaller one.", "err");
    clearId(true);
    invalidateResults();
    updateReadiness();
    idSlot.file = file;
    idEls.name.textContent = file.name;
    idEls.size.textContent = formatFileSize(file.size);
    idEls.meta.hidden = false;
    idEls.drop.classList.add("has-file");
    if (isImage(file)) {
      try {
        const { bmp, url } = await loadBitmap(file, 0);
        if (idSlot.file !== file) {
          URL.revokeObjectURL(url);
          return;
        }
        idSlot.bmp = bmp;
        idSlot.url = url;
        idEls.thumb.src = url;
      } catch (err) {
        if (idSlot.file !== file) return;
        toast(err.message, "err");
        clearId();
        return;
      }
    } else idEls.thumb.src = placeholderThumb(isPdf(file) ? "PDF" : "FILE");
    if (idEls.panel.hidden) {
      idEls.panel.hidden = false;
      idEls.toggle.setAttribute("aria-expanded", "true");
    }
    updateIdControls();
    invalidateResults();
    updateReadiness();
  }
  function clearId(silent) {
    if (idSlot.url) URL.revokeObjectURL(idSlot.url);
    idSlot.file = idSlot.bmp = idSlot.url = null;
    idEls.meta.hidden = true;
    idEls.drop.classList.remove("has-file");
    idEls.thumb.removeAttribute("src");
    updateIdControls();
    if (!silent) {
      invalidateResults();
      updateReadiness();
    }
  }
  setupDropzone(idEls.drop, idEls.input, (files) => setIdFile(files[0]));
  on(idEls.drop, "pointerenter", () => (state.lastSlot = "id"));
  on(idEls.drop, "pointerleave", () => {
    if (state.lastSlot === "id") state.lastSlot = null;
  });
  on(document.querySelector('[data-view="id"]'), "click", () => openViewer(idSlot.file, "ID document"));
  on(document.querySelector('[data-clear="id"]'), "click", () => clearId());
  ["sheetDrop", "compDrop", "mergeDrop"].forEach((id) => {
    on($(id), "pointerenter", () => (state.lastSlot = "tool"));
    on($(id), "pointerleave", () => {
      if (state.lastSlot === "tool") state.lastSlot = null;
    });
  });

  // clipboard paste → the hovered slot, else photo then signature
  document.addEventListener("paste", (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const item = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    const named = new File([file], `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`, { type: file.type });
    if (state.lastSlot === "tool") return;
    if (state.lastSlot === "id") {
      setIdFile(named);
      toast("Pasted into ID document", "ok");
      return;
    }
    let target = state.lastSlot && slots.get(state.lastSlot);
    if (!target) target = !slots.get("photo").file ? slots.get("photo") : slots.get("sign");
    setSlotFile(target, named);
    toast(`Pasted into ${target.def.name}`, "ok");
    scrollToEl(target.el.block, { focus: false });
  });

  /* ---------- readiness, action bar ---------- */
  function requiredMissing() {
    const missing = [];
    slots.forEach((slot) => {
      if (slot.def.required && !slot.bmp) missing.push(slot);
    });
    return missing;
  }
  function updateReadiness() {
    const spec = currentSpec();
    if (readinessEl) {
      readinessEl.className = "readiness" + (spec ? " ok" : "");
      readinessEl.innerHTML = spec ? `${icon("circle-check")}${esc(spec.name)}` : `${icon("circle")}No exam chosen`;
    }
    slots.forEach(setFrameState);
    updateDock();
  }
  function dockState() {
    if (state.results.length) return "download";
    if (!currentSpec()) return "exam";
    if (requiredMissing().length) return "photo";
    return "process";
  }
  function updateDock() {
    if (!dockCta) return;
    const s = dockState();
    const missing = requiredMissing()[0];
    const map = {
      exam: ["crop", "Choose exam"],
      photo: ["upload", "Add " + (missing ? missing.def.name.toLowerCase() : "photo")],
      process: ["check", "Process"],
      download: [SHARE_FILES ? "share" : "download", SHARE_FILES ? "Share files" : "Download all"],
    };
    dockCtaIcon.querySelector("use").setAttribute("href", "#i-" + map[s][0]);
    dockCtaLabel.textContent = map[s][1];
  }
  on(dockCta, "click", () => {
    const s = dockState();
    if (s === "download") downloadAll();
    else if (s === "process") processAll();
    else if (s === "photo") {
      const missing = requiredMissing()[0];
      if (missing) {
        scrollToEl(missing.el.block, { focus: false });
        missing.el.input.click();
      }
    } else {
      scrollToEl("#templateField", { focus: false });
      setTimeout(openPicker, 300);
    }
  });
  // action bar shows while the Studio is on screen and no text field has focus
  const studioSection = $("studio");
  let studioVisible = false,
    ctaVisible = false;
  const syncActionbar = () => {
    if (actionbar) actionbar.hidden = !studioVisible || ctaVisible;
  };
  if (actionbar && studioSection && "IntersectionObserver" in window) {
    new IntersectionObserver(
      ([en]) => {
        studioVisible = en.isIntersecting;
        syncActionbar();
      },
      { threshold: 0 },
    ).observe(studioSection);
    if (processBtn)
      new IntersectionObserver(
        ([en]) => {
          ctaVisible = en.isIntersecting;
          syncActionbar();
        },
        { threshold: 0.6 },
      ).observe(processBtn);
  }
  const typingNow = () => {
    const a = document.activeElement;
    return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && !/^(range|checkbox|file|color|radio)$/.test(a.type);
  };
  document.addEventListener("focusin", () => {
    if (actionbar && typingNow()) actionbar.classList.add("hide");
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (actionbar && !typingNow()) actionbar.classList.remove("hide");
    }, 120);
  });
  // dock active item
  const dockItems = Array.from(document.querySelectorAll(".dock-item[data-dock]"));
  const DOCK_OWNER = { studio: "studio", rules: "studio", templates: "templates", tools: "tools", news: "news", faq: "news" };
  if (dockItems.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const owner = DOCK_OWNER[en.target.id] || "";
          dockItems.forEach((a) => {
            const active = a.dataset.dock === owner;
            a.classList.toggle("active", active);
            if (active) a.setAttribute("aria-current", "page");
            else a.removeAttribute("aria-current");
          });
        }),
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );
    document.querySelectorAll("main > section[id]").forEach((sec) => io.observe(sec));
  }

  /* ---------- template selection ---------- */
  function selectTemplate(key, opts = {}) {
    if (!hasTpl(key)) key = "";
    const changed = key !== state.templateKey;
    state.templateKey = key;
    const spec = currentSpec();
    const t = key ? TEMPLATES[key] : null;
    templateBtnLabel.textContent = t ? t.name : "Choose your exam";
    templateBtnSub.textContent = t ? (t.custom ? "Enter your own pixel sizes" : `${catName(t.category)} · ${t.org}`) : "SSC, Railways, Banking, UPSC, NEET, passport…";
    if (templateChange) templateChange.hidden = !t;
    templateHint.innerHTML = describeSpec(spec);
    customBox.hidden = !(t && t.custom);
    document.querySelectorAll(".template-card").forEach((c) => c.classList.toggle("selected", c.dataset.key === key));
    updateAnatomy(spec);
    syncSlots(changed && !!t);
    if (changed) invalidateResults();
    if (key) {
      try {
        localStorage.setItem("govforms-template", key);
      } catch (e) {}
      const lu = $("lastUsed");
      if (lu) lu.hidden = true;
    }
    renderPickerList(templatePopSearch.value);
    if (opts.scroll) scrollToEl("#studio", { focus: false });
  }
  function updateAnatomy(spec) {
    const p = spec ? spec.photo : { w: 200, h: 240, maxKb: 50, format: "jpg" };
    const s = spec ? spec.sign : { w: 240, h: 80 };
    const set = (k, v) => document.querySelectorAll(`[data-an="${k}"]`).forEach((el) => (el.textContent = v));
    set("prefix", spec ? "" : "Example (SSC): ");
    set("width", String(p.w));
    set("height", String(p.h));
    set("sig", `${s.w} × ${s.h} px`);
    set("kb", p.maxKb ? `≤ ${p.maxKb} KB as ${fmtLabel(normFmt(p.format))}` : `${fmtLabel(normFmt(p.format))}, no fixed limit`);
  }
  [customW, customH, customSW, customSH].forEach((el) =>
    on(el, "input", () => {
      templateHint.innerHTML = describeSpec(currentSpec());
      updateAnatomy(currentSpec());
      syncSlots(false);
      invalidateResults();
    }),
  );

  /* ---------- picker (searchable combobox) ---------- */
  let pickerOpen = false,
    pickerFocus = -1;
  const pickerItems = () => Array.from(templatePopList.querySelectorAll(".picker-item"));
  function matches(t, f) {
    if (!f) return true;
    const hay = [t.name, t.org, catName(t.category), catShort(t.category), ...(t.tags || [])].join(" ").toLowerCase();
    return f.split(/\s+/).every((w) => hay.includes(w));
  }
  function renderPickerList(filter = "") {
    const f = filter.trim().toLowerCase();
    const groups = [...CATEGORIES.map((c) => c.id), "custom"];
    let html = "";
    let any = false;
    groups.forEach((cat) => {
      const entries = Object.entries(TEMPLATES).filter(([, t]) => (t.category || "custom") === cat && matches(t, f));
      if (!entries.length) return;
      any = true;
      html += `<div class="picker-group" role="group" aria-label="${esc(catName(cat))}"><div class="picker-group-name" aria-hidden="true">${esc(catName(cat))}</div>`;
      entries.forEach(([key, t]) => {
        const dims = t.custom ? "any size" : `${t.photo.w}×${t.photo.h} · ${t.sign.w}×${t.sign.h}`;
        const sel = key === state.templateKey;
        html += `<button type="button" tabindex="-1" class="picker-item ${sel ? "selected" : ""}" role="option" id="opt-${key}" data-key="${key}" aria-selected="${sel}"><span>${esc(t.name)}</span><small>${dims}</small></button>`;
      });
      html += "</div>";
    });
    templatePopList.innerHTML = any ? html : '<div class="picker-empty">No matches. Try a shorter word.</div>';
    pickerFocus = -1;
    templatePopSearch.removeAttribute("aria-activedescendant");
  }
  function openPicker() {
    if (pickerOpen) return;
    pickerOpen = true;
    templatePop.hidden = false;
    templateBtn.setAttribute("aria-expanded", "true");
    renderPickerList(templatePopSearch.value);
    if (!coarse) setTimeout(() => templatePopSearch.focus(), 30);
  }
  function closePicker() {
    if (!pickerOpen) return;
    pickerOpen = false;
    templatePop.hidden = true;
    templateBtn.setAttribute("aria-expanded", "false");
  }
  on(templateBtn, "click", () => (pickerOpen ? closePicker() : openPicker()));
  on(templatePopSearch, "input", () => renderPickerList(templatePopSearch.value));
  on(templatePopList, "click", (e) => {
    const item = e.target.closest(".picker-item");
    if (!item) return;
    selectTemplate(item.dataset.key);
    closePicker();
    templateBtn.focus();
  });
  on(templatePop, "keydown", (e) => {
    const items = pickerItems();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      if (document.activeElement !== templatePopSearch) templatePopSearch.focus();
      pickerFocus = (pickerFocus + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle("focus", i === pickerFocus));
      items[pickerFocus].scrollIntoView({ block: "nearest" });
      templatePopSearch.setAttribute("aria-activedescendant", items[pickerFocus].id);
    } else if (e.key === "Enter") {
      const focused = e.target.closest && e.target.closest(".picker-item");
      const target = pickerFocus >= 0 ? items[pickerFocus] : focused || items[0];
      if (!target) return;
      e.preventDefault();
      selectTemplate(target.dataset.key);
      closePicker();
      templateBtn.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      templateBtn.focus();
    }
  });
  on(templatePop, "focusout", (e) => {
    if (!templatePop.contains(e.relatedTarget) && e.relatedTarget !== templateBtn && e.relatedTarget) closePicker();
  });
  document.addEventListener("click", (e) => {
    if (pickerOpen && !e.target.closest(".picker") && !e.target.closest("#processBtn, #dockCta")) closePicker();
  });

  /* ---------- exam gallery ---------- */
  const EXTRA_SHORT = { thumb: "thumb impression", declaration: "declaration", postcard: "postcard photo" };
  function buildGallery() {
    const grid = $("templateGrid");
    if (!grid) return;
    Object.entries(TEMPLATES).forEach(([key, t]) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "template-card";
      card.dataset.key = key;
      card.dataset.cat = t.category || "custom";
      card.dataset.search = [t.name, t.org, catName(t.category), catShort(t.category), ...(t.tags || [])].join(" ").toLowerCase();
      const tags = [];
      if (!t.custom) {
        tags.push(`<span class="tag">${fmtLabel(normFmt(t.photo.format))}</span>`);
        if (t.extras && t.extras.length) tags.push(`<span class="tag">+ ${t.extras.map((e) => EXTRA_SHORT[e.key] || e.name.toLowerCase()).join(", ")}</span>`);
        if (t.verify) tags.push(`<span class="tag warn">${icon("info")}check sizes</span>`);
      } else tags.push(`<span class="tag">any size</span>`);
      const dims = t.custom ? "W × H" : `${t.photo.w}×${t.photo.h} · ${t.sign.w}×${t.sign.h}`;
      const limit = t.custom ? "" : kbRange(t.photo);
      card.innerHTML = `<span class="tc-name">${esc(t.name)}</span><span class="tc-org">${esc(t.org)}</span>
        <span class="tc-dims mono">${dims}${limit ? `<small>${limit}</small>` : ""}</span>
        <span class="tc-tags">${tags.join("")}</span>`;
      card.addEventListener("click", () => selectTemplate(key, { scroll: true }));
      grid.appendChild(card);
    });
    buildChips();
    filterGallery();
  }
  function buildChips() {
    const host = $("catChips");
    if (!host) return;
    const counts = {};
    Object.values(TEMPLATES).forEach((t) => {
      if (t.custom) return;
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    const total = Object.values(TEMPLATES).filter((t) => !t.custom).length;
    const chips = [{ id: "all", name: "All", n: total }, ...CATEGORIES.map((c) => ({ id: c.id, name: c.short || c.name, n: counts[c.id] || 0 }))];
    host.innerHTML = chips.map((c) => `<button type="button" class="chip-btn" data-cat="${c.id}" aria-pressed="${c.id === state.category}">${esc(c.name)} <span class="n">${c.n}</span></button>`).join("");
    host.addEventListener("click", (e) => {
      const b = e.target.closest(".chip-btn");
      if (b) setCategory(b.dataset.cat);
    });
  }
  function setCategory(cat) {
    state.category = cat;
    document.querySelectorAll("#catChips .chip-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === cat));
    filterGallery();
  }
  function filterGallery() {
    const f = state.search.trim().toLowerCase();
    const words = f.split(/\s+/).filter(Boolean);
    let shown = 0;
    let total = 0;
    document.querySelectorAll(".template-card").forEach((card) => {
      const isCustom = card.dataset.cat === "custom";
      const catOk = state.category === "all" || card.dataset.cat === state.category || (isCustom && !f);
      const searchOk = words.every((w) => card.dataset.search.includes(w));
      const show = catOk && searchOk;
      card.classList.toggle("hidden-by-filter", !show);
      if (!isCustom) {
        total++;
        if (show) shown++;
      }
    });
    const count = $("templateCount");
    if (count) count.textContent = shown === total ? `${total} exams and documents` : `${shown} of ${total}`;
    const empty = $("templateEmpty");
    if (empty) empty.hidden = shown > 0;
  }
  const templateSearch = $("templateSearch");
  on(
    templateSearch,
    "input",
    debounce(() => {
      state.search = templateSearch.value;
      filterGallery();
    }, 80),
  );
  on($("useCustomBtn"), "click", () => selectTemplate("custom", { scroll: true }));

  /* ---------- processing ---------- */
  function setProcessMode(hasResults) {
    if (!processBtn) return;
    processBtn.innerHTML = hasResults ? (SHARE_FILES ? `${icon("share")}Share files` : `${icon("download")}Download all`) : "Process";
    processBtn.title = hasResults ? "" : "Ctrl + Enter";
    if (processAgain) processAgain.hidden = !hasResults;
    if (zipRow) zipRow.hidden = coarse || !hasResults || state.results.length < 2;
  }
  function invalidateResults() {
    state.gen++;
    if (!state.results.length) return;
    state.results = [];
    resultsEl.innerHTML = "";
    setProcessMode(false);
    setStatus(statusEl, "Inputs changed — process again to refresh the files.");
    slots.forEach((slot) => {
      slot.el.frame.classList.remove("flash-ok", "flash-bad");
      setFrameState(slot);
    });
    updateDock();
  }
  const extFor = (fmt) => (fmt === "jpeg" ? "jpeg" : fmt === "jpg" ? "jpg" : fmt);
  const baseName = (slot) => (slot.key === "photo" ? "photo" : slot.key === "sign" ? "signature" : slot.key);

  async function encodeSlot(slot) {
    const dims = slotSpecDims(slot);
    const fmt = slot.el.fmt.value;
    const maxBytes = kbOf(slot.el.maxKb) || (dims.maxKb || 0) * 1024;
    const minBytes = (dims.minKb || 0) * 1024;
    const canvas = document.createElement("canvas");
    if (slot.def.clean) canvas.getContext("2d", { willReadFrequently: true });
    renderFrame(canvas, slot.bmp, dims.w, dims.h, slot.view, slot.bg);
    if (slot.el.clean && slot.el.clean.checked) cleanSignature(canvas);
    const base = `${baseName(slot)}_${dims.w}x${dims.h}`;
    const common = { key: slot.key, label: slot.def.name, before: slot.file.size, min: minBytes, max: maxBytes };
    if (fmt === "pdf") {
      let quality;
      if (maxBytes) ({ quality } = await encodeUnderLimit(canvas, "image/jpeg", Math.max(1024, maxBytes - 2048)));
      const file = await canvasToPDF(canvas, `${base}.pdf`, { btn: processBtn, quality });
      return { ...common, file, over: !!maxBytes && file.size > maxBytes, under: !!minBytes && file.size < minBytes, padded: false };
    }
    const mime = fmt === "png" ? "image/png" : "image/jpeg";
    const { blob, over, under, padded } = await encodeUnderLimit(canvas, mime, maxBytes, minBytes);
    return { ...common, file: new File([blob], `${base}.${extFor(fmt)}`, { type: mime }), over, under, padded };
  }
  async function processId() {
    if (!idSlot.file) return null;
    const wantPdf = idFormat.value === "pdf";
    const maxBytes = kbOf(idMaxKb);
    const common = { key: "id", label: "ID document", before: idSlot.file.size, min: 0, max: maxBytes, under: false, padded: false };
    if (idSlot.bmp) {
      const c = document.createElement("canvas");
      // re-encoded IDs are capped at 4096 px on the long side: enough for any portal, safe on phones
      const idScale = Math.min(1, 4096 / Math.max(idSlot.bmp.w, idSlot.bmp.h));
      const iw = Math.round(idSlot.bmp.w * idScale),
        ih = Math.round(idSlot.bmp.h * idScale);
      if (wantPdf) {
        renderFrame(c, idSlot.bmp, iw, ih, defaultView("fill"), "#ffffff");
        let quality;
        if (maxBytes) ({ quality } = await encodeUnderLimit(c, "image/jpeg", Math.max(1024, maxBytes - 2048)));
        const file = await canvasToPDF(c, "id_document.pdf", { btn: processBtn, quality });
        return { ...common, file, over: !!maxBytes && file.size > maxBytes };
      }
      if (maxBytes && idSlot.file.size > maxBytes) {
        renderFrame(c, idSlot.bmp, iw, ih, defaultView("fill"), "#ffffff");
        const { blob, over } = await encodeUnderLimit(c, "image/jpeg", maxBytes);
        return { ...common, file: new File([blob], "id_document.jpg", { type: "image/jpeg" }), over };
      }
    }
    const name = /\.[a-z0-9]+$/i.test(idSlot.file.name) ? idSlot.file.name : idSlot.file.name + ".bin";
    return { ...common, file: new File([idSlot.file], "id_" + name, { type: idSlot.file.type }), over: false };
  }
  function renderResults() {
    resultsEl.innerHTML = "";
    state.results.forEach((r, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = reducedMotion ? "0s" : i * 60 + "ms";
      const flag = r.over ? `<span class="r-flag bad">${icon("alert")}over ${kb(r.max)} KB</span>` : r.under ? `<span class="r-flag warn">${icon("alert")}under ${kb(r.min)} KB</span>` : "";
      li.innerHTML = `${icon(r.file.type === "application/pdf" ? "file-text" : "photo")}<span class="r-body"><span class="r-name" title="${esc(r.file.name)}">${esc(r.file.name)}</span><span class="r-sub"><span class="r-size mono">${formatFileSize(r.before)} → ${formatFileSize(r.file.size)}</span>${flag}</span></span>`;
      const mk = (name, title, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "icon-btn";
        b.title = title;
        b.setAttribute("aria-label", `${title} ${r.file.name}`);
        b.innerHTML = icon(name);
        b.addEventListener("click", fn);
        return b;
      };
      li.appendChild(mk("eye", "Preview", () => openViewer(r.file, r.file.name)));
      li.appendChild(mk("download", "Download", () => downloadFile(r.file)));
      resultsEl.appendChild(li);
    });
  }
  function countUp(el, target) {
    if (!el) return;
    if (reducedMotion) {
      el.textContent = target;
      return;
    }
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 400);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  async function processAll() {
    if (state.processing) return;
    const spec = currentSpec();
    if (!spec) {
      setStatus(statusEl, "Choose an exam first.", "err");
      scrollToEl("#templateField", { focus: false });
      setTimeout(openPicker, 0);
      return;
    }
    const loading = Array.from(slots.values()).some((s) => s.file && !s.bmp) || (idSlot.file && isImage(idSlot.file) && !idSlot.bmp);
    if (loading) {
      setStatus(statusEl, "Still reading your file — try again in a moment.", "busy");
      return;
    }
    const missing = requiredMissing();
    if (missing.length) {
      setStatus(statusEl, `Add the ${missing.map((s) => s.def.name.toLowerCase()).join(" and ")} first.`, "err");
      scrollToEl(missing[0].el.block, { focus: false });
      return;
    }
    state.processing = true;
    const gen = state.gen;
    processBtn.disabled = true;
    if (dockCta) dockCta.disabled = true;
    setStatus(statusEl, "Processing…", "busy");
    try {
      const out = [];
      for (const slot of slots.values()) if (slot.bmp) out.push(await encodeSlot(slot));
      const id = await processId();
      if (id) out.push(id);
      if (gen !== state.gen) {
        setStatus(statusEl, "Something changed while processing — press Process again.", "warn");
        updateDock();
        return;
      }
      state.results = out;
      renderResults();
      setProcessMode(true);
      slots.forEach((slot) => {
        setFrameState(slot);
        const r = out.find((x) => x.key === slot.key);
        if (!r) return;
        countUp(slot.el.fstate.querySelector("[data-kb]"), kb(r.file.size));
        const cls = r.over ? "flash-bad" : "flash-ok";
        slot.el.frame.classList.add(cls);
        setTimeout(() => slot.el.frame.classList.remove(cls), 600);
      });
      const over = out.find((r) => r.over);
      const under = out.find((r) => r.under);
      const padded = out.filter((r) => r.padded);
      if (over) {
        const isPng = over.file.type === "image/png";
        setStatus(statusEl, `${over.label} is ${kb(over.file.size)} KB but the limit is ${kb(over.max)} KB. ${isPng ? "PNG cannot be shrunk — save it as JPG instead." : "Try a plainer background or a smaller source image."}`, "err");
      } else if (under) {
        setStatus(statusEl, `${under.label} is ${kb(under.file.size)} KB but the portal wants at least ${kb(under.min)} KB. A larger or sharper source image helps.`, "warn");
      } else if (padded.length) {
        const names = padded.map((r) => r.label).join(" and ");
        setStatus(statusEl, `Done — ${out.length} file${out.length > 1 ? "s" : ""} ready. ${names} ${padded.length > 1 ? "were" : "was"} below the minimum size, so ${padded.length > 1 ? "they were" : "it was"} topped up to it.`, "ok");
      } else setStatus(statusEl, `Done — ${out.length} file${out.length > 1 ? "s" : ""} ready.`, "ok");
      if (idSlot.file && !idSlot.bmp && kbOf(idMaxKb)) toast("KB limit ignored for non-image ID files", "info");
      updateDock();
    } catch (err) {
      console.error(err);
      setStatus(statusEl, "Error: " + err.message, "err");
    } finally {
      state.processing = false;
      processBtn.disabled = false;
      if (dockCta) dockCta.disabled = false;
    }
  }
  const slug = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  async function downloadAll() {
    if (!state.results.length || state.downloading) return;
    state.downloading = true;
    processBtn.disabled = true;
    if (dockCta) dockCta.disabled = true;
    const files = state.results.map((r) => r.file);
    try {
      if (zipToggle && zipToggle.checked && files.length > 1) {
        setStatus(statusEl, "Zipping…", "busy");
        await ensureLib("jszip", processBtn, "Loading ZIP support…");
        const zip = new JSZip();
        files.forEach((f) => zip.file(f.name, f));
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        const t = TEMPLATES[state.templateKey];
        downloadFile(new File([blob], `GovForms_${slug(t ? t.name : "files")}.zip`, { type: "application/zip" }));
        setStatus(statusEl, "ZIP downloaded.", "ok");
        return;
      }
      if (coarse && navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({ files, title: "GovForms files" });
          setStatus(statusEl, "Files shared.", "ok");
          return;
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
      }
      for (const f of files) {
        downloadFile(f);
        if (files.length > 1) await sleep(350);
      }
      setStatus(statusEl, files.length > 1 ? "Files downloaded." : "File downloaded.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(statusEl, "Error: " + err.message, "err");
    } finally {
      state.downloading = false;
      processBtn.disabled = false;
      if (dockCta) dockCta.disabled = false;
    }
  }
  on(processBtn, "click", () => (state.results.length ? downloadAll() : processAll()));
  on(processAgain, "click", processAll);
  [idFormat, idMaxKb].forEach((el) => on(el, "change", invalidateResults));
  if (zipToggle) zipToggle.checked = !coarse;

  /* ---------- dialogs (viewer, install sheet) ---------- */
  const viewerModal = $("viewerModal");
  const viewerBody = $("viewerBody");
  const viewerTitle = $("viewerTitle");
  const installSheet = $("installSheet");
  let viewerUrl = null,
    lastFocus = null;
  const inertTargets = () => [document.querySelector("main"), document.querySelector(".nav"), document.querySelector(".footer"), $("dock"), $("actionbar")].filter(Boolean);
  function trapTab(e, box) {
    if (e.key !== "Tab") return;
    const f = box.querySelectorAll('button:not([disabled]),[href],input,select,textarea,object,[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  function openDialog(el, focusEl) {
    lastFocus = document.activeElement;
    el.hidden = false;
    inertTargets().forEach((t) => (t.inert = true));
    if (focusEl) focusEl.focus();
    document.dispatchEvent(new CustomEvent("govforms:modal", { detail: true }));
  }
  function closeDialog(el) {
    el.hidden = true;
    inertTargets().forEach((t) => (t.inert = false));
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    document.dispatchEvent(new CustomEvent("govforms:modal", { detail: false }));
  }
  function openViewer(file, title = "Preview") {
    if (!file || !viewerModal) return;
    viewerBody.innerHTML = "";
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerTitle.textContent = title;
    viewerUrl = URL.createObjectURL(file);
    if (isImage(file)) {
      const img = document.createElement("img");
      img.src = viewerUrl;
      img.alt = file.name;
      viewerBody.appendChild(img);
    } else if (isPdf(file)) {
      if (coarse) {
        const card = document.createElement("div");
        card.className = "pdf-card";
        card.innerHTML = `${icon("file-text")}<b>${esc(file.name)}</b><span class="mono muted">${formatFileSize(file.size)}</span>`;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "btn btn-primary";
        open.textContent = "Open PDF";
        open.addEventListener("click", () => window.open(viewerUrl, "_blank", "noopener"));
        card.appendChild(open);
        viewerBody.appendChild(card);
      } else {
        const obj = document.createElement("object");
        obj.data = viewerUrl;
        obj.type = "application/pdf";
        obj.innerHTML = `<p class="muted">Inline preview unavailable. <a target="_blank" rel="noopener" href="${viewerUrl}">Open in a new tab</a></p>`;
        viewerBody.appendChild(obj);
      }
    } else if (file.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const pre = document.createElement("pre");
        pre.textContent = e.target.result;
        viewerBody.appendChild(pre);
      };
      reader.readAsText(file);
    } else {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "This file type cannot be previewed here. Download it to check it.";
      viewerBody.appendChild(p);
    }
    openDialog(viewerModal, $("closeViewerBtn"));
  }
  function closeViewer() {
    if (!viewerModal || viewerModal.hidden) return;
    viewerBody.innerHTML = "";
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = null;
    closeDialog(viewerModal);
  }
  on($("closeViewerBtn"), "click", closeViewer);
  on(viewerModal, "click", (e) => {
    if (e.target === viewerModal) closeViewer();
  });
  on(viewerModal, "keydown", (e) => {
    if (e.key === "Escape") closeViewer();
    trapTab(e, viewerModal);
  });
  const openInstallSheet = () => installSheet && openDialog(installSheet, $("installSheetClose"));
  const closeInstallSheet = () => installSheet && !installSheet.hidden && closeDialog(installSheet);
  on($("installSheetClose"), "click", closeInstallSheet);
  on($("installSheetDone"), "click", closeInstallSheet);
  on(installSheet, "click", (e) => {
    if (e.target === installSheet) closeInstallSheet();
  });
  on(installSheet, "keydown", (e) => {
    if (e.key === "Escape") closeInstallSheet();
    trapTab(e, installSheet);
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
  let mergeBusy = false;
  function moveItem(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from === to || from < 0 || to < 0 || from >= mergeItems.length || to >= mergeItems.length) return;
    const [it] = mergeItems.splice(from, 1);
    mergeItems.splice(to, 0, it);
    renderMergeList();
  }
  function renderMergeList() {
    if (!mergeListEl) return;
    mergeListEl.innerHTML = "";
    const total = mergeItems.reduce((a, b) => a + b.file.size, 0);
    if (mergeSummary) mergeSummary.textContent = mergeItems.length ? `${mergeItems.length} file${mergeItems.length > 1 ? "s" : ""} · ${formatFileSize(total)}` : "—";
    mergeBtn.disabled = mergeBusy || !mergeItems.length;
    mergeClearBtn.disabled = mergeBusy || !mergeItems.length;
    if (!mergeItems.length) return;
    mergeItems.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "merge-item";
      row.draggable = !coarse && !mergeBusy;
      row.innerHTML = icon("grip", "ic mi-grip");
      const thumb = document.createElement(item.url ? "img" : "div");
      thumb.className = "mi-thumb";
      if (item.url) {
        thumb.src = item.url;
        thumb.alt = "";
      } else thumb.textContent = isPdf(item.file) ? "PDF" : "FILE";
      row.appendChild(thumb);
      const meta = document.createElement("div");
      meta.className = "mi-meta";
      meta.innerHTML = `<span class="mi-name" title="${esc(item.file.name)}">${esc(item.file.name)}</span><span class="mi-size mono">${formatFileSize(item.file.size)}</span>`;
      row.appendChild(meta);
      const mk = (name, title, cls, fn, disabled) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "icon-btn " + cls;
        b.title = title;
        b.setAttribute("aria-label", `${title}: ${item.file.name}`);
        b.disabled = mergeBusy || !!disabled;
        b.innerHTML = icon(name);
        b.addEventListener("click", fn);
        return b;
      };
      row.appendChild(mk("up", "Move up", "mi-up", () => moveItem(index, index - 1), index === 0));
      row.appendChild(mk("down", "Move down", "mi-down", () => moveItem(index, index + 1), index === mergeItems.length - 1));
      row.appendChild(mk("eye", "View", "mi-view", () => openViewer(item.file, item.file.name)));
      row.appendChild(
        mk("x", "Remove", "", () => {
          if (item.url) URL.revokeObjectURL(item.url);
          mergeItems.splice(index, 1);
          renderMergeList();
        }),
      );
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-govforms-merge", String(index));
        e.dataTransfer.setData("text/plain", String(index));
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        mergeListEl.querySelectorAll(".merge-item").forEach((r) => r.classList.remove("drop-before", "drop-after"));
      });
      row.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes("application/x-govforms-merge")) return;
        e.preventDefault();
        e.stopPropagation();
        const r = row.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        row.classList.toggle("drop-before", before);
        row.classList.toggle("drop-after", !before);
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
      row.addEventListener("drop", (e) => {
        const raw = e.dataTransfer.getData("application/x-govforms-merge");
        const from = Number(raw);
        if (raw === "" || !Number.isInteger(from) || from < 0 || from >= mergeItems.length) return;
        e.preventDefault();
        e.stopPropagation();
        const r = row.getBoundingClientRect();
        let to = index + (e.clientY < r.top + r.height / 2 ? 0 : 1);
        if (from < to) to--;
        moveItem(from, to);
      });
      mergeListEl.appendChild(row);
    });
  }
  setupDropzone($("mergeDrop"), $("mergeFiles"), (files) => {
    let added = 0;
    files.forEach((file) => {
      if (!isImage(file) && !isPdf(file)) return;
      mergeItems.push({ id: mergeSeq++, file, url: isImage(file) ? URL.createObjectURL(file) : null });
      added++;
    });
    if (!added) return setStatus(mergeStatus, "Only images and PDFs can be merged.", "err");
    renderMergeList();
    setStatus(mergeStatus, "");
  });
  on(mergeClearBtn, "click", () => {
    if (mergeBusy) return;
    mergeItems.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    mergeItems.length = 0;
    renderMergeList();
    setStatus(mergeStatus, "");
  });
  // EXIF orientation tag (0x0112) of a JPEG, 1 when absent
  function exifOrientation(bytes) {
    try {
      const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (v.getUint16(0) !== 0xffd8) return 1;
      let off = 2;
      while (off + 4 <= v.byteLength) {
        const marker = v.getUint16(off);
        off += 2;
        if (marker === 0xffe1 && v.getUint32(off + 2) === 0x45786966) {
          const start = off + 2;
          const tiff = start + 6;
          const little = v.getUint16(tiff) === 0x4949;
          const g16 = (p) => v.getUint16(p, little);
          const g32 = (p) => v.getUint32(p, little);
          const ifd = tiff + g32(tiff + 4);
          const n = g16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (g16(e) === 0x0112) return g16(e + 8) || 1;
          }
          return 1;
        }
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1;
        off += v.getUint16(off);
      }
    } catch (e) {}
    return 1;
  }
  async function decodeOriented(file) {
    const c = document.createElement("canvas");
    let bmp = null;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      bmp = null;
    }
    const paint = (src, w, h) => {
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(src, 0, 0);
    };
    if (bmp) {
      paint(bmp, bmp.width, bmp.height);
      if (bmp.close) bmp.close();
    } else {
      const { bmp: b, url } = await loadBitmap(file, 0);
      URL.revokeObjectURL(url);
      paint(b.src, b.w, b.h);
    }
    return c;
  }
  async function mergeFilesToPdf(items, pageMode, onProgress) {
    const merged = await PDFLib.PDFDocument.create();
    const A4 = [595.28, 841.89];
    const MARGIN = 24;
    for (let i = 0; i < items.length; i++) {
      const file = items[i].file;
      onProgress && onProgress(i, items.length, file.name);
      if (isPdf(file)) {
        const pdf = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        if (pdf.isEncrypted) throw new Error(`${file.name} is password-protected. Remove the password first (print or save it as a new PDF), then merge.`);
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        continue;
      }
      if (!isImage(file)) continue;
      let img;
      const lower = file.name.toLowerCase();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/.test(lower);
      try {
        if (file.type === "image/png" || lower.endsWith(".png")) img = await merged.embedPng(bytes);
        else if (isJpeg && exifOrientation(bytes) <= 1) img = await merged.embedJpg(bytes);
        else {
          const c = await decodeOriented(file);
          img = await merged.embedJpg(new Uint8Array(await (await canvasToBlob(c, "image/jpeg", 0.92)).arrayBuffer()));
        }
      } catch (err) {
        const c = await decodeOriented(file);
        img = await merged.embedPng(new Uint8Array(await (await canvasToBlob(c, "image/png")).arrayBuffer()));
      }
      const { width, height } = img.scale(1);
      if (pageMode === "a4") {
        const page = merged.addPage(A4);
        const s = Math.min((A4[0] - MARGIN * 2) / width, (A4[1] - MARGIN * 2) / height);
        const w = width * s,
          h = height * s;
        page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
      } else merged.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
    }
    return merged.save();
  }
  on(mergeBtn, "click", async () => {
    if (!mergeItems.length || mergeBusy) return;
    const items = mergeItems.slice();
    mergeBusy = true;
    renderMergeList();
    try {
      await ensureLib("pdflib", mergeBtn);
      const bytes = await mergeFilesToPdf(items, mergePageSize.value, (i, n, name) => setStatus(mergeStatus, `Merging ${i + 1} of ${n}: ${name}`, "busy"));
      const safe = (mergeName.value || "merged").replace(/[^\w\-]+/g, "_");
      const file = new File([bytes], `${safe}.pdf`, { type: "application/pdf" });
      downloadFile(file);
      setStatus(mergeStatus, `Merged PDF downloaded (${formatFileSize(file.size)}).`, "ok");
    } catch (err) {
      console.error(err);
      setStatus(mergeStatus, "Error merging files: " + err.message, "err");
    } finally {
      mergeBusy = false;
      mergeBtn.innerHTML = "Merge into one PDF";
      renderMergeList();
    }
  });

  /* ---------- passport photo sheet ---------- */
  const PAPERS = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4], "4x6": [101.6, 152.4] };
  const PAPER_NAMES = { a4: "A4", a5: "A5", letter: "Letter", "4x6": "4 × 6 in" };
  const PHOTO_SIZES = { "35x45": [35, 45], "51x51": [50.8, 50.8], "25x35": [25, 35], "35x35": [35, 35] };
  const DPI = 300;
  const sheet = { bmp: null, url: null, view: defaultView("fill"), bg: "#ffffff", fromStudio: false };
  const sheetPaper = $("sheetPaper"),
    sheetPhoto = $("sheetPhoto"),
    sheetGap = $("sheetGap"),
    sheetCustom = $("sheetCustom"),
    sheetCW = $("sheetCW"),
    sheetCH = $("sheetCH"),
    sheetGuides = $("sheetGuides"),
    sheetPreview = $("sheetPreview"),
    sheetInfo = $("sheetInfo"),
    sheetJpgBtn = $("sheetJpgBtn"),
    sheetPdfBtn = $("sheetPdfBtn");
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
    return { pw, ph, cw, ch, gap, cols, rows, ox: (pw - gridW) / 2, oy: (ph - gridH) / 2 };
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
    renderFrame(cell, sheet.bmp, Math.round(L.cw * pxPerMm), Math.round(L.ch * pxPerMm), sheet.view, sheet.bg);
    ctx.strokeStyle = "#9aa4b8";
    ctx.lineWidth = Math.max(1, pxPerMm * 0.12);
    ctx.setLineDash([pxPerMm * 1.2, pxPerMm * 1.2]);
    for (let r = 0; r < L.rows; r++)
      for (let c = 0; c < L.cols; c++) {
        const x = Math.round((L.ox + c * (L.cw + L.gap)) * pxPerMm);
        const y = Math.round((L.oy + r * (L.ch + L.gap)) * pxPerMm);
        ctx.drawImage(cell, x, y);
        if (sheetGuides.checked) ctx.strokeRect(x + 0.5, y + 0.5, cell.width - 1, cell.height - 1);
      }
    return L;
  }
  function refreshSheet() {
    if (!sheetPreview) return;
    sheetCustom.hidden = sheetPhoto.value !== "custom";
    const scale = Math.min(0.42, 320 / (PAPERS[sheetPaper.value] || PAPERS.a4)[1]);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const L = drawSheet(sheetPreview, ((DPI / 25.4) * scale * dpr) / 4.4);
    sheetPreview.style.width = Math.round((L.pw * scale * (DPI / 25.4)) / 4.4) + "px";
    const has = !!sheet.bmp;
    sheetJpgBtn.disabled = !has || !L.cols || !L.rows;
    sheetPdfBtn.disabled = sheetJpgBtn.disabled;
    sheetInfo.textContent = has ? `${L.cols * L.rows} photos of ${L.cw} × ${L.ch} mm on ${PAPER_NAMES[sheetPaper.value] || sheetPaper.value} · ${L.cols} across × ${L.rows} down · 300 DPI` : "";
  }
  [sheetPaper, sheetPhoto, sheetGap, sheetCW, sheetCH, sheetGuides].forEach((el) => on(el, "input", refreshSheet));
  function showSheetFile(name, size, url) {
    $("sheetThumb").src = url;
    $("sheetName").textContent = name;
    $("sheetSize").textContent = formatFileSize(size);
    $("sheetMeta").hidden = false;
    $("sheetDrop").classList.add("has-file");
  }
  async function setSheetFile(file) {
    if (!isImage(file)) return toast("Please choose an image file.", "err");
    clearSheet(true);
    const token = (sheet.pending = {});
    try {
      const { bmp, url } = await loadBitmap(file);
      if (sheet.pending !== token) {
        URL.revokeObjectURL(url);
        return;
      }
      Object.assign(sheet, { bmp, url, view: defaultView("fill"), bg: "#ffffff", fromStudio: false });
      showSheetFile(file.name, file.size, url);
      refreshSheet();
    } catch (err) {
      if (sheet.pending === token) toast(err.message, "err");
    }
  }
  function clearSheet(silent) {
    if (sheet.url && !sheet.fromStudio) URL.revokeObjectURL(sheet.url);
    Object.assign(sheet, { bmp: null, url: null, bg: "#ffffff", fromStudio: false, pending: null });
    const meta = $("sheetMeta");
    if (meta) meta.hidden = true;
    const drop = $("sheetDrop");
    if (drop) drop.classList.remove("has-file");
    if (!silent) refreshSheet();
  }
  setupDropzone($("sheetDrop"), $("sheetFile"), (files) => setSheetFile(files[0]));
  on($("sheetUseStudio"), "click", () => {
    const photo = slots.get("photo");
    if (!photo || !photo.bmp) {
      toast("Add a photo at the top of the page first.", "warn");
      scrollToEl("#studio", { focus: false });
      return;
    }
    clearSheet(true);
    Object.assign(sheet, { bmp: photo.bmp, url: photo.url, view: { ...photo.view }, bg: photo.bg, fromStudio: true });
    showSheetFile(photo.file.name + " (as framed above)", photo.file.size, photo.url);
    refreshSheet();
  });
  on(document.querySelector('[data-clear="sheet"]'), "click", () => clearSheet());
  async function exportSheet(kind) {
    if (!sheet.bmp) return;
    const btn = kind === "pdf" ? sheetPdfBtn : sheetJpgBtn;
    const label = btn.textContent;
    btn.disabled = true;
    try {
      const full = document.createElement("canvas");
      const L = drawSheet(full, DPI / 25.4);
      const stamp = `${sheetPaper.value}_${L.cw}x${L.ch}mm`;
      if (kind === "pdf") downloadFile(await canvasToPDF(full, `photo_sheet_${stamp}.pdf`, { mmW: L.pw, mmH: L.ph, quality: 0.92, btn }));
      else downloadFile(new File([await canvasToBlob(full, "image/jpeg", 0.92)], `photo_sheet_${stamp}.jpg`, { type: "image/jpeg" }));
    } catch (err) {
      console.error(err);
      toast("Could not build the sheet: " + err.message, "err");
    } finally {
      btn.textContent = label;
      btn.disabled = false;
    }
  }
  on(sheetJpgBtn, "click", () => exportSheet("jpg"));
  on(sheetPdfBtn, "click", () => exportSheet("pdf"));

  /* ---------- quick compress ---------- */
  const comp = { file: null, bmp: null, url: null, out: null };
  const compBtn = $("compBtn"),
    compDownloadBtn = $("compDownloadBtn"),
    compStatus = $("compStatus");
  async function setCompFile(file) {
    if (!isImage(file)) return toast("Please choose an image file.", "err");
    clearComp(true);
    const token = (comp.pending = {});
    try {
      const { bmp, url } = await loadBitmap(file, 0);
      if (comp.pending !== token) {
        URL.revokeObjectURL(url);
        return;
      }
      Object.assign(comp, { file, bmp, url });
      $("compThumb").src = url;
      $("compName").textContent = file.name;
      $("compSize").textContent = formatFileSize(file.size);
      $("compMeta").hidden = false;
      $("compDrop").classList.add("has-file");
      compBtn.disabled = false;
      setStatus(compStatus, `${bmp.w} × ${bmp.h} px · ${formatFileSize(file.size)}`);
    } catch (err) {
      if (comp.pending === token) toast(err.message, "err");
    }
  }
  function clearComp(silent) {
    if (comp.url) URL.revokeObjectURL(comp.url);
    comp.file = comp.bmp = comp.url = comp.out = comp.pending = null;
    $("compMeta").hidden = true;
    $("compDrop").classList.remove("has-file");
    $("compResult").hidden = true;
    compBtn.disabled = true;
    compDownloadBtn.disabled = true;
    if (!silent) setStatus(compStatus, "");
  }
  const WEBP_OK = (() => {
    try {
      return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
    } catch (e) {
      return false;
    }
  })();
  if (!WEBP_OK) {
    const o = document.querySelector('#compFormat option[value="webp"]');
    if (o) o.remove();
  }
  setupDropzone($("compDrop"), $("compFile"), (files) => setCompFile(files[0]));
  on(document.querySelector('[data-clear="comp"]'), "click", () => clearComp());
  on(compBtn, "click", async () => {
    if (!comp.bmp) return;
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
      renderFrame(c, comp.bmp, w, h, defaultView("fill"), "#ffffff");
      const fmt = $("compFormat").value;
      const mime = fmt === "png" ? "image/png" : fmt === "webp" ? "image/webp" : "image/jpeg";
      const { blob, quality, over } = await encodeUnderLimit(c, mime, target);
      if (blob.type && blob.type !== mime) throw new Error("This browser cannot save that format. Choose JPG or PNG.");
      const base = comp.file.name.replace(/\.[^.]+$/, "");
      const keepOriginal = !over && !maxDim && blob.size >= comp.file.size && mime === comp.file.type;
      comp.out = keepOriginal ? comp.file : new File([blob], `${base}_compressed.${fmt === "jpeg" ? "jpg" : fmt}`, { type: mime });
      $("compBefore").textContent = formatFileSize(comp.file.size);
      $("compAfter").textContent = formatFileSize(comp.out.size);
      $("compQ").textContent = keepOriginal ? "unchanged" : quality == null ? "lossless" : Math.round(quality * 100) + "%";
      $("compDims").textContent = `${w} × ${h} px`;
      $("compResult").hidden = false;
      compDownloadBtn.disabled = false;
      const pct = ((comp.file.size - comp.out.size) / comp.file.size) * 100;
      if (over) setStatus(compStatus, `Could not get under ${Math.round(target / 1024)} KB at this size. Lower the max side or raise the limit.`, "err");
      else if (keepOriginal) setStatus(compStatus, "Already under the limit — the original is kept as is.", "ok");
      else setStatus(compStatus, pct >= 0 ? `Done — ${pct.toFixed(1)}% smaller.` : `Done — ${Math.abs(pct).toFixed(1)}% larger than the original.`, pct >= 0 ? "ok" : "warn");
    } catch (err) {
      console.error(err);
      setStatus(compStatus, "Error: " + err.message, "err");
    } finally {
      compBtn.disabled = false;
    }
  });
  on(compDownloadBtn, "click", () => comp.out && downloadFile(comp.out));

  /* ---------- tools tabs + hash routing ---------- */
  const TABS = ["sheet", "compress", "merge"];
  function selectTab(name, focus) {
    if (!TABS.includes(name)) return;
    TABS.forEach((t) => {
      const tab = $("tab-" + t),
        panel = $(t);
      const active = t === name;
      if (tab) {
        tab.setAttribute("aria-selected", active);
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      }
      if (panel) panel.hidden = !active;
    });
    if (name === "sheet") refreshSheet();
  }
  const tablist = document.querySelector(".tabs");
  on(tablist, "click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) selectTab(tab.dataset.tab);
  });
  on(tablist, "keydown", (e) => {
    const i = TABS.indexOf((document.activeElement.dataset || {}).tab);
    if (i < 0) return;
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
    if (next !== null) {
      e.preventDefault();
      selectTab(TABS[next], true);
    }
  });
  function routeHash() {
    const h = location.hash.slice(1);
    if (TABS.includes(h)) {
      selectTab(h);
      scrollToEl("#tools", { focus: false });
    }
  }
  window.addEventListener("hashchange", routeHash);

  /* ---------- news ---------- */
  const NEWS_CATS = [
    { id: "all", name: "All" },
    { id: "ssc", name: "SSC" },
    { id: "railway", name: "Railways" },
    { id: "banking", name: "Banking" },
    { id: "upsc", name: "UPSC & PSC" },
    { id: "defence", name: "Defence" },
    { id: "entrance", name: "Entrance" },
    { id: "general", name: "General" },
  ];
  const SOURCES = [
    ["SSC", "https://ssc.gov.in/"],
    ["Railways (RRB)", "https://indianrailways.gov.in/railwayboard/view_section.jsp?lang=0&id=0,7,1281"],
    ["IBPS", "https://www.ibps.in/"],
    ["SBI careers", "https://sbi.co.in/web/careers"],
    ["RBI", "https://opportunities.rbi.org.in/"],
    ["UPSC", "https://upsc.gov.in/"],
    ["NTA", "https://nta.ac.in/"],
    ["Join Indian Army", "https://joinindianarmy.nic.in/"],
    ["Employment News", "https://www.employmentnews.gov.in/"],
    ["Passport Seva", "https://www.passportindia.gov.in/"],
  ];
  const news = { items: [], updatedAt: null, cat: "all", search: "", shown: 8, loaded: false, loading: false };
  const newsGrid = $("newsGrid"),
    newsChips = $("newsChips"),
    newsSearch = $("newsSearch"),
    newsMeta = $("newsMeta"),
    newsMore = $("newsMore"),
    newsEmpty = $("newsEmpty"),
    newsEmptyText = $("newsEmptyText"),
    newsCount = $("newsCount");
  function buildNewsStatic() {
    const src = $("sourceList");
    if (src) src.innerHTML = SOURCES.map(([n, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(n)}${icon("external")}</a></li>`).join("");
    if (newsChips) {
      newsChips.innerHTML = NEWS_CATS.map((c) => `<button type="button" class="chip-btn" data-cat="${c.id}" aria-pressed="${c.id === "all"}">${esc(c.name)}</button>`).join("");
      newsChips.addEventListener("click", (e) => {
        const b = e.target.closest(".chip-btn");
        if (!b) return;
        news.cat = b.dataset.cat;
        news.shown = 8;
        newsChips.querySelectorAll(".chip-btn").forEach((x) => x.setAttribute("aria-pressed", x === b));
        renderNews();
      });
    }
    on(
      newsSearch,
      "input",
      debounce(() => {
        news.search = newsSearch.value;
        news.shown = 8;
        renderNews();
      }, 100),
    );
    on(newsMore, "click", () => {
      news.shown += 8;
      renderNews();
    });
  }
  // the live feed (api/news.mjs, a few minutes old at most) first, the daily news.json snapshot as the fallback
  const NEWS_SOURCES = ["./api/news", "./news.json"];
  const NEWS_REFRESH_MS = 5 * 60 * 1000;
  let newsFetchedAt = 0;
  async function fetchNewsFeed() {
    for (const url of NEWS_SOURCES) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length) return data;
      } catch (err) {}
    }
    return null;
  }
  async function loadNews(background = false) {
    if (!newsGrid || news.loading) return;
    if (!background) newsGrid.innerHTML = Array.from({ length: 4 }, () => '<div class="news-skel"></div>').join("");
    news.loading = true;
    const data = await fetchNewsFeed();
    newsFetchedAt = Date.now();
    news.loading = false;
    if (!data) {
      if (background) return renderNews(false, false); // keep what is on screen; just refresh "Updated … ago"
      news.items = [];
      news.loaded = false;
      return renderNews();
    }
    const changed = !news.loaded || data.items.map((it) => it.link).join("\n") !== news.items.map((it) => it.link).join("\n");
    news.items = data.items;
    news.updatedAt = data.updatedAt || null;
    news.loaded = true;
    // a background refresh redraws only when the headlines changed, and without replaying the card animation
    renderNews(!background, !background || changed);
  }
  function refreshNewsIfStale() {
    if (document.hidden || news.loading) return;
    if (Date.now() - newsFetchedAt >= NEWS_REFRESH_MS) loadNews(true);
    else if (news.loaded) renderNews(false, false); // keeps "Updated … ago" current
  }
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "#");
  function renderNews(animate = true, redraw = true) {
    if (!newsGrid || news.loading) return;
    const f = news.search.trim().toLowerCase();
    const list = news.items.filter((it) => (news.cat === "all" || it.category === news.cat) && (!f || it.title.toLowerCase().includes(f) || (it.source || "").toLowerCase().includes(f)));
    if (newsMeta) newsMeta.textContent = news.loaded ? `Updated ${timeAgo(news.updatedAt)} · ${news.items.length} headlines` : "Headlines need an internet connection. Use the official boards below.";
    if (!redraw) return;
    newsGrid.innerHTML = list
      .slice(0, news.shown)
      .map(
        (it, i) => `<a class="news-card" href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener" style="${animate && !reducedMotion ? `animation-delay:${(i % 8) * 40}ms` : "animation:none"}">
          <div class="news-top"><span class="news-src">${esc(it.source || "News")}</span><span>${timeAgo(it.date)}</span></div>
          <div class="news-title">${esc(it.title)}</div>
          <div class="news-bottom"><span class="news-cat">${esc((NEWS_CATS.find((c) => c.id === it.category) || { name: it.category }).name)}</span><span class="news-read">Read ${icon("external")}</span></div>
        </a>`,
      )
      .join("");
    if (newsEmpty) newsEmpty.hidden = list.length > 0;
    if (newsEmptyText) newsEmptyText.textContent = news.loaded ? "No headlines match." : "Headlines need an internet connection. Use the official boards below.";
    if (newsMore) newsMore.hidden = list.length <= news.shown;
    if (newsCount) newsCount.textContent = `${Math.min(list.length, news.shown)} headline${list.length === 1 ? "" : "s"} shown`;
  }

  /* ---------- PWA: service worker + install ---------- */
  const installBtn = $("installBtn");
  let deferredPrompt = null;
  const isIOS = (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && !window.MSStream;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    const hadController = !!navigator.serviceWorker.controller;
    let announced = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !announced) {
        announced = true;
        toast("A new version is ready — tap to reload", "info", 8000, () => location.reload());
      }
    });
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn && !standalone) installBtn.hidden = false;
  });
  if (isIOS && !standalone && installBtn) installBtn.hidden = false;
  on(installBtn, "click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.hidden = true;
      if (outcome !== "accepted") return;
    } else if (isIOS) openInstallSheet();
  });
  window.addEventListener("appinstalled", () => {
    if (installBtn) installBtn.hidden = true;
    toast("Installed — find GovForms on your home screen", "ok");
  });

  /* ---------- theme ---------- */
  const themeToggle = $("themeToggle");
  const resolvedTheme = () => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  function reflectTheme() {
    const t = resolvedTheme();
    if (themeToggle) themeToggle.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = t === "dark" ? "#0f1115" : "#f5f6f8";
  }
  on(themeToggle, "click", () => {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("govforms-theme", next);
    } catch (e) {}
    reflectTheme();
  });
  reflectTheme();
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", reflectTheme);
  } catch (e) {}

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    const typing = typingNow() || (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !typing) {
      e.preventDefault();
      processAll();
    } else if (e.key === "Escape") {
      if (viewerModal && !viewerModal.hidden) closeViewer();
      else if (installSheet && !installSheet.hidden) closeInstallSheet();
      else closePicker();
    } else if (e.key === "/" && !typing && templateBtn) {
      e.preventDefault();
      scrollToEl("#templateField", { focus: false });
      openPicker();
      setTimeout(() => templatePopSearch.focus(), 60);
    }
  });

  /* ---------- init ---------- */
  buildGallery();
  buildNewsStatic();
  const params = new URLSearchParams(location.search);
  const examParam = params.get("exam");
  let remembered = "";
  try {
    remembered = localStorage.getItem("govforms-template") || "";
  } catch (e) {}
  if (hasTpl(examParam)) {
    selectTemplate(examParam);
    setTimeout(() => scrollToEl("#templateField", { focus: false }), 50);
  } else {
    selectTemplate("");
    if (hasTpl(remembered)) {
      const lu = $("lastUsed");
      if (lu) {
        $("lastUsedName").textContent = TEMPLATES[remembered].name;
        lu.hidden = false;
        on($("lastUsedBtn"), "click", () => selectTemplate(remembered));
      }
    }
  }
  const catParam = (params.get("cat") || "").trim().toLowerCase();
  if (catParam && (catParam === "all" || catOf(catParam))) setCategory(catParam);
  renderMergeList();
  refreshSheet();
  updateIdControls();
  setProcessMode(false);
  loadNews();
  // keep the headlines live while the page is open: checked every minute, refetched every 5, and on returning to the tab
  setInterval(refreshNewsIfStale, 60 * 1000);
  document.addEventListener("visibilitychange", refreshNewsIfStale);
  routeHash();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => slots.forEach((s) => drawEditor(s)), 150);
  });

  window.GovForms = {
    TEMPLATES,
    CATEGORIES,
    slots,
    selectTemplate,
    setSlotFile: (key, file) => setSlotFile(slots.get(key), file),
    setIdFile,
    processAll,
    currentSpec,
    results: () => state.results,
    state,
    news,
    selectTab,
  };
})();
