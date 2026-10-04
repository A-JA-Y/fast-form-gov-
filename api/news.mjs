/* ============================================================
   GovForms — live exam news (Vercel function, GET /api/news)
   Fetches the Google News RSS searches in news-core.mjs on
   request. Vercel's edge serves each result for 5 minutes and keeps
   serving it while the next one is fetched, so the feed stays
   minutes-fresh without hitting Google on every visit. The page
   falls back to the daily news.json snapshot if this fails.
   ============================================================ */
import { collectNews, SOURCE } from "../scripts/news-core.mjs";

const TIMEOUT_MS = 8000;

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "GovFormsNewsBot/1.0" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export default async function handler(req, res) {
  try {
    const items = await collectNews(fetchText);
    if (!items.length) throw new Error("no headlines");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    res.status(200).send(JSON.stringify({ updatedAt: new Date().toISOString(), source: SOURCE, items }));
  } catch (err) {
    // never cache a failure; the page falls back to news.json
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "News is unavailable right now." });
  }
}
