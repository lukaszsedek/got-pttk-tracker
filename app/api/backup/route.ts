import { DEFAULT_USER_ID, getPool } from "@/lib/db";

interface Backup {
  version: 1;
  exportedAt: string;
  progress: { segmentId: string; direction: string; completedAt: string; sourceActivityId?: string | null }[];
  plan: { segmentId: string; direction: string; addedAt: string }[];
}

/** Pełna kopia danych użytkownika (zaliczenia + plan) jako JSON do pobrania. */
export async function GET() {
  try {
    const pool = getPool();
    const [pr, pl] = await Promise.all([
      pool.query(
        `SELECT segment_id, direction, completed_at, source_activity_id FROM user_trail_progress WHERE user_id = $1`,
        [DEFAULT_USER_ID],
      ),
      pool.query(`SELECT segment_id, direction, added_at FROM user_plan WHERE user_id = $1`, [DEFAULT_USER_ID]),
    ]);
    const body: Backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: pr.rows.map((r) => ({
        segmentId: r.segment_id,
        direction: r.direction,
        completedAt: new Date(r.completed_at).toISOString(),
        sourceActivityId: r.source_activity_id,
      })),
      plan: pl.rows.map((r) => ({
        segmentId: r.segment_id,
        direction: r.direction,
        addedAt: new Date(r.added_at).toISOString(),
      })),
    };
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

const isDir = (d: unknown) => d === "forward" || d === "backward";

/** Przywraca kopię (scalanie: istniejące wpisy zostają, odcinki spoza bazy są pomijane). */
export async function POST(request: Request) {
  let b: Partial<Backup>;
  try {
    b = (await request.json()) as Partial<Backup>;
  } catch {
    return Response.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }
  if (b.version !== 1 || !Array.isArray(b.progress) || !Array.isArray(b.plan)) {
    return Response.json({ error: "To nie jest kopia z tej aplikacji (version 1)" }, { status: 400 });
  }
  const prog = b.progress.filter(
    (p) => typeof p?.segmentId === "string" && isDir(p.direction) && !Number.isNaN(Date.parse(p.completedAt)),
  );
  const plan = b.plan.filter((p) => typeof p?.segmentId === "string" && isDir(p.direction));
  try {
    const pool = getPool();
    const a = await pool.query(
      `INSERT INTO user_trail_progress (user_id, segment_id, direction, completed_at, source_activity_id)
       SELECT $1, c.s, c.d, c.at::timestamptz, c.src
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS c(s, d, at, src)
        WHERE c.s IN (SELECT id FROM segments)
       ON CONFLICT DO NOTHING`,
      [
        DEFAULT_USER_ID,
        prog.map((p) => p.segmentId),
        prog.map((p) => p.direction),
        prog.map((p) => p.completedAt),
        prog.map((p) => p.sourceActivityId ?? null),
      ],
    );
    const c = await pool.query(
      `INSERT INTO user_plan (user_id, segment_id, direction)
       SELECT $1, c.s, c.d FROM unnest($2::text[], $3::text[]) AS c(s, d)
        WHERE c.s IN (SELECT id FROM segments)
       ON CONFLICT DO NOTHING`,
      [DEFAULT_USER_ID, plan.map((p) => p.segmentId), plan.map((p) => p.direction)],
    );
    return Response.json({
      progressInserted: a.rowCount,
      planInserted: c.rowCount,
      skipped: prog.length - (a.rowCount ?? 0) + plan.length - (c.rowCount ?? 0),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
