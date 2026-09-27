import { AuthPageLayout } from "@/components/auth-page-layout";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <AuthPageLayout title="Mot de passe oublié">
      <ForgotPasswordForm />
    </AuthPageLayout>
  );
}
