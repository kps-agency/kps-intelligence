import { Injectable, NotFoundException } from "@nestjs/common";
import { EventEntityType } from "@kps/types";
import type { Database, EventActorType, EventType, TimelineEventResponse } from "@kps/types";
import { toDbException } from "../common/db-error";
import { SupabaseService } from "../supabase/supabase.service";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

// Timeline d'une demande ou d'une opportunité (section 43) : reconstruite
// uniquement à partir de la table `events` — aucune autre source n'est
// consultée, ce qui garantit que tout ce qui s'affiche ici a réellement
// été journalisé.
@Injectable()
export class TimelineService {
  constructor(private readonly supabase: SupabaseService) {}

  async forRequest(requestId: string): Promise<TimelineEventResponse[]> {
    const client = this.supabase.getClient();

    const { data: request, error: requestError } = await client
      .from("requests")
      .select("id")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError) throw toDbException(requestError);
    if (!request) throw new NotFoundException("Demande introuvable.");

    const { data: events, error } = await client
      .from("events")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (error) throw toDbException(error);
    return this.toResponses(events);
  }

  // Événements portés par l'opportunité elle-même (création, étapes,
  // notifications) ; ceux de sa demande d'origine restent sur la demande.
  async forOpportunity(opportunityId: string): Promise<TimelineEventResponse[]> {
    const { data: events, error } = await this.supabase
      .getClient()
      .from("events")
      .select("*")
      .eq("entity_type", EventEntityType.OPPORTUNITY)
      .eq("entity_id", opportunityId)
      .order("created_at", { ascending: true });
    if (error) throw toDbException(error);
    return this.toResponses(events);
  }

  private async toResponses(events: EventRow[]): Promise<TimelineEventResponse[]> {
    const userIds = [
      ...new Set(
        events
          .filter((e) => e.actor_type === "USER" && e.actor_id)
          .map((e) => e.actor_id as string),
      ),
    ];
    const names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await this.supabase
        .getClient()
        .from("users")
        .select("id, first_name, last_name")
        .in("id", userIds);
      if (usersError) throw toDbException(usersError);
      for (const user of users) names.set(user.id, `${user.first_name} ${user.last_name}`);
    }

    return events.map((e) => ({
      id: e.id,
      type: e.type as EventType,
      entityType: e.entity_type as EventEntityType,
      entityId: e.entity_id,
      actorType: e.actor_type as EventActorType,
      actorName: e.actor_id ? (names.get(e.actor_id) ?? null) : null,
      payload: (e.payload ?? {}) as Record<string, unknown>,
      createdAt: e.created_at,
    }));
  }
}
