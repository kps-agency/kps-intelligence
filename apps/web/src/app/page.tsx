import { redirect } from "next/navigation";

// Le middleware garantit qu'on n'atteint cette page qu'authentifié
// (sinon redirection vers /login) — il ne reste qu'à router vers le
// dashboard, qui devient la vraie page d'accueil de l'application.
export default function HomePage() {
  redirect("/dashboard");
}
