import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { ClientDetail } from "./client-detail";

export const metadata = { title: "Client" };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("clients.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Client</h1>
        <AccessDenied permission="clients.read" />
      </div>
    );
  }

  return (
    <ClientDetail
      clientId={id}
      canManageClients={result.user.permissions.includes("clients.manage")}
      canManageContacts={result.user.permissions.includes("contacts.manage")}
    />
  );
}
