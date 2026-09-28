import { Injectable } from "@nestjs/common";
import { EventEntityType, EventType } from "@kps/types";
import { toDbException } from "../common/db-error";
import { EventBus, SYSTEM_ACTOR } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";

export type ConversationChannel = "EMAIL" | "WHATSAPP";

export interface InboundMessage {
  fromAddress: string;
  fromName: string | null;
  toAddress: string | null;
  subject: string | null;
  body: string;
  externalMessageId: string;
  externalThreadId: string | null;
  sentAt: string;
}

export interface OutboundMessage {
  fromAddress: string | null;
  toAddress: string;
  subject: string | null;
  body: string;
  externalMessageId: string;
}

export interface OpenConversation {
  id: string;
  requestId: string;
}

// Où et à qui répondre pour une demande : le dernier message entrant du
// prospect, sur le canal qu'il a lui-même utilisé.
export interface ReplyTarget {
  conversationId: string;
  channel: ConversationChannel;
  address: string;
  name: string | null;
  externalMessageId: string | null;
}

// Une conversation dont la demande a atteint l'un de ces statuts est
// close : un nouveau message du même prospect ouvre une nouvelle demande.
const CLOSED_REQUEST_STATUSES = ["WON", "LOST", "CONVERTED_TO_MISSION", "CLOSED", "UNQUALIFIED"];

@Injectable()
export class ConversationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBus,
  ) {}

  async isKnownMessage(externalMessageId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .getClient()
      .from("conversation_messages")
      .select("id")
      .eq("external_message_id", externalMessageId)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data !== null;
  }

  // WhatsApp : pas de notion de fil, la conversation ouverte est celle du
  // dernier message reçu de ce numéro.
  async findOpenBySender(
    channel: ConversationChannel,
    address: string,
  ): Promise<OpenConversation | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("conversation_messages")
      .select("conversation_id")
      .eq("channel", channel)
      .eq("direction", "INBOUND")
      .eq("from_address", address)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data ? this.openConversation(data.conversation_id) : null;
  }

  // Email : une réponse référence (In-Reply-To/References) un message déjà
  // connu, entrant ou sortant, de la même conversation.
  async findOpenByExternalIds(
    channel: ConversationChannel,
    externalIds: string[],
  ): Promise<OpenConversation | null> {
    if (externalIds.length === 0) return null;
    const { data, error } = await this.supabase
      .getClient()
      .from("conversation_messages")
      .select("conversation_id")
      .eq("channel", channel)
      .in("external_message_id", externalIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw toDbException(error);
    return data ? this.openConversation(data.conversation_id) : null;
  }

  async startForRequest(
    channel: ConversationChannel,
    request: { id: string; clientId: string | null; contactId: string | null },
    message: InboundMessage,
  ): Promise<string> {
    const { data, error } = await this.supabase
      .getClient()
      .from("conversations")
      .insert({
        channel,
        request_id: request.id,
        client_id: request.clientId,
        contact_id: request.contactId,
      })
      .select("id")
      .single();
    if (error) throw toDbException(error);
    await this.insertInbound(data.id, channel, message);
    return data.id;
  }

  async appendInbound(
    conversation: OpenConversation,
    channel: ConversationChannel,
    message: InboundMessage,
  ): Promise<void> {
    const inserted = await this.insertInbound(conversation.id, channel, message);
    if (!inserted) return;
    await this.eventBus.emit({
      type: EventType.CONVERSATION_MESSAGE_RECEIVED,
      entityType: EventEntityType.CONVERSATION,
      entityId: conversation.id,
      requestId: conversation.requestId,
      actor: SYSTEM_ACTOR,
      payload: { channel },
    });
  }

  async recordOutbound(
    conversationId: string,
    channel: ConversationChannel,
    message: OutboundMessage,
  ): Promise<void> {
    const { error } = await this.supabase.getClient().from("conversation_messages").insert({
      conversation_id: conversationId,
      direction: "OUTBOUND",
      channel,
      from_address: message.fromAddress,
      to_address: message.toAddress,
      subject: message.subject,
      body: message.body,
      external_message_id: message.externalMessageId,
      sent_at: new Date().toISOString(),
    });
    if (error && error.code !== "23505") throw toDbException(error);
  }

  async findReplyTarget(requestId: string): Promise<ReplyTarget | null> {
    const client = this.supabase.getClient();
    const { data: conversations, error } = await client
      .from("conversations")
      .select("id")
      .eq("request_id", requestId);
    if (error) throw toDbException(error);
    if (conversations.length === 0) return null;

    const { data: last, error: lastError } = await client
      .from("conversation_messages")
      .select("conversation_id, channel, from_address, from_name, external_message_id")
      .in(
        "conversation_id",
        conversations.map((c) => c.id),
      )
      .eq("direction", "INBOUND")
      .in("channel", ["EMAIL", "WHATSAPP"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw toDbException(lastError);
    if (!last?.from_address) return null;

    return {
      conversationId: last.conversation_id,
      channel: last.channel as ConversationChannel,
      address: last.from_address,
      name: last.from_name,
      externalMessageId: last.external_message_id,
    };
  }

  // Faux si le message était déjà enregistré (rejeu concurrent).
  private async insertInbound(
    conversationId: string,
    channel: ConversationChannel,
    message: InboundMessage,
  ): Promise<boolean> {
    const { error } = await this.supabase.getClient().from("conversation_messages").insert({
      conversation_id: conversationId,
      direction: "INBOUND",
      channel,
      from_address: message.fromAddress,
      from_name: message.fromName,
      to_address: message.toAddress,
      subject: message.subject,
      body: message.body,
      external_message_id: message.externalMessageId,
      external_thread_id: message.externalThreadId,
      sent_at: message.sentAt,
    });
    if (error?.code === "23505") return false;
    if (error) throw toDbException(error);
    return true;
  }

  private async openConversation(conversationId: string): Promise<OpenConversation | null> {
    const client = this.supabase.getClient();
    const { data: conversation, error } = await client
      .from("conversations")
      .select("id, request_id")
      .eq("id", conversationId)
      .single();
    if (error) throw toDbException(error);
    if (!conversation.request_id) return null;

    const { data: request, error: requestError } = await client
      .from("requests")
      .select("status")
      .eq("id", conversation.request_id)
      .maybeSingle();
    if (requestError) throw toDbException(requestError);
    if (!request || CLOSED_REQUEST_STATUSES.includes(request.status)) return null;

    return { id: conversation.id, requestId: conversation.request_id };
  }
}
