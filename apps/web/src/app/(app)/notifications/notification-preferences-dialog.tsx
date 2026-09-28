"use client";

import { NotificationChannel, type NotificationPreferenceResponse } from "@kps/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Skeleton,
} from "@kps/ui";
import { Settings2 } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from "@/lib/queries/notifications";

const CHANNELS = [
  { key: NotificationChannel.IN_APP, label: "Application" },
  { key: NotificationChannel.EMAIL, label: "Email" },
] as const;

function PreferenceRow({ preference }: { preference: NotificationPreferenceResponse }) {
  const update = useUpdateNotificationPreference();

  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="py-2 pr-4 text-left font-normal">
        {preference.label}
      </th>
      {CHANNELS.map((channel) => {
        const state = preference.channels[channel.key];
        const id = `pref-${preference.eventType}-${channel.key}`;
        return (
          <td key={channel.key} className="py-2 text-center">
            <input
              id={id}
              type="checkbox"
              className="size-4 accent-primary disabled:cursor-not-allowed"
              checked={state.enabled}
              disabled={state.locked || update.isPending}
              aria-label={`${preference.label} — ${channel.label}${state.locked ? " (obligatoire)" : ""}`}
              onChange={(event) =>
                update.mutate({
                  eventType: preference.eventType,
                  channel: channel.key,
                  enabled: event.target.checked,
                })
              }
            />
          </td>
        );
      })}
    </tr>
  );
}

export function NotificationPreferencesDialog() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreference();
  const serverError = update.error instanceof ApiError ? update.error : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Settings2 aria-hidden="true" />
          Préférences
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Préférences de notification</DialogTitle>
          <DialogDescription>
            {
              "Choisissez comment être prévenu pour chaque étape. Les notifications critiques restent toujours visibles dans l'application."
            }
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {serverError.message}
          </p>
        )}

        {preferences.isPending && (
          <div role="status" aria-label="Chargement des préférences" className="flex flex-col gap-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        )}
        {preferences.isError && (
          <p role="alert" className="text-sm text-destructive">
            Impossible de charger les préférences.
          </p>
        )}

        {preferences.data && (
          <table className="w-full text-sm">
            <caption className="sr-only">Canaux de notification par étape</caption>
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="py-2 pr-4 text-left font-medium">
                  Étape
                </th>
                {CHANNELS.map((channel) => (
                  <th key={channel.key} scope="col" className="py-2 font-medium">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preferences.data.map((preference) => (
                <PreferenceRow key={preference.eventType} preference={preference} />
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">
          Les notifications WhatsApp seront disponibles une fois le compte WhatsApp Business configuré.
        </p>
      </DialogContent>
    </Dialog>
  );
}
