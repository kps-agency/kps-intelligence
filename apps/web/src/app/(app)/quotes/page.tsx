import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { QuotesList } from "./quotes-list";

export const metadata = { title: "Devis" };

export default async function QuotesPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("quotes.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
        <AccessDenied permission="quotes.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
        <p className="text-sm text-muted-foreground">
          Un devis se crée depuis la fiche d&apos;une opportunité ; il n&apos;est envoyé au client que sur votre action.
        </p>
      </div>
      <QuotesList />
    </div>
  );
}
