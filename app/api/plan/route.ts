import { DEFAULT_USER_ID, getPool } from "@/lib/db";
import type { Direction } from "@/types/pttk";

const isDir = (d: unknown): d is Direction => d === "forward" || d === "backward";

export async function GET() {
  try {
    const { rows } = await getPool().query(
      `SELECT segment_id, direction, added_at FROM user_plan WHERE user_id = $1 ORDER BY added_at`,
      [DEFAULT_USER_ID],
    );
    return Response.json({
      plan: rows.map((r) => ({
        segmentId: r.segment_id as string,
        direction: r.direction as Direction,
        addedAt: new Date(r.added_at).toISOString(),
      })),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { segmentId, direction } = (await request.json()) as { segmentId?: string; direction?: unknown };
  if (typeof segmentId !== "string" || !isDir(direction)) {
    return Response.json({ error: "Wymagane: segmentId, direction" }, { status: 400 });
  }
  try {
    await getPool().query(
      `INSERT INTO user_plan (user_id, segment_id, direction) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [DEFAULT_USER_ID, segmentId, direction],
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { segmentId, direction } = (await request.json()) as { segmentId?: string; direction?: unknown };
  if (typeof segmentId !== "string" || !isDir(direction)) {
    return Response.json({ error: "Wymagane: segmentId, direction" }, { status: 400 });
  }
  try {
    await getPool().query(
      `DELETE FROM user_plan WHERE user_id = $1 AND segment_id = $2 AND direction = $3`,
      [DEFAULT_USER_ID, segmentId, direction],
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
