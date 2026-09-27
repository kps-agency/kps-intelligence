import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { FormsList } from "./forms-list";

export const metadata = { title: "Formulaires" };

export default async function FormsPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("forms.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Formulaires</h1>
        <AccessDenied permission="forms.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Formulaires</h1>
        <p className="text-sm text-muted-foreground">
          Les formulaires de qualification associés aux services de KPS Agency.
        </p>
      </div>
      <FormsList canManage={result.user.permissions.includes("forms.manage")} />
    </div>
  );
}
