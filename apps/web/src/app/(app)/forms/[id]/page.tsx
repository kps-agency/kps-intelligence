import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { FormBuilder } from "./form-builder";

export const metadata = { title: "Formulaire" };

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("forms.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Formulaire</h1>
        <AccessDenied permission="forms.read" />
      </div>
    );
  }

  return (
    <FormBuilder formId={id} canManage={result.user.permissions.includes("forms.manage")} />
  );
}
