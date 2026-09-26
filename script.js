/* ============================================================
   GovForms — application logic (v2)
   All processing happens on-device with the Canvas API.
   ============================================================ */
(() => {
  "use strict";

  /* ---------- tiny helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

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
  function timeAgo(iso) {
    const d = new Date(iso);
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    const days = Math.floor(s / 86400);
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
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
  const scrollToEl = (target, opts) => {
    const el =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!el) return;
    if (window.GovFX && window.GovFX.scrollTo) window.GovFX.scrollTo(el, opts);
    else el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const layoutChanged = () =>
    document.dispatchEvent(new CustomEvent("govforms:layout"));

  const isImage = (f) =>
    !!f &&
    (f.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name));
  const isPdf = (f) =>
    !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const kbOf = (input) => {
    const v = parseFloat(input && input.value);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 1024) : 0;
  };
  const placeholderThumb = (label) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="12" fill="#1b2a4a"/><text x="40" y="46" font-family="monospace" font-size="16" font-weight="700" text-anchor="middle" fill="#22d3ee">${label}</text></svg>`,
    );

  /* ---------- catalog ---------- */
  const CATALOG = window.GOVFORMS_CATALOG || {
    categories: [],
    templates: {
      custom: {
        name: "Custom",
        org: "Enter your own pixel sizes",
        category: "custom",
        tags: [],
        custom: true,
      },
    },
  };
  const TEMPLATES = CATALOG.templates;
  const CATEGORIES = CATALOG.categories;
  const catName = (id) =>
    (
      CATEGORIES.find((c) => c.id === id) || {
        name: id === "custom" ? "Custom" : id,
      }
    ).name;

  /* ---------- imagery (Wikimedia Commons, credited in the footer) ---------- */
  const IMAGES = {
    railway: {
      path: "6/6d/Dhubri_railway_station_platform_with_child_and_flag.jpg",
      title: "Dhubri railway station platform",
      author: "GeoEvan",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    },
    banking: {
      path: "f/f6/General_Post_Office_and_Reserve_Bank_of_India%2C_Kolkata%2C_India.jpg",
      title: "General Post Office and Reserve Bank of India, Kolkata",
      author: "Vyacheslav Argenberg",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    },
    defence: {
      path: "c/c6/Indian_Army_contingent_Republic_Day_parade_2023_Img1.jpg",
      title: "Indian Army contingent, Republic Day parade 2023",
      author: "Government of India",
      license: "GODL-India",
      licenseUrl:
        "https://data.gov.in/sites/default/files/Gazette_Notification_OGDL.pdf",
    },
    ssc: {
      path: "0/09/India_Gate_in_New_Delhi_03-2016.jpg",
      title: "India Gate, New Delhi",
      author: "A. Savin",
      license: "FAL 1.3",
      licenseUrl: "https://artlibre.org/licence/lal/en/",
    },
    upsc: {
      path: "d/d7/North_Block%2C_Secretariat_Building%2C_New_Delhi_-_1.jpg",
      title: "North Block, Secretariat Building, New Delhi",
      author: "Ronakshah1990",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    documents: {
      path: "9/9f/Indian_Passport_01.jpg",
      title: "Indian passport",
      author: "Gpkp",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    entrance: {
      path: "6/63/Students_at_a_school_in_Bangalore%2C_India_learning_to_code_on_Progate.jpg",
      title: "Students at a school in Bangalore",
      author: "Nayakyashraj",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    news: {
      path: "3/34/Rashtrapati_Bhavan-Delhi-India05.JPG",
      title: "Rashtrapati Bhavan, New Delhi",
      author: "Diego Delso",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    credits: {
      path: "f/fd/India_Gate_Evening_New_Delhi.jpg",
      title: "India Gate in the evening",
      author: "Dipesh Patel",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    },
  };
  const wm = (path, w) =>
    `https://upload.wikimedia.org/wikipedia/commons/thumb/${path}/${w}px-${path.split("/").pop()}`;
  const wmPage = (path) =>
    "https://commons.wikimedia.org/wiki/File:" +
    decodeURIComponent(path.split("/").pop());

  function applyImages() {
    document.querySelectorAll("img[data-img]").forEach((img) => {
      const meta = IMAGES[img.dataset.img];
      if (!meta) return;
      img.alt = meta.title;
      img.sizes = "(max-width: 640px) 100vw, (max-width: 1080px) 60vw, 640px";
      img.srcset = `${wm(meta.path, 500)} 500w, ${wm(meta.path, 1280)} 1280w`;
      img.src = wm(meta.path, 1280);
      const done = () => img.classList.add("loaded");
      img.addEventListener("load", done, { once: true });
      img.addEventListener(
        "error",
        () => {
          img.remove();
          const host = img.closest(".tile, .news-hero, .credits-media");
          if (host) host.classList.add("no-img");
        },
        { once: true },
      );
      if (img.complete && img.naturalWidth) done();
    });
    const list = $("photoCredits");
    if (list) {
      list.innerHTML = Object.values(IMAGES)
        .map(
          (m) =>
            `<li><a href="${wmPage(m.path)}" target="_blank" rel="noopener">${esc(m.title)}</a> — ${esc(m.author)}, <a href="${m.licenseUrl}" target="_blank" rel="noopener">${esc(m.license)}</a>, via Wikimedia Commons</li>`,
        )
        .join("");
    }
  }

  /* ---------- DOM ---------- */
  const templateHint = $("templateHint");
  const templateBtn = $("templateBtn");
  const templateBtnLabel = $("templateBtnLabel");
  const templateBtnSub = $("templateBtnSub");
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
  const downloadBtn = $("downloadBtn");
  const statusEl = $("status");
  const resultsEl = $("results");
  const zipToggle = $("zipToggle");
  const outputSpec = $("outputSpec");
  const idFormat = $("idFormat");
  const idMaxKb = $("idMaxKb");
  const previewGrid = $("previewGrid");
  const previewEmptyState = $("previewEmptyState");
  const stepper = $("stepper");
  const dockCta = $("dockCta");
  const dockCtaIcon = $("dockCtaIcon");
  const dockCtaLabel = $("dockCtaLabel");

  /* ---------- state ---------- */
  const state = {
    templateKey: "",
    results: [],
    downloaded: false,
    lastSlot: null,
    category: "all",
    search: "",
  };
  const defaultView = (mode) => ({ zoom: 1, px: 0, py: 0, rot: 0, mode });
  const slots = new Map(); // key → slot record (photo, sign, extras)
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
  function geom(iw, ih, W, H, view) {
    const swap = view.rot % 180 !== 0;
    const rw = swap ? ih : iw;
    const rh = swap ? iw : ih;
    const base =
      view.mode === "fill"
        ? Math.max(W / rw, H / rh)
        : Math.min(W / rw, H / rh);
    const s = base * view.zoom;
    const dw = rw * s;
    const dh = rh * s;
    const overX = Math.max(0, dw - W);
    const overY = Math.max(0, dh - H);
    const dx = (W - dw) / 2 + (view.px * overX) / 2;
    const dy = (H - dh) / 2 + (view.py * overY) / 2;
    return { s, dw, dh, dx, dy, overX, overY };
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

  /* ---------- signature / ink clean-up ---------- */
  function cleanSignature(canvas) {
    const ctx = canvas.getContext("2d");
    const { width: W, height: H } = canvas;
    const data = ctx.getImageData(0, 0, W, H);
    const p = data.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4)
      hist[((p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000) | 0]++;
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
    return new File([pdf.output("blob")], filename, {
      type: "application/pdf",
    });
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
  document.addEventListener("dragover", (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files"))
      e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault();
  });

  /* ---------- template spec ---------- */
  function currentSpec() {
    const key = state.templateKey;
    if (!key || !TEMPLATES[key]) return null;
    if (TEMPLATES[key].custom) {
      const w = clamp(parseInt(customW.value, 10) || 200, 16, 4000);
      const h = clamp(parseInt(customH.value, 10) || 240, 16, 4000);
      const sw = clamp(parseInt(customSW.value, 10) || 240, 16, 4000);
      const sh = clamp(parseInt(customSH.value, 10) || 80, 16, 4000);
      return {
        key,
        name: "Custom",
        org: "",
        category: "custom",
        custom: true,
        photo: { w, h, format: "jpeg" },
        sign: { w: sw, h: sh, format: "png" },
        extras: [],
      };
    }
    return { key, ...TEMPLATES[key], extras: TEMPLATES[key].extras || [] };
  }

  function slotDefs(spec) {
    if (!spec) return [];
    const defs = [
      {
        key: "photo",
        name: "Photo",
        icon: "i-photo",
        kind: "photo",
        required: true,
        spec: spec.photo,
        guide: true,
        bg: true,
        clean: false,
        defaultMode: "fill",
      },
      {
        key: "sign",
        name: "Signature",
        icon: "i-pen",
        kind: "sign",
        required: true,
        spec: spec.sign,
        guide: false,
        bg: false,
        clean: true,
        defaultMode: "fit",
        hint: "Photograph it on white paper — the paper is removed automatically.",
      },
    ];
    (spec.extras || []).forEach((e) => {
      defs.push({
        key: e.key,
        name: e.name,
        icon:
          e.key === "thumb"
            ? "i-thumb"
            : e.key === "postcard"
              ? "i-photo"
              : "i-pen",
        kind: "extra",
        required: false,
        spec: {
          w: e.w,
          h: e.h,
          format: e.format,
          minKb: e.minKb,
          maxKb: e.maxKb,
        },
        guide: !!e.guide,
        bg: e.key === "postcard",
        clean: e.key !== "postcard",
        defaultMode: e.mode || "fit",
        hint: e.hint,
      });
    });
    return defs;
  }

  const describeSize = (s) =>
    `${s.w}×${s.h} px · ${s.format.toUpperCase()}${s.maxKb ? ` · ${s.minKb ? s.minKb + "–" : "≤ "}${s.maxKb} KB` : ""}`;

  function describeSpec(spec) {
    if (!spec)
      return "Select a template to pre-fill dimensions and size limits.";
    const parts = [
      `Photo ${describeSize(spec.photo)}`,
      `Signature ${describeSize(spec.sign)}`,
    ];
    (spec.extras || []).forEach((e) =>
      parts.push(`${e.name} ${describeSize(e)}`),
    );
    let text = parts.join("  —  ");
    if (spec.note) text += `  ·  ${spec.note}`;
    if (spec.verify)
      text +=
        "  ·  Generic passport-size defaults — verify with the notification.";
    return text;
  }

  /* ---------- slot blocks (dynamic) ---------- */
  function createSlot(def) {
    const block = document.createElement("div");
    block.className = "upload-block";
    block.dataset.slot = def.key;
    block.innerHTML = `
      <div class="upload-head">
        <div class="upload-title"><svg class="ic"><use href="#${def.icon}"/></svg><span data-title>${esc(def.name)}</span></div>
        <span class="badge ${def.required ? "req" : ""}" data-badge>${def.required ? "required" : "optional"}</span>
      </div>
      ${def.hint ? `<p class="hint slot-hint" data-hint>${esc(def.hint)}</p>` : `<p class="hint slot-hint" data-hint hidden></p>`}
      <div class="dropzone ${def.kind === "extra" ? "compact" : ""}" data-drop tabindex="0" role="button" aria-label="Upload ${esc(def.name)}">
        <input type="file" data-input accept="image/*" hidden />
        <div class="dz-inner">
          <span class="dz-icon"><svg class="ic"><use href="#i-upload"/></svg></span>
          <span class="dz-text"><b>Drop ${def.kind === "photo" ? "a photo" : def.kind === "sign" ? "a signature" : "an image"}</b> or click to browse</span>
          <span class="dz-sub">JPG · PNG · WEBP · or paste with Ctrl/⌘+V</span>
        </div>
        <div class="dz-file" data-meta hidden>
          <img class="dz-thumb" data-thumb alt="" />
          <div class="dz-meta"><span class="dz-name" data-name></span><span class="dz-size mono" data-size></span></div>
          <button type="button" class="icon-btn" data-view title="Preview original" aria-label="Preview original"><svg class="ic"><use href="#i-eye"/></svg></button>
          <button type="button" class="icon-btn danger" data-clear title="Remove" aria-label="Remove"><svg class="ic"><use href="#i-x"/></svg></button>
        </div>
      </div>
      <div class="editor" data-editor hidden>
        <div class="editor-stage">
          <div class="editor-frame">
            <canvas class="editor-canvas" data-canvas></canvas>
            ${def.guide ? '<div class="editor-guides"><span class="g-head"></span></div>' : ""}
          </div>
        </div>
        <div class="editor-tools">
          <label class="range-label">Zoom</label>
          <input type="range" data-zoom min="1" max="3" step="0.01" value="1" aria-label="Zoom" />
          <div class="seg" role="group" aria-label="Fit mode">
            <button type="button" class="seg-btn ${def.defaultMode === "fill" ? "active" : ""}" data-mode="fill">Fill</button>
            <button type="button" class="seg-btn ${def.defaultMode === "fit" ? "active" : ""}" data-mode="fit">Fit</button>
          </div>
          <button type="button" class="icon-btn" data-rotate title="Rotate 90°" aria-label="Rotate 90 degrees"><svg class="ic"><use href="#i-rotate"/></svg></button>
          <button type="button" class="icon-btn" data-reset title="Reset" aria-label="Reset framing"><svg class="ic"><use href="#i-reset"/></svg></button>
        </div>
      </div>
      <div class="row-3">
        <div class="field">
          <label>Output format</label>
          <div class="select-wrap"><select data-format aria-label="Output format for ${esc(def.name)}">
            <option value="jpeg">JPEG</option><option value="jpg">JPG</option><option value="png">PNG</option><option value="pdf">PDF</option>
          </select></div>
        </div>
        <div class="field">
          <label>Max size (KB)</label>
          <input type="number" data-maxkb min="2" max="10240" placeholder="auto" aria-label="Maximum size in KB for ${esc(def.name)}" />
        </div>
        <div class="field">
          ${
            def.bg
              ? `<label>Background</label>
            <div class="swatches" data-swatches>
              <button type="button" class="swatch active" data-color="#ffffff" style="--c:#ffffff" title="White" aria-label="White background"></button>
              <button type="button" class="swatch" data-color="#dbeafe" style="--c:#dbeafe" title="Light blue" aria-label="Light blue background"></button>
              <button type="button" class="swatch" data-color="#f1f5f9" style="--c:#f1f5f9" title="Light grey" aria-label="Light grey background"></button>
              <label class="swatch custom" title="Custom colour"><input type="color" data-bgcustom value="#ffffff" aria-label="Custom background colour" /></label>
            </div>`
              : def.clean
                ? `<label>Clean-up</label>
            <label class="toggle"><input type="checkbox" data-clean checked /><span class="toggle-track"><span class="toggle-thumb"></span></span><span class="toggle-text">Remove paper background</span></label>`
                : ""
          }
        </div>
      </div>`;
    const q = (sel) => block.querySelector(sel);
    const frame = document.createElement("div");
    frame.className = "frame empty";
    frame.dataset.slot = def.key;
    frame.innerHTML = `<div class="frame-stage"><canvas data-out width="${def.spec.w}" height="${def.spec.h}"></canvas></div><div class="frame-label"><span data-flabel>${esc(def.name)}</span><span class="mono" data-fdims></span></div>`;
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
        segs: Array.from(block.querySelectorAll(".seg-btn")),
        fmt: q("[data-format]"),
        maxKb: q("[data-maxkb]"),
        clean: q("[data-clean]"),
        swatches: q("[data-swatches]"),
        bgCustom: q("[data-bgcustom]"),
        frame,
        out: frame.querySelector("[data-out]"),
        fdims: frame.querySelector("[data-fdims]"),
        flabel: frame.querySelector("[data-flabel]"),
        preview: null,
      },
    };
    if (def.clean) slot.el.out.getContext("2d", { willReadFrequently: true });
    wireSlot(slot);
    return slot;
  }

  function wireSlot(slot) {
    const { el } = slot;
    setupDropzone(el.drop, el.input, (files) => setSlotFile(slot, files[0]));
    el.drop.addEventListener("pointerenter", () => (state.lastSlot = slot.key));
    el.drop.addEventListener("focus", () => (state.lastSlot = slot.key));
    el.block.querySelector("[data-view]").addEventListener("click", (e) => {
      e.stopPropagation();
      openViewer(slot.file, `${slot.def.name} (original)`);
    });
    el.block.querySelector("[data-clear]").addEventListener("click", (e) => {
      e.stopPropagation();
      clearSlot(slot);
    });
    // editor interactions
    let dragging = false,
      lx = 0,
      ly = 0;
    el.canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.canvas.setPointerCapture(e.pointerId);
    });
    el.canvas.addEventListener("pointermove", (e) => {
      if (!dragging || !slot.bmp) return;
      const g = geom(slot.bmp.w, slot.bmp.h, slot.cssW, slot.cssH, slot.view);
      const dx = e.clientX - lx,
        dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      if (g.overX > 0)
        slot.view.px = clamp(slot.view.px + (dx * 2) / g.overX, -1, 1);
      if (g.overY > 0)
        slot.view.py = clamp(slot.view.py + (dy * 2) / g.overY, -1, 1);
      drawEditor(slot);
      renderLive();
    });
    const stop = () => (dragging = false);
    el.canvas.addEventListener("pointerup", stop);
    el.canvas.addEventListener("pointercancel", stop);
    el.canvas.addEventListener(
      "wheel",
      (e) => {
        if (!slot.bmp) return;
        e.preventDefault();
        slot.view.zoom = clamp(
          slot.view.zoom - Math.sign(e.deltaY) * 0.08,
          1,
          3,
        );
        drawEditor(slot);
        renderLive();
      },
      { passive: false },
    );
    el.zoom.addEventListener("input", () => {
      slot.view.zoom = parseFloat(el.zoom.value);
      drawEditor(slot);
      renderLive();
    });
    el.block.querySelector("[data-rotate]").addEventListener("click", () => {
      slot.view.rot = (slot.view.rot + 90) % 360;
      drawEditor(slot);
      renderLive();
    });
    el.block.querySelector("[data-reset]").addEventListener("click", () => {
      slot.view = defaultView(slot.view.mode);
      drawEditor(slot);
      renderLive();
    });
    el.segs.forEach((btn) =>
      btn.addEventListener("click", () => {
        slot.view.mode = btn.dataset.mode;
        slot.view.px = slot.view.py = 0;
        el.segs.forEach((b) => b.classList.toggle("active", b === btn));
        drawEditor(slot);
        renderLive();
      }),
    );
    if (el.swatches) {
      el.swatches.querySelectorAll(".swatch[data-color]").forEach((sw) =>
        sw.addEventListener("click", () => {
          slot.bg = sw.dataset.color;
          el.swatches
            .querySelectorAll(".swatch")
            .forEach((b) => b.classList.toggle("active", b === sw));
          drawEditor(slot);
          renderLive();
        }),
      );
      el.bgCustom.addEventListener("input", () => {
        slot.bg = el.bgCustom.value;
        el.swatches
          .querySelectorAll(".swatch")
          .forEach((b) =>
            b.classList.toggle("active", b === el.bgCustom.parentElement),
          );
        drawEditor(slot);
        renderLive();
      });
    }
    if (el.clean) el.clean.addEventListener("change", () => renderLive());
    [el.fmt, el.maxKb].forEach((c) =>
      c.addEventListener("change", invalidateResults),
    );
  }

  function applySlotSpec(slot, def, resetOutputs) {
    slot.def = def;
    slot.el.title.textContent = def.name;
    slot.el.flabel.textContent = def.name;
    slot.el.badge.textContent = def.required ? "required" : "optional";
    slot.el.badge.classList.toggle("req", def.required);
    if (def.hint) {
      slot.el.hint.textContent = def.hint;
      slot.el.hint.hidden = false;
    } else slot.el.hint.hidden = true;
    if (resetOutputs) {
      slot.el.fmt.value = def.spec.format || "jpeg";
      slot.el.maxKb.value = def.spec.maxKb || "";
      slot.el.maxKb.placeholder = def.spec.maxKb
        ? String(def.spec.maxKb)
        : "auto";
      if (!slot.file) {
        slot.view = defaultView(def.defaultMode);
        slot.el.segs.forEach((b) =>
          b.classList.toggle("active", b.dataset.mode === def.defaultMode),
        );
      }
    }
  }

  function syncSlots(resetOutputs) {
    const spec = currentSpec();
    const defs = slotDefs(spec);
    const keep = new Set(defs.map((d) => d.key));
    // remove slots no longer in the template (never photo/sign)
    for (const [key, slot] of Array.from(slots)) {
      if (!keep.has(key)) {
        if (slot.url) URL.revokeObjectURL(slot.url);
        slot.el.block.remove();
        slot.el.frame.remove();
        if (slot.el.preview) slot.el.preview.remove();
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
    if (!defs.length) {
      // no template yet: keep photo + signature visible so users can upload first
      const base = slotDefs({
        photo: { w: 200, h: 240, format: "jpeg" },
        sign: { w: 240, h: 80, format: "png" },
        extras: [],
      });
      base.forEach((def) => {
        let slot = slots.get(def.key);
        if (!slot) {
          slot = createSlot(def);
          slots.set(def.key, slot);
          applySlotSpec(slot, def, true);
        }
        slotsHost.appendChild(slot.el.block);
        outputFrames.appendChild(slot.el.frame);
      });
    }
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
    const maxW = Math.max(120, Math.min((stage.clientWidth || 360) - 20, 420));
    const maxH = 320;
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
    renderFrame(
      el.canvas,
      slot.bmp,
      Math.round(cw * dpr),
      Math.round(ch * dpr),
      slot.view,
      slot.bg,
    );
    slot.cssW = cw;
    slot.cssH = ch;
    el.zoom.value = slot.view.zoom;
    el.zoom.style.setProperty("--fill", ((slot.view.zoom - 1) / 2) * 100 + "%");
  }

  let liveTimer = null;
  function renderLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const spec = currentSpec();
      slots.forEach((slot) => {
        const dims = slotSpecDims(slot);
        const W = dims.w,
          H = dims.h;
        slot.el.fdims.textContent = `${W} × ${H} px`;
        slot.el.frame.classList.toggle("empty", !slot.bmp);
        if (!slot.bmp) {
          slot.el.out.width = W;
          slot.el.out.height = H;
          const ctx = slot.el.out.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = "#94a3b8";
          ctx.font = `${Math.max(10, Math.min(W, H) / 9)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(slot.def.name.toLowerCase(), W / 2, H / 2);
          return;
        }
        renderFrame(slot.el.out, slot.bmp, W, H, slot.view, slot.bg);
        if (slot.el.clean && slot.el.clean.checked) cleanSignature(slot.el.out);
      });
      outputSpec.textContent = spec
        ? `${spec.photo.w}×${spec.photo.h} / ${spec.sign.w}×${spec.sign.h}`
        : "no template";
      updateReadiness();
    }, 40);
  }

  async function setSlotFile(slot, file) {
    if (!file) return;
    if (!isImage(file)) {
      toast("Please choose an image file (JPG, PNG or WEBP).", "err");
      return;
    }
    clearSlot(slot, true);
    slot.file = file;
    slot.el.name.textContent = file.name;
    slot.el.size.textContent = formatFileSize(file.size);
    slot.el.meta.hidden = false;
    slot.el.drop.classList.add("has-file");
    try {
      const { bmp, url } = await loadBitmap(file);
      if (slot.file !== file) return;
      slot.bmp = bmp;
      slot.url = url;
      slot.el.thumb.src = url;
    } catch (err) {
      toast(err.message, "err");
      clearSlot(slot);
      return;
    }
    slot.view = defaultView(slot.view.mode);
    drawEditor(slot);
    renderLive();
    updatePreviewCards();
    invalidateResults();
    layoutChanged();
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
    renderLive();
    if (!silent) {
      updatePreviewCards();
      invalidateResults();
      layoutChanged();
    }
  }

  /* ---------- ID document slot ---------- */
  const idEls = {
    drop: $("idDrop"),
    input: $("idFile"),
    meta: $("idMeta"),
    thumb: $("idThumb"),
    name: $("idName"),
    size: $("idSize"),
  };
  async function setIdFile(file) {
    if (!file) return;
    clearId(true);
    idSlot.file = file;
    idEls.name.textContent = file.name;
    idEls.size.textContent = formatFileSize(file.size);
    idEls.meta.hidden = false;
    idEls.drop.classList.add("has-file");
    if (isImage(file)) {
      try {
        const { bmp, url } = await loadBitmap(file);
        if (idSlot.file !== file) return;
        idSlot.bmp = bmp;
        idSlot.url = url;
        idEls.thumb.src = url;
      } catch (err) {
        toast(err.message, "err");
        clearId();
        return;
      }
    } else idEls.thumb.src = placeholderThumb(isPdf(file) ? "PDF" : "FILE");
    updatePreviewCards();
    invalidateResults();
    layoutChanged();
  }
  function clearId(silent) {
    if (idSlot.url) URL.revokeObjectURL(idSlot.url);
    idSlot.file = idSlot.bmp = idSlot.url = null;
    idEls.meta.hidden = true;
    idEls.drop.classList.remove("has-file");
    idEls.thumb.removeAttribute("src");
    if (!silent) {
      updatePreviewCards();
      invalidateResults();
      layoutChanged();
    }
  }
  setupDropzone(idEls.drop, idEls.input, (files) => setIdFile(files[0]));
  idEls.drop.addEventListener("pointerenter", () => (state.lastSlot = "id"));
  document.querySelector('[data-view="id"]').addEventListener("click", (e) => {
    e.stopPropagation();
    openViewer(idSlot.file, "ID document");
  });
  document.querySelector('[data-clear="id"]').addEventListener("click", (e) => {
    e.stopPropagation();
    clearId();
  });

  // clipboard paste → photo / signature / focused slot
  document.addEventListener("paste", (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const item = items.find(
      (i) => i.kind === "file" && i.type.startsWith("image/"),
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    let target = state.lastSlot && slots.get(state.lastSlot);
    if (!target)
      target = !slots.get("photo").file
        ? slots.get("photo")
        : slots.get("sign");
    const named = new File(
      [file],
      `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`,
      { type: file.type },
    );
    setSlotFile(target, named);
    toast(`Pasted image into ${target.def.name}`, "ok");
    scrollToEl("#studio");
  });

  /* ---------- readiness, stepper, dock ---------- */
  function requiredMissing() {
    const missing = [];
    slots.forEach((slot) => {
      if (slot.def.required && !slot.bmp) missing.push(slot.def.name);
    });
    return missing;
  }
  function updateReadiness() {
    const spec = currentSpec();
    const chips = [];
    chips.push(
      `<span class="chip ${spec ? "ok" : ""}">${spec ? "✓ " + esc(spec.name) : "no template"}</span>`,
    );
    slots.forEach((slot) => {
      if (!slot.def.required && !slot.bmp) return;
      chips.push(
        `<span class="chip ${slot.bmp ? "ok" : ""}">${slot.bmp ? "✓ " : ""}${esc(slot.def.name)}${slot.bmp ? "" : " · missing"}</span>`,
      );
    });
    if (idSlot.file) chips.push(`<span class="chip ok">✓ ID document</span>`);
    readinessEl.innerHTML = chips.join("");
    updateStepper();
    updateDock();
  }
  function updateStepper() {
    if (!stepper) return;
    const hasTemplate = !!currentSpec();
    const filesOk =
      hasTemplate && requiredMissing().length === 0 && slots.size > 0;
    const processed = state.results.length > 0;
    const states = [
      hasTemplate ? "done" : "active",
      filesOk ? "done" : hasTemplate ? "active" : "",
      processed ? "done" : filesOk ? "active" : "",
      state.downloaded ? "done" : processed ? "active" : "",
    ];
    stepper.querySelectorAll(".step").forEach((li, i) => {
      li.classList.toggle("done", states[i] === "done");
      li.classList.toggle("active", states[i] === "active");
    });
  }
  if (stepper)
    stepper.addEventListener("click", (e) => {
      const li = e.target.closest(".step");
      if (!li) return;
      const n = +li.dataset.step;
      if (n === 1) {
        scrollToEl("#templateField", { offset: -100 });
        setTimeout(openPicker, 500);
      } else if (n === 2) {
        const first =
          Array.from(slots.values()).find((s) => !s.bmp) || slots.get("photo");
        scrollToEl(first.el.block, { offset: -90 });
      } else if (n === 3) {
        const first = Array.from(slots.values()).find((s) => s.bmp);
        scrollToEl(first ? first.el.editor : slotsHost, { offset: -90 });
      } else scrollToEl(".studio-output", { offset: -90 });
    });

  function dockState() {
    if (state.results.length) return "download";
    if (currentSpec() && requiredMissing().length === 0 && slots.size)
      return "process";
    return "studio";
  }
  function updateDock() {
    if (!dockCta) return;
    const s = dockState();
    const map = {
      download: ["#i-download", "Download"],
      process: ["#i-sparkle", "Process"],
      studio: ["#i-sparkle", "Studio"],
    };
    dockCtaIcon.querySelector("use").setAttribute("href", map[s][0]);
    dockCtaLabel.textContent = map[s][1];
    dockCta.setAttribute(
      "aria-label",
      s === "studio"
        ? "Open the Studio"
        : s === "process"
          ? "Process files"
          : "Download files",
    );
    dockCta.classList.toggle("pulse", s !== "studio");
  }
  if (dockCta)
    dockCta.addEventListener("click", () => {
      const s = dockState();
      if (s === "download") downloadAll();
      else if (s === "process") processAll();
      else scrollToEl("#studio");
    });

  /* ---------- template selection ---------- */
  function selectTemplate(key, opts = {}) {
    if (!TEMPLATES[key]) key = "";
    const changed = key !== state.templateKey;
    state.templateKey = key;
    const spec = currentSpec();
    const t = key ? TEMPLATES[key] : null;
    templateBtnLabel.textContent = t ? t.name : "Choose a template…";
    templateBtnSub.textContent = t
      ? t.custom
        ? "Enter your own pixel sizes"
        : `${catName(t.category)} · ${t.org}`
      : "Search 40+ exams and documents";
    templateHint.textContent = describeSpec(spec);
    customBox.hidden = !(t && t.custom);
    document
      .querySelectorAll(".template-card")
      .forEach((c) => c.classList.toggle("selected", c.dataset.key === key));
    updateAnatomy(spec);
    syncSlots(changed && !!t && !t.custom);
    if (changed) invalidateResults();
    try {
      localStorage.setItem("govforms-template", key);
    } catch (e) {}
    renderPickerList(templatePopSearch.value);
    if (opts.toast && t) toast(`${t.name} loaded into the Studio`, "ok");
    if (opts.scroll) scrollToEl("#studio");
    layoutChanged();
  }

  function updateAnatomy(spec) {
    const p = spec ? spec.photo : { w: 200, h: 240, maxKb: 50, format: "jpeg" };
    const s = spec ? spec.sign : { w: 240, h: 80 };
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set("anWidth", `${p.w} px`);
    set("anHeight", `${p.h} px`);
    set("anSig", `${s.w} × ${s.h} px`);
    set(
      "anKb",
      p.maxKb
        ? `≤ ${p.maxKb} KB as ${(p.format || "jpeg").toUpperCase()}`
        : `${(p.format || "jpeg").toUpperCase()}, no fixed limit`,
    );
  }
  [customW, customH, customSW, customSH].forEach((el) =>
    el.addEventListener("input", () => {
      templateHint.textContent = describeSpec(currentSpec());
      updateAnatomy(currentSpec());
      syncSlots(false);
      invalidateResults();
    }),
  );

  /* ---------- picker (searchable combobox) ---------- */
  let pickerOpen = false,
    pickerFocus = -1;
  function pickerItems() {
    return Array.from(templatePopList.querySelectorAll(".picker-item"));
  }
  function renderPickerList(filter = "") {
    const f = filter.trim().toLowerCase();
    const groups = [...CATEGORIES.map((c) => c.id), "custom"];
    let html = "";
    let any = false;
    groups.forEach((cat) => {
      const entries = Object.entries(TEMPLATES).filter(
        ([, t]) => (t.category || "custom") === cat && matches(t, f),
      );
      if (!entries.length) return;
      any = true;
      html += `<div class="picker-group">${esc(catName(cat))}</div>`;
      entries.forEach(([key, t]) => {
        const dims = t.custom
          ? "any size"
          : `${t.photo.w}×${t.photo.h} · ${t.sign.w}×${t.sign.h}`;
        html += `<button type="button" class="picker-item ${key === state.templateKey ? "selected" : ""}" role="option" data-key="${key}" aria-selected="${key === state.templateKey}"><span>${esc(t.name)}</span><small>${dims}</small></button>`;
      });
    });
    templatePopList.innerHTML = any
      ? html
      : '<div class="picker-empty">No matches. Try “SSC”, “bank” or “passport”.</div>';
    pickerFocus = -1;
  }
  function matches(t, f) {
    if (!f) return true;
    const hay = [t.name, t.org, catName(t.category), ...(t.tags || [])]
      .join(" ")
      .toLowerCase();
    return f.split(/\s+/).every((w) => hay.includes(w));
  }
  function openPicker() {
    if (pickerOpen) return;
    pickerOpen = true;
    templatePop.hidden = false;
    templateBtn.setAttribute("aria-expanded", "true");
    renderPickerList(templatePopSearch.value);
    setTimeout(() => templatePopSearch.focus(), 30);
  }
  function closePicker() {
    if (!pickerOpen) return;
    pickerOpen = false;
    templatePop.hidden = true;
    templateBtn.setAttribute("aria-expanded", "false");
  }
  templateBtn.addEventListener("click", () =>
    pickerOpen ? closePicker() : openPicker(),
  );
  templatePopSearch.addEventListener("input", () =>
    renderPickerList(templatePopSearch.value),
  );
  templatePopList.addEventListener("click", (e) => {
    const item = e.target.closest(".picker-item");
    if (!item) return;
    selectTemplate(item.dataset.key, { toast: false });
    closePicker();
    templateBtn.focus();
  });
  templatePop.addEventListener("keydown", (e) => {
    const items = pickerItems();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      pickerFocus =
        (pickerFocus + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
        items.length;
      items.forEach((it, i) => it.classList.toggle("focus", i === pickerFocus));
      items[pickerFocus].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = pickerFocus >= 0 ? items[pickerFocus] : items[0];
      if (target) {
        selectTemplate(target.dataset.key);
        closePicker();
        templateBtn.focus();
      }
    } else if (e.key === "Escape") {
      closePicker();
      templateBtn.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (pickerOpen && !e.target.closest(".picker")) closePicker();
  });

  /* ---------- gallery (templates section) ---------- */
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

  function buildGallery() {
    const grid = $("templateGrid");
    if (!grid) return;
    Object.entries(TEMPLATES).forEach(([key, t]) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "template-card card";
      card.dataset.key = key;
      card.dataset.cat = t.category || "custom";
      card.dataset.search = [
        t.name,
        t.org,
        catName(t.category),
        ...(t.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      if (t.custom) {
        card.innerHTML = `
          <div class="tc-head"><div><div class="tc-name">${esc(t.name)}</div><div class="tc-org">${esc(t.org)}</div></div><span class="tc-cat">any</span></div>
          <svg class="tc-svg" viewBox="0 0 240 150" aria-hidden="true">
            <rect class="r" x="40" y="20" width="70" height="90" rx="4" stroke-dasharray="6 5"/>
            <rect class="r s" x="130" y="50" width="80" height="30" rx="3" stroke-dasharray="6 5"/>
            <text x="75" y="135" text-anchor="middle">W × H</text><text x="170" y="105" text-anchor="middle">W × H</text>
          </svg>
          <div class="tc-meta"><span class="chip accent">any size</span><span class="chip">any format</span></div>`;
      } else {
        const chips = [
          `<span class="chip accent">${t.photo.format.toUpperCase()} photo</span>`,
          `<span class="chip">${t.sign.format.toUpperCase()} sign</span>`,
        ];
        if (t.photo.maxKb)
          chips.push(`<span class="chip">≤ ${t.photo.maxKb} KB</span>`);
        if (t.extras && t.extras.length)
          chips.push(`<span class="chip">+${t.extras.length} extra</span>`);
        if (t.verify) chips.push(`<span class="chip warn">verify sizes</span>`);
        card.innerHTML = `
          <div class="tc-head"><div><div class="tc-name">${esc(t.name)}</div><div class="tc-org">${esc(t.org)}</div></div><span class="tc-cat">${esc(catName(t.category))}</span></div>
          ${templateCardSVG(t)}
          <div class="tc-meta">${chips.join("")}</div>`;
      }
      card.addEventListener("click", () =>
        selectTemplate(key, { scroll: true, toast: true }),
      );
      grid.appendChild(card);
    });
    const stat = $("statTemplates");
    if (stat) stat.dataset.count = String(Object.keys(TEMPLATES).length - 1);
    buildChips();
    filterGallery();
  }

  function buildChips() {
    const host = $("catChips");
    if (!host) return;
    const counts = {};
    Object.values(TEMPLATES).forEach((t) => {
      const c = t.category || "custom";
      counts[c] = (counts[c] || 0) + 1;
    });
    const total = Object.keys(TEMPLATES).length;
    const chips = [
      { id: "all", name: "All", n: total },
      ...CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        n: counts[c.id] || 0,
      })),
    ];
    host.innerHTML = chips
      .map(
        (c) =>
          `<button type="button" class="chip-btn ${c.id === state.category ? "active" : ""}" role="tab" data-cat="${c.id}" aria-selected="${c.id === state.category}">${esc(c.name)} <span class="n">${c.n}</span></button>`,
      )
      .join("");
    host.addEventListener("click", (e) => {
      const b = e.target.closest(".chip-btn");
      if (!b) return;
      setCategory(b.dataset.cat);
    });
  }
  function setCategory(cat) {
    state.category = cat;
    document.querySelectorAll("#catChips .chip-btn").forEach((b) => {
      const on = b.dataset.cat === cat;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    filterGallery();
  }
  function filterGallery() {
    const f = state.search.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll(".template-card").forEach((card) => {
      const catOk =
        state.category === "all" ||
        card.dataset.cat === state.category ||
        (card.dataset.cat === "custom" && !f);
      const words = f.split(/\s+/).filter(Boolean);
      const searchOk = words.every((w) => card.dataset.search.includes(w));
      const show = catOk && searchOk;
      card.classList.toggle("hidden-by-filter", !show);
      if (show) shown++;
    });
    const count = $("templateCount");
    if (count) count.textContent = `${shown} template${shown === 1 ? "" : "s"}`;
    const empty = $("templateEmpty");
    if (empty) empty.hidden = shown > 0;
    layoutChanged();
  }
  const templateSearch = $("templateSearch");
  if (templateSearch)
    templateSearch.addEventListener(
      "input",
      debounce(() => {
        state.search = templateSearch.value;
        filterGallery();
      }, 80),
    );
  const useCustomBtn = $("useCustomBtn");
  if (useCustomBtn)
    useCustomBtn.addEventListener("click", () =>
      selectTemplate("custom", { scroll: true, toast: true }),
    );
  // showcase tiles → category filter
  document.querySelectorAll(".tile[data-cat]").forEach((tile) =>
    tile.addEventListener("click", () => {
      setCategory(tile.dataset.cat);
      if (templateSearch) {
        templateSearch.value = "";
        state.search = "";
        filterGallery();
      }
    }),
  );

  /* ---------- preview cards ---------- */
  function ensurePreviewCard(slot) {
    if (slot.el.preview) return slot.el.preview;
    const card = document.createElement("div");
    card.className = "preview-card card";
    card.innerHTML = `
      <div class="preview-compare">
        <div class="pc-side"><span class="pc-tag">Original</span><div class="pc-img" data-before></div></div>
        <div class="pc-side"><span class="pc-tag accent">Processed</span><div class="pc-img" data-after><span class="pc-empty">Process to compare</span></div></div>
      </div>
      <div class="preview-info">
        <div class="preview-title"><svg class="ic"><use href="#${slot.def.icon}"/></svg> <span data-ptitle>${esc(slot.def.name)}</span></div>
        <div class="size-row"><span class="size-label">Original</span><span class="size-value mono" data-sbefore>—</span></div>
        <div class="bar"><i data-bbefore></i></div>
        <div class="size-row"><span class="size-label">After processing</span><span class="size-value mono" data-safter>—</span></div>
        <div class="bar"><i class="after" data-bafter></i></div>
        <div class="size-reduction" data-red hidden></div>
      </div>`;
    slot.el.preview = card;
    return card;
  }
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
  let idPreviewCard = null;
  function updatePreviewCards() {
    let any = false;
    slots.forEach((slot) => {
      const card = ensurePreviewCard(slot);
      if (!slot.file) {
        card.remove();
        return;
      }
      any = true;
      previewGrid.appendChild(card);
      card.querySelector("[data-ptitle]").textContent = slot.def.name;
      setPreviewImage(
        card.querySelector("[data-before]"),
        slot.url,
        slot.def.name,
      );
      card.querySelector("[data-sbefore]").textContent = formatFileSize(
        slot.file.size,
      );
      const r = state.results.find((x) => x.key === slot.key);
      if (!r) {
        card.querySelector("[data-safter]").textContent = "—";
        card.querySelector("[data-bbefore]").style.width = "100%";
        card.querySelector("[data-bafter]").style.width = "0%";
        card.querySelector("[data-red]").hidden = true;
        setPreviewImage(card.querySelector("[data-after]"), null);
      }
    });
    if (idSlot.file) {
      any = true;
      if (!idPreviewCard) {
        idPreviewCard = document.createElement("div");
        idPreviewCard.className = "preview-card card";
        idPreviewCard.innerHTML = `
          <div class="preview-compare single"><div class="pc-side"><span class="pc-tag">Document</span><div class="pc-img" data-before></div></div></div>
          <div class="preview-info">
            <div class="preview-title"><svg class="ic"><use href="#i-id"/></svg> ID document</div>
            <div class="size-row"><span class="size-label">File size</span><span class="size-value mono" data-sbefore>—</span></div>
            <div class="size-row"><span class="size-label">Output</span><span class="size-value mono" data-out>—</span></div>
          </div>`;
      }
      previewGrid.appendChild(idPreviewCard);
      const box = idPreviewCard.querySelector("[data-before]");
      if (idSlot.url) setPreviewImage(box, idSlot.url, "ID document");
      else
        box.innerHTML = `<span class="pc-doc">📄 ${esc(idSlot.file.name)}</span>`;
      idPreviewCard.querySelector("[data-sbefore]").textContent =
        formatFileSize(idSlot.file.size);
      const r = state.results.find((x) => x.key === "id");
      idPreviewCard.querySelector("[data-out]").textContent = r
        ? `${r.file.name} · ${formatFileSize(r.file.size)}`
        : "—";
    } else if (idPreviewCard) idPreviewCard.remove();
    previewEmptyState.hidden = any;
    layoutChanged();
  }
  function showAfter(slot, file) {
    const card = ensurePreviewCard(slot);
    const before = slot.file.size;
    const after = file.size;
    card.querySelector("[data-safter]").textContent = formatFileSize(after);
    const max = Math.max(before, after, 1);
    requestAnimationFrame(() => {
      card.querySelector("[data-bbefore]").style.width =
        (before / max) * 100 + "%";
      card.querySelector("[data-bafter]").style.width =
        (after / max) * 100 + "%";
    });
    const red = card.querySelector("[data-red]");
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
    const box = card.querySelector("[data-after]");
    if (file.type === "application/pdf")
      box.innerHTML = `<span class="pc-doc">PDF · ${formatFileSize(after)}</span>`;
    else {
      const url = URL.createObjectURL(file);
      setPreviewImage(box, url, slot.def.name + " processed");
      box.querySelector("img").onload = () => URL.revokeObjectURL(url);
    }
  }

  /* ---------- processing ---------- */
  function invalidateResults() {
    if (!state.results.length) return;
    state.results = [];
    state.downloaded = false;
    resultsEl.innerHTML = "";
    downloadBtn.disabled = true;
    setStatus(
      statusEl,
      "Inputs changed — process again to refresh the output.",
    );
    updateReadiness();
  }
  const extFor = (fmt) =>
    fmt === "jpg" ? "jpg" : fmt === "jpeg" ? "jpeg" : fmt;
  const baseName = (slot) =>
    slot.key === "photo"
      ? "photo"
      : slot.key === "sign"
        ? "signature"
        : slot.key;

  async function encodeSlot(slot) {
    const dims = slotSpecDims(slot);
    const fmt = slot.el.fmt.value;
    const maxBytes = kbOf(slot.el.maxKb);
    const canvas = document.createElement("canvas");
    if (slot.def.clean) canvas.getContext("2d", { willReadFrequently: true });
    renderFrame(canvas, slot.bmp, dims.w, dims.h, slot.view, slot.bg);
    if (slot.el.clean && slot.el.clean.checked) cleanSignature(canvas);
    const base = `${baseName(slot)}_${dims.w}x${dims.h}`;
    if (fmt === "pdf") {
      const file = await canvasToPDF(canvas, `${base}.pdf`);
      return {
        key: slot.key,
        label: slot.def.name,
        file,
        over: !!maxBytes && file.size > maxBytes,
      };
    }
    const mime = fmt === "png" ? "image/png" : "image/jpeg";
    const { blob, over } = await encodeUnderLimit(canvas, mime, maxBytes);
    const file = new File([blob], `${base}.${extFor(fmt)}`, { type: mime });
    return { key: slot.key, label: slot.def.name, file, over };
  }

  async function processId() {
    if (!idSlot.file) return null;
    const wantPdf = idFormat.value === "pdf";
    const maxBytes = kbOf(idMaxKb);
    if (idSlot.bmp) {
      if (wantPdf) {
        const c = document.createElement("canvas");
        renderFrame(
          c,
          idSlot.bmp,
          idSlot.bmp.w,
          idSlot.bmp.h,
          defaultView("fill"),
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
      if (maxBytes && idSlot.file.size > maxBytes) {
        const c = document.createElement("canvas");
        renderFrame(
          c,
          idSlot.bmp,
          idSlot.bmp.w,
          idSlot.bmp.h,
          defaultView("fill"),
          "#ffffff",
        );
        const { blob, over } = await encodeUnderLimit(
          c,
          "image/jpeg",
          maxBytes,
        );
        return {
          key: "id",
          file: new File([blob], "id_document.jpg", { type: "image/jpeg" }),
          over,
          label: "ID document",
        };
      }
    }
    const name = /\.[a-z0-9]+$/i.test(idSlot.file.name)
      ? idSlot.file.name
      : idSlot.file.name + ".bin";
    const file = new File([idSlot.file], "id_" + name, {
      type: idSlot.file.type,
    });
    return {
      key: "id",
      file,
      over: !!maxBytes && file.size > maxBytes,
      label: "ID document",
    };
  }

  function renderResults() {
    resultsEl.innerHTML = "";
    state.results.forEach((r, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = i * 0.08 + "s";
      const icon = r.file.type === "application/pdf" ? "#i-pdf" : "#i-photo";
      li.innerHTML = `<svg class="ic"><use href="${icon}"/></svg><span class="r-name" title="${esc(r.file.name)}">${esc(r.file.name)}</span><span class="r-size mono ${r.over ? "over" : ""}">${formatFileSize(r.file.size)}${r.over ? " ⚠" : ""}</span>`;
      const mk = (icon2, title, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "icon-btn";
        b.title = title;
        b.setAttribute("aria-label", `${title} ${r.file.name}`);
        b.innerHTML = `<svg class="ic"><use href="${icon2}"/></svg>`;
        b.addEventListener("click", fn);
        return b;
      };
      li.appendChild(
        mk("#i-eye", "Preview", () => openViewer(r.file, r.file.name)),
      );
      li.appendChild(mk("#i-download", "Download", () => downloadFile(r.file)));
      resultsEl.appendChild(li);
    });
  }

  let processing = false;
  async function processAll() {
    if (processing) return;
    const spec = currentSpec();
    if (!spec) {
      setStatus(statusEl, "Choose a template first.", "err");
      scrollToEl("#templateField", { offset: -100 });
      openPicker();
      return;
    }
    const missing = requiredMissing();
    if (missing.length) {
      setStatus(statusEl, `Upload the ${missing.join(" and ")} first.`, "err");
      const first = Array.from(slots.values()).find(
        (s) => s.def.required && !s.bmp,
      );
      if (first) scrollToEl(first.el.block, { offset: -90 });
      return;
    }
    processing = true;
    processBtn.classList.add("loading");
    processBtn.disabled = true;
    if (dockCta) dockCta.classList.add("busy");
    setStatus(statusEl, "Processing on your device…", "busy");
    const t0 = performance.now();
    try {
      const out = [];
      for (const slot of slots.values()) {
        if (!slot.bmp) continue;
        out.push(await encodeSlot(slot));
      }
      const id = await processId();
      if (id) out.push(id);
      state.results = out;
      state.downloaded = false;
      renderResults();
      slots.forEach((slot) => {
        const r = out.find((x) => x.key === slot.key);
        if (r) showAfter(slot, r.file);
      });
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
        toast("Processing complete — ready to download", "ok");
      }
      updateReadiness();
      layoutChanged();
    } catch (err) {
      console.error(err);
      setStatus(statusEl, "Error: " + err.message, "err");
    } finally {
      processing = false;
      processBtn.classList.remove("loading");
      processBtn.disabled = false;
      if (dockCta) dockCta.classList.remove("busy");
    }
  }
  processBtn.addEventListener("click", processAll);

  async function downloadAll() {
    if (!state.results.length) return;
    try {
      if (zipToggle.checked && window.JSZip && state.results.length > 1) {
        setStatus(statusEl, "Zipping…", "busy");
        const zip = new JSZip();
        state.results.forEach((r) => zip.file(r.file.name, r.file));
        const blob = await zip.generateAsync({
          type: "blob",
          compression: "STORE",
        });
        downloadFile(
          new File([blob], `govforms_${state.templateKey || "files"}.zip`, {
            type: "application/zip",
          }),
        );
        setStatus(statusEl, "ZIP downloaded.", "ok");
      } else {
        for (const r of state.results) {
          downloadFile(r.file);
          await sleep(350);
        }
        setStatus(statusEl, "Files downloaded.", "ok");
      }
      state.downloaded = true;
      updateReadiness();
    } catch (err) {
      console.error(err);
      setStatus(statusEl, "Error: " + err.message, "err");
    }
  }
  downloadBtn.addEventListener("click", downloadAll);
  [idFormat, idMaxKb].forEach((el) =>
    el.addEventListener("change", invalidateResults),
  );

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
    document.dispatchEvent(new CustomEvent("govforms:modal", { detail: true }));
  }
  function closeViewer() {
    viewerBody.innerHTML = "";
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = null;
    viewerModal.classList.remove("active");
    document.dispatchEvent(
      new CustomEvent("govforms:modal", { detail: false }),
    );
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
      layoutChanged();
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
      meta.innerHTML = `<span class="mi-name" title="${esc(item.file.name)}">${esc(item.file.name)}</span><span class="mi-size mono">${formatFileSize(item.file.size)}</span>`;
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
    layoutChanged();
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
    if (!added)
      return setStatus(
        mergeStatus,
        "Only images and PDFs can be merged.",
        "err",
      );
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
        const pdf = await PDFLib.PDFDocument.load(await file.arrayBuffer(), {
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
        img = await merged.embedPng(await imageToPngBytes(file));
      }
      const { width, height } = img.scale(1);
      if (pageMode === "a4") {
        const page = merged.addPage(A4);
        const s = Math.min(
          (A4[0] - MARGIN * 2) / width,
          (A4[1] - MARGIN * 2) / height,
        );
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
    return merged.save();
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
    view: defaultView("fill"),
    fromStudio: false,
  };
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
      sheet.view,
      "#ffffff",
    );
    ctx.strokeStyle = "#9aa4b8";
    ctx.lineWidth = Math.max(1, pxPerMm * 0.12);
    ctx.setLineDash([pxPerMm * 1.2, pxPerMm * 1.2]);
    for (let r = 0; r < L.rows; r++)
      for (let c = 0; c < L.cols; c++) {
        const x = Math.round((L.ox + c * (L.cw + L.gap)) * pxPerMm);
        const y = Math.round((L.oy + r * (L.ch + L.gap)) * pxPerMm);
        ctx.drawImage(cell, x, y);
        if (sheetGuides.checked)
          ctx.strokeRect(x + 0.5, y + 0.5, cell.width - 1, cell.height - 1);
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
    layoutChanged();
  }
  [sheetPaper, sheetPhoto, sheetGap, sheetCW, sheetCH, sheetGuides].forEach(
    (el) => el.addEventListener("input", refreshSheet),
  );
  async function setSheetFile(file) {
    if (!isImage(file)) return toast("Please choose an image file.", "err");
    clearSheet(true);
    try {
      const { bmp, url } = await loadBitmap(file);
      Object.assign(sheet, {
        bmp,
        url,
        view: defaultView("fill"),
        fromStudio: false,
      });
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
    sheet.bmp = sheet.url = null;
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
    const photo = slots.get("photo");
    if (!photo || !photo.bmp) {
      toast("Upload a photo in the Studio first.", "warn");
      scrollToEl("#studio");
      return;
    }
    clearSheet(true);
    Object.assign(sheet, {
      bmp: photo.bmp,
      url: photo.url,
      view: { ...photo.view },
      fromStudio: true,
    });
    $("sheetThumb").src = photo.url;
    $("sheetName").textContent = photo.file.name + " (Studio framing)";
    $("sheetSize").textContent = formatFileSize(photo.file.size);
    $("sheetMeta").hidden = false;
    $("sheetDrop").classList.add("has-file");
    refreshSheet();
    toast("Using the Studio photo with its current framing", "ok");
  });
  document
    .querySelector('[data-clear="sheet"]')
    .addEventListener("click", (e) => {
      e.stopPropagation();
      clearSheet();
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
      if (kind === "pdf")
        downloadFile(
          await canvasToPDF(full, `photo_sheet_${stamp}.pdf`, {
            mmW: L.pw,
            mmH: L.ph,
            quality: 0.92,
          }),
        );
      else
        downloadFile(
          new File(
            [await canvasToBlob(full, "image/jpeg", 0.92)],
            `photo_sheet_${stamp}.jpg`,
            { type: "image/jpeg" },
          ),
        );
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
  const compBtn = $("compBtn"),
    compDownloadBtn = $("compDownloadBtn"),
    compStatus = $("compStatus");
  async function setCompFile(file) {
    if (!isImage(file)) return toast("Please choose an image file.", "err");
    clearComp(true);
    try {
      const { bmp, url } = await loadBitmap(file);
      Object.assign(comp, { file, bmp, url });
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
  document
    .querySelector('[data-clear="comp"]')
    .addEventListener("click", (e) => {
      e.stopPropagation();
      clearComp();
    });
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
      renderFrame(c, comp.bmp, w, h, defaultView("fill"), "#ffffff");
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
      layoutChanged();
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
    [
      "RRB (Railways)",
      "https://indianrailways.gov.in/railwayboard/view_section.jsp?lang=0&id=0,7,1281",
    ],
    ["IBPS", "https://www.ibps.in/"],
    ["SBI Careers", "https://sbi.co.in/web/careers"],
    ["RBI Opportunities", "https://opportunities.rbi.org.in/"],
    ["UPSC", "https://upsc.gov.in/"],
    ["NTA (NEET, JEE, CUET, NET)", "https://nta.ac.in/"],
    ["Join Indian Army", "https://joinindianarmy.nic.in/"],
    ["Employment News", "https://www.employmentnews.gov.in/"],
    ["Passport Seva", "https://www.passportindia.gov.in/"],
  ];
  const CALENDAR = [
    ["SSC CGL notification", "Jun – Jul"],
    ["SSC CHSL notification", "May – Jun"],
    ["RRB NTPC / Group D", "Sep – Jan"],
    ["IBPS PO / Clerk", "Jul – Aug"],
    ["SBI PO / Clerk", "Sep – Dec"],
    ["UPSC CSE prelims", "May – Jun"],
    ["NDA I / II", "Dec · May"],
    ["NEET UG", "Feb – May"],
    ["JEE Main", "Nov · Jan"],
    ["CUET UG", "Feb – May"],
    ["CTET", "Jul · Dec"],
  ];
  const news = {
    items: [],
    updatedAt: null,
    cat: "all",
    search: "",
    shown: 12,
    loaded: false,
  };
  const newsGrid = $("newsGrid"),
    newsChips = $("newsChips"),
    newsSearch = $("newsSearch"),
    newsMeta = $("newsMeta"),
    newsMore = $("newsMore"),
    newsEmpty = $("newsEmpty"),
    newsEmptyText = $("newsEmptyText");

  function buildNewsStatic() {
    const src = $("sourceList");
    if (src)
      src.innerHTML = SOURCES.map(
        ([n, u]) =>
          `<li><a href="${u}" target="_blank" rel="noopener">${esc(n)}<svg class="ic"><use href="#i-external"/></svg></a></li>`,
      ).join("");
    const cal = $("calendarList");
    if (cal)
      cal.innerHTML = CALENDAR.map(
        ([n, w]) => `<li><span>${esc(n)}</span><span>${esc(w)}</span></li>`,
      ).join("");
    if (newsChips) {
      newsChips.innerHTML = NEWS_CATS.map(
        (c) =>
          `<button type="button" class="chip-btn ${c.id === "all" ? "active" : ""}" role="tab" data-cat="${c.id}">${esc(c.name)}</button>`,
      ).join("");
      newsChips.addEventListener("click", (e) => {
        const b = e.target.closest(".chip-btn");
        if (!b) return;
        news.cat = b.dataset.cat;
        news.shown = 12;
        newsChips
          .querySelectorAll(".chip-btn")
          .forEach((x) => x.classList.toggle("active", x === b));
        renderNews();
      });
    }
    if (newsSearch)
      newsSearch.addEventListener(
        "input",
        debounce(() => {
          news.search = newsSearch.value;
          news.shown = 12;
          renderNews();
        }, 100),
      );
    if (newsMore)
      newsMore.addEventListener("click", () => {
        news.shown += 12;
        renderNews();
      });
  }
  async function loadNews() {
    if (!newsGrid) return;
    newsGrid.innerHTML = Array.from(
      { length: 6 },
      () => '<div class="news-skel"></div>',
    ).join("");
    try {
      const res = await fetch("./news.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      news.items = Array.isArray(data.items) ? data.items : [];
      news.updatedAt = data.updatedAt || null;
      news.loaded = true;
    } catch (err) {
      news.items = [];
      news.loaded = false;
    }
    renderNews();
  }
  function renderNews() {
    if (!newsGrid) return;
    const f = news.search.trim().toLowerCase();
    const list = news.items.filter(
      (it) =>
        (news.cat === "all" || it.category === news.cat) &&
        (!f ||
          it.title.toLowerCase().includes(f) ||
          (it.source || "").toLowerCase().includes(f)),
    );
    newsMeta.textContent = news.loaded
      ? `Updated ${timeAgo(news.updatedAt)} · ${news.items.length} headlines · via Google News (India)`
      : "Headlines load from news.json when the site is served over HTTP. Use the official notice boards on the right meanwhile.";
    const visible = list.slice(0, news.shown);
    newsGrid.innerHTML = visible
      .map(
        (
          it,
          i,
        ) => `<a class="news-card" href="${esc(it.link)}" target="_blank" rel="noopener" style="animation-delay:${(i % 12) * 0.05}s">
          <div class="news-top"><span class="news-src">${esc(it.source || "News")}</span><span>${timeAgo(it.date)}</span></div>
          <div class="news-title">${esc(it.title)}</div>
          <div class="news-bottom"><span class="news-cat">${esc((NEWS_CATS.find((c) => c.id === it.category) || { name: it.category }).name)}</span><span class="news-read">Read <svg class="ic"><use href="#i-external"/></svg></span></div>
        </a>`,
      )
      .join("");
    newsEmpty.hidden = list.length > 0;
    newsEmptyText.textContent = news.loaded
      ? "No headlines match that filter."
      : "Live headlines are unavailable in this view.";
    newsMore.hidden = list.length <= news.shown;
    layoutChanged();
  }

  /* ---------- PWA: service worker + install ---------- */
  const installBtn = $("installBtn");
  const installSheet = $("installSheet");
  let deferredPrompt = null;
  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (
    "serviceWorker" in navigator &&
    (location.protocol === "https:" ||
      /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
  ) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch(() => {}),
    );
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn && !standalone) installBtn.hidden = false;
  });
  if (isIOS && !standalone && installBtn) installBtn.hidden = false;
  function openInstallSheet() {
    installSheet.hidden = false;
    installSheet.classList.add("active");
    document.dispatchEvent(new CustomEvent("govforms:modal", { detail: true }));
  }
  function closeInstallSheet() {
    installSheet.classList.remove("active");
    installSheet.hidden = true;
    document.dispatchEvent(
      new CustomEvent("govforms:modal", { detail: false }),
    );
  }
  if (installBtn)
    installBtn.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") installBtn.hidden = true;
        deferredPrompt = null;
      } else openInstallSheet();
    });
  if (installSheet) {
    $("installSheetClose").addEventListener("click", closeInstallSheet);
    installSheet.addEventListener("click", (e) => {
      if (e.target === installSheet) closeInstallSheet();
    });
  }
  window.addEventListener("appinstalled", () => {
    if (installBtn) installBtn.hidden = true;
    toast("GovForms installed — find it on your home screen", "ok");
  });

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
      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((m) =>
          m.setAttribute("content", next === "light" ? "#f3f6fc" : "#050915"),
        );
      document.dispatchEvent(
        new CustomEvent("govforms:theme", { detail: next }),
      );
    });

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    const typing =
      /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") ||
      (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      processAll();
    } else if (e.key === "Escape") {
      if (viewerModal.classList.contains("active")) closeViewer();
      else if (installSheet && installSheet.classList.contains("active"))
        closeInstallSheet();
      else closePicker();
    } else if (e.key === "/" && !typing && templateSearch) {
      e.preventDefault();
      scrollToEl("#templates", { offset: -70 });
      setTimeout(() => templateSearch.focus(), 400);
    }
  });

  /* ---------- init ---------- */
  applyImages();
  buildGallery();
  buildNewsStatic();
  let remembered = "";
  try {
    remembered = localStorage.getItem("govforms-template") || "";
  } catch (e) {}
  selectTemplate(remembered && TEMPLATES[remembered] ? remembered : "");
  renderMergeList();
  refreshSheet();
  updatePreviewCards();
  loadNews();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => slots.forEach((s) => drawEditor(s)), 150);
  });
  // deep links: #templates?cat=… or ?cat=… → preselect a category
  const params = new URLSearchParams(location.search);
  if (params.get("cat")) setCategory(params.get("cat"));

  window.GovForms = {
    TEMPLATES,
    CATEGORIES,
    slots,
    selectTemplate,
    setSlotFile: (key, file) => setSlotFile(slots.get(key), file),
    processAll,
    currentSpec,
    results: () => state.results,
    state,
    news,
  };
})();
