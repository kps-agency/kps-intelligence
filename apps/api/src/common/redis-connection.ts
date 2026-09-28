import type { ConnectionOptions } from "bullmq";

// Options de connexion BullMQ à partir de REDIS_URL (redis:// ou rediss://).
export function redisConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    // Exigé par BullMQ pour les connexions bloquantes des workers.
    maxRetriesPerRequest: null,
  };
}
