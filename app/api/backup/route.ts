import { DEFAULT_USER_ID, ensureSchema, getPool } from "@/lib/db";

import { snapshot } from "@/lib/auto-backup";

/** Pełna kopia danych użytkownika (zaliczenia, plan, odznaki) jako JSON do pobrania. */
export async function GET() {
  try {
    const body = await snapshot();
    return new Response(JSON.stringify(body, null, 1), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="got-kopia-${body.exportedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

interface Backup {
  version: 1 | 2;
  exportedAt: string;
  progress: {
    segmentId: string;
    direction: string;
    completedAt: string;
    sourceActivityId?: string | null;
    verifiedYear?: number | null;
    note?: string | null;
  }[];
  plan: { segmentId: string; direction: string; addedAt: string }[];
  badges?: { badgeId: string; earnedYear: number }[];
}

const isDir = (d: unknown) => d === "forward" || d === "backward";

/** Przywraca kopię (scalanie: istniejące wpisy zostają, odcinki spoza bazy są pomijane). */
export async function POST(request: Request) {
  let b: Partial<Backup>;
  try {
    b = (await request.json()) as Partial<Backup>;
  } catch {
    return Response.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }
  if ((b.version !== 1 && b.version !== 2) || !Array.isArray(b.progress) || !Array.isArray(b.plan)) {
    return Response.json({ error: "To nie jest kopia z tej aplikacji (version 1)" }, { status: 400 });
  }
  const prog = b.progress.filter(
    (p) => typeof p?.segmentId === "string" && isDir(p.direction) && !Number.isNaN(Date.parse(p.completedAt)),
  );
  const plan = b.plan.filter((p) => typeof p?.segmentId === "string" && isDir(p.direction));
  try {
    await ensureSchema();
    const pool = getPool();
    const a = await pool.query(
      `INSERT INTO user_trail_progress (user_id, segment_id, direction, completed_at, source_activity_id, verified_year, note)
       SELECT $1, c.s, c.d, c.at::timestamptz, c.src, c.vy, c.note
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::text[]) AS c(s, d, at, src, vy, note)
        WHERE c.s IN (SELECT id FROM segments)
       ON CONFLICT DO NOTHING`,
      [
        DEFAULT_USER_ID,
        prog.map((p) => p.segmentId),
        prog.map((p) => p.direction),
        prog.map((p) => p.completedAt),
        prog.map((p) => p.sourceActivityId ?? null),
        prog.map((p) => (Number.isInteger(p.verifiedYear) ? p.verifiedYear : null)),
        prog.map((p) => p.note ?? null),
      ],
    );
    const c = await pool.query(
      `INSERT INTO user_plan (user_id, segment_id, direction)
       SELECT $1, c.s, c.d FROM unnest($2::text[], $3::text[]) AS c(s, d)
        WHERE c.s IN (SELECT id FROM segments)
       ON CONFLICT DO NOTHING`,
      [DEFAULT_USER_ID, plan.map((p) => p.segmentId), plan.map((p) => p.direction)],
    );
    for (const bd of b.badges ?? []) {
      if (typeof bd?.badgeId === "string" && Number.isInteger(bd.earnedYear)) {
        await pool.query(
          `INSERT INTO user_badges (user_id, badge_id, earned_year) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [DEFAULT_USER_ID, bd.badgeId, bd.earnedYear],
        );
      }
    }
    return Response.json({
      progressInserted: a.rowCount,
      planInserted: c.rowCount,
      skipped: prog.length - (a.rowCount ?? 0) + plan.length - (c.rowCount ?? 0),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
