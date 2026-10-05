import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { DOCUMENT_MAX_SIZE_BYTES } from "@kps/shared";
import { DocumentEntityType, EventEntityType, EventType } from "@kps/types";
import type { Database, DocumentDownloadResponse, DocumentResponse } from "@kps/types";
import { toDbException } from "../common/db-error";
import { EventBus, userActor } from "../events/event-bus.service";
import { SupabaseService } from "../supabase/supabase.service";
import type { AuthenticatedUser } from "../users/users.types";
import { decodeOriginalName, storageSafeName, validateFile } from "./file-validation";

const logger = new Logger("DocumentsService");

const BUCKET = "documents";
const SIGNED_URL_TTL_SECONDS = 60;

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type Person = { first_name: string; last_name: string };

// Ce qu'un document hérite de l'objet auquel il est rattaché : les droits
// (on voit ses documents si on voit l'objet, on les supprime si on le
// gère) et l'historique dans lequel le dépôt est tracé.
interface Target {
  readPermission: string;
  managePermission: string;
  eventEntityType: EventEntityType;
  eventEntityId: string;
  requestId: string | null;
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

// Documents (section 54) : fichiers dans un bucket privé de Supabase
// Storage, jamais exposé — tout téléchargement passe par un lien signé de
// courte durée délivré après contrôle des droits.
@Injectable()
export class DocumentsService implements OnModuleInit {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBus,
  ) {}

