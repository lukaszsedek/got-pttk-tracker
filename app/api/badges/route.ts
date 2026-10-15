import { maybeBackup } from "@/lib/auto-backup";
import { DEFAULT_USER_ID, ensureSchema, getPool } from "@/lib/db";

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      `SELECT badge_id, earned_year FROM user_badges WHERE user_id = $1 ORDER BY earned_year`,
      [DEFAULT_USER_ID],
    );
    return Response.json({ badges: rows.map((r) => ({ badgeId: r.badge_id, earnedYear: r.earned_year })) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Zapisuje (lub zmienia rok) zdobytej odznaki. */
export async function POST(request: Request) {
  const { badgeId, earnedYear } = (await request.json()) as { badgeId?: string; earnedYear?: number };
  if (typeof badgeId !== "string" || !Number.isInteger(earnedYear) || earnedYear! < 1950 || earnedYear! > 2100) {
    return Response.json({ error: "Wymagane: badgeId, earnedYear" }, { status: 400 });
  }
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO user_badges (user_id, badge_id, earned_year) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, badge_id) DO UPDATE SET earned_year = EXCLUDED.earned_year`,
      [DEFAULT_USER_ID, badgeId, earnedYear],
    );
    maybeBackup();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { badgeId } = (await request.json()) as { badgeId?: string };
  if (typeof badgeId !== "string") return Response.json({ error: "Wymagane: badgeId" }, { status: 400 });
  try {
    await ensureSchema();
    await getPool().query(`DELETE FROM user_badges WHERE user_id = $1 AND badge_id = $2`, [DEFAULT_USER_ID, badgeId]);
    maybeBackup();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
