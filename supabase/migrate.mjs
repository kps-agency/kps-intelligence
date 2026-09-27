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

// DATABASE_URL doit pointer sur le Session Pooler (IPv4) — voir
// .env.example. La connexion directe (db.<ref>.supabase.co) est IPv6
// uniquement et s'est révélée franchement injoignable (ENETUNREACH, pas
// une simple lenteur) sur certains réseaux, y compris celui utilisé pour
// développer ce projet. Le pooler est aussi le choix recommandé par
// Supabase pour ce cas de figure.
//
// Les tentatives ci-dessous couvrent les blips réseau ordinaires — elles
// n'auraient pas suffi à elles seules pour le problème IPv6 ci-dessus,
// qui n'était pas transitoire. pg.Client ne peut pas retenter une
// connexion après un échec (il refuse toute réutilisation, même après un
// connect() raté), donc chaque tentative recrée un client.
async function connectWithRetry(connectionString, attempts = 3, delayMs = 1500) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
      if (attempt < attempts) {
        console.log(
          `Connexion échouée (${err.code ?? err.message}), nouvelle tentative ${attempt}/${attempts - 1}...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL manquant — vérifie ton fichier .env.");
  }

  const client = await connectWithRetry(databaseUrl);

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
