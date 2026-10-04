/* ============================================================
   GovForms — news feed core
   Pulls recent headlines about government vacancies and exam
   notifications from Google News RSS and normalises them. Shared
   by api/news.mjs (the live feed the page reads) and
   scripts/update-news.mjs (the daily news.json snapshot).
   ============================================================ */
export const MAX_ITEMS = 72;
export const MAX_AGE_DAYS = 45;
export const SOURCE = "Google News RSS (India edition)";

// Each query is tagged with the catalog category it feeds.
export const QUERIES = [
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

export const feedUrl = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:45d")}&hl=en-IN&gl=IN&ceid=IN:en`;

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

export function parseItems(xml) {
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
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const date = new Date(pubDate);
    if (!title || !link || Number.isNaN(date.getTime())) continue;
    items.push({ title, link, source, date: date.toISOString() });
  }
  return items;
}

// fetchText(url) -> string or Promise<string>. All searches run in parallel; results are merged in
// QUERIES order, so a headline found by several searches keeps the category of the first one.
export async function collectNews(fetchText, log = () => {}) {
  const results = await Promise.allSettled(QUERIES.map(({ q }) => Promise.resolve().then(() => fetchText(feedUrl(q)))));
  const seen = new Set();
  const all = [];
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  results.forEach((r, i) => {
    const { category, q } = QUERIES[i];
    if (r.status !== "fulfilled") {
      log(`FAILED ${q}: ${r.reason && r.reason.message ? r.reason.message : r.reason}`);
      return;
    }
    let kept = 0;
    for (const it of parseItems(r.value)) {
      const key = it.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (seen.has(key) || new Date(it.date).getTime() < cutoff) continue;
      seen.add(key);
      all.push({ ...it, category });
      kept++;
    }
    log(`${category.padEnd(9)} ${String(kept).padStart(3)} new  ← ${q}`);
  });
  all.sort((a, b) => new Date(b.date) - new Date(a.date));
  return all.slice(0, MAX_ITEMS);
}
