import { Injectable, Logger } from "@nestjs/common";
import { RequestSource } from "@kps/types";
import { toDbException } from "../common/db-error";
import { ConversationsService, type InboundMessage } from "../conversations/conversations.service";
import { AUTOMATION_ACTOR } from "../events/event-bus.service";
import { RequestsService } from "../requests/requests.service";
import { SupabaseService } from "../supabase/supabase.service";
import type { WebsiteSubmissionDto } from "./dto/website-submission.dto";

const logger = new Logger("WebsiteIngestionService");

export interface WebsiteIngestionResult {
  requestId: string;
  reference: string;
  alreadyExisted: boolean;
}

// Demandes envoyées par les formulaires des sites (akoraweb...). Le site a
// déjà l'adresse email du prospect : la demande démarre une conversation
// EMAIL à son nom, donc la suite (lien de qualification, relances) passe
// par les workflows existants exactement comme pour un email reçu.
@Injectable()
export class WebsiteIngestionService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly requestsService: RequestsService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async ingest(site: string, submission: WebsiteSubmissionDto): Promise<WebsiteIngestionResult> {
    const submissionId = `${site}:${submission.formType}:${submission.externalId}`;
    const email = submission.contact.email.toLowerCase();
    const body = buildBody(site, submission);
    const contact = await this.findContact(email, submission.contact.phone ?? null);

    const { request, alreadyExisted } = await this.requestsService.createFromInbound({
      source: RequestSource.WEBSITE,
      channel: site,
      subject: submission.subject,
      originalMessage: body,
      language: submission.locale?.slice(0, 2).toLowerCase() ?? null,
      country: null,
      clientId: contact?.client_id ?? null,
      contactId: contact?.id ?? null,
      websiteSubmissionId: submissionId,
    });
    const result = { requestId: request.id, reference: request.reference, alreadyExisted };
    if (alreadyExisted) {
      logger.log({ submissionId, requestId: request.id }, "Soumission déjà reçue (idempotence)");
      return result;
    }

    // Identifiant au format Message-ID : il sert d'In-Reply-To au premier
    // email envoyé au prospect, et de clé d'unicité du message.
    const inbound: InboundMessage = {
      fromAddress: email,
      fromName: submission.contact.name,
      toAddress: null,
      subject: submission.subject,
      body,
      externalMessageId: `<${submission.formType}.${submission.externalId}@${site}.website>`,
      externalThreadId: null,
      sentAt: submission.submittedAt ?? new Date().toISOString(),
    };
    await this.conversationsService.startForRequest("EMAIL", request, inbound);

    // L'analyse IA prend plusieurs secondes : le site reçoit sa réponse
    // sans l'attendre. Un échec n'annule pas la demande, déjà enregistrée
    // et ré-analysable depuis sa fiche.
    void this.requestsService.analyze(request.id, AUTOMATION_ACTOR).catch((err: unknown) => {
      logger.error(
        { requestId: request.id, err: err instanceof Error ? err.message : String(err) },
        "Échec de l'analyse IA d'une demande du site",
      );
    });

    logger.log(
      { requestId: request.id, reference: request.reference, site, formType: submission.formType },
      "Demande créée depuis un formulaire du site",
    );
    return result;
  }

  private async findContact(
    email: string,
    phone: string | null,
  ): Promise<{ id: string; client_id: string } | null> {
    const client = this.supabase.getClient();
    const { data: byEmail, error } = await client
      .from("contacts")
      .select("id, client_id")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (byEmail) return byEmail;

    const digits = phone?.replace(/\D/g, "").replace(/^00/, "") ?? "";
    if (digits.length < 8) return null;
    const { data: byPhone, error: phoneError } = await client
      .from("contacts")
      .select("id, client_id")
      .or(`phone_digits.eq.${digits},whatsapp_digits.eq.${digits}`)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (phoneError) throw toDbException(phoneError);
    return byPhone;
  }
}

// Texte soumis à l'analyse IA et affiché comme message d'origine : le
// message libre du prospect, puis les réponses structurées du formulaire.
export function buildBody(site: string, submission: WebsiteSubmissionDto): string {
  const { contact } = submission;
  const lines = [
    `Nom : ${contact.name}`,
    `Email : ${contact.email}`,
    contact.phone ? `Téléphone : ${contact.phone}` : null,
    contact.company ? `Entreprise : ${contact.company}` : null,
    ...(submission.fields ?? [])
      .filter((field) => field.value.trim().length > 0)
      .map((field) => `${field.label} : ${field.value.trim()}`),
    submission.pageUrl ? `Page : ${submission.pageUrl}` : null,
  ].filter((line): line is string => line !== null);

  const header = `— Formulaire « ${submission.formType} » du site ${site} —`;
  const message = submission.message?.trim();
  return [message, `${header}\n${lines.join("\n")}`].filter(Boolean).join("\n\n");
}
