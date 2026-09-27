import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  ClipboardList,
  Contact,
  FileText,
  Handshake,
  Inbox,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  // false = module pas encore livré : affiché désactivé (jamais un lien
  // vers une page vide) avec la phase de livraison prévue.
  available: boolean;
  phase?: number;
  // Permission RBAC requise pour voir l'entrée (absente = tout utilisateur
  // connecté). L'API reste l'autorité : ceci n'évite que l'affichage d'un
  // lien inutile.
  requiredPermission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  // Groupe épinglé en bas du menu, toujours visible sans défiler. Sans ça,
  // sur un écran de 800 px (ou un mobile), les entrées réellement
  // utilisables passent sous la liste des modules « Bientôt ».
  pinned?: boolean;
}

// Routes de la section 57 du cahier des charges. Passer `available` à true
// (et retirer `phase`) au moment où la page correspondante est livrée.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, available: true },
    ],
  },
  {
    label: "Commercial",
    items: [
      { label: "Demandes", href: "/requests", icon: Inbox, available: false, phase: 7 },
      {
        label: "Clients",
        href: "/clients",
        icon: Building2,
        available: true,
        requiredPermission: "clients.read",
      },
      {
        label: "Contacts",
        href: "/contacts",
        icon: Contact,
        available: true,
        requiredPermission: "contacts.read",
      },
      { label: "Opportunités", href: "/opportunities", icon: Handshake, available: false, phase: 17 },
      { label: "Devis", href: "/quotes", icon: FileText, available: false, phase: 18 },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Missions", href: "/missions", icon: Briefcase, available: false, phase: 19 },
      { label: "Équipe", href: "/team", icon: Users, available: false, phase: 16 },
    ],
  },
  {
    label: "Automatisation",
    items: [
      { label: "Formulaires", href: "/forms", icon: ClipboardList, available: false, phase: 9 },
      { label: "Workflows", href: "/workflows", icon: Workflow, available: false, phase: 15 },
      { label: "Notifications", href: "/notifications", icon: Bell, available: false, phase: 14 },
      { label: "Conversations", href: "/conversations", icon: MessagesSquare, available: false, phase: 12 },
    ],
  },
  {
    label: "Analyse",
    items: [
      { label: "Rapports", href: "/reports", icon: BarChart3, available: false, phase: 21 },
    ],
  },
  {
    label: "Administration",
    pinned: true,
    items: [
      {
        label: "Paramètres",
        href: "/settings",
        icon: Settings,
        available: true,
        requiredPermission: "users.read",
      },
    ],
  },
];

// Groupes/entrées visibles pour un utilisateur donné (filtre RBAC).
export function visibleNavGroups(permissions: string[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        !item.requiredPermission || permissions.includes(item.requiredPermission),
    ),
  })).filter((group) => group.items.length > 0);
}
