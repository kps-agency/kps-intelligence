import { Injectable, Logger } from "@nestjs/common";
import { AI_LOW_CONFIDENCE_THRESHOLD } from "@kps/shared";
import { RequestSource } from "@kps/types";
import type { RequestResponse } from "@kps/types";
import { toDbException } from "../common/db-error";
import { QualificationSessionsService } from "../qualification-sessions/qualification-sessions.service";
import { RequestsService } from "../requests/requests.service";
import { ServicesService } from "../services/services.service";
import { SupabaseService } from "../supabase/supabase.service";
import { WhatsappService } from "./whatsapp.service";

const logger = new Logger("WhatsappIngestionService");

// Forme du webhook WhatsApp Cloud API (champ "messages") — seuls les
// champs exploités sont typés.
interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
}

interface WebhookValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: WebhookMessage[];
}

interface WebhookPayload {
  object?: string;
  entry?: { changes?: { field?: string; value?: WebhookValue }[] }[];
}

// Une conversation dont la demande a atteint l'un de ces statuts est
// close : un nouveau message du même numéro ouvre une nouvelle demande.
const CLOSED_REQUEST_STATUSES = ["WON", "LOST", "CONVERTED_TO_MISSION", "CLOSED", "UNQUALIFIED"];

const SUBJECT_MAX_LENGTH = 80;

