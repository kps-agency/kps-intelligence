import { Injectable } from "@nestjs/common";
import { prospectLanguage, type ProspectLanguage } from "@kps/shared";
import { EventEntityType, EventType } from "@kps/types";
import type { OpportunityStatus } from "@kps/types";
import { toDbException } from "../common/db-error";
import {
  ConversationsService,
  type ConversationChannel,
} from "../conversations/conversations.service";
import { EmailService } from "../email/email.service";
import { MatchingService } from "../matching/matching.service";
import { MissionsService } from "../missions/missions.service";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { QualificationAnalysisService } from "../qualification-analysis/qualification-analysis.service";
import { AUTOMATION_ACTOR, EventBus } from "../events/event-bus.service";
import { QualificationSessionsService } from "../qualification-sessions/qualification-sessions.service";
import { ServicesService } from "../services/services.service";
import { SupabaseService } from "../supabase/supabase.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";

export interface ActionContext {
  // Absente pour un objet sans demande d'origine (opportunité ou devis
  // saisis à la main).
  requestId: string | null;
  // L'objet de l'événement déclencheur (demande, session, devis...).
  subjectType: string | null;
  subjectId: string | null;
  sessionId: string | null;
  payload: Record<string, unknown>;
}

type RequestActionContext = ActionContext & { requestId: string };

// DONE : l'action a eu lieu. SKIPPED : rien à faire (déjà fait, pas de
// destinataire...), sans que ce soit une erreur. Une erreur est levée.
export interface ActionResult {
  status: "DONE" | "SKIPPED";
  detail: string;
}

// L'historique conserve l'envoi sans le lien : le token est un secret
// porteur (sections 23 et 60), il ne reste en clair nulle part.
const LINK_SENT_HISTORY = (serviceName: string) => `Lien de qualification envoyé (${serviceName}).`;
const REMINDER_HISTORY = (serviceName: string) => `Relance du formulaire de qualification (${serviceName}).`;

// Implémentation des actions déclarées dans ACTION_TYPES : le seul code
// qu'un workflow configuré en base peut déclencher.
@Injectable()
export class WorkflowActionsService {
  constructor(
    private readonly eventBus: EventBus,
    private readonly supabase: SupabaseService,
    private readonly servicesService: ServicesService,
    private readonly sessionsService: QualificationSessionsService,
    private readonly conversationsService: ConversationsService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsappService,
    private readonly qualificationAnalysis: QualificationAnalysisService,
    private readonly matching: MatchingService,
    private readonly opportunities: OpportunitiesService,
    private readonly missions: MissionsService,
  ) {}

