import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type HttpException,
} from "@nestjs/common";
import type { PostgrestError } from "@supabase/supabase-js";

const logger = new Logger("Database");

// Traduit une erreur Supabase/PostgREST en exception HTTP. Le détail brut
// (nom de table, contrainte, requête) ne doit jamais atteindre le client :
// il est logué avec le requestId de la requête, et le client reçoit un
// message générique — sauf pour les cas métier connus ci-dessous.
export function toDbException(error: PostgrestError): HttpException {
  switch (error.code) {
    case "P0002": // levé par nos fonctions SQL : « introuvable »
      return new NotFoundException("Ressource introuvable.");
    case "23505": // unique_violation
      return new ConflictException("Cette valeur existe déjà.");
    default:
      logger.error(
        { code: error.code, message: error.message, details: error.details },
        "Erreur base de données",
      );
      return new InternalServerErrorException("Erreur de base de données.");
  }
}
