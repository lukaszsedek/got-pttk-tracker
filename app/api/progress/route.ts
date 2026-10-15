import { maybeBackup } from "@/lib/auto-backup";
import { DEFAULT_USER_ID, ensureSchema, getPool } from "@/lib/db";
import type { Direction, UserTrailProgress } from "@/types/pttk";

const isDir = (d: unknown): d is Direction => d === "forward" || d === "backward";

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      `SELECT user_id, segment_id, direction, completed_at, source_activity_id, verified_year, note
         FROM user_trail_progress WHERE user_id = $1 ORDER BY completed_at DESC`,
      [DEFAULT_USER_ID],
    );
    const progress: UserTrailProgress[] = rows.map((r) => ({
      userId: r.user_id,
      segmentId: r.segment_id,
      direction: r.direction,
      completedAt: new Date(r.completed_at).toISOString(),
      sourceActivityId: r.source_activity_id ?? undefined,
      verifiedYear: r.verified_year ?? undefined,
      note: r.note ?? undefined,
    }));
    return Response.json({ progress });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

interface PostBody {
  activityId?: string;
  completions: { segmentId: string; direction: Direction; completedAt?: string; verifiedYear?: number; note?: string }[];
}

/** Dodaje zaliczenia (z GPX lub ręcznie). Ponowne zaliczenie tego samego odcinka/kierunku jest ignorowane. */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<PostBody>;
  const items = body.completions;
  if (
    !Array.isArray(items) ||
    items.some(
      (c) =>
        typeof c?.segmentId !== "string" ||
        !isDir(c.direction) ||
        (c.completedAt !== undefined && Number.isNaN(Date.parse(c.completedAt))),
    )
  ) {
    return Response.json({ error: "Wymagane: completions[{segmentId, direction, completedAt?}]" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const { rowCount } = await getPool().query(
      `INSERT INTO user_trail_progress (user_id, segment_id, direction, completed_at, source_activity_id, verified_year, note)
       SELECT $1, c.segment_id, c.direction, COALESCE(c.at::timestamptz, now()), $5, c.vy, c.note
         FROM unnest($2::text[], $3::text[], $4::text[], $6::int[], $7::text[]) AS c(segment_id, direction, at, vy, note)
       ON CONFLICT DO NOTHING`,
      [
        DEFAULT_USER_ID,
        items.map((c) => c.segmentId),
        items.map((c) => c.direction),
        items.map((c) => c.completedAt ?? null),
        body.activityId ?? null,
        items.map((c) => (Number.isInteger(c.verifiedYear) ? c.verifiedYear : null)),
        items.map((c) => (typeof c.note === "string" && c.note ? c.note : null)),
      ],
    );
    maybeBackup();
    return Response.json({ inserted: rowCount });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Cofa zaliczenie odcinka w danym kierunku. */
export async function DELETE(request: Request) {
  const body = (await request.json()) as { segmentId?: string; direction?: unknown; activityId?: string };
  if (typeof body.activityId === "string" && body.activityId) {
    try {
      await ensureSchema();
      const { rowCount } = await getPool().query(
        `DELETE FROM user_trail_progress WHERE user_id = $1 AND source_activity_id = $2`,
        [DEFAULT_USER_ID, body.activityId],
      );
      maybeBackup();
      return Response.json({ deleted: rowCount });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  const { segmentId, direction } = body;
  if (typeof segmentId !== "string" || !isDir(direction)) {
    return Response.json({ error: "Wymagane: segmentId, direction" }, { status: 400 });
  }
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM user_trail_progress WHERE user_id = $1 AND segment_id = $2 AND direction = $3`,
      [DEFAULT_USER_ID, segmentId, direction],
    );
    maybeBackup();
    return Response.json({ deleted: rowCount });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Zmienia datę przejścia istniejącego zaliczenia. */
export async function PATCH(request: Request) {
  const { segmentId, direction, completedAt, verifiedYear, note } = (await request.json()) as {
    segmentId?: string;
    direction?: unknown;
    completedAt?: string;
    verifiedYear?: number | null;
    note?: string | null;
  };
  if (
    typeof segmentId !== "string" ||
    !isDir(direction) ||
    typeof completedAt !== "string" ||
    Number.isNaN(Date.parse(completedAt))
  ) {
    return Response.json({ error: "Wymagane: segmentId, direction, completedAt" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const { rowCount } = await getPool().query(
      `UPDATE user_trail_progress SET completed_at = $4::timestamptz,
              verified_year = CASE WHEN $5::boolean THEN $6::int ELSE verified_year END,
              note = CASE WHEN $7::boolean THEN $8::text ELSE note END
        WHERE user_id = $1 AND segment_id = $2 AND direction = $3`,
      [DEFAULT_USER_ID, segmentId, direction, completedAt, verifiedYear !== undefined, verifiedYear ?? null, note !== undefined, note || null],
    );
    maybeBackup();
    return Response.json({ updated: rowCount });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
