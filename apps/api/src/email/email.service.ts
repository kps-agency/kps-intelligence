import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import {
  renderQualificationEmail,
  type QualificationEmailParams,
} from "./templates/qualification-email";

const logger = new Logger("EmailService");

@Injectable()
export class EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = config.getOrThrow<string>("SMTP_FROM");
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>("SMTP_HOST"),
      port: Number(config.getOrThrow<string>("SMTP_PORT")),
      // 587 = STARTTLS (upgrade après connexion en clair), pas de TLS
      // implicite dès la connexion (ce que `secure: true` signifierait).
      secure: false,
      auth: {
        user: config.getOrThrow<string>("SMTP_USER"),
        pass: config.getOrThrow<string>("SMTP_PASSWORD"),
      },
    });
  }

  getFromAddress(): string {
    return this.from;
  }

  // Notification interne à un membre de l'équipe (texte brut : lisible
  // partout, sans mise en forme marketing).
  async sendInternalEmail(to: string, subject: string, text: string): Promise<string> {
    const info = await this.transporter.sendMail({ from: this.from, to, subject, text });
    logger.log({ to, messageId: info.messageId }, "Email de notification interne envoyé");
    return info.messageId;
  }

  // `inReplyTo` : Message-ID du message du prospect. L'email part alors
  // dans le même fil chez lui, et sa réponse référencera les deux
  // messages — c'est ce qui permet de la rattacher à la demande existante
  // au lieu d'en créer une nouvelle.
  async sendQualificationEmail(
    to: string,
    params: QualificationEmailParams,
    thread?: { inReplyTo: string | null },
  ): Promise<{ messageId: string; subject: string }> {
    const { subject, text, html } = renderQualificationEmail(params);
    const inReplyTo = thread?.inReplyTo ?? undefined;
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
      inReplyTo,
      references: inReplyTo,
    });
    logger.log({ to, messageId: info.messageId }, "Email de qualification envoyé");
    return { messageId: info.messageId, subject };
  }
}
