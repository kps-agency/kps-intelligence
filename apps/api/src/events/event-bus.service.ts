import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { EventActorType, type EventEntityType, type EventType } from "@kps/types";
import type { Json } from "@kps/types";
import { SupabaseService } from "../supabase/supabase.service";

const logger = new Logger("EventBus");

export interface EventActor {
  type: EventActorType;
  id: string | null;
}

export const SYSTEM_ACTOR: EventActor = { type: EventActorType.SYSTEM, id: null };
export const AI_ACTOR: EventActor = { type: EventActorType.AI, id: null };
export const AUTOMATION_ACTOR: EventActor = { type: EventActorType.AUTOMATION, id: null };

export function userActor(user: { id: string }): EventActor {
  return { type: EventActorType.USER, id: user.id };
}

export interface EmitParams {
  type: EventType;
  entityType: EventEntityType;
  entityId: string;
  requestId: string | null;
  actor: EventActor;
  payload?: Record<string, Json>;
}

export interface DomainEvent {
  id: string;
  type: EventType;
  entityType: EventEntityType;
  entityId: string;
  requestId: string | null;
  actor: EventActor;
  payload: Record<string, Json>;
  createdAt: string;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

// Bus d'événements (section 44) : chaque étape métier est d'abord
// persistée dans `events` — la source de vérité, dont la timeline est
// entièrement dérivée — puis transmise aux handlers abonnés.
//
// Les handlers tournent hors du chemin de l'appelant : une étape métier
// déjà réalisée (demande créée, formulaire soumis) ne doit ni attendre ni
// échouer à cause d'une réaction en aval (envoi d'email, notification).
// Chaque handler gère ses propres erreurs ; celles qui remontent quand
// même sont journalisées, jamais propagées.
@Injectable()
export class EventBus implements OnApplicationShutdown {
  private readonly handlers = new Map<EventType, EventHandler[]>();
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly supabase: SupabaseService) {}

  subscribe(type: EventType, handler: EventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  // Un échec d'écriture est journalisé sans être propagé : l'étape métier
  // a déjà eu lieu, l'annuler côté appelant parce que son journal n'a pas
  // pu être écrit laisserait l'utilisateur face à une erreur pour une
  // action pourtant réalisée.
  async emit(params: EmitParams): Promise<DomainEvent | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from("events")
      .insert({
        type: params.type,
        entity_type: params.entityType,
        entity_id: params.entityId,
        request_id: params.requestId,
        actor_type: params.actor.type,
        actor_id: params.actor.id,
        payload: params.payload ?? {},
      })
      .select("id, created_at")
      .single();

    if (error) {
      logger.error(
        { type: params.type, entityId: params.entityId, code: error.code, message: error.message },
        "Échec de l'enregistrement d'un événement",
      );
      return null;
    }

    const event: DomainEvent = {
      id: data.id,
      type: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      requestId: params.requestId,
      actor: params.actor,
      payload: params.payload ?? {},
      createdAt: data.created_at,
    };
    this.dispatch(event);
    return event;
  }

  // Attend la fin de tous les handlers en cours, y compris ceux déclenchés
  // en cascade par des événements émis depuis un handler.
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.whenIdle();
  }

  private dispatch(event: DomainEvent): void {
    for (const handler of this.handlers.get(event.type) ?? []) {
      const run = Promise.resolve()
        .then(() => handler(event))
        .catch((err: unknown) => {
          logger.error(
            { eventId: event.id, type: event.type, err: err instanceof Error ? err.message : String(err) },
            "Échec d'un handler d'événement",
          );
        })
        .finally(() => this.pending.delete(run));
      this.pending.add(run);
    }
  }
}
