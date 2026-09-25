# GovForms — Auto Document Formatter

A cinematic, single-page web app that formats exam photos, signatures and ID
documents to exact pixel sizes and KB limits — entirely in your browser.
Nothing is uploaded anywhere.

## 🌟 What it does

- **Studio** — drop (or paste) a photo and a signature, pan / zoom / rotate them
  inside the exact template frame, pick an output format and a KB ceiling, and
  download the results individually or as one ZIP.
- **Templates** — SSC (CGL / CHSL / MTS / GD), Railway RRB, IBPS / SBI, generic
  Bank, BPSC, Passport 2×2 in, 35×45 mm ID photo, plus fully custom sizes.
  Template cards show the photo and signature frames to scale.
- **KB-aware encoding** — a binary search over JPEG quality lands each file just
  under the limit you set (SSC and IBPS limits are pre-filled).
- **Signature clean-up** — lifts photographed paper to pure white and deepens
  the ink, so a phone photo of a signature comes out as clean dark strokes.
- **Background fill** — white, light blue, light grey or any custom colour for
  letter-boxed areas.
- **Before & after** — side-by-side previews with animated size bars and
  reduction percentages.
- **Passport photo sheet** — tile one photo across A4, A5, Letter or 4×6 paper at
  300 DPI with cut guides; export as JPEG or PDF.
- **Quick compress** — squeeze any image under a KB target (JPEG / WEBP / PNG),
  optionally capping the longest side.
- **Merge into one PDF** — drop images and PDFs, drag rows to reorder, keep
  original pixel sizes or fit every image to A4.
- **Light / dark theme**, keyboard shortcuts (`Ctrl/⌘ + Enter` to process,
  `Ctrl/⌘ + V` to paste an image, `Esc` to close previews) and toast feedback.

## 🎬 The cinematic layer

The page is built as a scroll-driven experience:

- A Three.js hero scene: floating document sheets, a wireframe icosahedron and a
  particle field that react to the pointer and fly apart as you scroll.
- Word-by-word headline reveal, animated counters and a marquee of exam names.
- A pipeline diagram whose connecting path draws itself as you scroll, with
  3D-tilting step cards.
- A 2D "anatomy of a compliant photo" diagram: dimension lines, face guide and
  callouts are drawn by scroll position and follow the selected template.
- A pinned 3D "exploded stack" that separates photo, signature, ID and merged
  PDF layers as you scroll (scrubbed on desktop, played on mobile).
- Section reveals, staggered grids, cursor spotlight on cards, magnetic buttons,
  aurora background with parallax and a subtle film grain.

Every effect is progressive: `prefers-reduced-motion` disables the heavy
animation, and the page stays fully usable if the animation libraries fail to
load.

## 📋 Templates

| Template | Photo (px) | Signature (px) | Size hints |
|---|---|---|---|
| SSC CGL / CHSL / MTS / GD | 200 × 240 JPEG | 240 × 80 PNG | photo 20–50 KB, sign 10–20 KB |
| Railway RRB (NTPC / Group D) | 200 × 230 PNG | 150 × 50 PNG | — |
| IBPS / SBI PO & Clerk | 200 × 230 JPEG | 140 × 60 JPEG | photo 20–50 KB, sign 10–20 KB |
| Bank (generic) | 140 × 160 JPEG | 120 × 60 JPEG | — |
| BPSC | 150 × 180 PNG | 120 × 60 PNG | — |
| Passport / Visa 2 × 2 in | 600 × 600 JPEG | 300 × 100 PNG | — |
| 35 × 45 mm ID photo | 413 × 531 JPEG | 300 × 100 PNG | — |
| Custom | any | any | any |

Portals change their rules — always cross-check the official notification and
use **Custom** when your requirement differs.

## 🚀 Getting started

No build step, no server. Clone or download and open `index.html` in a modern
browser (Chrome, Edge, Firefox, Safari). An internet connection is needed on
first load so the browser can fetch the libraries below.

```
fast-form-gov/
├── index.html   # page structure
├── gov.css      # design system, themes, animation states
├── script.js    # application logic (templates, editor, encoding, tools, merge)
├── fx.js        # cinematic layer (GSAP ScrollTrigger, Three.js hero, effects)
└── README.md
```

## 📖 How to use the Studio

1. **Pick a template** — click a card in the Templates section or use the
   dropdown. Dimensions, formats and KB limits are pre-filled.
2. **Add a photo and a signature** — drag & drop, click to browse, or paste an
   image from the clipboard. An optional ID document (image or PDF) can be added
   too.
3. **Frame it** — drag inside the editor to pan, scroll or use the slider to
   zoom, rotate in 90° steps, and switch between *Fill* (crop) and *Fit* (pad).
   The head guide shows where the face should sit. The live output panel shows
   the exact pixels that will be exported.
4. **Set output options** — format (JPEG / JPG / PNG / PDF), max size in KB,
   background colour, and signature clean-up.
5. **Process** — click *Process* or press `Ctrl/⌘ + Enter`. Files that could
   not fit under their KB limit are flagged.
6. **Download** — as one ZIP (default) or one file at a time. Every result can
   also be previewed before download.

## 🔧 Technical notes

- **Vanilla HTML / CSS / JavaScript** — no framework, no bundler.
- **Canvas API** for cropping, rotation, progressive downscaling and encoding.
- **jsPDF** for single-image PDFs and photo sheets, **pdf-lib** for merging,
  **JSZip** for bundled downloads.
- **GSAP + ScrollTrigger** for scrubbed scroll animation and pinning,
  **Three.js** for the hero scene. All libraries load from cdnjs.
- Images larger than 2600 px on the longest side are downscaled progressively
  on load for speed; outputs use stepwise halving before the final resample for
  quality.
- PDF page size uses 96 DPI pixel-to-mm conversion (photo sheets use 300 DPI).
- The last used template and theme are remembered in `localStorage`; nothing
  else is stored.

## 🔒 Privacy

All processing runs on your device. Files are never sent to a server; the page
only fetches its libraries and fonts from public CDNs.

## 🚀 Version

**Current version**: 4.0

- v4.0 — Cinematic redesign: 3D hero, scroll-driven diagrams, exploded stack,
  template gallery; new Studio with drag & drop, clipboard paste, pan / zoom /
  rotate editor, KB-targeted encoding, signature clean-up, background fill, ZIP
  download; passport photo sheet and quick compress tools; drag-to-reorder
  merge with fit-to-A4; light / dark theme.
- v3.0 — Individual format selectors for photo, signature and ID; improved PDF
  conversion.
- v2.0 — Preview section with file size tracking.
- v1.0 — Initial release with basic template support.
