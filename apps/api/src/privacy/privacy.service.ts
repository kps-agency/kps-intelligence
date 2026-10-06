import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ContactAnonymizationResponse, ContactPersonalDataExport, Json } from "@kps/types";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";

const logger = new Logger("PrivacyService");

export interface RequestOrigin {
  userId: string;
  ip: string | null;
  userAgent: string | null;
}

// RGPD (section 66) : droit d'accès (export) et droit à l'effacement des
// données personnelles d'un contact. Chaque opération laisse une ligne
// dans `audit_logs` — qui, quand, sur quel contact — sans y recopier les
// données concernées.
@Injectable()
export class PrivacyService {
  constructor(private readonly supabase: SupabaseService) {}

  // Tout ce que la plateforme détient sur la personne, dans un format
  // lisible et réutilisable (JSON).
  async exportContact(contactId: string, origin: RequestOrigin): Promise<ContactPersonalDataExport> {
    const client = this.supabase.getClient();
    const { data: contact, error } = await client
      .from("contacts")
      .select("*, clients(company_name)")
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!contact) throw new NotFoundException("Contact introuvable.");

    const { data: requests, error: requestsError } = await client
      .from("requests")
      .select("id, reference, subject, original_message, source, language, country, status, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });
    if (requestsError) throw toDbException(requestsError);
    const requestIds = requests.map((r) => r.id);
    // `.in()` avec une liste vide est une requête invalide pour PostgREST.
    const scope = requestIds.length > 0 ? requestIds : ["00000000-0000-0000-0000-000000000000"];

    const [conversations, sessions, documents] = await Promise.all([
      client
        .from("conversations")
        .select("request_id, channel, conversation_messages(direction, from_address, to_address, subject, body, sent_at, created_at)")
        .or(`contact_id.eq.${contactId},request_id.in.(${scope.join(",")})`),
      client
        .from("qualification_sessions")
        .select("request_id, status, completed_at, consent_at, consent_version, forms(name), form_responses(value, form_fields(label))")
        .in("request_id", scope),
      client.from("documents").select("entity_id, name, mime_type, size, created_at").eq("entity_type", "request").in("entity_id", scope),
    ]);
    if (conversations.error) throw toDbException(conversations.error);
    if (sessions.error) throw toDbException(sessions.error);
    if (documents.error) throw toDbException(documents.error);

    const reference = new Map(requests.map((r) => [r.id, r.reference]));
    const exported: ContactPersonalDataExport = {
      exportedAt: new Date().toISOString(),
      contact: {
        id: contact.id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        whatsapp: contact.whatsapp,
        position: contact.position,
        company: (contact.clients as { company_name: string } | null)?.company_name ?? null,
        createdAt: contact.created_at,
        anonymizedAt: contact.anonymized_at,
      },
      requests: requests.map((r) => ({
        reference: r.reference,
        subject: r.subject,
        message: r.original_message,
        source: r.source,
        language: r.language,
        country: r.country,
        status: r.status,
        receivedAt: r.created_at,
      })),
      messages: conversations.data.flatMap((conversation) =>
        (
          conversation.conversation_messages as {
            direction: string;
            from_address: string | null;
            to_address: string | null;
            subject: string | null;
            body: string;
            sent_at: string | null;
            created_at: string;
          }[]
        ).map((message) => ({
          requestReference: conversation.request_id ? (reference.get(conversation.request_id) ?? null) : null,
          channel: conversation.channel,
          direction: message.direction,
          from: message.from_address,
          to: message.to_address,
          subject: message.subject,
          body: message.body,
          date: message.sent_at ?? message.created_at,
        })),
      ),
      qualifications: sessions.data.map((session) => ({
        requestReference: reference.get(session.request_id) ?? null,
        form: (session.forms as { name: string } | null)?.name ?? null,
        status: session.status,
        completedAt: session.completed_at,
        consentAt: session.consent_at,
        consentVersion: session.consent_version,
        answers: (session.form_responses as { value: Json; form_fields: { label: string } | null }[]).map((answer) => ({
          question: answer.form_fields?.label ?? "",
          answer: answer.value,
        })),
      })),
      documents: documents.data.map((document) => ({
        requestReference: reference.get(document.entity_id) ?? null,
        name: document.name,
        mimeType: document.mime_type,
        size: Number(document.size),
        uploadedAt: document.created_at,
      })),
    };

    const { error: auditError } = await client.from("audit_logs").insert({
      user_id: origin.userId,
      action: "CONTACT_DATA_EXPORTED",
      entity_type: "contact",
      entity_id: contactId,
      new_value: {
        requests: exported.requests.length,
        messages: exported.messages.length,
        qualifications: exported.qualifications.length,
        documents: exported.documents.length,
      },
      ip_address: origin.ip,
      user_agent: origin.userAgent,
    });
    if (auditError) throw toDbException(auditError);
    return exported;
  }

  // Effacement : la base est nettoyée en une transaction (fonction SQL
  // `anonymize_contact`), puis les fichiers sont retirés du stockage.
  async anonymizeContact(contactId: string, origin: RequestOrigin): Promise<ContactAnonymizationResponse> {
    const client = this.supabase.getClient();
    const { data, error } = await client.rpc("anonymize_contact", {
      p_contact_id: contactId,
      p_user_id: origin.userId,
      p_ip: origin.ip as string,
      p_user_agent: origin.userAgent as string,
    });
    if (error) {
      if (error.code === "P0001") throw new ConflictException("Ce contact est déjà anonymisé.");
      throw toDbException(error);
    }

    const { storagePaths, ...erased } = data as unknown as ContactAnonymizationResponse["erased"] & {
      storagePaths: string[];
    };
    let filesRemaining = 0;
    if (storagePaths.length > 0) {
      const { error: storageError } = await client.storage.from("documents").remove(storagePaths);
      if (storageError) {
        // Les lignes n'existent plus : ces fichiers ne sont plus atteignables
        // par l'application, mais restent à purger du stockage.
        filesRemaining = storagePaths.length;
        logger.error({ contactId, err: storageError.message, storagePaths }, "Fichiers à purger du stockage après anonymisation");
      }
    }
    return { contactId, anonymizedAt: new Date().toISOString(), erased, filesRemaining };
  }
}
