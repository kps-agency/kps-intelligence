#!/usr/bin/env node
// Crée le tout premier utilisateur (SUPER_ADMIN par défaut), via l'API
// Admin de Supabase Auth + insertion du profil applicatif (public.users).
// À exécuter une seule fois par rôle nécessaire pour les tests manuels —
// les utilisateurs suivants passent par le module `users` de apps/api une
// fois authentifié en tant qu'admin.
//
// Usage : node supabase/bootstrap-admin.mjs <email> [role_key] [password]

import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
loadEnv({ path: join(repoRoot, ".env") });

const email = process.argv[2];
const roleKey = process.argv[3] ?? "SUPER_ADMIN";
const password = process.argv[4] ?? randomBytes(12).toString("base64url");

if (!email) {
  console.error(
    "Usage: node supabase/bootstrap-admin.mjs <email> [role_key] [password]",
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError) {
    throw new Error(`Échec création utilisateur Auth : ${createError.message}`);
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("key", roleKey)
    .single();

  if (roleError) {
    throw new Error(`Rôle ${roleKey} introuvable : ${roleError.message}`);
  }

  const { error: profileError } = await supabase.from("users").insert({
    id: created.user.id,
    first_name: roleKey,
    last_name: "Test",
    email,
    role_id: role.id,
    status: "ACTIVE",
  });

  if (profileError) {
    throw new Error(`Échec création profil : ${profileError.message}`);
  }

  console.log(`Utilisateur ${roleKey} créé avec succès :`);
  console.log(`  email    : ${email}`);
  console.log(`  password : ${password}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
