import { Suspense } from "react";
import { AuthPageLayout } from "@/components/auth-page-layout";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <AuthPageLayout title="Connexion">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthPageLayout>
  );
}
