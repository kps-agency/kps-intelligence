import { AccessDenied } from "@/components/access-denied";
import { getCurrentUser } from "@/lib/session";
import { ContactsList } from "./contacts-list";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const result = await getCurrentUser();
  if (result.status !== "ok") return null;

  if (!result.user.permissions.includes("contacts.read")) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <AccessDenied permission="contacts.read" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Interlocuteurs chez les clients de KPS Agency.
        </p>
      </div>
      <ContactsList />
    </div>
  );
}
