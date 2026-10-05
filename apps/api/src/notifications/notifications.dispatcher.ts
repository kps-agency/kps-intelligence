import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OPPORTUNITY_STATUS_LABELS } from "@kps/shared";
import { EventEntityType, EventType } from "@kps/types";
import type { Database, OpportunityStatus } from "@kps/types";
import { toDbException } from "../common/db-error";
import { EventBus, SYSTEM_ACTOR, type DomainEvent } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";
import { NotificationEmailQueue } from "./notification-email.queue";
import {
  NOTIFICATION_RULES,
  type Audience,
  type NotificationRule,
  type RuleChannel,
} from "./notification-rules";
import { renderTemplate } from "./render-template";

const logger = new Logger("NotificationsDispatcher");

type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];

interface Recipient {
  id: string;
  email: string;
  fullName: string;
  language: string;
}

// L'objet d'une notification : la demande, ou l'opportunité pour les
// événements du pipeline (qui peut ne pas avoir de demande d'origine).
interface SubjectContext {
  entityType: EventEntityType;
  entityId: string;
  requestId: string | null;
  reference: string;
  subject: string;
  source: string;
  // Demande : utilisateur assigné ; opportunité : son responsable.
  assignedUserId: string | null;
  path: string;
  clientName: string;
  valueSuffix: string;
}

const NO_CLIENT = "prospect sans fiche client";
const amountFormatter = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 2 });

const DEFAULT_LANGUAGE = "fr";
const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];
const AUDIENCE_ROLES: Record<Exclude<Audience, "ASSIGNEE" | "TEAM_MEMBER">, string[]> = {
  COMMERCIAL: ["SALES"],
  PROJECT_MANAGER: ["PROJECT_MANAGER"],
  RESPONSABLE: ["DIRECTOR"],
  TECHNICAL_MANAGER: ["TECHNICAL_MANAGER"],
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "par saisie manuelle",
  EMAIL: "par email",
  WHATSAPP: "par WhatsApp",
  WEBSITE: "depuis le site web",
  API: "via l'API",
};
const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "par email",
  WHATSAPP: "par WhatsApp",
  MANUAL: "manuellement",
};

