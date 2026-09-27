import { APP_NAME } from "@kps/shared";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <div className="w-full max-w-sm rounded-lg border border-border p-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
