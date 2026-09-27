import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">Mot de passe oublié</h1>
      <div className="w-full max-w-sm rounded-lg border border-border p-6">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
