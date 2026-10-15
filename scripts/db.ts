import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const cmd = process.argv[2];
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const dir = join(__dirname, "../db/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, f), "utf8"));
    console.log("migrated", f);
  }
}

async function main() {
  if (cmd === "migrate") await migrate();
  else if (cmd === "seed")
    console.log("`db:seed` jest przestarzałe — użyj: npm run db:import-got (wszystkie odcinki PTTK).");
  else throw new Error("Użycie: tsx scripts/db.ts migrate|seed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
