import { APP_NAME } from "@kps/shared";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <p className="text-muted-foreground">
        Plateforme en cours de construction — voir docs/AI_CONTEXT.md pour
        l&apos;état d&apos;avancement des phases.
      </p>
    </main>
  );
}
