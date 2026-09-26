#!/usr/bin/env node
// Exécuteur de migrations SQL minimal, sans dépendance au CLI Supabase.
// Lit supabase/migrations/*.sql dans l'ordre alphabétique (donc
// chronologique grâce au préfixe timestamp) et n'applique que celles pas
// encore enregistrées dans la table de suivi `schema_migrations`.
//
// Usage : node supabase/migrate.mjs
// Nécessite DATABASE_URL dans l'environnement (voir .env).

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const migrationsDir = join(__dirname, "migrations");

loadEnv({ path: join(repoRoot, ".env") });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL manquant — vérifie ton fichier .env.");
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await client.query(
      "select filename from schema_migrations",
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log("Aucune migration à appliquer — schéma à jour.");
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`→ Application de ${file} ...`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (filename) values ($1)",
          [file],
        );
        await client.query("commit");
        console.log(`  ✓ ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Échec sur ${file} : ${err.message}`);
      }
    }

    console.log(`Terminé — ${pending.length} migration(s) appliquée(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
