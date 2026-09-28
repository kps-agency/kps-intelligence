import { NotificationsCenter } from "./notifications-center";

export const metadata = { title: "Notifications" };

// Accessible à tout utilisateur connecté : chacun ne voit que ses propres
// notifications (filtré côté serveur sur l'utilisateur du jeton).
export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Les étapes des demandes qui vous concernent.
        </p>
      </div>
      <NotificationsCenter />
    </div>
  );
}
