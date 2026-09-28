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

  async sendQualificationEmail(to: string, params: QualificationEmailParams): Promise<void> {
    const { subject, text, html } = renderQualificationEmail(params);
    const info = await this.transporter.sendMail({ from: this.from, to, subject, text, html });
    logger.log({ to, messageId: info.messageId }, "Email de qualification envoyé");
  }
}