  async execute(
    type: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ActionResult> {
    if (type === "SET_OPPORTUNITY_STAGE") {
      return this.setOpportunityStage(context, params.stage as OpportunityStatus);
    }
    if (type === "CREATE_MISSION") return this.createMission(context);
    // Toutes les autres actions portent sur une demande.
    const requestId = context.requestId;
    if (!requestId) return { status: "SKIPPED", detail: "Aucune demande concernée." };
    return this.executeForRequest(type, params, { ...context, requestId });
  }

  private async executeForRequest(
    type: string,
    params: Record<string, unknown>,
    context: RequestActionContext,
  ): Promise<ActionResult> {
    switch (type) {
      case "REQUIRE_QUALIFICATION":
        return this.requireQualification(context);
      case "SEND_QUALIFICATION_LINK":
        return this.sendQualificationLink(context);
      case "SEND_QUALIFICATION_REMINDER":
        return this.sendQualificationReminder(context, params.channel as ConversationChannel);
      case "ANALYZE_QUALIFICATION": {
        const analysis = await this.qualificationAnalysis.analyze(context.requestId, AUTOMATION_ACTOR);
        if (analysis.status === "FAILED") throw new Error(analysis.error ?? "Analyse en échec.");
        return {
          status: "DONE",
          detail: `Réponses analysées (confiance ${Math.round((analysis.confidence ?? 0) * 100)} %).`,
        };
      }
      case "START_MATCHING": {
        const matching = await this.matching.run(context.requestId, AUTOMATION_ACTOR);
        return {
          status: "DONE",
          detail: `${matching.candidates.length} collaborateur(s) classé(s).`,
        };
      }
      case "CREATE_OPPORTUNITY": {
        const { opportunity, created } = await this.opportunities.createFromRequest(
          context.requestId,
          AUTOMATION_ACTOR,
        );
        return created
          ? { status: "DONE", detail: `Opportunité créée : ${opportunity.title}.` }
          : { status: "SKIPPED", detail: "Une opportunité existe déjà pour cette demande." };
      }
      case "MARK_REQUEST_CONVERTED":
        return this.missions.markRequestConverted(context.requestId);
      case "SYNC_REQUEST_STATUS":
        return this.opportunities.syncRequestStatus(context.requestId);
      default:
        throw new Error(`Action inconnue : ${type}`);
    }
  }

  private async createMission(context: ActionContext): Promise<ActionResult> {
    if (context.subjectType !== EventEntityType.OPPORTUNITY || !context.subjectId) {
      return { status: "SKIPPED", detail: "Aucune opportunité concernée." };
    }
    const { mission, created } = await this.missions.createFromOpportunity(context.subjectId, AUTOMATION_ACTOR);
    return created
      ? { status: "DONE", detail: `Mission créée : ${mission.title}.` }
      : { status: "SKIPPED", detail: "Une mission existe déjà pour cette opportunité." };
  }

  private async setOpportunityStage(
    context: ActionContext,
    stage: OpportunityStatus,
  ): Promise<ActionResult> {
    if (context.subjectType !== EventEntityType.QUOTE || !context.subjectId) {
      return { status: "SKIPPED", detail: "Aucun devis concerné." };
    }
    const { data: quote, error } = await this.supabase
      .getClient()
      .from("quotes")
      .select("opportunity_id")
      .eq("id", context.subjectId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!quote) return { status: "SKIPPED", detail: "Devis introuvable." };
    return this.opportunities.advanceTo(quote.opportunity_id, stage, AUTOMATION_ACTOR);
  }

  // Idempotent : ni second lien, ni seconde « qualification requise » pour
  // le même service si l'analyse est relancée.
  private async requireQualification(context: RequestActionContext): Promise<ActionResult> {
    const slug = String(context.payload.serviceSlug ?? "");
    const service = (await this.servicesService.list()).find((s) => s.slug === slug);
    if (!service?.qualificationFormId) {
      return { status: "SKIPPED", detail: `Aucun formulaire publié pour le service ${slug}.` };
    }

    const client = this.supabase.getClient();
    const { count: sessions, error } = await client
      .from("qualification_sessions")
      .select("id", { count: "exact", head: true })
      .eq("request_id", context.requestId);
    if (error) throw toDbException(error);
    if ((sessions ?? 0) > 0) {
      return { status: "SKIPPED", detail: "Un lien de qualification existe déjà." };
    }

    const { count: alreadyRequired, error: eventsError } = await client
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("request_id", context.requestId)
      .eq("type", EventType.QUALIFICATION_REQUIRED)
      .eq("payload->>serviceSlug", slug);
    if (eventsError) throw toDbException(eventsError);
    if ((alreadyRequired ?? 0) > 0) {
      return { status: "SKIPPED", detail: "Qualification déjà requise pour ce service." };
    }

    await this.eventBus.emit({
      type: EventType.QUALIFICATION_REQUIRED,
      entityType: EventEntityType.REQUEST,
      entityId: context.requestId,
      requestId: context.requestId,
      actor: AUTOMATION_ACTOR,
      payload: { serviceSlug: slug, serviceName: service.name, formId: service.qualificationFormId },
    });
    return { status: "DONE", detail: `Qualification requise (${service.name}).` };
  }

  private async sendQualificationLink(context: RequestActionContext): Promise<ActionResult> {
    const formId = String(context.payload.formId ?? "");
    const serviceName = String(context.payload.serviceName ?? "");
    const target = await this.conversationsService.findReplyTarget(context.requestId);
    if (!target || !formId) {
      return { status: "SKIPPED", detail: "Aucun canal pour joindre le prospect." };
    }

    const session = await this.sessionsService.create(context.requestId, formId, AUTOMATION_ACTOR);
    const params = {
      contactFirstName: await this.firstName(context.requestId, target.name),
      serviceName,
      qualificationUrl: session.qualificationUrl,
      language: await this.language(context.requestId),
    };

    if (target.channel === "EMAIL") {
      const sent = await this.emailService.sendQualificationEmail(target.address, params, {
        inReplyTo: target.externalMessageId,
      });
      await this.conversationsService.recordOutbound(target.conversationId, "EMAIL", {
        fromAddress: this.emailService.getFromAddress(),
        toAddress: target.address,
        subject: sent.subject,
        body: LINK_SENT_HISTORY(serviceName),
        externalMessageId: sent.messageId,
      });
    } else {
      const messageId = await this.whatsappService.sendQualificationMessage(target.address, params);
      await this.conversationsService.recordOutbound(target.conversationId, "WHATSAPP", {
        fromAddress: null,
        toAddress: target.address,
        subject: null,
        body: LINK_SENT_HISTORY(serviceName),
        externalMessageId: messageId,
      });
    }

    if (session.status === "CREATED") {
      await this.sessionsService.markSent(session.id, AUTOMATION_ACTOR, target.channel);
    }
    return {
      status: "DONE",
      detail: `Lien envoyé ${target.channel === "EMAIL" ? "par email" : "par WhatsApp"}.`,
    };
  }

  private async sendQualificationReminder(
    context: RequestActionContext,
    channel: ConversationChannel,
  ): Promise<ActionResult> {
    const sessionId = context.sessionId;
    if (!sessionId) return { status: "SKIPPED", detail: "Aucun lien de qualification concerné." };

    const recipient = await this.reminderRecipient(context.requestId, channel);
    if (!recipient) {
      return {
        status: "SKIPPED",
        detail: `Aucune adresse ${channel === "EMAIL" ? "email" : "WhatsApp"} connue pour le prospect.`,
      };
    }

    const serviceName = await this.serviceNameForSession(sessionId);

    const contactFirstName = await this.firstName(context.requestId, recipient.name);
    const language = await this.language(context.requestId);
    const { externalMessageId, subject } = await this.sessionsService.withFreshLink(
      sessionId,
      async (qualificationUrl) => {
        const params = { contactFirstName, serviceName, qualificationUrl, language };
        if (channel === "EMAIL") {
          const sent = await this.emailService.sendQualificationReminderEmail(
            recipient.address,
            params,
            { inReplyTo: recipient.externalMessageId },
          );
          return { externalMessageId: sent.messageId, subject: sent.subject as string | null };
        }
        const messageId = await this.whatsappService.sendQualificationReminder(recipient.address, params);
        return { externalMessageId: messageId, subject: null };
      },
    );

    if (recipient.conversationId) {
      await this.conversationsService.recordOutbound(recipient.conversationId, channel, {
        fromAddress: channel === "EMAIL" ? this.emailService.getFromAddress() : null,
        toAddress: recipient.address,
        subject,
        body: REMINDER_HISTORY(serviceName),
        externalMessageId,
      });
    }

    await this.eventBus.emit({
      type: EventType.QUALIFICATION_REMINDER_SENT,
      entityType: EventEntityType.QUALIFICATION_SESSION,
      entityId: sessionId,
      requestId: context.requestId,
      actor: AUTOMATION_ACTOR,
      payload: { sessionId, channel },
    });
    return {
      status: "DONE",
      detail: `Relance envoyée ${channel === "EMAIL" ? "par email" : "par WhatsApp"}.`,
    };
  }

  // Le prospect sur ce canal : son dernier message entrant sur ce canal,
  // sinon les coordonnées du contact lié à la demande.
  private async reminderRecipient(
    requestId: string,
    channel: ConversationChannel,
  ): Promise<{
    address: string;
    name: string | null;
    conversationId: string | null;
    externalMessageId: string | null;
  } | null> {
    const target = await this.conversationsService.findReplyTarget(requestId, channel);
    if (target) {
      return {
        address: target.address,
        name: target.name,
        conversationId: target.conversationId,
        externalMessageId: target.externalMessageId,
      };
    }

    const client = this.supabase.getClient();
    const { data: request, error } = await client
      .from("requests")
      .select("contacts(email, whatsapp_digits, first_name)")
      .eq("id", requestId)
      .single();
    if (error) throw toDbException(error);
    const contact = request.contacts as {
      email: string | null;
      whatsapp_digits: string | null;
      first_name: string;
    } | null;
    const address = channel === "EMAIL" ? contact?.email : contact?.whatsapp_digits;
    if (!address) return null;
    return { address, name: contact?.first_name ?? null, conversationId: null, externalMessageId: null };
  }

  private async serviceNameForSession(sessionId: string): Promise<string> {
    const client = this.supabase.getClient();
    const { data: session, error } = await client
      .from("qualification_sessions")
      .select("form_id")
      .eq("id", sessionId)
      .single();
    if (error) throw toDbException(error);

    const { data: service, error: serviceError } = await client
      .from("services")
      .select("name")
      .eq("qualification_form_id", session.form_id)
      .limit(1)
      .maybeSingle();
    if (serviceError) throw toDbException(serviceError);
    if (service) return service.name;

    const { data: form, error: formError } = await client
      .from("forms")
      .select("name")
      .eq("id", session.form_id)
      .single();
    if (formError) throw toDbException(formError);
    return form.name;
  }

  // Section 65 : le prospect est servi dans la langue de sa demande.
  private async language(requestId: string): Promise<ProspectLanguage> {
    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("language")
      .eq("id", requestId)
      .single();
    if (error) throw toDbException(error);
    return prospectLanguage(data.language);
  }

  private async firstName(requestId: string, fallbackName: string | null): Promise<string | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("contacts(first_name)")
      .eq("id", requestId)
      .single();
    if (error) throw toDbException(error);
    const contact = data.contacts as { first_name: string } | null;
    return contact?.first_name ?? fallbackName?.split(" ")[0] ?? null;
  }
}
