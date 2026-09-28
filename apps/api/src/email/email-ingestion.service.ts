import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { RequestSource } from "@kps/types";
import type { Database } from "@kps/types";
import { toDbException } from "../common/db-error";
import { ConversationsService, type InboundMessage } from "../conversations/conversations.service";
import { AUTOMATION_ACTOR } from "../events/event-bus.service";
import { RequestsService } from "../requests/requests.service";
import { SupabaseService } from "../supabase/supabase.service";

type IngestionStateRow = Database["public"]["Tables"]["email_ingestion_state"]["Row"];

const logger = new Logger("EmailIngestionService");

// Réception par polling IMAP réel (pas un webhook) : Gmail n'offre pas
// d'inbound webhook simple pour un compte personnel (il faudrait Google
// Cloud Pub/Sub + un point HTTPS public, hors de portée d'un dev local
// sans tunnel). Le pipeline en aval est strictement le même que celui
// qu'un vrai webhook déclencherait — voir docs/AI_CONTEXT.md.
//
// Ce service ne fait que recevoir et enregistrer : la suite (envoi du
// lien de qualification...) réagit aux événements émis par l'analyse,
// dans le module qualification-dispatch.
@Injectable()
export class EmailIngestionService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly requestsService: RequestsService,
    private readonly conversationsService: ConversationsService,
  ) {}

  onModuleInit(): void {
    const intervalSeconds = Number(this.config.get<string>("EMAIL_POLL_INTERVAL_SECONDS") ?? "60");
    this.timer = setInterval(() => void this.poll(), intervalSeconds * 1000);
    // Premier passage peu après le démarrage plutôt que d'attendre le
    // premier intervalle complet.
    setTimeout(() => void this.poll(), 5000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<void> {
    // Un cycle précédent encore en cours (boîte volumineuse, réseau lent)
    // ne doit jamais en chevaucher un second.
    if (this.polling) return;
    this.polling = true;
    try {
      await this.pollOnce();
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Échec du cycle de polling IMAP",
      );
      await this.recordError(err).catch(() => undefined);
    } finally {
      this.polling = false;
    }
  }

  private async pollOnce(): Promise<void> {
    const state = await this.getState();
    const client = new ImapFlow({
      host: this.config.getOrThrow<string>("IMAP_HOST"),
      port: Number(this.config.getOrThrow<string>("IMAP_PORT")),
      secure: true,
      auth: {
        user: this.config.getOrThrow<string>("IMAP_USER"),
        pass: this.config.getOrThrow<string>("IMAP_PASSWORD"),
      },
      logger: false,
    });

    await client.connect();
    let maxUid = state.last_uid;
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const range = `${state.last_uid + 1}:*`;
        for await (const message of client.fetch(
          range,
          { uid: true, source: true },
          { uid: true },
        )) {
          if (message.uid <= state.last_uid || !message.source) continue;
          try {
            await this.processMessage(message.uid, message.source);
          } catch (err) {
            logger.error(
              { uid: message.uid, err: err instanceof Error ? err.message : String(err) },
              "Échec du traitement d'un email",
            );
          }
          maxUid = Math.max(maxUid, message.uid);
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }

    await this.updateState(maxUid);
  }

  private async processMessage(uid: number, source: Buffer): Promise<void> {
    const parsed = await simpleParser(source);

    const messageId = parsed.messageId ?? null;
    if (!messageId) {
      logger.warn({ uid }, "Email sans Message-ID, ignoré (idempotence impossible)");
      return;
    }

    const fromEntry = Array.isArray(parsed.from) ? parsed.from[0] : parsed.from;
    const fromAddress = fromEntry?.value[0]?.address?.toLowerCase().trim() ?? null;
    if (!fromAddress) {
      logger.warn({ uid, messageId }, "Email sans expéditeur exploitable, ignoré");
      return;
    }

    const selfAddress = this.config.getOrThrow<string>("IMAP_USER").toLowerCase();
    if (fromAddress === selfAddress) {
      logger.debug({ uid }, "Email envoyé par le compte lui-même, ignoré");
      return;
    }

    if (await this.conversationsService.isKnownMessage(messageId)) {
      logger.log({ messageId }, "Email déjà traité (idempotence), ignoré");
      return;
    }

    const references = Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [];
    const threadIds = [...new Set([parsed.inReplyTo, ...references].filter(isNonEmpty))];
    const subject = parsed.subject?.trim() || "(sans objet)";
    const body = (parsed.text ?? (parsed.html || "")).toString().trim();

    const inbound: InboundMessage = {
      fromAddress,
      fromName: fromEntry?.value[0]?.name?.trim() || null,
      toAddress: selfAddress,
      subject,
      body: body || "(message vide)",
      externalMessageId: messageId,
      externalThreadId: threadIds[0] ?? null,
      sentAt: (parsed.date ?? new Date()).toISOString(),
    };

    // Réponse dans un fil déjà connu (typiquement : le prospect répond à
    // l'email de qualification) : elle rejoint la demande existante.
    const open = await this.conversationsService.findOpenByExternalIds("EMAIL", threadIds);
    if (open) {
      await this.conversationsService.appendInbound(open, "EMAIL", inbound);
      logger.log({ requestId: open.requestId }, "Email rattaché à une conversation existante");
      return;
    }

    let clientId: string | null = null;
    let contactId: string | null = null;
    const { data: contact, error: contactError } = await this.supabase
      .getClient()
      .from("contacts")
      .select("id, client_id")
      .ilike("email", fromAddress)
      .limit(1)
      .maybeSingle();
    if (contactError) throw toDbException(contactError);
    if (contact) {
      contactId = contact.id;
      clientId = contact.client_id;
    }

    const { request, alreadyExisted } = await this.requestsService.createFromInbound({
      source: RequestSource.EMAIL,
      channel: "gmail",
      subject,
      originalMessage: body || null,
      language: null,
      country: null,
      clientId,
      contactId,
      emailMessageId: messageId,
      emailThreadId: inbound.externalThreadId,
    });
    if (alreadyExisted) {
      logger.log({ messageId }, "Email déjà traité (idempotence), ignoré");
      return;
    }

    await this.conversationsService.startForRequest("EMAIL", request, inbound);
    await this.requestsService.analyze(request.id, AUTOMATION_ACTOR);
    logger.log(
      { requestId: request.id, reference: request.reference, from: fromAddress },
      "Demande créée depuis un email entrant",
    );
  }

  private async getState(): Promise<IngestionStateRow> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from("email_ingestion_state")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (data) return data;

    // Auto-amorçage (déploiement neuf) : démarre à 0, traite donc toute
    // la boîte existante — le comportement attendu pour une boîte dédiée
    // qui n'a encore reçu aucun email métier.
    const { data: inserted, error: insertError } = await client
      .from("email_ingestion_state")
      .insert({ id: true, last_uid: 0 })
      .select("*")
      .single();
    if (insertError) throw toDbException(insertError);
    return inserted;
  }

  private async updateState(lastUid: number): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from("email_ingestion_state")
      .update({ last_uid: lastUid, last_polled_at: new Date().toISOString(), last_error: null })
      .eq("id", true);
    if (error) throw toDbException(error);
  }

  private async recordError(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const { error } = await this.supabase
      .getClient()
      .from("email_ingestion_state")
      .update({ last_polled_at: new Date().toISOString(), last_error: message.slice(0, 500) })
      .eq("id", true);
    if (error) throw toDbException(error);
  }
}

function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length > 0;
}
