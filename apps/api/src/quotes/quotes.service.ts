import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { computeQuoteTotals, prospectLanguage, type ProspectLanguage } from "@kps/shared";
import { EventEntityType, EventType, QuoteStatus } from "@kps/types";
import type {
  Database,
  Json,
  PaginatedResponse,
  QuoteListItemResponse,
  QuoteResponse,
  QuoteVersionResponse,
} from "@kps/types";
import { CompanySettingsService } from "../company/company-settings.service";
import { toDbException } from "../common/db-error";
import { toRange } from "../common/pagination-query.dto";
import { toContainsPattern } from "../common/search";
import { EmailService } from "../email/email.service";
import { EventBus, type EventActor } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";
import type {
  CreateQuoteDto,
  ListQuotesQueryDto,
  RejectQuoteDto,
  SendQuoteDto,
  UpdateQuoteDto,
} from "./dto/quote.dto";
import { formatAmount, formatDate, type QuoteDocument } from "./quote-document";
import { renderQuotePdf } from "./quote-pdf";

const logger = new Logger("QuotesService");

type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
type ItemRow = Database["public"]["Tables"]["quote_items"]["Row"];
type Person = { first_name: string; last_name: string };
type QuoteWithLinks = QuoteRow & {
  clients: { company_name: string } | null;
  opportunities: { title: string; request_id: string | null } | null;
  creator: Person | null;
};

// Un seul littéral : le typage des sélections Supabase ne suit pas une
// chaîne concaténée.
const QUOTE_SELECT =
  "*, clients(company_name), opportunities(title, request_id), creator:users!quotes_created_by_fkey(first_name, last_name)";

const DEFAULT_CURRENCY = "EUR";

const fullName = (person: Person | null): string | null =>
  person ? `${person.first_name} ${person.last_name}` : null;
// Date du jour (AAAA-MM-JJ) au fuseau de l'agence : en UTC, un devis
// préparé tard le soir serait daté de la veille ou du lendemain.
const BUSINESS_TIME_ZONE = "Europe/Zurich";
const localDate = (date: Date): string =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: BUSINESS_TIME_ZONE }).format(date);
const today = (): string => localDate(new Date());

// EXPIRED n'est jamais écrit en base : c'est un devis envoyé dont la date
// de validité est passée (aucune tâche planifiée à faire tourner).
function effectiveStatus(row: Pick<QuoteRow, "status" | "valid_until">): QuoteStatus {
  if (row.status === "SENT" && row.valid_until && row.valid_until < today()) return QuoteStatus.EXPIRED;
  return row.status as QuoteStatus;
}

