import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { RequestDetail } from "./request-detail";

export const metadata = { title: "Demande" };

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("requests.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Demande</h1>
        <AccessDenied permission="requests.read" />
      </div>
    );
  }

  return (
    <RequestDetail
      requestId={id}
      canManage={result.user.permissions.includes("requests.manage")}
    />
  );
}
