import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  requestId: string | null;
}

// HttpStatus[429] vaut "TOO_MANY_REQUESTS" : on le met au format lisible
// ("Too Many Requests") utilisé par les autres exceptions Nest.
function statusLabel(statusCode: number): string {
  const name = HttpStatus[statusCode];
  if (!name) return "Error";
  return name
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Format d'erreur unique pour toute l'API (voir API.md) : même forme que
// les exceptions HttpException de Nest, plus le requestId de la requête
// pour pouvoir retrouver la trace dans les logs. Les erreurs non prévues
// sont loguées avec leur stack mais jamais détaillées au client.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { id?: string | number }>();
    const response = context.getResponse<Response>();
    const requestId = request.id !== undefined ? String(request.id) : null;

    let body: ErrorBody;

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
        body = {
          statusCode,
          message: "Trop de requêtes, réessayez plus tard.",
          error: statusLabel(statusCode),
          requestId,
        };
      } else if (typeof payload === "string") {
        body = {
          statusCode,
          message: payload,
          error: statusLabel(statusCode),
          requestId,
        };
      } else {
        const { message, error } = payload as {
          message?: string | string[];
          error?: string;
        };
        body = {
          statusCode,
          message: message ?? exception.message,
          error: error ?? statusLabel(statusCode),
          requestId,
        };
      }
    } else {
      this.logger.error(
        { requestId, path: request.url, err: exception },
        "Unhandled exception",
      );
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "Erreur interne du serveur.",
        error: "Internal Server Error",
        requestId,
      };
    }

    response.status(body.statusCode).json(body);
  }
}