@Injectable()
export class WhatsappIngestionService {
  // File par numéro expéditeur : un prospect qui envoie "Bonjour" puis sa
  // vraie demande une seconde plus tard ne doit pas créer deux demandes
  // parce que le second message a été traité pendant l'analyse IA du
  // premier. En mémoire, donc valable pour une seule instance de l'API.
  private readonly senderQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly requestsService: RequestsService,
    private readonly servicesService: ServicesService,
    private readonly qualificationSessionsService: QualificationSessionsService,
    private readonly whatsappService: WhatsappService,
  ) {}

  // Retourne immédiatement : Meta attend un 200 rapide et rejoue le webhook
  // sinon, alors que l'analyse IA prend plusieurs secondes. Les rejeux
  // éventuels sont absorbés par l'idempotence sur l'id de message.
  handleWebhook(payload: unknown): void {
    const body = payload as WebhookPayload;
    if (body?.object !== "whatsapp_business_account") return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages" || !change.value?.messages) continue;
        const value = change.value;
        for (const message of value.messages ?? []) {
          const profileName =
            value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null;
          this.enqueue(message.from, () =>
            this.processMessage(message, profileName, value.metadata?.display_phone_number ?? null),
          );
        }
      }
    }
  }

  private enqueue(sender: string, task: () => Promise<void>): void {
    const previous = this.senderQueues.get(sender) ?? Promise.resolve();
    const current = previous.then(task).catch((err: unknown) => {
      logger.error(
        { sender, err: err instanceof Error ? err.message : String(err) },
        "Échec du traitement d'un message WhatsApp",
      );
    });
    this.senderQueues.set(sender, current);
    void current.finally(() => {
      if (this.senderQueues.get(sender) === current) this.senderQueues.delete(sender);
    });
  }

  private async processMessage(
    message: WebhookMessage,
    profileName: string | null,
    ownNumber: string | null,
  ): Promise<void> {
    if (!/^\d{6,20}$/.test(message.from)) {
      logger.warn({ messageId: message.id }, "Numéro expéditeur WhatsApp invalide, ignoré");
      return;
    }

    const text = message.type === "text" ? message.text?.body?.trim() : undefined;
    if (!text) {
      logger.log(
        { messageId: message.id, type: message.type },
        "Message WhatsApp non textuel, ignoré",
      );
      return;
    }

    const client = this.supabase.getClient();
    const { data: known, error: knownError } = await client
      .from("conversation_messages")
      .select("id")
      .eq("external_message_id", message.id)
      .maybeSingle();
    if (knownError) throw toDbException(knownError);
    if (known) {
      logger.log({ messageId: message.id }, "Message WhatsApp déjà traité (idempotence), ignoré");
      return;
    }

    const inbound = {
      direction: "INBOUND" as const,
      channel: "WHATSAPP" as const,
      from_address: message.from,
      to_address: ownNumber,
      body: text,
      external_message_id: message.id,
      sent_at: new Date(Number(message.timestamp) * 1000).toISOString(),
    };

    const openConversationId = await this.findOpenConversation(message.from);
    if (openConversationId) {
      await this.insertMessage({ ...inbound, conversation_id: openConversationId });
      logger.log(
        { conversationId: openConversationId },
        "Message WhatsApp ajouté à une conversation existante",
      );
      return;
    }

    const contact = await this.findContact(message.from);
    const { request, alreadyExisted } = await this.requestsService.createFromInbound({
      source: RequestSource.WHATSAPP,
      channel: "whatsapp",
      subject: buildSubject(text),
      originalMessage: text,
      language: null,
      country: null,
      clientId: contact?.client_id ?? null,
      contactId: contact?.id ?? null,
      whatsappMessageId: message.id,
    });
    if (alreadyExisted) return;

    const { data: conversation, error: conversationError } = await client
      .from("conversations")
      .insert({
        channel: "WHATSAPP",
        request_id: request.id,
        client_id: request.clientId,
        contact_id: request.contactId,
      })
      .select("id")
      .single();
    if (conversationError) throw toDbException(conversationError);
    await this.insertMessage({ ...inbound, conversation_id: conversation.id });

    logger.log(
      { requestId: request.id, reference: request.reference },
      "Demande créée depuis un message WhatsApp",
    );

    if (
      request.detectedServiceSlug &&
      request.aiConfidence !== null &&
      request.aiConfidence >= AI_LOW_CONFIDENCE_THRESHOLD
    ) {
      const firstName = contact?.first_name ?? profileName?.split(" ")[0] ?? null;
      await this.trySendQualificationLink(request, conversation.id, message.from, ownNumber, firstName);
    }
  }

  private async findOpenConversation(sender: string): Promise<string | null> {
    const client = this.supabase.getClient();
    const { data: last, error } = await client
      .from("conversation_messages")
      .select("conversation_id")
      .eq("channel", "WHATSAPP")
      .eq("direction", "INBOUND")
      .eq("from_address", sender)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!last) return null;

    const { data: conversation, error: conversationError } = await client
      .from("conversations")
      .select("id, request_id")
      .eq("id", last.conversation_id)
      .single();
    if (conversationError) throw toDbException(conversationError);
    if (!conversation.request_id) return null;

    const { data: request, error: requestError } = await client
      .from("requests")
      .select("status")
      .eq("id", conversation.request_id)
      .maybeSingle();
    if (requestError) throw toDbException(requestError);
    if (!request || CLOSED_REQUEST_STATUSES.includes(request.status)) return null;

    return conversation.id;
  }

  private async findContact(
    sender: string,
  ): Promise<{ id: string; client_id: string; first_name: string } | null> {
    // `sender` est validé (chiffres uniquement) avant d'être interpolé
    // dans le filtre PostgREST.
    const { data, error } = await this.supabase
      .getClient()
      .from("contacts")
      .select("id, client_id, first_name")
      .or(`whatsapp_digits.eq.${sender},phone_digits.eq.${sender}`)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data;
  }

  private async insertMessage(row: {
    conversation_id: string;
    direction: "INBOUND" | "OUTBOUND";
    channel: "WHATSAPP";
    from_address: string | null;
    to_address: string | null;
    body: string;
    external_message_id: string;
    sent_at: string;
  }): Promise<void> {
    const { error } = await this.supabase.getClient().from("conversation_messages").insert(row);
    // Doublon concurrent sur external_message_id : déjà enregistré, rien à faire.
    if (error && error.code !== "23505") throw toDbException(error);
  }

  // Ne bloque jamais l'ingestion (section 68) : la demande existe déjà et
  // reste qualifiable manuellement depuis /requests/:id en cas d'échec ici.
  private async trySendQualificationLink(
    request: RequestResponse,
    conversationId: string,
    to: string,
    ownNumber: string | null,
    firstName: string | null,
  ): Promise<void> {
    try {
      const services = await this.servicesService.list();
      const service = services.find((s) => s.slug === request.detectedServiceSlug);
      if (!service?.qualificationFormId) {
        logger.log(
          { requestId: request.id, service: request.detectedServiceSlug },
          "Aucun formulaire publié pour ce service, envoi automatique ignoré",
        );
        return;
      }

      const session = await this.qualificationSessionsService.create(
        request.id,
        service.qualificationFormId,
      );
      const params = {
        contactFirstName: firstName,
        serviceName: service.name,
        qualificationUrl: session.qualificationUrl,
      };
      const outboundId = await this.whatsappService.sendQualificationMessage(to, params);
      if (session.status === "CREATED") {
        await this.qualificationSessionsService.markSent(session.id);
      }

      await this.insertMessage({
        conversation_id: conversationId,
        direction: "OUTBOUND",
        channel: "WHATSAPP",
        from_address: ownNumber,
        to_address: to,
        body: renderForHistory(params),
        external_message_id: outboundId,
        sent_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(
        { requestId: request.id, err: err instanceof Error ? err.message : String(err) },
        "Échec de l'envoi automatique du lien de qualification WhatsApp",
      );
    }
  }
}

function buildSubject(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() ?? text;
  return firstLine.length > SUBJECT_MAX_LENGTH
    ? `${firstLine.slice(0, SUBJECT_MAX_LENGTH - 1)}…`
    : firstLine;
}

// L'historique conserve le message envoyé sans le token : le lien est un
// secret porteur (sections 23 et 60), il ne doit pas traîner en clair dans
// une table lisible par toute l'équipe.
function renderForHistory(params: { serviceName: string }): string {
  return `Lien de qualification envoyé (${params.serviceName}).`;
}
