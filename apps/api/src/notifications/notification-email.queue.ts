import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job } from "bullmq";
import { toDbException } from "../common/db-error";
import { redisConnection } from "../common/redis-connection";
import { EmailService } from "../email/email.service";
import { SupabaseService } from "../supabase/supabase.service";

const logger = new Logger("NotificationEmailQueue");

const QUEUE_NAME = "notification-email";

interface EmailJobData {
  notificationId: string;
}

// Au-delà, une notification non envoyée n'a plus d'intérêt à être relancée
// au démarrage (elle reste visible en in-app et tracée avec son erreur).
const REQUEUE_WINDOW_HOURS = 24;

// Envoi asynchrone des emails de notification (section 62 : retry,
// backoff, idempotence, logs, gestion d'échec). La ligne `notifications`
// (canal EMAIL) est créée avant le job ; le job ne fait que l'envoyer et
// marquer `sent_at`. Idempotence à deux niveaux : jobId dérivé de la
// notification (BullMQ refuse un doublon en file), et `sent_at` vérifié
// avant envoi (un job rejoué après succès n'envoie rien).
@Injectable()
export class NotificationEmailQueue implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<EmailJobData>;
  private worker!: Worker<EmailJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = redisConnection(this.config.getOrThrow<string>("REDIS_URL"));
    this.queue = new Queue<EmailJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    this.worker = new Worker<EmailJobData>(QUEUE_NAME, (job) => this.process(job), {
      connection,
      concurrency: 5,
    });
    // Sans écouteur, un événement "error" (Redis injoignable...) est une
    // exception non gérée qui ferait tomber l'API : on le journalise, BullMQ
    // se reconnecte seul.
    const logConnectionError = (err: Error) =>
      logger.error({ err: err.message }, "Erreur de connexion Redis (file des notifications)");
    this.queue.on("error", logConnectionError);
    this.worker.on("error", logConnectionError);
    this.worker.on("failed", (job, err) => {
      logger.error(
        { notificationId: job?.data.notificationId, attempt: job?.attemptsMade, err: err.message },
        "Échec d'envoi d'un email de notification",
      );
    });

    await this.requeuePending().catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "Reprise des emails de notification en attente impossible",
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(notificationId: string): Promise<void> {
    await this.queue.add("send", { notificationId }, { jobId: `email-${notificationId}` });
  }

  // Emails restés en attente (Redis indisponible au moment de l'événement,
  // arrêt de l'API pendant un envoi...) : relancés au démarrage.
  private async requeuePending(): Promise<void> {
    const since = new Date(Date.now() - REQUEUE_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { data, error } = await this.supabase
      .getClient()
      .from("notifications")
      .select("id")
      .eq("channel", "EMAIL")
      .is("sent_at", null)
      .gte("created_at", since);
    if (error) throw toDbException(error);
    for (const row of data) await this.enqueue(row.id);
    if (data.length > 0) logger.log({ count: data.length }, "Emails de notification relancés");
  }

  private async process(job: Job<EmailJobData>): Promise<void> {
    const client = this.supabase.getClient();
    const { data: notification, error } = await client
      .from("notifications")
      .select("id, title, body, sent_at, users(email)")
      .eq("id", job.data.notificationId)
      .maybeSingle();
    if (error) throw toDbException(error);
    if (!notification || notification.sent_at) return;

    const recipient = (notification.users as { email: string } | null)?.email;
    if (!recipient) return;

    try {
      await this.emailService.sendInternalEmail(recipient, notification.title, notification.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client
        .from("notifications")
        .update({ error: message.slice(0, 500) })
        .eq("id", notification.id);
      throw err;
    }

    const { error: updateError } = await client
      .from("notifications")
      .update({ sent_at: new Date().toISOString(), error: null })
      .eq("id", notification.id);
    if (updateError) throw toDbException(updateError);
  }
}
