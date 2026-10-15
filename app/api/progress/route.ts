import { DEFAULT_USER_ID, getPool } from "@/lib/db";
import type { Direction, UserTrailProgress } from "@/types/pttk";

export async function GET() {
  try {
    const { rows } = await getPool().query(
      `SELECT user_id, segment_id, direction, completed_at, source_activity_id
         FROM user_trail_progress WHERE user_id = $1 ORDER BY completed_at`,
      [DEFAULT_USER_ID],
    );
    const progress: UserTrailProgress[] = rows.map((r) => ({
      userId: r.user_id,
      segmentId: r.segment_id,
      direction: r.direction,
      completedAt: new Date(r.completed_at).toISOString(),
      sourceActivityId: r.source_activity_id ?? undefined,
    }));
    return Response.json({ progress });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

interface PostBody {
  activityId?: string;
  completions: { segmentId: string; direction: Direction }[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<PostBody>;
  const items = body.completions;
  if (
    !Array.isArray(items) ||
    items.some((c) => typeof c?.segmentId !== "string" || !["forward", "backward"].includes(c.direction))
  ) {
    return Response.json({ error: "Wymagane: completions[{segmentId, direction}]" }, { status: 400 });
  }
  try {
    const { rowCount } = await getPool().query(
      `INSERT INTO user_trail_progress (user_id, segment_id, direction, source_activity_id)
       SELECT $1, c.segment_id, c.direction, $4
         FROM unnest($2::text[], $3::text[]) AS c(segment_id, direction)
       ON CONFLICT DO NOTHING`,
      [
        DEFAULT_USER_ID,
        items.map((c) => c.segmentId),
        items.map((c) => c.direction),
        body.activityId ?? null,
      ],
    );
    return Response.json({ inserted: rowCount });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
