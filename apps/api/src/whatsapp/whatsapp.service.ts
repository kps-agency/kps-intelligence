import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  renderQualificationWhatsapp,
  type QualificationWhatsappParams,
} from "./templates/qualification-whatsapp";

const logger = new Logger("WhatsappService");

interface GraphSendResponse {
  messages?: { id: string }[];
  error?: { message?: string; code?: number };
}

// Client de l'API WhatsApp Business Cloud (Graph API Meta). Les
// credentials sont lus à l'usage et non au démarrage : l'API doit pouvoir
// démarrer sans compte WhatsApp configuré, seul l'envoi échoue alors
// explicitement.
@Injectable()
export class WhatsappService {
  constructor(private readonly config: ConfigService) {}

  async sendText(to: string, body: string): Promise<string> {
    return this.send(to, { type: "text", text: { preview_url: true, body } });
  }

  // Message hors de la fenêtre de 24 h suivant le dernier message du
  // prospect (ex. relance, section 39) : Meta n'accepte qu'un template
  // approuvé. Paramètres du corps, dans l'ordre : prénom, service, lien.
  async sendQualificationReminder(
    to: string,
    params: QualificationWhatsappParams,
  ): Promise<string> {
    const template = this.config.get<string>("WHATSAPP_REMINDER_TEMPLATE");
    if (!template) {
      throw new ServiceUnavailableException(
        "Template WhatsApp de relance non configuré (WHATSAPP_REMINDER_TEMPLATE).",
      );
    }
    return this.send(to, {
      type: "template",
      template: {
        name: template,
        // Un template approuvé par Meta existe par langue : celle du
        // prospect si elle est fournie, sinon celle configurée.
        language: { code: params.language ?? (this.config.get<string>("WHATSAPP_TEMPLATE_LANGUAGE") || "fr") },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: params.contactFirstName ?? "" },
              { type: "text", text: params.serviceName },
              { type: "text", text: params.qualificationUrl },
            ],
          },
        ],
      },
    });
  }

  private async send(to: string, message: Record<string, unknown>): Promise<string> {
    const apiUrl = this.config.get<string>("WHATSAPP_API_URL");
    const token = this.config.get<string>("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = this.config.get<string>("WHATSAPP_PHONE_NUMBER_ID");
    if (!apiUrl || !token || !phoneNumberId) {
      throw new ServiceUnavailableException("WhatsApp n'est pas configuré.");
    }

    const response = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        ...message,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const payload = (await response.json().catch(() => ({}))) as GraphSendResponse;
    const messageId = payload.messages?.[0]?.id;
    if (!response.ok || !messageId) {
      throw new Error(
        `Envoi WhatsApp refusé (HTTP ${response.status}) : ${payload.error?.message ?? "réponse inattendue"}`,
      );
    }

    logger.log({ to, messageId }, "Message WhatsApp envoyé");
    return messageId;
  }

  sendQualificationMessage(to: string, params: QualificationWhatsappParams): Promise<string> {
    return this.sendText(to, renderQualificationWhatsapp(params));
  }
}
