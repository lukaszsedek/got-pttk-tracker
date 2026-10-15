import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio/slim";
import { parseGotPage } from "../lib/got/parse-page";
import type { GotPageMeta, GotRecord } from "../lib/got/types";

const BASE = "https://pttkhts.hg.pl/ktg/komisja-tg/got/";
const UA = "got-pttk-tracker/0.1 (+https://github.com/lukaszsedek/got-pttk-tracker)";
const OUT = join(__dirname, "../data/got");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Strony PTTK są w ISO-8859-2.
      return new TextDecoder("iso-8859-2").decode(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${(e as Error).message}`);
      await sleep(1000 * attempt);
    }
  }
}

async function main() {
  const index = await fetchHtml(`${BASE}got.html`);
  const $ = cheerio.load(index);
  const pages = [
    ...new Set(
      $("a[href$='.html']")
        .map((_, a) => $(a).attr("href")!)
        .get()
        .filter((h) => !/^https?:/.test(h)),
    ),
  ];
  console.log(`Znaleziono ${pages.length} podstron`);

  const metas: GotPageMeta[] = [];
  const records: GotRecord[] = [];
  for (const page of pages) {
    const url = BASE + page.replace(/ /g, "%20");
    const { meta, records: recs } = parseGotPage(await fetchHtml(url), page.replace(/[/ ]/g, "_"), url);
    metas.push(meta);
    records.push(...recs);
    console.log(`${meta.groupCode.padEnd(28)} ${String(meta.blocks).padStart(3)} bloków ${String(meta.records).padStart(4)} wierszy  ${page}`);
    await sleep(300); // nie obciążamy serwera
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "pages.json"), JSON.stringify(metas, null, 2) + "\n");
  writeFileSync(join(OUT, "records.json"), JSON.stringify(records, null, 1) + "\n");

  const edges = records.filter((r) => r.kind === "edge");
  console.log(
    `\nRazem: ${records.length} wierszy, w tym ${edges.length} odcinków; ` +
      `BZ: ${edges.filter((r) => r.unmarked).length}; ` +
      `bez punktów: ${records.filter((r) => r.pointsForward === null).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
