#!/usr/bin/env node
/* ============================================================
   GovForms — news feed updater
   Pulls recent headlines about government vacancies and exam
   notifications from Google News RSS, normalises them and writes
   ./news.json. Runs daily in GitHub Actions (see
   .github/workflows/update-news.yml) and can be run locally with
   `node scripts/update-news.mjs`.
   ============================================================ */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "news.json");
const MAX_ITEMS = 72;
const MAX_AGE_DAYS = 45;

// Each query is tagged with the catalog category it feeds.
const QUERIES = [
  { category: "ssc", q: "SSC notification recruitment 2026" },
  { category: "ssc", q: 'SSC CGL OR CHSL OR MTS OR "GD Constable" exam' },
  { category: "railway", q: "RRB recruitment notification railway vacancy" },
  { category: "railway", q: 'RRB NTPC OR "Group D" OR ALP exam date' },
  { category: "banking", q: "IBPS OR SBI recruitment notification 2026" },
  { category: "banking", q: "RBI OR LIC OR NABARD recruitment notification" },
  { category: "upsc", q: "UPSC notification exam 2026" },
  { category: "upsc", q: "PSC recruitment notification state civil services" },
  { category: "defence", q: "Agniveer OR AFCAT OR CDS OR NDA recruitment" },
  {
    category: "defence",
    q: "police constable recruitment notification vacancy",
  },
  { category: "entrance", q: "NEET OR JEE OR CUET OR GATE registration date" },
  { category: "entrance", q: 'CTET OR "UGC NET" notification' },
  {
    category: "general",
    q: "sarkari naukri government job vacancy notification",
  },
];

function fetchText(url) {
  // Node's fetch ignores HTTPS_PROXY; fall back to curl (which honours it) when a proxy is set.
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    return execFileSync(
      "curl",
      ["-sS", "-L", "--max-time", "40", "-A", "GovFormsNewsBot/1.0", url],
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      },
    );
  }
  return fetch(url, { headers: { "user-agent": "GovFormsNewsBot/1.0" } }).then(
    (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.text();
    },
  );
}

const decode = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();

function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const pick = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
      return r ? r[1] : "";
    };
    let title = decode(pick("title"));
    const link = decode(pick("link"));
    const pubDate = decode(pick("pubDate"));
    const source = decode(pick("source"));
    if (source && title.endsWith(" - " + source))
      title = title.slice(0, -(source.length + 3));
    const date = new Date(pubDate);
    if (!title || !link || Number.isNaN(date.getTime())) continue;
    items.push({ title, link, source, date: date.toISOString() });
  }
  return items;
}

const seen = new Set();
const all = [];
const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
for (const { category, q } of QUERIES) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:45d")}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const xml = await fetchText(url);
    const items = parseItems(xml);
    let kept = 0;
    for (const it of items) {
      const key = it.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (seen.has(key) || new Date(it.date).getTime() < cutoff) continue;
      seen.add(key);
      all.push({ ...it, category });
      kept++;
    }
    console.log(
      `${category.padEnd(9)} ${String(kept).padStart(3)} new  ← ${q}`,
    );
  } catch (err) {
    console.error(`FAILED ${q}: ${err.message}`);
  }
}

all.sort((a, b) => new Date(b.date) - new Date(a.date));
const trimmed = all.slice(0, MAX_ITEMS);

// keep the previous feed if this run produced nothing (network hiccup)
if (!trimmed.length && existsSync(OUT)) {
  console.error("No items fetched; keeping the existing news.json");
  process.exit(0);
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
const output = {
  updatedAt: new Date().toISOString(),
  source: "Google News RSS (India edition)",
  items: trimmed,
};
const unchanged =
  previous && JSON.stringify(previous.items) === JSON.stringify(output.items);
if (unchanged) {
  console.log(`news.json unchanged (${trimmed.length} items)`);
} else {
  writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");
  console.log(`wrote news.json with ${trimmed.length} items`);
}
