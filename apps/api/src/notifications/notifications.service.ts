import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  EventType,
  NotificationPreferenceResponse,
  NotificationResponse,
  PaginatedResponse,
  PriorityLevel,
} from "@kps/types";
import { toDbException } from "../common/db-error";
import { toRange } from "../common/pagination-query.dto";
import { toContainsPattern } from "../common/search";
import { SupabaseService } from "../supabase/supabase.service";
import type { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import type { UpdateNotificationPreferenceDto } from "./dto/update-notification-preference.dto";
import { NOTIFICATION_RULES, ruleForEventType } from "./notification-rules";

interface NotificationRow {
  id: string;
  event_type: string;
  title: string;
  body: string;
  priority: string;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

function toResponse(row: NotificationRow): NotificationResponse {
  return {
    id: row.id,
    eventType: row.event_type as EventType,
    title: row.title,
    body: row.body,
    priority: row.priority as PriorityLevel,
    link: row.link,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

// Centre de notifications (section 42) : uniquement les notifications
// in-app de l'utilisateur connecté. Les lignes EMAIL sont des traces
// d'envoi, pas des éléments à lire ici.
@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedResponse<NotificationResponse>> {
    let request = this.supabase
      .getClient()
      .from("notifications")
      .select("id, event_type, title, body, priority, link, is_read, read_at, created_at", {
        count: "exact",
      })
      .eq("user_id", userId)
      .eq("channel", "IN_APP");

    if (query.status === "unread") request = request.eq("is_read", false);
    if (query.status === "read") request = request.eq("is_read", true);
    if (query.priority) request = request.eq("priority", query.priority);
    const pattern = query.search ? toContainsPattern(query.search) : null;
    if (pattern) request = request.or(`title.ilike.${pattern},body.ilike.${pattern}`);

    const [from, to] = toRange(query.page, query.limit);
    const { data, count, error } = await request
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw toDbException(error);

    return {
      data: data.map(toResponse),
      meta: { total: count ?? 0, page: query.page, limit: query.limit },
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const { count, error } = await this.supabase
      .getClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("channel", "IN_APP")
      .eq("is_read", false);
    if (error) throw toDbException(error);
    return { count: count ?? 0 };
  }

  // Filtré sur l'utilisateur : la notification d'un autre est introuvable
  // (404), jamais modifiable.
  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    const { data: existing, error: existingError } = await this.supabase
      .getClient()
      .from("notifications")
      .select("id, is_read, read_at")
      .eq("id", id)
      .eq("user_id", userId)
      .eq("channel", "IN_APP")
      .maybeSingle();
    if (existingError) throw toDbException(existingError);
    if (!existing) throw new NotFoundException("Notification introuvable.");

    const { data, error } = await this.supabase
      .getClient()
      .from("notifications")
      .update({ is_read: true, read_at: existing.read_at ?? new Date().toISOString() })
      .eq("id", id)
      .select("id, event_type, title, body, priority, link, is_read, read_at, created_at")
      .single();
    if (error) throw toDbException(error);
    return toResponse(data);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { data, error } = await this.supabase
      .getClient()
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("channel", "IN_APP")
      .eq("is_read", false)
      .select("id");
    if (error) throw toDbException(error);
    return { updated: data.length };
  }

  async preferences(userId: string): Promise<NotificationPreferenceResponse[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from("notification_preferences")
      .select("event_type, channel, enabled")
      .eq("user_id", userId);
    if (error) throw toDbException(error);

    return NOTIFICATION_RULES.map((rule) => {
      const state = (channel: "IN_APP" | "EMAIL") => {
        const locked = channel === "IN_APP" && rule.critical === true;
        const preference = data.find(
          (p) => p.event_type === rule.eventType && p.channel === channel,
        );
        return {
          enabled: locked || (preference ? preference.enabled : rule.channels.includes(channel)),
          locked,
        };
      };
      return {
        eventType: rule.eventType,
        label: rule.label,
        channels: { IN_APP: state("IN_APP"), EMAIL: state("EMAIL") },
      };
    });
  }

  async updatePreference(
    userId: string,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceResponse[]> {
    const rule = ruleForEventType(dto.eventType);
    if (!rule) {
      throw new BadRequestException("Aucune notification n'existe pour ce type d'événement.");
    }
    if (dto.channel === "WHATSAPP") {
      // Un message WhatsApp à l'initiative de l'entreprise exige un template
      // approuvé par Meta : pas disponible tant que le compte n'existe pas.
      throw new BadRequestException("Les notifications WhatsApp ne sont pas encore disponibles.");
    }
    if (dto.channel === "IN_APP" && rule.critical && !dto.enabled) {
      throw new BadRequestException(
        "Cette notification est critique : elle ne peut pas être désactivée dans l'application.",
      );
    }

    const { error } = await this.supabase
      .getClient()
      .from("notification_preferences")
      .upsert(
        { user_id: userId, event_type: dto.eventType, channel: dto.channel, enabled: dto.enabled },
        { onConflict: "user_id,event_type,channel" },
      );
    if (error) throw toDbException(error);
    return this.preferences(userId);
  }
}