  // Le bucket fait partie de l'infrastructure : créé (privé) s'il manque,
  // pour qu'un nouvel environnement fonctionne sans geste manuel.
  async onModuleInit(): Promise<void> {
    const storage = this.supabase.getClient().storage;
    const { data } = await storage.getBucket(BUCKET);
    if (data) return;
    const { error } = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: DOCUMENT_MAX_SIZE_BYTES });
    if (error && !/already exists/i.test(error.message)) {
      logger.error({ err: error.message }, "Création du bucket de documents impossible");
    }
  }

  async list(entityType: DocumentEntityType, entityId: string, user: AuthenticatedUser): Promise<DocumentResponse[]> {
    const target = await this.resolveTarget(entityType, entityId);
    this.assertPermission(user, target.readPermission);

    const { data, error } = await this.supabase
      .getClient()
      .from("documents")
      .select("*, users(first_name, last_name)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) throw toDbException(error);
    return data.map((row) => this.toResponse(row, row.users as Person | null, user, target));
  }

  async upload(
    entityType: DocumentEntityType,
    entityId: string,
    file: UploadedFile | undefined,
    user: AuthenticatedUser,
  ): Promise<DocumentResponse> {
    if (!file) throw new BadRequestException("Aucun fichier reçu.");
    const target = await this.resolveTarget(entityType, entityId);
    this.assertPermission(user, target.readPermission);

    const name = decodeOriginalName(file.originalname);
    const invalid = validateFile({ name, mimeType: file.mimetype, content: file.buffer });
    if (invalid) throw new BadRequestException(invalid);

    const client = this.supabase.getClient();
    const path = `${entityType}/${entityId}/${randomUUID()}-${storageSafeName(name)}`;
    const { error: storageError } = await client.storage
      .from(BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (storageError) {
      logger.error({ err: storageError.message }, "Dépôt du fichier dans le stockage impossible");
      throw new InternalServerErrorException("Le fichier n'a pas pu être enregistré.");
    }

    const { data, error } = await client
      .from("documents")
      .insert({
        name,
        storage_path: path,
        mime_type: file.mimetype,
        size: file.buffer.length,
        entity_type: entityType,
        entity_id: entityId,
        uploaded_by: user.id,
      })
      .select("*")
      .single();
    if (error) {
      // Pas de fichier orphelin dans le stockage si la ligne n'a pas pu être écrite.
      await client.storage.from(BUCKET).remove([path]);
      throw toDbException(error);
    }

    await this.emit(EventType.DOCUMENT_UPLOADED, target, user, data, entityType);
    return this.toResponse(data, { first_name: user.firstName, last_name: user.lastName }, user, target);
  }

  async download(id: string, user: AuthenticatedUser): Promise<DocumentDownloadResponse> {
    const row = await this.findRow(id);
    const target = await this.resolveTarget(row.entity_type as DocumentEntityType, row.entity_id);
    this.assertPermission(user, target.readPermission);

    const { data, error } = await this.supabase
      .getClient()
      .storage.from(BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, { download: row.name });
    if (error || !data) {
      logger.error({ documentId: id, err: error?.message }, "Lien signé impossible à créer");
      throw new NotFoundException("Le fichier de ce document est introuvable.");
    }
    return { url: data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const row = await this.findRow(id);
    const entityType = row.entity_type as DocumentEntityType;
    const target = await this.resolveTarget(entityType, row.entity_id);
    this.assertPermission(user, target.readPermission);
    if (!this.canDelete(row, user, target)) {
      throw new ForbiddenException("Seul l'auteur du dépôt ou un responsable de l'objet peut supprimer ce document.");
    }

    const client = this.supabase.getClient();
    const { error } = await client.from("documents").delete().eq("id", id);
    if (error) throw toDbException(error);
    const { error: storageError } = await client.storage.from(BUCKET).remove([row.storage_path]);
    if (storageError) {
      // La ligne n'existe plus : le fichier n'est plus atteignable par l'application.
      logger.error({ documentId: id, err: storageError.message }, "Suppression du fichier dans le stockage impossible");
    }
    await this.emit(EventType.DOCUMENT_DELETED, target, user, row, entityType);
  }

  private toResponse(
    row: DocumentRow,
    uploader: Person | null,
    user: AuthenticatedUser,
    target: Target,
  ): DocumentResponse {
    return {
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      size: Number(row.size),
      entityType: row.entity_type as DocumentEntityType,
      entityId: row.entity_id,
      uploadedById: row.uploaded_by,
      uploadedByName: uploader ? `${uploader.first_name} ${uploader.last_name}` : null,
      createdAt: row.created_at,
      canDelete: this.canDelete(row, user, target),
    };
  }

  private canDelete(row: DocumentRow, user: AuthenticatedUser, target: Target): boolean {
    return (
      user.permissions.includes(target.managePermission) ||
      (row.uploaded_by === user.id && user.permissions.includes("documents.manage"))
    );
  }

  private assertPermission(user: AuthenticatedUser, permission: string): void {
    if (!user.permissions.includes(permission)) throw new ForbiddenException("Permission insuffisante.");
  }

  private async findRow(id: string): Promise<DocumentRow> {
    const { data, error } = await this.supabase.getClient().from("documents").select("*").eq("id", id).maybeSingle();
    if (error) throw toDbException(error);
    if (!data) throw new NotFoundException("Document introuvable.");
    return data;
  }

  // Vérifie que l'objet existe (pas de clé étrangère sur une association
  // polymorphe : le contrôle est ici, DATABASE.md §17) et en déduit droits
  // et historique.
  private async resolveTarget(entityType: DocumentEntityType, entityId: string): Promise<Target> {
    const client = this.supabase.getClient();
    const missing = () => new NotFoundException("L'objet auquel rattacher le document est introuvable.");
    const viaOpportunity = (o: unknown) => (o as { request_id: string | null } | null)?.request_id ?? null;

    switch (entityType) {
      case DocumentEntityType.REQUEST: {
        const { data, error } = await client.from("requests").select("id").eq("id", entityId).maybeSingle();
        if (error) throw toDbException(error);
        if (!data) throw missing();
        return {
          readPermission: "requests.read",
          managePermission: "requests.manage",
          eventEntityType: EventEntityType.REQUEST,
          eventEntityId: entityId,
          requestId: entityId,
        };
      }
      case DocumentEntityType.OPPORTUNITY: {
        const { data, error } = await client.from("opportunities").select("request_id").eq("id", entityId).maybeSingle();
        if (error) throw toDbException(error);
        if (!data) throw missing();
        return {
          readPermission: "opportunities.read",
          managePermission: "opportunities.manage",
          eventEntityType: EventEntityType.OPPORTUNITY,
          eventEntityId: entityId,
          requestId: data.request_id,
        };
      }
      case DocumentEntityType.QUOTE: {
        const { data, error } = await client.from("quotes").select("opportunities(request_id)").eq("id", entityId).maybeSingle();
        if (error) throw toDbException(error);
        if (!data) throw missing();
        return {
          readPermission: "quotes.read",
          managePermission: "quotes.manage",
          eventEntityType: EventEntityType.QUOTE,
          eventEntityId: entityId,
          requestId: viaOpportunity(data.opportunities),
        };
      }
      case DocumentEntityType.MISSION: {
        const { data, error } = await client.from("missions").select("opportunities(request_id)").eq("id", entityId).maybeSingle();
        if (error) throw toDbException(error);
        if (!data) throw missing();
        return {
          readPermission: "missions.read",
          managePermission: "missions.manage",
          eventEntityType: EventEntityType.MISSION,
          eventEntityId: entityId,
          requestId: viaOpportunity(data.opportunities),
        };
      }
      // Pièce jointe d'une tâche : droits et historique de sa mission.
      case DocumentEntityType.TASK: {
        const { data, error } = await client
          .from("tasks")
          .select("mission_id, missions(opportunities(request_id))")
          .eq("id", entityId)
          .maybeSingle();
        if (error) throw toDbException(error);
        if (!data) throw missing();
        return {
          readPermission: "missions.read",
          managePermission: "missions.manage",
          eventEntityType: EventEntityType.MISSION,
          eventEntityId: data.mission_id,
          requestId: viaOpportunity((data.missions as { opportunities: unknown } | null)?.opportunities),
        };
      }
      case DocumentEntityType.CLIENT: {
        const { data, error } = await client.from("clients").select("id").eq("id", entityId).maybeSingle();
        if (error) throw toDbException(error);
        if (!data) throw missing();
        return {
          readPermission: "clients.read",
          managePermission: "clients.manage",
          eventEntityType: EventEntityType.CLIENT,
          eventEntityId: entityId,
          requestId: null,
        };
      }
    }
  }

  private async emit(
    type: EventType,
    target: Target,
    user: AuthenticatedUser,
    row: DocumentRow,
    entityType: DocumentEntityType,
  ): Promise<void> {
    await this.eventBus.emit({
      type,
      entityType: target.eventEntityType,
      entityId: target.eventEntityId,
      requestId: target.requestId,
      actor: userActor(user),
      payload: { documentId: row.id, name: row.name, size: Number(row.size), attachedTo: entityType },
    });
  }
}
