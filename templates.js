/* ============================================================
   GovForms — exam & document catalog
   Sizes are the values most commonly quoted in official
   notifications. Portals change rules: entries flagged
   `verify: true` use generic passport-size defaults and must be
   cross-checked with the current notification.
   ============================================================ */
(() => {
  "use strict";

  // helpers
  const mm = (w, h, dpi = 150) => ({
    w: Math.round((w / 25.4) * dpi),
    h: Math.round((h / 25.4) * dpi),
  });
  const P = (w, h, format, minKb, maxKb) => ({ w, h, format, minKb, maxKb });

  // shared specs
  const BANK_PHOTO = P(200, 230, "jpeg", 20, 50);
  const BANK_SIGN = P(140, 60, "jpeg", 10, 20);
  const BANK_EXTRAS = [
    {
      key: "thumb",
      name: "Left thumb impression",
      hint: "Black or blue ink on white paper",
      ...P(240, 240, "jpeg", 20, 50),
      mode: "fit",
    },
    {
      key: "declaration",
      name: "Handwritten declaration",
      hint: "The declaration text written in your own hand on white paper",
      ...P(800, 400, "jpeg", 50, 100),
      mode: "fit",
    },
  ];
  const SSC_PHOTO = P(200, 240, "jpeg", 20, 50);
  const SSC_SIGN = P(240, 80, "png", 10, 20);
  const UPSC_PHOTO = P(350, 350, "jpeg", 20, 300);
  const UPSC_SIGN = P(350, 350, "jpeg", 20, 300);
  const NTA_PHOTO = {
    ...mm(35, 45, 150),
    format: "jpeg",
    minKb: 10,
    maxKb: 200,
  };
  const NTA_SIGN = { ...mm(35, 15, 150), format: "jpeg", minKb: 4, maxKb: 30 };
  const GENERIC_PHOTO = { ...mm(35, 45, 150), format: "jpeg" };
  const GENERIC_SIGN = { ...mm(35, 15, 150), format: "jpeg" };

  const categories = [
    {
      id: "ssc",
      name: "SSC",
      blurb:
        "Staff Selection Commission — CGL, CHSL, MTS, GD, CPO, JE, Stenographer",
      icon: "i-target",
    },
    {
      id: "railway",
      name: "Railways",
      blurb: "RRB NTPC, Group D, ALP, JE, RPF and metro recruitment",
      icon: "i-layers",
    },
    {
      id: "banking",
      name: "Banking & Insurance",
      blurb: "IBPS, SBI, RBI, LIC, NABARD and other bank portals",
      icon: "i-shield",
    },
    {
      id: "upsc",
      name: "UPSC & State PSC",
      blurb: "Civil services, NDA / CDS and state public service commissions",
      icon: "i-bolt",
    },
    {
      id: "defence",
      name: "Defence & Police",
      blurb: "Agniveer, AFCAT, Navy, CAPF and state police forces",
      icon: "i-shield",
    },
    {
      id: "entrance",
      name: "Entrance & Teaching",
      blurb: "NEET, JEE, CUET, GATE, CAT, CTET and UGC NET",
      icon: "i-sparkle",
    },
    {
      id: "documents",
      name: "Passport, PAN & Visa",
      blurb: "Identity documents and international visa photo standards",
      icon: "i-id",
    },
  ];

  const templates = {
    /* ---------------- SSC ---------------- */
    sscexams: {
      name: "SSC CGL / CHSL / MTS / GD",
      org: "Staff Selection Commission",
      category: "ssc",
      tags: [
        "ssc",
        "cgl",
        "chsl",
        "mts",
        "havaldar",
        "gd constable",
        "selection post",
        "otr",
      ],
      photo: SSC_PHOTO,
      sign: SSC_SIGN,
    },
    ssc_cpo: {
      name: "SSC CPO (SI Delhi Police / CAPF)",
      org: "Staff Selection Commission",
      category: "ssc",
      tags: ["ssc", "cpo", "sub inspector", "delhi police", "capf"],
      photo: SSC_PHOTO,
      sign: SSC_SIGN,
    },
    ssc_je_steno: {
      name: "SSC JE / Stenographer",
      org: "Staff Selection Commission",
      category: "ssc",
      tags: ["ssc", "je", "junior engineer", "stenographer", "steno"],
      photo: SSC_PHOTO,
      sign: SSC_SIGN,
    },

    /* ---------------- Railways ---------------- */
    railway: {
      name: "RRB NTPC / Group D",
      org: "Railway Recruitment Boards",
      category: "railway",
      tags: ["rrb", "railway", "ntpc", "group d", "level 1", "rrc"],
      photo: P(200, 230, "png"),
      sign: P(150, 50, "png"),
    },
    rrb_alp_je: {
      name: "RRB ALP / Technician / JE",
      org: "Railway Recruitment Boards",
      category: "railway",
      tags: ["rrb", "railway", "alp", "loco pilot", "technician", "je"],
      photo: P(200, 230, "png"),
      sign: P(150, 50, "png"),
    },
    rpf: {
      name: "RPF Constable / SI",
      org: "Railway Protection Force",
      category: "railway",
      tags: ["rpf", "railway police", "constable", "sub inspector"],
      photo: P(200, 230, "png"),
      sign: P(150, 50, "png"),
    },

    /* ---------------- Banking & Insurance ---------------- */
    ibps: {
      name: "IBPS PO / Clerk / SO / RRB",
      org: "Institute of Banking Personnel Selection",
      category: "banking",
      tags: ["ibps", "po", "clerk", "so", "rrb", "office assistant", "bank"],
      photo: BANK_PHOTO,
      sign: BANK_SIGN,
      extras: BANK_EXTRAS,
    },
    sbi: {
      name: "SBI PO / Clerk / SO",
      org: "State Bank of India",
      category: "banking",
      tags: ["sbi", "po", "clerk", "junior associate", "bank"],
      photo: BANK_PHOTO,
      sign: BANK_SIGN,
      extras: BANK_EXTRAS,
    },
    rbi: {
      name: "RBI Grade B / Assistant",
      org: "Reserve Bank of India",
      category: "banking",
      tags: ["rbi", "grade b", "assistant", "bank"],
      photo: BANK_PHOTO,
      sign: BANK_SIGN,
      extras: BANK_EXTRAS,
    },
    lic: {
      name: "LIC AAO / ADO / Assistant",
      org: "Life Insurance Corporation",
      category: "banking",
      tags: ["lic", "aao", "ado", "assistant", "insurance"],
      photo: BANK_PHOTO,
      sign: BANK_SIGN,
    },
    nabard: {
      name: "NABARD Grade A / B",
      org: "National Bank for Agriculture and Rural Development",
      category: "banking",
      tags: ["nabard", "grade a", "grade b", "bank"],
      photo: BANK_PHOTO,
      sign: BANK_SIGN,
    },
    bank: {
      name: "Bank (generic portal)",
      org: "Other bank & cooperative portals",
      category: "banking",
      tags: ["bank", "generic", "cooperative"],
      photo: P(140, 160, "jpeg"),
      sign: P(120, 60, "jpeg"),
    },

    /* ---------------- UPSC & State PSC ---------------- */
    upsc: {
      name: "UPSC CSE / IFoS / ESE / CMS",
      org: "Union Public Service Commission (OTR)",
      category: "upsc",
      tags: [
        "upsc",
        "civil services",
        "ias",
        "ips",
        "ifos",
        "ese",
        "cms",
        "otr",
        "prelims",
      ],
      photo: UPSC_PHOTO,
      sign: UPSC_SIGN,
      note: "OTR accepts 350–1000 px squares. CSE photos must be recent and may need a name-and-date placard.",
    },
    upsc_nda_cds: {
      name: "UPSC NDA / CDS / CAPF AC",
      org: "Union Public Service Commission (OTR)",
      category: "upsc",
      tags: ["upsc", "nda", "cds", "capf", "assistant commandant", "defence"],
      photo: UPSC_PHOTO,
      sign: UPSC_SIGN,
    },
    bpsc: {
      name: "BPSC",
      org: "Bihar Public Service Commission",
      category: "upsc",
      tags: ["bpsc", "bihar", "pcs", "state psc"],
      photo: P(150, 180, "png"),
      sign: P(120, 60, "png"),
    },
    uppsc: {
      name: "UPPSC PCS",
      org: "Uttar Pradesh Public Service Commission",
      category: "upsc",
      tags: ["uppsc", "uttar pradesh", "pcs", "state psc"],
      photo: { ...GENERIC_PHOTO, maxKb: 50 },
      sign: { ...GENERIC_SIGN, maxKb: 30 },
      verify: true,
    },
    mpsc: {
      name: "MPSC",
      org: "Maharashtra Public Service Commission",
      category: "upsc",
      tags: ["mpsc", "maharashtra", "state psc"],
      photo: { ...GENERIC_PHOTO, maxKb: 50 },
      sign: { ...GENERIC_SIGN, maxKb: 50 },
      verify: true,
    },
    rpsc: {
      name: "RPSC RAS",
      org: "Rajasthan Public Service Commission",
      category: "upsc",
      tags: ["rpsc", "rajasthan", "ras", "state psc"],
      photo: { ...GENERIC_PHOTO, maxKb: 100 },
      sign: { ...GENERIC_SIGN, maxKb: 50 },
      verify: true,
    },
    mppsc: {
      name: "MPPSC",
      org: "Madhya Pradesh Public Service Commission",
      category: "upsc",
      tags: ["mppsc", "madhya pradesh", "state psc"],
      photo: { ...GENERIC_PHOTO, maxKb: 100 },
      sign: { ...GENERIC_SIGN, maxKb: 50 },
      verify: true,
    },
    tnpsc: {
      name: "TNPSC",
      org: "Tamil Nadu Public Service Commission",
      category: "upsc",
      tags: [
        "tnpsc",
        "tamil nadu",
        "group 1",
        "group 2",
        "group 4",
        "state psc",
      ],
      photo: { ...GENERIC_PHOTO, maxKb: 50 },
      sign: { ...GENERIC_SIGN, maxKb: 30 },
      verify: true,
    },
    wbpsc: {
      name: "WBPSC",
      org: "West Bengal Public Service Commission",
      category: "upsc",
      tags: ["wbpsc", "west bengal", "wbcs", "state psc"],
      photo: { ...GENERIC_PHOTO, maxKb: 50 },
      sign: { ...GENERIC_SIGN, maxKb: 30 },
      verify: true,
    },

    /* ---------------- Defence & Police ---------------- */
    agniveer_army: {
      name: "Army Agniveer",
      org: "Indian Army (joinindianarmy)",
      category: "defence",
      tags: ["agniveer", "army", "agnipath", "gd", "technical", "clerk"],
      photo: { ...GENERIC_PHOTO, minKb: 10, maxKb: 20 },
      sign: { ...GENERIC_SIGN, minKb: 5, maxKb: 10 },
      verify: true,
    },
    afcat: {
      name: "AFCAT / Agniveervayu",
      org: "Indian Air Force",
      category: "defence",
      tags: ["afcat", "air force", "agniveervayu", "iaf"],
      photo: { ...GENERIC_PHOTO, minKb: 10, maxKb: 50 },
      sign: { ...GENERIC_SIGN, minKb: 10, maxKb: 50 },
      extras: [
        {
          key: "thumb",
          name: "Left thumb impression",
          hint: "Black or blue ink on white paper",
          ...P(240, 240, "jpeg", 10, 50),
          mode: "fit",
        },
      ],
      verify: true,
    },
    navy_agniveer: {
      name: "Navy Agniveer SSR / MR",
      org: "Indian Navy",
      category: "defence",
      tags: ["navy", "agniveer", "ssr", "mr", "sailor"],
      photo: { ...GENERIC_PHOTO, minKb: 10, maxKb: 50 },
      sign: { ...GENERIC_SIGN, minKb: 10, maxKb: 30 },
      verify: true,
    },
    capf_gd: {
      name: "CAPF / BSF / CRPF / CISF (via SSC GD)",
      org: "Staff Selection Commission",
      category: "defence",
      tags: [
        "capf",
        "bsf",
        "crpf",
        "cisf",
        "itbp",
        "ssb",
        "gd constable",
        "ssc",
      ],
      photo: SSC_PHOTO,
      sign: SSC_SIGN,
    },
    state_police: {
      name: "State Police Constable / SI",
      org: "UP, Bihar, MP, Rajasthan and other state police boards",
      category: "defence",
      tags: [
        "police",
        "constable",
        "sub inspector",
        "up police",
        "bihar police",
        "mp police",
      ],
      photo: { ...GENERIC_PHOTO, minKb: 20, maxKb: 50 },
      sign: { ...GENERIC_SIGN, minKb: 10, maxKb: 30 },
      verify: true,
    },

    /* ---------------- Entrance & Teaching ---------------- */
    neet: {
      name: "NEET UG",
      org: "National Testing Agency",
      category: "entrance",
      tags: ["neet", "nta", "medical", "mbbs"],
      photo: NTA_PHOTO,
      sign: NTA_SIGN,
      extras: [
        {
          key: "postcard",
          name: "Postcard-size photo (4 × 6 in)",
          hint: "Same photo, larger print size",
          ...mm(101.6, 152.4, 150),
          format: "jpeg",
          minKb: 10,
          maxKb: 200,
          mode: "fill",
          guide: true,
        },
      ],
    },
    jee_main: {
      name: "JEE Main",
      org: "National Testing Agency",
      category: "entrance",
      tags: ["jee", "nta", "engineering", "iit"],
      photo: NTA_PHOTO,
      sign: NTA_SIGN,
    },
    cuet: {
      name: "CUET UG / PG",
      org: "National Testing Agency",
      category: "entrance",
      tags: ["cuet", "nta", "university"],
      photo: NTA_PHOTO,
      sign: NTA_SIGN,
    },
    ugc_net: {
      name: "UGC NET / CSIR NET",
      org: "National Testing Agency",
      category: "entrance",
      tags: ["ugc", "net", "csir", "nta", "jrf", "assistant professor"],
      photo: NTA_PHOTO,
      sign: NTA_SIGN,
    },
    gate: {
      name: "GATE",
      org: "IITs / IISc",
      category: "entrance",
      tags: ["gate", "iit", "engineering", "psu"],
      photo: P(400, 520, "jpeg", 5, 200),
      sign: P(500, 160, "jpeg", 5, 200),
      note: "GATE accepts photos from 200 × 260 to 530 × 690 px and signatures from 250 × 80 to 580 × 180 px.",
    },
    cat: {
      name: "CAT",
      org: "Indian Institutes of Management",
      category: "entrance",
      tags: ["cat", "iim", "mba"],
      photo: { ...mm(30, 45, 150), format: "jpeg", maxKb: 80 },
      sign: { ...mm(80, 35, 100), format: "jpeg", maxKb: 80 },
      verify: true,
    },
    ctet: {
      name: "CTET",
      org: "Central Board of Secondary Education",
      category: "entrance",
      tags: ["ctet", "cbse", "teacher", "tet"],
      photo: { ...GENERIC_PHOTO, minKb: 10, maxKb: 100 },
      sign: { ...GENERIC_SIGN, minKb: 3, maxKb: 30 },
    },
    state_tet: {
      name: "State TET / KVS / NVS",
      org: "State teacher eligibility tests and central schools",
      category: "entrance",
      tags: ["tet", "uptet", "htet", "reet", "kvs", "nvs", "teacher"],
      photo: { ...GENERIC_PHOTO, maxKb: 100 },
      sign: { ...GENERIC_SIGN, maxKb: 50 },
      verify: true,
    },

    /* ---------------- Passport, PAN & Visa ---------------- */
    passport_in: {
      name: "Indian Passport (Passport Seva)",
      org: "Ministry of External Affairs",
      category: "documents",
      tags: ["passport", "seva", "mea", "35x45"],
      photo: { ...mm(35, 45, 300), format: "jpeg" },
      sign: { ...mm(35, 15, 300), format: "jpeg" },
      note: "Plain white background, neutral expression, no glasses glare.",
    },
    us_visa: {
      name: "US Visa (DS-160)",
      org: "US Department of State",
      category: "documents",
      tags: ["usa", "visa", "ds-160", "2x2", "600x600"],
      photo: P(600, 600, "jpeg", undefined, 240),
      sign: P(300, 100, "png"),
      note: "Square, 600–1200 px, plain white background, under 240 KB.",
    },
    schengen: {
      name: "Schengen / UK visa (35 × 45 mm)",
      org: "ICAO passport-photo standard",
      category: "documents",
      tags: ["schengen", "uk", "europe", "visa", "icao", "35x45"],
      photo: { ...mm(35, 45, 300), format: "jpeg" },
      sign: { ...mm(35, 15, 300), format: "jpeg" },
      note: "Light grey or white background, face 70–80% of the frame.",
    },
    pan: {
      name: "PAN card (NSDL / UTIITSL)",
      org: "Income Tax Department",
      category: "documents",
      tags: ["pan", "nsdl", "utiitsl", "income tax"],
      photo: { ...mm(35, 25, 300), format: "jpeg", maxKb: 50 },
      sign: { ...mm(45, 20, 300), format: "jpeg", maxKb: 50 },
      verify: true,
    },
    passport: {
      name: "Passport / Visa 2 × 2 in",
      org: "600 × 600 px at 300 DPI",
      category: "documents",
      tags: ["2x2", "600x600", "square", "visa"],
      photo: P(600, 600, "jpeg"),
      sign: P(300, 100, "png"),
    },
    mm3545: {
      name: "35 × 45 mm ID photo",
      org: "413 × 531 px at 300 DPI",
      category: "documents",
      tags: ["35x45", "id photo", "generic", "300 dpi"],
      photo: { ...mm(35, 45, 300), format: "jpeg" },
      sign: { ...mm(35, 15, 300), format: "png" },
    },
    custom: {
      name: "Custom",
      org: "Enter your own pixel sizes",
      category: "custom",
      tags: ["custom", "any"],
      custom: true,
    },
  };

  window.GOVFORMS_CATALOG = { categories, templates };
})();