function toListItem(row: QuoteWithLinks): QuoteListItemResponse {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: effectiveStatus(row),
    opportunityId: row.opportunity_id,
    opportunityTitle: row.opportunities?.title ?? "",
    clientId: row.client_id,
    clientCompanyName: row.clients?.company_name ?? "",
    currency: row.currency ?? DEFAULT_CURRENCY,
    discountPercent: Number(row.discount_percent),
    taxRate: Number(row.tax_rate),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    validUntil: row.valid_until,
    sentAt: row.sent_at,
    sentTo: row.sent_to,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    createdByName: fullName(row.creator),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Devis (section 51). Human in the loop (section 6) : rien ne part au
// client sans l'action explicite d'un utilisateur — le devis reste un
// brouillon jusqu'à `send`, et l'acceptation ou le refus sont enregistrés
// par un utilisateur.
@Injectable()
export class QuotesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBus,
    private readonly emailService: EmailService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  async list(query: ListQuotesQueryDto): Promise<PaginatedResponse<QuoteListItemResponse>> {
    let request = this.supabase.getClient().from("quotes").select(QUOTE_SELECT, { count: "exact" });

    if (query.opportunityId) request = request.eq("opportunity_id", query.opportunityId);
    if (query.clientId) request = request.eq("client_id", query.clientId);
    // « Expiré » et « Envoyé » se distinguent par la date de validité.
    if (query.status === QuoteStatus.EXPIRED) {
      request = request.eq("status", "SENT").lt("valid_until", today());
    } else if (query.status === QuoteStatus.SENT) {
      request = request.eq("status", "SENT").or(`valid_until.is.null,valid_until.gte.${today()}`);
    } else if (query.status) {
      request = request.eq("status", query.status);
    }
    const pattern = query.search ? toContainsPattern(query.search) : null;
    if (pattern) request = request.or(`reference.ilike.${pattern},title.ilike.${pattern}`);

    const [from, to] = toRange(query.page, query.limit);
    const { data, count, error } = await request.order("created_at", { ascending: false }).range(from, to);
    if (error) throw toDbException(error);

    return {
      data: (data as unknown as QuoteWithLinks[]).map(toListItem),
      meta: { total: count ?? 0, page: query.page, limit: query.limit },
    };
  }

  async findById(id: string): Promise<QuoteResponse> {
    const client = this.supabase.getClient();
    const row = await this.loadRow(id);

    const [{ data: items, error: itemsError }, { data: versions, error: versionsError }] = await Promise.all([
      client.from("quote_items").select("*").eq("quote_id", id).order("order_index", { ascending: true }),
      client
        .from("quote_versions")
        .select("version, snapshot, created_at, creator:users!quote_versions_created_by_fkey(first_name, last_name)")
        .eq("quote_id", id)
        .order("version", { ascending: false }),
    ]);
    if (itemsError) throw toDbException(itemsError);
    if (versionsError) throw toDbException(versionsError);

    return {
      ...toListItem(row),
      notes: row.notes,
      requestId: row.opportunities?.request_id ?? null,
      suggestedRecipient: await this.suggestedRecipient(row),
      items: (items as ItemRow[]).map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        discountPercent: Number(item.discount_percent),
        total: Number(item.total),
      })),
      versions: versions.map((v): QuoteVersionResponse => {
        const snapshot = v.snapshot as unknown as QuoteDocument;
        return {
          version: v.version,
          total: snapshot.total,
          currency: snapshot.currency,
          sentTo: snapshot.sentTo,
          createdByName: fullName(v.creator as Person | null),
          createdAt: v.created_at,
        };
      }),
    };
  }

  async create(dto: CreateQuoteDto, actor: EventActor): Promise<QuoteResponse> {
    const client = this.supabase.getClient();
    const { data: opportunity, error } = await client
      .from("opportunities")
      .select("id, title, client_id, currency, request_id")
      .eq("id", dto.opportunityId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!opportunity) throw new BadRequestException("Cette opportunité n'existe pas.");
    if (!opportunity.client_id) {
      throw new BadRequestException(
        "Rattachez d'abord un client à l'opportunité : un devis est toujours adressé à un client.",
      );
    }

    const settings = await this.companySettings.get();
    const validUntil = localDate(new Date(Date.now() + settings.quoteValidityDays * 86_400_000));

    const { data, error: insertError } = await client
      .from("quotes")
      .insert({
        opportunity_id: opportunity.id,
        client_id: opportunity.client_id,
        title: dto.title ?? opportunity.title,
        currency: opportunity.currency ?? DEFAULT_CURRENCY,
        tax_rate: settings.defaultTaxRate,
        valid_until: validUntil,
        created_by: actor.id,
      })
      .select("id, reference, title")
      .single();
    if (insertError) throw toDbException(insertError);

    await this.eventBus.emit({
      type: EventType.QUOTE_CREATED,
      entityType: EventEntityType.QUOTE,
      entityId: data.id,
      requestId: opportunity.request_id,
      actor,
      payload: { quoteId: data.id, reference: data.reference, title: data.title, opportunityId: opportunity.id },
    });
    return this.findById(data.id);
  }

  // Les totaux sont recalculés ici à chaque enregistrement : ceux que
  // l'interface affiche pendant la saisie ne sont jamais repris.
  async update(id: string, dto: UpdateQuoteDto): Promise<QuoteResponse> {
    const row = await this.loadRow(id);
    this.assertDraft(row);

    const totals = computeQuoteTotals(dto.items, dto.discountPercent, dto.taxRate);
    const { error } = await this.supabase.getClient().rpc("save_quote_content", {
      p_quote_id: id,
      p_quote: {
        title: dto.title,
        notes: dto.notes,
        currency: dto.currency,
        valid_until: dto.validUntil,
        discount_percent: dto.discountPercent,
        tax_rate: dto.taxRate,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax_amount: totals.taxAmount,
        total: totals.total,
      },
      p_items: dto.items.map((item, index) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_percent: item.discountPercent,
        total: totals.lineTotals[index] as number,
      })),
    });
    if (error) throw this.toStateException(error);
    return this.findById(id);
  }

  // Envoi au client : PDF généré, email réel avec le PDF joint, puis — et
  // seulement si l'email est parti — version figée et statut SENT.
  async send(id: string, dto: SendQuoteDto, actor: EventActor): Promise<QuoteResponse> {
    const row = await this.loadRow(id);
    this.assertDraft(row);
    const document = await this.buildDocument(row, dto.to);
    if (document.items.length === 0) {
      throw new BadRequestException("Ajoutez au moins une ligne au devis avant de l'envoyer.");
    }

    const pdf = await renderQuotePdf(document);
    try {
      await this.emailService.sendQuoteEmail(
        dto.to,
        {
          contactFirstName: document.client.contactName?.split(" ")[0] ?? null,
          reference: document.reference,
          title: document.title,
          total: `${formatAmount(document.total)} ${document.currency}`,
          validUntil: document.validUntil ? formatDate(document.validUntil) : null,
          companyName: document.company.legalName,
          message: dto.message ?? null,
          language: await this.prospectLanguage(row),
        },
        { filename: `${document.reference}.pdf`, content: pdf },
      );
    } catch (err) {
      logger.error(
        { quoteId: id, err: err instanceof Error ? err.message : String(err) },
        "Échec de l'envoi du devis par email",
      );
      throw new BadGatewayException("L'email n'a pas pu être envoyé : le devis reste en brouillon.");
    }

    const { data: version, error } = await this.supabase.getClient().rpc("mark_quote_sent", {
      p_quote_id: id,
      p_snapshot: document as unknown as Json,
      p_sent_to: dto.to,
      p_user_id: actor.id as string,
    });
    if (error) throw this.toStateException(error);

    await this.emit(EventType.QUOTE_SENT, row, actor, {
      version,
      sentTo: dto.to,
      total: document.total,
      currency: document.currency,
    });
    return this.findById(id);
  }

  // Un devis envoyé (ou refusé) ne se modifie pas : il repasse en
  // brouillon, et son prochain envoi créera une nouvelle version.
  async revise(id: string, actor: EventActor): Promise<QuoteResponse> {
    const row = await this.loadRow(id);
    if (row.status !== "SENT" && row.status !== "REJECTED") {
      throw new ConflictException("Seul un devis envoyé ou refusé peut être révisé.");
    }
    await this.transition(id, row.status, { status: "DRAFT" });
    await this.emit(EventType.QUOTE_REVISED, row, actor, { from: row.status });
    return this.findById(id);
  }

  async accept(id: string, actor: EventActor): Promise<QuoteResponse> {
    const row = await this.loadRow(id);
    if (row.status !== "SENT") throw new ConflictException("Seul un devis envoyé peut être accepté.");
    await this.transition(id, "SENT", { status: "ACCEPTED", accepted_at: new Date().toISOString() });
    await this.emit(EventType.QUOTE_ACCEPTED, row, actor, {
      total: Number(row.total),
      currency: row.currency ?? DEFAULT_CURRENCY,
    });
    return this.findById(id);
  }

  async reject(id: string, dto: RejectQuoteDto, actor: EventActor): Promise<QuoteResponse> {
    const row = await this.loadRow(id);
    if (row.status !== "SENT") throw new ConflictException("Seul un devis envoyé peut être refusé.");
    const reason = dto.reason ?? null;
    await this.transition(id, "SENT", {
      status: "REJECTED",
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
    });
    await this.emit(EventType.QUOTE_REJECTED, row, actor, { reason });
    return this.findById(id);
  }

  // PDF de l'état courant du devis (aperçu d'un brouillon compris).
  async currentPdf(id: string): Promise<{ filename: string; content: Buffer }> {
    const row = await this.loadRow(id);
    const document = await this.buildDocument(row, row.sent_to);
    return { filename: `${document.reference}.pdf`, content: await renderQuotePdf(document) };
  }

  // PDF d'une version envoyée, régénéré depuis son instantané.
  async versionPdf(id: string, version: number): Promise<{ filename: string; content: Buffer }> {
    const { data, error } = await this.supabase
      .getClient()
      .from("quote_versions")
      .select("snapshot")
      .eq("quote_id", id)
      .eq("version", version)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Version de devis introuvable.");
    const document = data.snapshot as unknown as QuoteDocument;
    return {
      filename: `${document.reference}-v${document.version}.pdf`,
      content: await renderQuotePdf(document),
    };
  }

  private async buildDocument(row: QuoteWithLinks, sentTo: string | null): Promise<QuoteDocument> {
    const client = this.supabase.getClient();
    const settings = await this.companySettings.get();
    if (!settings.legalName) {
      throw new BadRequestException(
        "Renseignez d'abord l'identité de l'entreprise (Paramètres) : elle figure sur le devis.",
      );
    }

    const [items, versions, recipient, contact] = await Promise.all([
      client.from("quote_items").select("*").eq("quote_id", row.id).order("order_index", { ascending: true }),
      client.from("quote_versions").select("version", { count: "exact", head: true }).eq("quote_id", row.id),
      client.from("clients").select("company_name, city, country").eq("id", row.client_id).single(),
      this.requestContact(row),
    ]);
    if (items.error) throw toDbException(items.error);
    if (versions.error) throw toDbException(versions.error);
    if (recipient.error) throw toDbException(recipient.error);

    // Brouillon : la version que créera le prochain envoi.
    const sentVersions = versions.count ?? 0;
    return {
      reference: row.reference,
      version: row.status === "DRAFT" ? sentVersions + 1 : Math.max(sentVersions, 1),
      title: row.title,
      notes: row.notes,
      currency: row.currency ?? DEFAULT_CURRENCY,
      issuedOn: (row.status === "DRAFT" ? null : row.sent_at)?.slice(0, 10) ?? today(),
      validUntil: row.valid_until,
      discountPercent: Number(row.discount_percent),
      taxRate: Number(row.tax_rate),
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      taxAmount: Number(row.tax_amount),
      total: Number(row.total),
      sentTo,
      items: (items.data as ItemRow[]).map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        discountPercent: Number(item.discount_percent),
        total: Number(item.total),
      })),
      client: {
        companyName: recipient.data.company_name,
        contactName: contact ? `${contact.first_name} ${contact.last_name}` : null,
        city: recipient.data.city,
        country: recipient.data.country,
      },
      company: {
        legalName: settings.legalName,
        address: settings.address,
        postalCode: settings.postalCode,
        city: settings.city,
        country: settings.country,
        vatNumber: settings.vatNumber,
        email: settings.email,
        phone: settings.phone,
        website: settings.website,
        iban: settings.iban,
        quoteTerms: settings.quoteTerms,
      },
    };
  }

  // Interlocuteur du devis : le contact de la demande d'origine, sinon le
  // contact principal du client.
  private async requestContact(
    row: QuoteWithLinks,
  ): Promise<{ first_name: string; last_name: string; email: string | null } | null> {
    const client = this.supabase.getClient();
    const requestId = row.opportunities?.request_id;
    if (requestId) {
      const { data, error } = await client
        .from("requests")
        .select("contacts(first_name, last_name, email)")
        .eq("id", requestId)
        .maybeSingle();
      if (error) throw toDbException(error);
      const contact = data?.contacts as { first_name: string; last_name: string; email: string | null } | null;
      if (contact) return contact;
    }
    const { data, error } = await client
      .from("contacts")
      .select("first_name, last_name, email")
      .eq("client_id", row.client_id)
      .eq("is_primary", true)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data;
  }

  // Section 65 : langue de la demande d'origine, français sans demande.
  private async prospectLanguage(row: QuoteWithLinks): Promise<ProspectLanguage> {
    const requestId = row.opportunities?.request_id;
    if (!requestId) return "fr";
    const { data, error } = await this.supabase
      .getClient()
      .from("requests")
      .select("language")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return prospectLanguage(data?.language);
  }

  private async suggestedRecipient(row: QuoteWithLinks): Promise<string | null> {
    const contact = await this.requestContact(row);
    if (contact?.email) return contact.email;
    const { data, error } = await this.supabase
      .getClient()
      .from("clients")
      .select("email")
      .eq("id", row.client_id)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data?.email ?? null;
  }

  private async loadRow(id: string): Promise<QuoteWithLinks> {
    const { data, error } = await this.supabase
      .getClient()
      .from("quotes")
      .select(QUOTE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Devis introuvable.");
    return data as unknown as QuoteWithLinks;
  }

  private assertDraft(row: QuoteRow): void {
    if (row.status !== "DRAFT") {
      throw new ConflictException("Ce devis a déjà été envoyé : révisez-le pour le modifier.");
    }
  }

  // Filtrée sur le statut lu : deux actions simultanées (accepter et
  // refuser) n'en laissent passer qu'une, donc un seul événement.
  private async transition(
    id: string,
    from: QuoteRow["status"],
    fields: Database["public"]["Tables"]["quotes"]["Update"],
  ): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from("quotes")
      .update(fields)
      .eq("id", id)
      .eq("status", from)
      .select("id");
    if (error) throw toDbException(error);
    if (data.length === 0) throw new ConflictException("Ce devis vient d'être modifié : rechargez la page.");
  }

  // P0001 : refus levé par nos fonctions SQL (devis qui n'est plus un
  // brouillon au moment d'écrire).
  private toStateException(error: Parameters<typeof toDbException>[0]) {
    return error.code === "P0001"
      ? new ConflictException("Ce devis a déjà été envoyé : révisez-le pour le modifier.")
      : toDbException(error);
  }

  private async emit(
    type: EventType,
    row: QuoteWithLinks,
    actor: EventActor,
    payload: Record<string, Json>,
  ): Promise<void> {
    await this.eventBus.emit({
      type,
      entityType: EventEntityType.QUOTE,
      entityId: row.id,
      requestId: row.opportunities?.request_id ?? null,
      actor,
      payload: { quoteId: row.id, reference: row.reference, title: row.title, ...payload },
    });
  }
}
