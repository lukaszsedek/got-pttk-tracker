import * as cheerio from "cheerio/slim";
import type { TrailColor } from "@/types/pttk";
import type { GotPageMeta, GotRecord } from "./types";

const COLOR_BY_ALT: [RegExp, TrailColor][] = [
  [/niebiesk/i, "Blue"],
  [/zielon/i, "Green"],
  [/czerwon/i, "Red"],
  [/[żz]o?[łl]t/i, "Yellow"],
  [/czarn/i, "Black"],
];

const clean = (s: string) =>
  s.replace(/[ \s]+/g, " ").replace(/\s*\r?\n\s*/g, " ").trim();

/** "7/4", "7", "7+3/3+1 (10/4)", "?/?", "4/-", "6/(8)" → punkty tam/z powrotem. */
export function parsePoints(raw: string): { forward: number | null; backward: number | null } {
  const s = raw.replace(/[ \s]+/g, "");
  const paren = s.match(/\((\d+)\/(\d+)\)/);
  if (paren) return { forward: +paren[1], backward: +paren[2] };
  const m = s.match(/^(\d+|\?|-)?(?:\/(?:\((\d+)\)|(\d+)|\?|-))?$/);
  if (!m) return { forward: null, backward: null };
  const num = (v?: string) => (v && /^\d+$/.test(v) ? +v : null);
  if (!s.includes("/")) return { forward: num(m[1]), backward: null }; // jeden kierunek
  return { forward: num(m[1]), backward: num(m[2] ?? m[3]) };
}

function groupFromHeading(text: string): { code: string | null; name: string } {
  const t = clean(text);
  const m = t.match(/(?:^|[^A-Za-zŁ])(BZ|BW|[TSŁ])\s*\.?\s*(\d{2})(?!\d)/);
  const code = m ? `${m[1]}.${m[2]}` : null;
  const name = t
    .replace(/[-–:]?\s*(?<![A-Za-zŁ])(BZ|BW|[TSŁ])\s*\.?\s*\d{2}(?!\d)/, "")
    .replace(/\bGRUPA\b/i, "")
    .replace(/[-–:\s]+$/, "")
    .trim();
  return { code, name };
}

function splitElevation(name: string): { name: string; elevation?: string } {
  const m = name.match(/^(.*?)\s*\(([\d\s÷–-]+)\s*m\)\s*$/);
  return m ? { name: m[1].trim(), elevation: m[2].trim() } : { name };
}

/** Parsuje jedną podstronę regionu. `html` musi być już zdekodowany do UTF-8. */
export function parseGotPage(html: string, sourcePage: string, url: string) {
  const $ = cheerio.load(html);

  // Nagłówek grupy: pierwszy <h4> z kodem; dla stron słowackich — ostatni <h4>.
  const headings = $("h4").map((_, el) => clean($(el).text())).get();
  let group = { code: null as string | null, name: "" };
  for (const h of headings) {
    const g = groupFromHeading(h);
    if (g.code) {
      group = g;
      break;
    }
  }
  if (!group.code) {
    const h = headings[headings.length - 1] ?? sourcePage;
    group = {
      code: `SK-${sourcePage.replace(/\.html$/, "").replace(/_/g, "-")}`,
      name: h.replace(/\s*-\s*Słowacja\s*$/i, ""),
    };
  }
  const groupCode = group.code!;

  const records: GotRecord[] = [];
  let blockNo = 0;

  $("table.kolor").each((_, tbl) => {
    const t = $(tbl);
    // Wiersze nagłówkowe bieżącej tabeli (bez zagnieżdżonej): ostatni to punkt docelowy,
    // wcześniejsze to nazwa sekcji (np. "GRZBIET GŁÓWNY").
    const headers = t
      .find("tr")
      .filter((_, tr) => $(tr).closest("table")[0] === tbl && $(tr).find("table").length === 0)
      .map((_, tr) => clean($(tr).text()))
      .get()
      .filter(Boolean);
    const header = headers[headers.length - 1];
    if (!header) return;
    blockNo++;
    const dest = splitElevation(header);
    const section = headers.length > 1 ? headers.slice(0, -1).join(" / ") : undefined;

    let rowNo = 0;
    t.find("table tr").each((_, tr) => {
      const tds = $(tr).children("td");
      if (tds.length < 2) return;
      const colorCell = tds.length >= 3 ? tds.eq(0) : null;
      const nameCell = tds.length >= 3 ? tds.eq(1) : tds.eq(0);
      const ptsCell = tds.eq(tds.length - 1);

      const rawName = clean(nameCell.text());
      const pointsRaw = clean(ptsCell.text());
      if (!rawName && !pointsRaw) return;

      // Kolory z atrybutów alt ikon; "BZ" = bez znaków.
      const colors: TrailColor[] = [];
      let unmarked = false;
      if (colorCell) {
        colorCell.find("img").each((_, img) => {
          const alt = $(img).attr("alt") ?? "";
          const hit = COLOR_BY_ALT.find(([re]) => re.test(alt));
          if (hit && !colors.includes(hit[1])) colors.push(hit[1]);
        });
        if (/\bBZ\b/.test(clean(colorCell.text()))) unmarked = true;
      }
      // Strony słowackie: kolor w klasie CSS div-a w komórce nazwy.
      nameCell.find("div").each((_, d) => {
        const cls = $(d).attr("class") ?? "";
        const hit = COLOR_BY_ALT.find(([re]) => re.test(cls));
        if (hit && !colors.includes(hit[1])) colors.push(hit[1]);
      });

      const edge = rawName.match(/^(?:z|ze|od)\s+(.+)$/i);
      const { forward, backward } = parsePoints(pointsRaw);
      rowNo++;
      records.push({
        id: `${sourcePage.replace(/\.html$/, "")}:${blockNo}:${rowNo}`,
        groupCode,
        regionName: group.name,
        sourcePage,
        destination: dest.name,
        destinationElevationM: dest.elevation,
        section,
        origin: edge ? edge[1].trim() : undefined,
        trailColors: colors,
        unmarked,
        pointsForward: forward,
        pointsBackward: backward,
        pointsRaw,
        kind: edge ? "edge" : forward !== null && !colorCell ? "other" : "attraction",
        rawName,
      });
    });
  });

  const meta: GotPageMeta = {
    sourcePage,
    url,
    groupCode,
    regionName: group.name,
    blocks: blockNo,
    records: records.length,
  };
  return { meta, records };
}
