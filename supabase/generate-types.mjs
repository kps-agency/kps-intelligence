#!/usr/bin/env node
// Régénère packages/types/src/supabase.generated.ts depuis le schéma réel
// de la base (via une connexion directe, sans besoin de session CLI
// authentifiée). À lancer après chaque nouvelle migration qui change le
// schéma public.
//
// Usage : node supabase/generate-types.mjs
// Nécessite le CLI Supabase installé et Docker (postgres-meta) disponible.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
loadEnv({ path: join(repoRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL manquant — vérifie ton fichier .env.");
  process.exit(1);
}

const outputPath = join(repoRoot, "packages/types/src/supabase.generated.ts");

console.log("Génération des types depuis le schéma réel (peut prendre ~30s)...");
const output = execSync(
  `supabase gen types typescript --db-url "${databaseUrl}" --schema public`,
  { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1024 * 1024 * 10 },
).toString();

writeFileSync(outputPath, output);
console.log(`✓ Types écrits dans ${outputPath}`);
