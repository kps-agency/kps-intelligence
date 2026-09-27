import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { ServicesList } from "./services-list";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("services.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <AccessDenied permission="services.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="text-sm text-muted-foreground">
          Le catalogue de services de KPS Agency et leur formulaire de qualification associé.
        </p>
      </div>
      <ServicesList canManage={result.user.permissions.includes("services.manage")} />
    </div>
  );
}
