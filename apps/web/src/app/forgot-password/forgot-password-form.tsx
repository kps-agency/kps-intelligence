"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Label } from "@kps/ui";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().email("Adresse email invalide."),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Toujours afficher le même message, succès ou échec, pour ne pas
    // révéler si un email existe dans la base (énumération de comptes).
    setSent(true);
  }

  if (sent) {
    return (
      <div className="grid gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          Si un compte existe avec cette adresse, un email de réinitialisation
          vient d&apos;être envoyé.
        </p>
        <Link
          href="/login"
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Envoi..." : "Envoyer le lien de réinitialisation"}
      </Button>

      <Link
        href="/login"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Retour à la connexion
      </Link>
    </form>
  );
}
