/* ============================================================
   GovForms — cinematic layer (v2)
   Lenis smooth scroll, GSAP ScrollTrigger choreography, 2D/3D
   diagrams and the Three.js hero. Everything is progressive:
   the page works without it.
   ============================================================ */
(() => {
  "use strict";
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  const hasGsap = !!(window.gsap && window.ScrollTrigger) && !reduced;
  const hasLenis = !!window.Lenis && !reduced;
  root.classList.add(hasGsap ? "gsap" : "no-gsap");
  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    gsap.defaults({ ease: "power3.out", overwrite: "auto" });
  }

  /* ---------- smooth scroll (Lenis) ---------- */
  let lenis = null;
  if (hasLenis) {
    try {
      lenis = new Lenis({
        lerp: 0.085,
        wheelMultiplier: 0.95,
        smoothWheel: true,
        syncTouch: false,
        autoResize: true,
      });
      root.classList.add("lenis");
      if (hasGsap) {
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => {
          lenis.raf(t);
          requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
      }
    } catch (e) {
      lenis = null;
    }
  }
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  function scrollTo(target, opts = {}) {
    const el =
      typeof target === "string" ? document.querySelector(target) : target;
    const offset = opts.offset != null ? opts.offset : -76;
    if (el === null || el === undefined) return;
    const isTop =
      el === document.body ||
      el === document.documentElement ||
      (el.id === "top" && el.tagName === "MAIN");
    if (lenis) {
      if (isTop) lenis.scrollTo(0, { duration: 1.2, easing: easeOutQuart });
      else lenis.scrollTo(el, { offset, duration: 1.15, easing: easeOutQuart });
    } else {
      const y = isTop
        ? 0
        : el.getBoundingClientRect().top + window.scrollY + offset;
      window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    }
  }
  window.GovFX = {
    scrollTo,
    refresh: () => hasGsap && ScrollTrigger.refresh(),
  };

  // in-page anchors → smooth scroll with offset
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute("href");
    if (hash.length < 2) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    e.preventDefault();
    scrollTo(el, { offset: hash === "#top" ? 0 : -76 });
    if (history.replaceState) history.replaceState(null, "", hash);
  });

  /* ---------- intro ---------- */
  const intro = document.getElementById("intro");
  let introDelay = 0;
  let seen = false;
  try {
    seen = !!sessionStorage.getItem("govforms-intro");
  } catch (e) {}
  const introDone = new Promise((resolve) => {
    if (!intro || reduced || seen) {
      if (intro) intro.remove();
      resolve();
      return;
    }
    introDelay = 1;
    intro
      .querySelectorAll(".intro-word span")
      .forEach((s, i) => s.style.setProperty("--i", i));
    if (lenis) lenis.stop();
    document.body.style.overflow = "hidden";
    // measured from navigation start, so slow networks never stretch the curtain past MAX
    const MIN = 1600,
      MAX = 3400;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      root.style.setProperty("--boot", 1);
      intro.classList.add("done");
      document.body.style.overflow = "";
      if (lenis) lenis.start();
      try {
        sessionStorage.setItem("govforms-intro", "1");
      } catch (e) {}
      setTimeout(() => intro.remove(), 1000);
      resolve();
    };
    const bootRatio = () =>
      window.__boot ? window.__boot.loaded / window.__boot.total : 1;
    const fonts =
      document.fonts && document.fonts.ready
        ? document.fonts.ready
        : Promise.resolve();
    let fontsReady = false;
    fonts.then(() => (fontsReady = true));
    const tick = () => {
      const elapsed = performance.now();
      if ((bootRatio() >= 1 && fontsReady && elapsed >= MIN) || elapsed >= MAX)
        finish();
      else setTimeout(tick, 80);
    };
    tick();
  });

  /* ---------- nav, dock, progress ---------- */
  const nav = document.getElementById("nav");
  const progress = document.getElementById("scrollProgress");
  const toTop = document.getElementById("toTop");
  const aurora = document.querySelector(".aurora");
  const dock = document.getElementById("dock");
  let lastY = window.scrollY || 0;
  let ticking = false;
  let modalOpen = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || 0;
      const max = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      if (nav) nav.classList.toggle("scrolled", y > 24);
      if (progress) progress.style.width = Math.min(100, (y / max) * 100) + "%";
      if (toTop) toTop.classList.toggle("show", y > 700);
      if (aurora && !reduced)
        aurora.style.transform = `translate3d(0, ${-y * 0.06}px, 0)`;
      if (dock && !modalOpen) {
        const dy = y - lastY;
        if (y > 240 && dy > 8) dock.classList.add("hide");
        else if (dy < -8 || y < 240 || y >= max - 4)
          dock.classList.remove("hide");
      }
      lastY = y;
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop)
    toTop.addEventListener("click", () =>
      scrollTo(document.body, { offset: 0 }),
    );
  document.addEventListener("govforms:modal", (e) => {
    modalOpen = !!e.detail;
    if (dock) dock.classList.toggle("hide", modalOpen);
    if (lenis) modalOpen ? lenis.stop() : lenis.start();
  });
  // hide the dock while a field has focus on mobile (keyboard up)
  document.addEventListener("focusin", (e) => {
    if (
      dock &&
      isMobile &&
      /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) &&
      !/^(range|checkbox|file|color)$/.test(e.target.type)
    )
      dock.classList.add("hide");
  });
  document.addEventListener(
    "focusout",
    () =>
      dock &&
      setTimeout(() => !modalOpen && dock.classList.remove("hide"), 120),
  );

  const navLinks = Array.from(
    document.querySelectorAll(".nav-links a[data-nav]"),
  );
  const dockItems = Array.from(
    document.querySelectorAll(".dock-item[data-dock]"),
  );
  if ("IntersectionObserver" in window) {
    const targets = new Map();
    navLinks.forEach((a) => targets.set(a.dataset.nav, a.dataset.nav));
    dockItems.forEach((a) => targets.set(a.dataset.dock, a.dataset.dock));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const id = en.target.id;
          navLinks.forEach((a) =>
            a.classList.toggle("active", a.dataset.nav === id),
          );
          const dockId = dockOwner(id);
          dockItems.forEach((a) =>
            a.classList.toggle("active", a.dataset.dock === dockId),
          );
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );
    document
      .querySelectorAll("main > section[id]")
      .forEach((sec) => io.observe(sec));
  }
  // which dock item "owns" a section
  function dockOwner(id) {
    if (["hero", "showcase", "how", "anatomy", "stack"].includes(id))
      return "hero";
    if (["templates", "studio", "preview"].includes(id)) return "templates";
    if (["tools", "merge"].includes(id)) return "tools";
    if (["news", "features", "faq", "credits"].includes(id)) return "news";
    return "";
  }

  /* ---------- reveals ---------- */
  function initReveals() {
    const items = Array.from(document.querySelectorAll("[data-reveal]"));
    const groups = Array.from(
      document.querySelectorAll("[data-reveal-stagger]"),
    );
    const extras = Array.from(
      document.querySelectorAll(".pipeline, #stack, .anatomy-figure"),
    );
    if (!hasGsap) {
      items.forEach(
        (el) =>
          el.dataset.delay && el.style.setProperty("--delay", el.dataset.delay),
      );
      groups.forEach((g) =>
        Array.from(g.children).forEach((c, i) => c.style.setProperty("--i", i)),
      );
      const all = [...items, ...groups, ...extras];
      if (!("IntersectionObserver" in window))
        return all.forEach((el) => el.classList.add("in-view"));
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add("in-view");
              io.unobserve(en.target);
            }
          }),
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
      );
      all.forEach((el) => io.observe(el));
      return;
    }
    const from = (el) => {
      const v = el.dataset.reveal;
      return {
        opacity: 0,
        y: v === "up" ? 40 : 0,
        x: v === "left" ? 44 : v === "right" ? -44 : 0,
        scale: v === "scale" ? 0.94 : 1,
        filter: v === "blur" ? "blur(14px)" : "blur(0px)",
      };
    };
    items.forEach((el) => gsap.set(el, from(el)));
    ScrollTrigger.batch(items, {
      start: "top 88%",
      once: true,
      onEnter: (batch) => {
        batch.forEach((el, i) => {
          el.classList.add("in-view");
          gsap.to(el, {
            opacity: 1,
            y: 0,
            x: 0,
            scale: 1,
            filter: "blur(0px)",
            duration: 1.15,
            ease: "power3.out",
            delay: i * 0.08 + (parseFloat(el.dataset.delay) || 0) * 0.6,
            clearProps: "transform,filter",
          });
        });
      },
    });
    groups.forEach((g) => {
      const kids = Array.from(g.children);
      gsap.set(kids, { opacity: 0, y: 30 });
      ScrollTrigger.create({
        trigger: g,
        start: "top 86%",
        once: true,
        onEnter: () => {
          g.classList.add("in-view");
          gsap.to(kids, {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: "power3.out",
            stagger: { each: 0.07, from: "start" },
            clearProps: "transform",
          });
        },
      });
    });
    extras.forEach((el) =>
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () => el.classList.add("in-view"),
      }),
    );
  }

  /* ---------- counters ---------- */
  function initCounters() {
    const els = document.querySelectorAll("[data-count]");
    const run = (el) => {
      const target = parseFloat(el.dataset.count) || 0;
      if (reduced) return (el.textContent = target);
      if (hasGsap) {
        const o = { v: 0 };
        gsap.to(o, {
          v: target,
          duration: 1.8,
          ease: "power3.out",
          onUpdate: () => (el.textContent = Math.round(o.v)),
        });
        return;
      }
      const dur = 1500,
        start = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - start) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!("IntersectionObserver" in window)) return els.forEach(run);
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            run(en.target);
            io.unobserve(en.target);
          }
        }),
      { threshold: 0.5 },
    );
    els.forEach((el) => io.observe(el));
  }

  /* ---------- hero split-text ---------- */
  function splitWords(el) {
    const walk = (node) => {
      if (node.nodeType === 3) {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part))
            return frag.appendChild(document.createTextNode(" "));
          const w = document.createElement("span");
          w.className = "w";
          const wi = document.createElement("span");
          wi.className = "wi";
          wi.textContent = part;
          w.appendChild(wi);
          frag.appendChild(w);
        });
        node.replaceWith(frag);
      } else if (node.nodeType === 1) Array.from(node.childNodes).forEach(walk);
    };
    Array.from(el.childNodes).forEach(walk);
    return Array.from(el.querySelectorAll(".wi"));
  }
  function initHeroText() {
    const title = document.querySelector("[data-split]");
    if (!title) return;
    const words = splitWords(title);
    words.forEach((w, i) => w.style.setProperty("--i", i));
    root.style.setProperty("--intro", "0s");
    if (!hasGsap) return;
    gsap.set(words, { yPercent: 110, rotateX: -50, opacity: 0 });
    introDone.then(() => {
      gsap.to(words, {
        yPercent: 0,
        rotateX: 0,
        opacity: 1,
        duration: 1.2,
        ease: "power4.out",
        stagger: 0.055,
        delay: 0.15,
        clearProps: "transform",
      });
    });
    gsap.to(".hero-inner", {
      yPercent: -12,
      opacity: 0.12,
      ease: "none",
      scrollTrigger: {
        trigger: "#hero",
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });
  }

  /* ---------- pointer effects ---------- */
  function initPointerFX() {
    if (!finePointer || reduced) return;
    const glow = document.querySelector(".cursor-glow");
    if (glow && hasGsap) {
      const xTo = gsap.quickTo(glow, "x", { duration: 0.55, ease: "power3" });
      const yTo = gsap.quickTo(glow, "y", { duration: 0.55, ease: "power3" });
      document.addEventListener(
        "pointermove",
        (e) => {
          document.body.classList.add("has-cursor");
          xTo(e.clientX);
          yTo(e.clientY);
        },
        { passive: true },
      );
    } else if (glow) {
      let gx = 0,
        gy = 0,
        tx = 0,
        ty = 0,
        raf = null;
      const loop = () => {
        gx += (tx - gx) * 0.12;
        gy += (ty - gy) * 0.12;
        glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
        raf =
          Math.abs(tx - gx) > 0.3 || Math.abs(ty - gy) > 0.3
            ? requestAnimationFrame(loop)
            : null;
      };
      document.addEventListener(
        "pointermove",
        (e) => {
          tx = e.clientX;
          ty = e.clientY;
          document.body.classList.add("has-cursor");
          if (!raf) raf = requestAnimationFrame(loop);
        },
        { passive: true },
      );
    }
    // card spotlight
    document.addEventListener(
      "pointermove",
      (e) => {
        const card = e.target.closest && e.target.closest(".card");
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", e.clientX - r.left + "px");
        card.style.setProperty("--my", e.clientY - r.top + "px");
      },
      { passive: true },
    );
    // 3D tilt
    document.querySelectorAll(".tilt").forEach((el) => {
      if (hasGsap) {
        gsap.set(el, { transformPerspective: 900 });
        const rx = gsap.quickTo(el, "rotationX", {
          duration: 0.6,
          ease: "power3",
        });
        const ry = gsap.quickTo(el, "rotationY", {
          duration: 0.6,
          ease: "power3",
        });
        const yy = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3" });
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          el.classList.add("tilting");
          rx(-y * 9);
          ry(x * 11);
          yy(-4);
        });
        el.addEventListener("pointerleave", () => {
          el.classList.remove("tilting");
          rx(0);
          ry(0);
          yy(0);
        });
      } else {
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          el.classList.add("tilting");
          el.style.transform = `perspective(900px) rotateX(${(-y * 9).toFixed(2)}deg) rotateY(${(x * 11).toFixed(2)}deg) translateY(-4px)`;
        });
        el.addEventListener("pointerleave", () => {
          el.classList.remove("tilting");
          el.style.transform = "";
        });
      }
    });
    // magnetic buttons
    document.querySelectorAll(".magnetic").forEach((el) => {
      const strength = 0.26;
      if (hasGsap) {
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * strength);
          yTo((e.clientY - (r.top + r.height / 2)) * strength);
        });
        el.addEventListener("pointerleave", () => {
          xTo(0);
          yTo(0);
        });
      } else {
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * strength}px, ${(e.clientY - (r.top + r.height / 2)) * strength - 2}px)`;
        });
        el.addEventListener("pointerleave", () => (el.style.transform = ""));
      }
    });
  }

  /* ---------- parallax imagery ---------- */
  function initParallax() {
    if (!hasGsap || isMobile) return;
    document
      .querySelectorAll(".tile img, .news-hero img, .credits-media img")
      .forEach((img) => {
        const host = img.parentElement;
        gsap.fromTo(
          img,
          { yPercent: -7, scale: 1.16 },
          {
            yPercent: 7,
            scale: 1.16,
            ease: "none",
            scrollTrigger: {
              trigger: host,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          },
        );
      });
  }

  /* ---------- pipeline path ---------- */
  function initPipeline() {
    const path = document.getElementById("pipePath");
    if (!path) return;
    const len = path.getTotalLength();
    path.style.setProperty("--len", len);
    const dot = path.parentElement.querySelector(".pipe-dot");
    if (!hasGsap) {
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      return;
    }
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    if (dot) gsap.set(dot, { opacity: 0 });
    gsap.to(path, {
      strokeDashoffset: 0,
      ease: "none",
      scrollTrigger: {
        trigger: ".pipeline",
        start: "top 85%",
        end: "bottom 55%",
        scrub: 0.6,
        onUpdate: (self) =>
          dot &&
          gsap.to(dot, {
            opacity: self.progress > 0.97 ? 1 : 0,
            duration: 0.4,
          }),
      },
    });
  }

  /* ---------- anatomy 2D diagram ---------- */
  function initAnatomy() {
    const svg = document.getElementById("anatomySvg");
    if (!svg) return;
    const draws = Array.from(svg.querySelectorAll(".a-draw"));
    const texts = Array.from(svg.querySelectorAll(".a-text"));
    draws.forEach((el, i) => {
      let len = 600;
      try {
        len = el.getTotalLength();
      } catch (e) {}
      el.style.setProperty("--len", len);
      el.style.setProperty("--d", (i * 0.08).toFixed(2));
    });
    texts.forEach((el, i) =>
      el.style.setProperty("--d", (0.6 + i * 0.1).toFixed(2)),
    );
    if (!hasGsap) return;
    draws.forEach((el) => {
      const len = parseFloat(el.style.getPropertyValue("--len")) || 600;
      gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
    });
    gsap.set(texts, { opacity: 0, y: 6 });
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ".anatomy-figure",
        start: "top 85%",
        end: "center 42%",
        scrub: 0.6,
      },
    });
    const order = [
      ".frame:not(.sig)",
      ".shoulders",
      ".head",
      ".eyes",
      ".dim",
      ".tick",
      ".leader",
      ".frame.sig",
      ".scribble",
    ];
    let t = 0;
    order.forEach((sel) => {
      const els = draws.filter((d) => d.matches(sel));
      if (!els.length) return;
      tl.to(
        els,
        { strokeDashoffset: 0, duration: 0.6, ease: "none", stagger: 0.05 },
        t,
      );
      t += 0.32;
    });
    tl.to(
      texts,
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "none" },
      0.9,
    );
  }

  /* ---------- 3D exploded stack ---------- */
  function initStack() {
    const stack = document.getElementById("stack3d");
    if (!stack) return;
    const layers = Array.from(stack.querySelectorAll(".layer"));
    const items = Array.from(document.querySelectorAll("#layerList li"));
    const highlight = (p) => {
      const idx = Math.min(items.length - 1, Math.floor(p * items.length));
      items.forEach((li, i) => li.classList.toggle("active", i <= idx));
    };
    if (!hasGsap) return items.forEach((li) => li.classList.add("active"));
    const mm = gsap.matchMedia();
    mm.add(
      { desktop: "(min-width: 901px)", mobile: "(max-width: 900px)" },
      (ctx) => {
        const { desktop } = ctx.conditions;
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: desktop ? "#stackPin" : "#stack",
            start: desktop ? "center center" : "top 75%",
            end: desktop ? "+=120%" : "bottom 70%",
            scrub: desktop ? 0.7 : 0.5,
            pin: desktop ? "#stackPin" : false,
            anticipatePin: 1,
            onUpdate: (self) => highlight(self.progress),
          },
        });
        tl.fromTo(
          stack,
          { rotateX: 72, rotateZ: -18 },
          { rotateX: 56, rotateZ: -34, ease: "none", duration: 1.2 },
          0,
        );
        layers.forEach((l, i) => {
          tl.to(
            l,
            { z: i * (desktop ? 96 : 72), duration: 0.6, ease: "power2.out" },
            0.1 + i * 0.16,
          );
          tl.fromTo(
            l.querySelector(".layer-tag"),
            { opacity: 0 },
            { opacity: 1, duration: 0.3 },
            0.3 + i * 0.16,
          );
        });
        tl.to(
          ".stack-shadow",
          { opacity: 0.35, scale: 1.2, duration: 1.2, ease: "none" },
          0,
        );
        return () => {};
      },
    );
  }

  /* ---------- Three.js hero ---------- */
  function initHero3D() {
    const canvas = document.getElementById("heroCanvas");
    if (!canvas || !window.THREE || reduced) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !isMobile,
        powerPreference: "high-performance",
      });
    } catch (e) {
      return;
    }
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75),
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const portrait = window.innerWidth < window.innerHeight;
    const CAM_Z = portrait ? 15 : 12;
    camera.position.set(0, 0, CAM_Z);
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(4, 6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0x22d3ee, 1.6, 40);
    rim.position.set(-7, -2, 4);
    scene.add(rim);
    const warm = new THREE.PointLight(0xffb547, 1.1, 40);
    warm.position.set(7, 3, -2);
    scene.add(warm);

    function docTexture(kind) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 320;
      const x = c.getContext("2d");
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, 256, 320);
      x.fillStyle = "#e6ecf7";
      x.fillRect(0, 0, 256, 34);
      x.fillStyle = "#4f8cff";
      x.fillRect(18, 12, 60, 10);
      const lines = (from, n) => {
        x.fillStyle = "#d3dbea";
        for (let i = 0; i < n; i++)
          x.fillRect(24, from + i * 22, 208 - (i % 3) * 40, 9);
      };
      if (kind === "photo") {
        x.fillStyle = "#dbe7ff";
        x.fillRect(58, 60, 140, 168);
        x.strokeStyle = "#4f8cff";
        x.lineWidth = 4;
        x.strokeRect(58, 60, 140, 168);
        x.fillStyle = "#2f6ff0";
        x.beginPath();
        x.ellipse(128, 128, 34, 42, 0, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.ellipse(128, 236, 70, 44, 0, Math.PI, 0);
        x.fill();
        lines(250, 3);
      } else if (kind === "sign") {
        lines(60, 5);
        x.strokeStyle = "#0b1430";
        x.lineWidth = 4;
        x.beginPath();
        x.moveTo(40, 230);
        x.bezierCurveTo(70, 170, 90, 270, 120, 220);
        x.bezierCurveTo(150, 170, 170, 260, 200, 205);
        x.stroke();
        x.fillStyle = "#ffb547";
        x.fillRect(40, 250, 170, 4);
      } else if (kind === "id") {
        x.fillStyle = "#d9f7ef";
        x.fillRect(28, 70, 200, 120);
        x.fillStyle = "#0ea5c4";
        x.fillRect(44, 88, 56, 72);
        x.fillStyle = "#33405f";
        x.fillRect(116, 92, 96, 10);
        x.fillRect(116, 116, 72, 10);
        x.fillRect(116, 140, 88, 10);
        lines(214, 3);
      } else {
        lines(60, 7);
        x.fillStyle = "#e11d48";
        x.fillRect(150, 226, 82, 50);
        x.fillStyle = "#fff";
        x.font = "bold 28px Sora, Inter, sans-serif";
        x.fillText("PDF", 160, 262);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;
      return tex;
    }

    const kinds = ["photo", "sign", "id", "pdf", "photo", "sign", "id", "pdf"];
    const cards = [];
    kinds.forEach((k, i) => {
      const geo = new THREE.PlaneGeometry(1.3, 1.65);
      const mat = new THREE.MeshStandardMaterial({
        map: docTexture(k),
        roughness: 0.5,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      const a = (i / kinds.length) * Math.PI * 2 + 0.4;
      const r = 6.2 + (i % 3) * 0.9;
      const y = portrait ? -3.2 - (i % 2) * 1.4 : Math.sin(a * 1.7) * 2.4;
      m.position.set(
        Math.cos(a) * r * (portrait ? 0.7 : 1),
        y,
        Math.sin(a) * r * 0.45 - 1.5,
      );
      m.rotation.set(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 1.3,
        (Math.random() - 0.5) * 0.5,
      );
      m.userData = {
        base: m.position.clone(),
        rot: m.rotation.clone(),
        phase: Math.random() * Math.PI * 2,
        speed: 0.35 + Math.random() * 0.5,
      };
      group.add(m);
      cards.push(m);
    });
    const ico = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.2, 1),
      new THREE.MeshBasicMaterial({
        color: 0x4f8cff,
        wireframe: true,
        transparent: true,
        opacity: 0.16,
      }),
    );
    ico.position.y = portrait ? -3.5 : -0.6;
    group.add(ico);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 2),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0e7490,
        roughness: 0.2,
        metalness: 0.6,
      }),
    );
    core.position.copy(ico.position);
    group.add(core);
    const N = isMobile ? 420 : 800;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color: 0x9cc2ff,
        size: 0.05,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(pts);

    let tx = 0,
      ty = 0,
      mx = 0,
      my = 0,
      sp = 0;
    window.addEventListener(
      "pointermove",
      (e) => {
        tx = (e.clientX / window.innerWidth - 0.5) * 2;
        ty = (e.clientY / window.innerHeight - 0.5) * 2;
      },
      { passive: true },
    );
    if (hasGsap)
      ScrollTrigger.create({
        trigger: "#hero",
        start: "top top",
        end: "bottom top",
        scrub: true,
        onUpdate: (self) => (sp = self.progress),
      });
    else
      window.addEventListener(
        "scroll",
        () =>
          (sp = Math.min(1, window.scrollY / Math.max(1, window.innerHeight))),
        { passive: true },
      );
    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    let visible = true;
    if ("IntersectionObserver" in window)
      new IntersectionObserver(([en]) => (visible = en.isIntersecting), {
        threshold: 0,
      }).observe(canvas);

    const clock = new THREE.Clock();
    let introT = 0;
    let started = false;
    introDone.then(() => (started = true));
    function tick() {
      requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const t = clock.getElapsedTime();
      if (started) introT = Math.min(1, introT + 0.012);
      const ease = 1 - Math.pow(1 - introT, 3);
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;
      group.rotation.y = Math.sin(t * 0.12) * 0.22 + mx * 0.28 + sp * 1.3;
      group.rotation.x = my * 0.14 - sp * 0.35;
      const spread = (0.4 + 0.6 * ease) * (1 + sp * 1.9);
      cards.forEach((c) => {
        const u = c.userData;
        c.position.x = u.base.x * spread;
        c.position.z = u.base.z * spread;
        c.position.y =
          u.base.y * (0.6 + 0.4 * ease) +
          Math.sin(t * u.speed + u.phase) * 0.35;
        c.rotation.x = u.rot.x + Math.sin(t * 0.5 + u.phase) * 0.12;
        c.rotation.y = u.rot.y + Math.cos(t * 0.4 + u.phase) * 0.16;
        c.material.opacity = 0.85 * ease * (1 - sp * 0.7);
      });
      ico.rotation.x = t * 0.15;
      ico.rotation.y = -t * 0.22;
      ico.scale.setScalar((0.6 + 0.4 * ease) * (1 + sp * 0.8));
      core.rotation.y = t * 0.6;
      core.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
      pts.rotation.y = t * 0.02;
      pts.position.y = -sp * 3;
      camera.position.z = CAM_Z - sp * 3;
      camera.position.y = -sp * 2.2;
      camera.lookAt(0, -sp * 1.6, 0);
      renderer.render(scene, camera);
    }
    tick();
  }

  /* ---------- keep ScrollTrigger in sync with layout changes ---------- */
  function initRefresh() {
    if (!hasGsap) return;
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ScrollTrigger.refresh(), 240);
    };
    document.addEventListener("govforms:layout", refresh);
    window.addEventListener("load", refresh);
    introDone.then(refresh);
    if ("ResizeObserver" in window) {
      const main = document.querySelector("main");
      if (main) new ResizeObserver(refresh).observe(main);
    }
    document
      .querySelectorAll("img[data-img]")
      .forEach((img) => img.addEventListener("load", refresh, { once: true }));
  }

  /* ---------- boot ---------- */
  initHeroText();
  initPointerFX();
  initCounters();
  initPipeline();
  initAnatomy();
  initStack();
  initParallax();
  initHero3D();
  initRefresh();
  introDone.then(() => setTimeout(initReveals, introDelay ? 120 : 0));
})();
