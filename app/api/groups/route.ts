import { getPool } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await getPool().query<{ group_id: string; segments: string }>(
      `SELECT group_id, count(*) AS segments FROM segments GROUP BY group_id ORDER BY group_id`,
    );
    return Response.json({
      groups: rows.map((r) => ({ id: r.group_id, segments: Number(r.segments) })),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
