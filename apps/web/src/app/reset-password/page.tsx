import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">Réinitialiser le mot de passe</h1>
      <div className="w-full max-w-sm rounded-lg border border-border p-6">
        <ResetPasswordForm />
      </div>
    </main>
  );
}
