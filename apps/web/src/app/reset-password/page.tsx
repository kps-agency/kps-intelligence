import { AuthPageLayout } from "@/components/auth-page-layout";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Réinitialiser le mot de passe" };

export default function ResetPasswordPage() {
  return (
    <AuthPageLayout title="Réinitialiser le mot de passe">
      <ResetPasswordForm />
    </AuthPageLayout>
  );
}