// Transforme un événement en notifications (section 5) : règle → acteurs
// visés → préférences de chacun → une ligne par destinataire et par canal.
// L'in-app est écrit immédiatement ; l'email part par la file BullMQ.
@Injectable()
export class NotificationsDispatcher implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly emailQueue: NotificationEmailQueue,
  ) {}

  onModuleInit(): void {
    for (const type of new Set(NOTIFICATION_RULES.map((rule) => rule.eventType))) {
      this.eventBus.subscribe(type, (event) => this.dispatch(event));
    }
  }

  async dispatch(event: DomainEvent): Promise<void> {
    // Opportunités, devis et missions portent leurs propres notifications
    // (ils peuvent ne pas avoir de demande d'origine).
    const ownSubject =
      event.entityType === EventEntityType.OPPORTUNITY ||
      event.entityType === EventEntityType.QUOTE ||
      event.entityType === EventEntityType.MISSION;
    if (!ownSubject && !event.requestId) return;

    // Les destinataires sont figés au premier traitement de l'événement.
    // Recalculés lors d'un rejeu, ils suivraient l'état *actuel* de la
    // demande (ex. réassignée entre-temps) et notifieraient quelqu'un pour
    // une étape déjà traitée : l'idempotence porte sur l'événement entier,
    // pas seulement sur le triplet événement × destinataire × canal.
    const { count: alreadyDispatched, error } = await this.supabase
      .getClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    if (error) throw toDbException(error);
    if ((alreadyDispatched ?? 0) > 0) return;

    const request =
      event.entityType === EventEntityType.OPPORTUNITY
        ? await this.loadOpportunity(event.entityId)
        : event.entityType === EventEntityType.QUOTE
          ? await this.loadQuote(event.entityId)
          : event.entityType === EventEntityType.MISSION
            ? await this.loadMission(event.entityId)
            : await this.loadRequest(event.requestId as string);
    if (!request) return;

    const rules = NOTIFICATION_RULES.filter(
      (rule) =>
        rule.eventType === event.type &&
        (!rule.applies || rule.applies(event, { source: request.source })),
    );

    for (const rule of rules) {
      await this.dispatchRule(rule, event, request);
    }
  }

  private async dispatchRule(
    rule: NotificationRule,
    event: DomainEvent,
    request: SubjectContext,
  ): Promise<void> {
    const recipients = new Map<string, Recipient>();
    for (const audience of rule.audiences) {
      for (const recipient of await this.resolveAudience(audience, event, request)) {
        recipients.set(recipient.id, recipient);
      }
    }
    // On ne notifie pas quelqu'un de sa propre action.
    if (event.actor.id) recipients.delete(event.actor.id);
    if (recipients.size === 0) return;

    const channelsByUser = await this.effectiveChannels(rule, [...recipients.keys()]);
    const templates = await this.loadTemplates(rule.key);
    const variables = await this.variables(event, request);

    const rows: NotificationInsert[] = [];
    for (const recipient of recipients.values()) {
      for (const channel of channelsByUser.get(recipient.id) ?? []) {
        const template =
          templates.get(`${channel}:${recipient.language}`) ??
          templates.get(`${channel}:${DEFAULT_LANGUAGE}`);
        if (!template) {
          logger.error({ key: rule.key, channel }, "Template de notification manquant");
          continue;
        }
        rows.push({
          event_id: event.id,
          user_id: recipient.id,
          event_type: event.type,
          channel,
          priority: rule.priority,
          title: renderTemplate(template.subject ?? rule.label, variables),
          body: renderTemplate(template.body, variables),
          related_entity_type: request.entityType,
          related_entity_id: request.entityId,
          link: request.path,
          // L'in-app est délivré en étant écrit ; l'email quand il est parti.
          sent_at: channel === "IN_APP" ? new Date().toISOString() : null,
        });
      }
    }
    if (rows.length === 0) return;

    // Idempotence (section 63) : un événement rejoué ne recrée rien — seules
    // les lignes réellement insérées sont renvoyées.
    const { data: inserted, error } = await this.supabase
      .getClient()
      .from("notifications")
      .upsert(rows, { onConflict: "event_id,user_id,channel", ignoreDuplicates: true })
      .select("id, user_id, channel");
    if (error) throw toDbException(error);
    if (inserted.length === 0) return;

    for (const row of inserted.filter((r) => r.channel === "EMAIL")) {
      try {
        await this.emailQueue.enqueue(row.id);
      } catch (err) {
        // Reste en attente (sent_at NULL) : repris au prochain démarrage.
        logger.error(
          { notificationId: row.id, err: err instanceof Error ? err.message : String(err) },
          "Mise en file de l'email de notification impossible",
        );
      }
    }

    const notified = new Map<string, Set<string>>();
    for (const row of inserted) {
      const name = recipients.get(row.user_id)?.fullName ?? "";
      notified.set(name, (notified.get(name) ?? new Set()).add(row.channel));
    }
    await this.eventBus.emit({
      type: EventType.TEAM_NOTIFIED,
      entityType: request.entityType,
      entityId: request.entityId,
      requestId: request.requestId,
      actor: SYSTEM_ACTOR,
      payload: {
        rule: rule.key,
        label: rule.label,
        sourceEventId: event.id,
        recipients: [...notified.entries()].map(([name, channels]) => ({
          name,
          channels: [...channels].sort(),
        })),
      },
    });
  }

  private async resolveAudience(
    audience: Audience,
    event: DomainEvent,
    request: SubjectContext,
  ): Promise<Recipient[]> {
    if (audience === "TEAM_MEMBER") {
      const userId = event.payload.userId;
      return typeof userId === "string" ? this.activeUsers({ ids: [userId] }) : [];
    }
    if (audience === "ASSIGNEE") {
      const assigneeId =
        typeof event.payload.assignedUserId === "string"
          ? event.payload.assignedUserId
          : request.assignedUserId;
      return assigneeId ? this.activeUsers({ ids: [assigneeId] }) : [];
    }

    // Le responsable désigné de l'objet (commercial de la demande ou de
    // l'opportunité, chef de projet de la mission) passe avant le rôle.
    if ((audience === "COMMERCIAL" || audience === "PROJECT_MANAGER") && request.assignedUserId) {
      const assigned = await this.activeUsers({ ids: [request.assignedUserId] });
      if (assigned.length > 0) return assigned;
    }

    const byRole = await this.activeUsers({ roles: AUDIENCE_ROLES[audience] });
    return byRole.length > 0 ? byRole : this.activeUsers({ roles: ADMIN_ROLES });
  }

  private async activeUsers(filter: { ids?: string[]; roles?: string[] }): Promise<Recipient[]> {
    let query = this.supabase
      .getClient()
      .from("users")
      .select("id, email, first_name, last_name, language, roles!inner(key)")
      .eq("status", "ACTIVE");
    if (filter.ids) query = query.in("id", filter.ids);
    if (filter.roles) query = query.in("roles.key", filter.roles);

    const { data, error } = await query;
    if (error) throw toDbException(error);
    return data.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: `${u.first_name} ${u.last_name}`,
      language: u.language,
    }));
  }

  // Canaux par défaut de la règle, corrigés par les préférences explicites
  // de chaque utilisateur ; l'in-app d'une règle critique est toujours actif.
  private async effectiveChannels(
    rule: NotificationRule,
    userIds: string[],
  ): Promise<Map<string, RuleChannel[]>> {
    const { data: preferences, error } = await this.supabase
      .getClient()
      .from("notification_preferences")
      .select("user_id, channel, enabled")
      .eq("event_type", rule.eventType)
      .in("user_id", userIds);
    if (error) throw toDbException(error);

    const result = new Map<string, RuleChannel[]>();
    for (const userId of userIds) {
      const channels = (["IN_APP", "EMAIL"] as const).filter((channel) => {
        if (channel === "IN_APP" && rule.critical) return true;
        const preference = preferences.find((p) => p.user_id === userId && p.channel === channel);
        return preference ? preference.enabled : rule.channels.includes(channel);
      });
      result.set(userId, channels);
    }
    return result;
  }

  private async loadTemplates(
    key: string,
  ): Promise<Map<string, { subject: string | null; body: string }>> {
    const { data, error } = await this.supabase
      .getClient()
      .from("notification_templates")
      .select("channel, language, subject, body")
      .eq("key", key);
    if (error) throw toDbException(error);
    return new Map(data.map((t) => [`${t.channel}:${t.language}`, t]));
  }

  private async loadRequest(requestId: string): Promise<SubjectContext | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("id, reference, subject, source, assigned_user_id")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) return null;
    return {
      entityType: EventEntityType.REQUEST,
      entityId: data.id,
      requestId: data.id,
      reference: data.reference,
      subject: data.subject,
      source: data.source,
      assignedUserId: data.assigned_user_id,
      path: `/requests/${data.id}`,
      clientName: "—",
      valueSuffix: "",
    };
  }

  private async loadMission(missionId: string): Promise<SubjectContext | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("missions")
      .select("id, title, project_manager_id, clients(company_name), opportunities(request_id, requests(reference, source))")
      .eq("id", missionId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) return null;
    const opportunity = data.opportunities as {
      request_id: string | null;
      requests: { reference: string; source: string } | null;
    } | null;
    return {
      entityType: EventEntityType.MISSION,
      entityId: data.id,
      requestId: opportunity?.request_id ?? null,
      reference: opportunity?.requests?.reference ?? "",
      subject: data.title,
      source: opportunity?.requests?.source ?? "MANUAL",
      assignedUserId: data.project_manager_id,
      path: `/missions/${data.id}`,
      clientName: (data.clients as { company_name: string } | null)?.company_name ?? NO_CLIENT,
      valueSuffix: "",
    };
  }

  // Devis : notifié au responsable de son opportunité.
  private async loadQuote(quoteId: string): Promise<SubjectContext | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("quotes")
      .select(
        "id, reference, title, total, currency, clients(company_name), opportunities(request_id, owner_user_id, requests(source))",
      )
      .eq("id", quoteId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) return null;

    const opportunity = data.opportunities as {
      request_id: string | null;
      owner_user_id: string | null;
      requests: { source: string } | null;
    } | null;
    return {
      entityType: EventEntityType.QUOTE,
      entityId: data.id,
      requestId: opportunity?.request_id ?? null,
      reference: data.reference,
      subject: data.title,
      source: opportunity?.requests?.source ?? "MANUAL",
      assignedUserId: opportunity?.owner_user_id ?? null,
      path: `/quotes/${data.id}`,
      clientName: (data.clients as { company_name: string } | null)?.company_name ?? NO_CLIENT,
      valueSuffix: ` (${amountFormatter.format(Number(data.total))} ${data.currency ?? ""} TTC)`,
    };
  }

  private async loadOpportunity(opportunityId: string): Promise<SubjectContext | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("opportunities")
      .select(
        "id, title, request_id, owner_user_id, estimated_value, currency, clients(company_name), requests(reference, source, contacts(first_name, last_name))",
      )
      .eq("id", opportunityId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) return null;

    const origin = data.requests as {
      reference: string;
      source: string;
      contacts: { first_name: string; last_name: string } | null;
    } | null;
    const company = (data.clients as { company_name: string } | null)?.company_name;
    const contact = origin?.contacts ? `${origin.contacts.first_name} ${origin.contacts.last_name}` : null;
    return {
      entityType: EventEntityType.OPPORTUNITY,
      entityId: data.id,
      requestId: data.request_id,
      reference: origin?.reference ?? "",
      subject: data.title,
      source: origin?.source ?? "MANUAL",
      assignedUserId: data.owner_user_id,
      path: `/opportunities/${data.id}`,
      clientName: company ?? contact ?? NO_CLIENT,
      valueSuffix:
        data.estimated_value !== null && data.currency
          ? ` (${amountFormatter.format(Number(data.estimated_value))} ${data.currency})`
          : "",
    };
  }

  private async variables(
    event: DomainEvent,
    request: SubjectContext,
  ): Promise<Record<string, string>> {
    const payload = event.payload;
    const confidence =
      typeof payload.confidence === "number" ? `${Math.round(payload.confidence * 100)} %` : "—";
    return {
      reference: request.reference,
      subject: request.subject,
      source: SOURCE_LABELS[request.source] ?? request.source,
      serviceName: typeof payload.serviceName === "string" ? payload.serviceName : "—",
      confidence,
      channel: CHANNEL_LABELS[String(payload.channel ?? "")] ?? "",
      actorName: await this.actorName(event),
      topCandidates: Array.isArray(payload.top)
        ? (payload.top as { name?: string; score?: number }[])
            .map((c) => `${c.name ?? ""} (${c.score ?? 0} %)`)
            .join(", ") || "aucun profil disponible"
        : "—",
      link: `${this.config.getOrThrow<string>("APP_URL")}${request.path}`,
      title: request.subject,
      clientName: request.clientName,
      valueSuffix: request.valueSuffix,
      stage: stageLabel(payload.to),
      fromStage: stageLabel(payload.from),
      taskTitle: typeof payload.taskTitle === "string" ? payload.taskTitle : "—",
      dueSuffix:
        typeof payload.dueDate === "string"
          ? `, à rendre pour le ${payload.dueDate.slice(8, 10)}.${payload.dueDate.slice(5, 7)}.${payload.dueDate.slice(0, 4)}`
          : "",
      reasonSuffix: typeof payload.reason === "string" && payload.reason ? ` : ${payload.reason}` : "",
      lostReasonSuffix:
        typeof payload.lostReason === "string" && payload.lostReason ? ` : ${payload.lostReason}` : "",
    };
  }

  private async actorName(event: DomainEvent): Promise<string> {
    if (event.actor.type === "AI") return "l'IA";
    if (event.actor.type !== "USER" || !event.actor.id) return "le système";
    const [user] = await this.activeUsers({ ids: [event.actor.id] });
    return user?.fullName ?? "un utilisateur";
  }
}

function stageLabel(value: unknown): string {
  return OPPORTUNITY_STATUS_LABELS[value as OpportunityStatus] ?? "—";
}
