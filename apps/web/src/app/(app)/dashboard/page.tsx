import { ROLE_LABELS } from "@kps/shared";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kps/ui";
import { getCurrentUser } from "@/lib/session";
import { HomeOverview } from "./home-overview";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const result = await getCurrentUser();
  // Le layout n'affiche cette page que pour un utilisateur valide ; ce
  // garde sert uniquement au typage (layout et page se rendent en parallèle).
  if (result.status !== "ok") return null;
  const { user } = result;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bonjour {user.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Bienvenue sur KPS Intelligence.
        </p>
      </div>

      <HomeOverview />

      <Card>
        <CardHeader>
          <CardTitle>Votre profil</CardTitle>
          <CardDescription>
            Informations de votre compte et droits associés à votre rôle.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Nom</p>
            <p className="font-medium">
              {user.firstName} {user.lastName}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="break-all font-medium">{user.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Rôle</p>
            <p className="font-medium">{ROLE_LABELS[user.roleKey]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Permissions</p>
            {user.permissions.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {user.permissions.map((permission) => (
                  <li key={permission}>
                    <Badge variant="secondary">{permission}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-medium">Aucune permission spécifique</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
