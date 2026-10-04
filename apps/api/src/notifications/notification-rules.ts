import { EventType, PriorityLevel, RequestSource } from "@kps/types";
import type { DomainEvent } from "../events/event-bus.service";

// Destinataires, résolus par NotificationsDispatcher :
// - COMMERCIAL : l'utilisateur assigné à la demande (ou le responsable de
//   l'opportunité), sinon tous les commerciaux actifs ;
// - RESPONSABLE : les directeurs ;
// - TECHNICAL_MANAGER : les responsables techniques ;
// - ASSIGNEE : la personne à qui la demande vient d'être confiée.
// Si personne n'occupe le rôle visé, les administrateurs reçoivent la
// notification à sa place : une étape n'est jamais notifiée à personne.
export type Audience =
  | "COMMERCIAL"
  | "RESPONSABLE"
  | "TECHNICAL_MANAGER"
  | "ASSIGNEE"
  // Collaborateur affecté à la demande (payload.userId de l'événement).
  | "TEAM_MEMBER";

export type RuleChannel = "IN_APP" | "EMAIL";

export interface RuleContext {
  source: string;
}

export interface NotificationRule {
  // Clé du template (notification_templates.key).
  key: string;
  eventType: EventType;
  // Libellé affiché dans les préférences de l'utilisateur.
  label: string;
  audiences: Audience[];
  // Canaux activés par défaut ; l'utilisateur peut en activer ou en couper
  // d'autres dans ses préférences.
  channels: RuleChannel[];
  priority: PriorityLevel;
  // Notification critique : l'in-app ne peut pas être désactivé.
  critical?: boolean;
  applies?: (event: DomainEvent, context: RuleContext) => boolean;
}

// Moteur de règles de la section 5 : jamais de diffusion à toute l'équipe,
// chaque étape a ses destinataires. L'email n'accompagne par défaut que
// les étapes qui appellent une action rapide.
export const NOTIFICATION_RULES: NotificationRule[] = [
  {
    key: "REQUEST_RECEIVED",
    eventType: EventType.REQUEST_RECEIVED,
    label: "Nouvelle demande",
    audiences: ["COMMERCIAL"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.MEDIUM,
  },
  {
    key: "REQUEST_ANALYSIS_COMPLETED",
    eventType: EventType.REQUEST_ANALYSIS_COMPLETED,
    label: "Analyse IA terminée",
    audiences: ["COMMERCIAL"],
    channels: ["IN_APP"],
    priority: PriorityLevel.LOW,
  },
  {
    key: "AI_ANALYSIS_FAILED",
    eventType: EventType.AI_ANALYSIS_FAILED,
    label: "Échec de l'analyse IA",
    audiences: ["COMMERCIAL", "RESPONSABLE"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.HIGH,
    critical: true,
  },
  {
    key: "BUSINESS_APPLICATION_DETECTED",
    eventType: EventType.SERVICE_DETECTED,
    label: "Application métier détectée",
    audiences: ["TECHNICAL_MANAGER"],
    channels: ["IN_APP"],
    priority: PriorityLevel.MEDIUM,
    applies: (event) => event.payload.serviceSlug === "BUSINESS_APPLICATION",
  },
  {
    // Seulement quand personne n'a pu être contacté automatiquement : une
    // demande entrante reçoit le lien sans intervention.
    key: "QUALIFICATION_REQUIRED",
    eventType: EventType.QUALIFICATION_REQUIRED,
    label: "Qualification à envoyer",
    audiences: ["COMMERCIAL"],
    channels: ["IN_APP"],
    priority: PriorityLevel.MEDIUM,
    applies: (_, context) => context.source === RequestSource.MANUAL,
  },
  {
    key: "QUALIFICATION_LINK_SENT",
    eventType: EventType.QUALIFICATION_LINK_SENT,
    label: "Formulaire envoyé",
    audiences: ["COMMERCIAL"],
    channels: ["IN_APP"],
    priority: PriorityLevel.LOW,
  },
  {
    key: "FORM_COMPLETED",
    eventType: EventType.FORM_COMPLETED,
    label: "Réponse client reçue",
    audiences: ["COMMERCIAL", "RESPONSABLE"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.HIGH,
  },
  {
    key: "REQUEST_QUALIFIED",
    eventType: EventType.REQUEST_QUALIFIED,
    label: "Demande qualifiée",
    audiences: ["COMMERCIAL", "RESPONSABLE"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.HIGH,
  },
  {
    key: "REQUEST_ASSIGNED",
    eventType: EventType.REQUEST_ASSIGNED,
    label: "Demande qui m'est assignée",
    audiences: ["ASSIGNEE"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.HIGH,
    critical: true,
  },
  {
    // Section 40 : analyse incertaine → validation humaine, responsable notifié.
    key: "QUALIFICATION_REVIEW_REQUIRED",
    eventType: EventType.QUALIFICATION_ANALYSIS_COMPLETED,
    label: "Qualification à valider",
    audiences: ["RESPONSABLE", "COMMERCIAL"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.HIGH,
    applies: (event) => event.payload.needsReview === true,
  },
  {
    key: "MATCHING_COMPLETED",
    eventType: EventType.MATCHING_COMPLETED,
    label: "Matching terminé",
    audiences: ["RESPONSABLE", "TECHNICAL_MANAGER"],
    channels: ["IN_APP"],
    priority: PriorityLevel.MEDIUM,
  },
  {
    key: "TEAM_MEMBER_ASSIGNED",
    eventType: EventType.TEAM_MEMBER_ASSIGNED,
    label: "Affectation à une demande",
    audiences: ["TEAM_MEMBER"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.HIGH,
    critical: true,
  },
  {
    key: "OPPORTUNITY_CREATED",
    eventType: EventType.OPPORTUNITY_CREATED,
    label: "Nouvelle opportunité",
    audiences: ["COMMERCIAL", "RESPONSABLE"],
    channels: ["IN_APP"],
    priority: PriorityLevel.MEDIUM,
  },
  {
    // Gagnée et perdue ont leur propre règle : pas de doublon ici.
    key: "OPPORTUNITY_STAGE_CHANGED",
    eventType: EventType.OPPORTUNITY_STAGE_CHANGED,
    label: "Opportunité : changement d'étape",
    audiences: ["COMMERCIAL"],
    channels: ["IN_APP"],
    priority: PriorityLevel.LOW,
    applies: (event) => event.payload.to !== "WON" && event.payload.to !== "LOST",
  },
  {
    key: "OPPORTUNITY_WON",
    eventType: EventType.OPPORTUNITY_WON,
    label: "Opportunité gagnée",
    audiences: ["COMMERCIAL", "RESPONSABLE"],
    channels: ["IN_APP", "EMAIL"],
    priority: PriorityLevel.HIGH,
  },
  {
    key: "OPPORTUNITY_LOST",
    eventType: EventType.OPPORTUNITY_LOST,
    label: "Opportunité perdue",
    audiences: ["COMMERCIAL", "RESPONSABLE"],
    channels: ["IN_APP"],
    priority: PriorityLevel.MEDIUM,
  },
  {
    key: "CONVERSATION_MESSAGE_RECEIVED",
    eventType: EventType.CONVERSATION_MESSAGE_RECEIVED,
    label: "Nouveau message du prospect",
    audiences: ["COMMERCIAL"],
    channels: ["IN_APP"],
    priority: PriorityLevel.MEDIUM,
  },
];

export function ruleForEventType(eventType: EventType): NotificationRule | undefined {
  return NOTIFICATION_RULES.find((rule) => rule.eventType === eventType);
}
