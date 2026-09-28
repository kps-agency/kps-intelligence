import { Injectable, Logger } from "@nestjs/common";
import { RequestSource } from "@kps/types";
import { toDbException } from "../common/db-error";
import { ConversationsService, type InboundMessage } from "../conversations/conversations.service";
import { AUTOMATION_ACTOR } from "../events/event-bus.service";
import { RequestsService } from "../requests/requests.service";
import { SupabaseService } from "../supabase/supabase.service";

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

const SUBJECT_MAX_LENGTH = 80;

// Ne fait que recevoir et enregistrer : l'envoi du lien de qualification
// réagit aux événements émis par l'analyse (module qualification-dispatch).
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
    private readonly conversationsService: ConversationsService,
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

    if (await this.conversationsService.isKnownMessage(message.id)) {
      logger.log({ messageId: message.id }, "Message WhatsApp déjà traité (idempotence), ignoré");
      return;
    }

    const inbound: InboundMessage = {
      fromAddress: message.from,
      fromName: profileName,
      toAddress: ownNumber,
      subject: null,
      body: text,
      externalMessageId: message.id,
      externalThreadId: null,
      sentAt: new Date(Number(message.timestamp) * 1000).toISOString(),
    };

    const open = await this.conversationsService.findOpenBySender("WHATSAPP", message.from);
    if (open) {
      await this.conversationsService.appendInbound(open, "WHATSAPP", inbound);
      logger.log({ requestId: open.requestId }, "Message WhatsApp ajouté à une conversation existante");
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

    await this.conversationsService.startForRequest("WHATSAPP", request, inbound);
    await this.requestsService.analyze(request.id, AUTOMATION_ACTOR);
    logger.log(
      { requestId: request.id, reference: request.reference },
      "Demande créée depuis un message WhatsApp",
    );
  }

  private async findContact(sender: string): Promise<{ id: string; client_id: string } | null> {
    // `sender` est validé (chiffres uniquement) avant d'être interpolé
    // dans le filtre PostgREST.
    const { data, error } = await this.supabase
      .getClient()
      .from("contacts")
      .select("id, client_id")
      .or(`whatsapp_digits.eq.${sender},phone_digits.eq.${sender}`)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data;
  }
}

function buildSubject(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() ?? text;
  return firstLine.length > SUBJECT_MAX_LENGTH
    ? `${firstLine.slice(0, SUBJECT_MAX_LENGTH - 1)}…`
    : firstLine;
}
