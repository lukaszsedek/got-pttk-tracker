import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_USER_ID, ensureSchema, getPool } from "@/lib/db";

const DIR = process.env.BACKUP_DIR ?? "/app/backups";
const EVERY_MS = 60 * 60 * 1000; // najwyżej raz na godzinę
const KEEP = 40;
let last = 0;

/** Zrzut zaliczeń, planu i odznak do pliku JSON. */
export async function snapshot() {
  await ensureSchema();
  const pool = getPool();
  const [pr, pl, bd] = await Promise.all([
    pool.query(
      `SELECT segment_id, direction, completed_at, source_activity_id, verified_year, note
         FROM user_trail_progress WHERE user_id = $1`,
      [DEFAULT_USER_ID],
    ),
    pool.query(`SELECT segment_id, direction, added_at FROM user_plan WHERE user_id = $1`, [DEFAULT_USER_ID]),
    pool.query(`SELECT badge_id, earned_year FROM user_badges WHERE user_id = $1`, [DEFAULT_USER_ID]),
  ]);
  return {
    version: 2 as const,
    exportedAt: new Date().toISOString(),
    progress: pr.rows.map((r) => ({
      segmentId: r.segment_id as string,
      direction: r.direction as string,
      completedAt: new Date(r.completed_at).toISOString(),
      sourceActivityId: (r.source_activity_id as string | null) ?? null,
      verifiedYear: (r.verified_year as number | null) ?? null,
      note: (r.note as string | null) ?? null,
    })),
    plan: pl.rows.map((r) => ({
      segmentId: r.segment_id as string,
      direction: r.direction as string,
      addedAt: new Date(r.added_at).toISOString(),
    })),
    badges: bd.rows.map((r) => ({ badgeId: r.badge_id as string, earnedYear: r.earned_year as number })),
  };
}

/** Automatyczna kopia po zmianach (best effort — błędy tylko logujemy). */
export function maybeBackup() {
  if (Date.now() - last < EVERY_MS) return;
  last = Date.now();
  void (async () => {
    try {
      await mkdir(DIR, { recursive: true });
      const snap = await snapshot();
      const name = `got-kopia-${snap.exportedAt.slice(0, 16).replace(/[:T]/g, "-")}.json`;
      await writeFile(join(DIR, name), JSON.stringify(snap));
      const files = (await readdir(DIR)).filter((f) => f.startsWith("got-kopia-")).sort();
      for (const f of files.slice(0, Math.max(0, files.length - KEEP))) await unlink(join(DIR, f));
    } catch (e) {
      last = 0;
      console.warn("Automatyczna kopia nie powiodła się:", (e as Error).message);
    }
  })();
}
