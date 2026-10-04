import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { QuoteDetail } from "./quote-detail";

export const metadata = { title: "Devis" };

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return <QuoteDetail quoteId={id} canManage={result.user.permissions.includes("quotes.manage")} />;
}
