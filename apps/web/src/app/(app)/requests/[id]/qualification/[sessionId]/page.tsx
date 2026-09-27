import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { QualificationRunner } from "./qualification-runner";

export const metadata = { title: "Qualification" };

export default async function QualificationSessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("requests.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Qualification</h1>
        <AccessDenied permission="requests.read" />
      </div>
    );
  }

  return (
    <QualificationRunner
      requestId={id}
      sessionId={sessionId}
      canEdit={result.user.permissions.includes("requests.manage")}
    />
  );
}
