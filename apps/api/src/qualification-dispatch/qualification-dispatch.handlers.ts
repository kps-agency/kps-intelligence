import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { AI_LOW_CONFIDENCE_THRESHOLD } from "@kps/shared";
import { EventEntityType, EventType } from "@kps/types";
import { toDbException } from "../common/db-error";
import { ConversationsService, type ReplyTarget } from "../conversations/conversations.service";
import { EmailService } from "../email/email.service";
import { AUTOMATION_ACTOR, EventBus, type DomainEvent } from "../events/event-bus.service";
import { QualificationSessionsService } from "../qualification-sessions/qualification-sessions.service";
import { ServicesService } from "../services/services.service";
import { SupabaseService } from "../supabase/supabase.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";

const logger = new Logger("QualificationDispatch");

// Règle métier "un service identifié avec assurance déclenche l'envoi du
// formulaire de qualification" (sections 19-21), exprimée comme réactions
// à des événements plutôt que comme appels directs depuis l'ingestion :
//
//   SERVICE_DETECTED ──► QUALIFICATION_REQUIRED ──► lien créé + envoyé
//
// Le premier maillon décide *si* une qualification est nécessaire (et
// l'inscrit dans la timeline) ; le second l'envoie sur le canal par lequel
// le prospect a écrit. Une demande saisie à la main n'a pas de canal de
// réponse : la qualification reste requise, un utilisateur envoie le lien.
@Injectable()
export class QualificationDispatchHandlers implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly supabase: SupabaseService,
    private readonly servicesService: ServicesService,
    private readonly sessionsService: QualificationSessionsService,
    private readonly conversationsService: ConversationsService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsappService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe(EventType.SERVICE_DETECTED, (e) => this.onServiceDetected(e));
    this.eventBus.subscribe(EventType.QUALIFICATION_REQUIRED, (e) => this.onQualificationRequired(e));
  }

  async onServiceDetected(event: DomainEvent): Promise<void> {
    const requestId = event.requestId;
    const confidence = Number(event.payload.confidence);
    const slug = String(event.payload.serviceSlug ?? "");
    if (!requestId || !(confidence >= AI_LOW_CONFIDENCE_THRESHOLD)) return;

    const service = (await this.servicesService.list()).find((s) => s.slug === slug);
    if (!service?.qualificationFormId) {
      logger.log({ requestId, service: slug }, "Aucun formulaire publié pour ce service");
      return;
    }

    // Une analyse relancée ne doit ni renvoyer un second lien, ni redire
    // qu'une qualification est requise (bruit dans la timeline, et en
    // Phase 14 une nouvelle notification à chaque relance) — sauf si elle
    // identifie un autre service.
    const client = this.supabase.getClient();
    const { count: sessions, error } = await client
      .from("qualification_sessions")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestId);
    if (error) throw toDbException(error);
    if ((sessions ?? 0) > 0) return;

    const { count: alreadyRequired, error: eventsError } = await client
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestId)
      .eq("type", EventType.QUALIFICATION_REQUIRED)
      .eq("payload->>serviceSlug", slug);
    if (eventsError) throw toDbException(eventsError);
    if ((alreadyRequired ?? 0) > 0) return;

    await this.eventBus.emit({
      type: EventType.QUALIFICATION_REQUIRED,
      entityType: EventEntityType.REQUEST,
      entityId: requestId,
      requestId,
      actor: AUTOMATION_ACTOR,
      payload: {
        serviceSlug: slug,
        serviceName: service.name,
        formId: service.qualificationFormId,
      },
    });
  }

  // Ne remonte jamais d'erreur (section 68) : la demande reste qualifiable
  // manuellement depuis /requests/:id si l'envoi automatique échoue.
  async onQualificationRequired(event: DomainEvent): Promise<void> {
    const requestId = event.requestId;
    const formId = String(event.payload.formId ?? "");
    const serviceName = String(event.payload.serviceName ?? "");
    if (!requestId || !formId) return;

    try {
      const target = await this.conversationsService.findReplyTarget(requestId);
      if (!target) return;

      const session = await this.sessionsService.create(requestId, formId, AUTOMATION_ACTOR);
      const params = {
        contactFirstName: await this.firstName(requestId, target),
        serviceName,
        qualificationUrl: session.qualificationUrl,
      };

      // L'historique conserve l'envoi sans le lien : le token est un secret
      // porteur (sections 23 et 60), il ne reste en clair nulle part.
      const historyBody = `Lien de qualification envoyé (${serviceName}).`;
      if (target.channel === "EMAIL") {
        const sent = await this.emailService.sendQualificationEmail(target.address, params, {
          inReplyTo: target.externalMessageId,
        });
        await this.conversationsService.recordOutbound(target.conversationId, "EMAIL", {
          fromAddress: this.emailService.getFromAddress(),
          toAddress: target.address,
          subject: sent.subject,
          body: historyBody,
          externalMessageId: sent.messageId,
        });
      } else {
        const messageId = await this.whatsappService.sendQualificationMessage(target.address, params);
        await this.conversationsService.recordOutbound(target.conversationId, "WHATSAPP", {
          fromAddress: null,
          toAddress: target.address,
          subject: null,
          body: historyBody,
          externalMessageId: messageId,
        });
      }

      if (session.status === "CREATED") {
        await this.sessionsService.markSent(session.id, AUTOMATION_ACTOR, target.channel);
      }
    } catch (err) {
      logger.error(
        { requestId, err: err instanceof Error ? err.message : String(err) },
        "Échec de l'envoi automatique du lien de qualification",
      );
    }
  }

  private async firstName(requestId: string, target: ReplyTarget): Promise<string | null> {
    const client = this.supabase.getClient();
    const { data: request, error } = await client
      .from("requests")
      .select("contact_id")
      .eq("id", requestId)
      .single();
    if (error) throw toDbException(error);

    if (request.contact_id) {
      const { data: contact, error: contactError } = await client
        .from("contacts")
        .select("first_name")
        .eq("id", request.contact_id)
        .maybeSingle();
      if (contactError) throw toDbException(contactError);
      if (contact) return contact.first_name;
    }
    return target.name?.split(" ")[0] ?? null;
  }
}
