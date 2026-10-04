#!/usr/bin/env node
/* ============================================================
   GovForms — news snapshot updater
   Writes ./news.json from Google News RSS (see news-core.mjs).
   The page reads the live feed at /api/news and falls back to this
   snapshot, which GitHub Actions refreshes daily (see
   .github/workflows/update-news.yml). Run locally with
   `node scripts/update-news.mjs`.
   ============================================================ */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { collectNews, SOURCE } from "./news-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "news.json");

function fetchText(url) {
  // Node's fetch ignores HTTPS_PROXY; fall back to curl (which honours it) when a proxy is set.
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    return execFileSync("curl", ["-sS", "-L", "--max-time", "40", "-A", "GovFormsNewsBot/1.0", url], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  }
  return fetch(url, { headers: { "user-agent": "GovFormsNewsBot/1.0" } }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.text();
  });
}

const items = await collectNews(fetchText, (line) => (line.startsWith("FAILED") ? console.error(line) : console.log(line)));

// keep the previous feed if this run produced nothing (network hiccup)
if (!items.length && existsSync(OUT)) {
  console.error("No items fetched; keeping the existing news.json");
  process.exit(0);
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
const output = {
  updatedAt: new Date().toISOString(),
  source: SOURCE,
  items,
};
const unchanged = previous && JSON.stringify(previous.items) === JSON.stringify(output.items);
if (unchanged) {
  console.log(`news.json unchanged (${items.length} items)`);
} else {
  writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");
  console.log(`wrote news.json with ${items.length} items`);
}
