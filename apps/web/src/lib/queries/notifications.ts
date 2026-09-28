import type {
  NotificationPreferenceResponse,
  NotificationResponse,
  PaginatedResponse,
  PriorityLevel,
  UnreadNotificationsCountResponse,
  UpdateNotificationPreferenceRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface ListNotificationsParams {
  page: number;
  limit: number;
  status: "all" | "unread" | "read";
  priority?: PriorityLevel;
  search?: string;
}

function toQueryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return `?${query.toString()}`;
}

// Les notifications arrivent sans action de l'utilisateur : rafraîchies
// régulièrement tant que l'onglet est visible.
const REFRESH_MS = 30_000;

export function useNotifications(params: ListNotificationsParams) {
  return useQuery({
    queryKey: ["notifications", "list", params] as const,
    queryFn: () =>
      apiFetch<PaginatedResponse<NotificationResponse>>(`/notifications${toQueryString(params)}`),
    placeholderData: (previous) => previous,
    refetchInterval: REFRESH_MS,
  });
}

export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"] as const,
    queryFn: () => apiFetch<UnreadNotificationsCountResponse>("/notifications/unread-count"),
    refetchInterval: REFRESH_MS,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<NotificationResponse>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notifications", "preferences"] as const,
    queryFn: () => apiFetch<NotificationPreferenceResponse[]>("/notifications/preferences"),
  });
}

// Mise à jour optimiste : la case change d'état immédiatement, puis
// revient à l'état précédent si le serveur refuse.
export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();
  const key = ["notifications", "preferences"] as const;
  return useMutation({
    mutationFn: (body: UpdateNotificationPreferenceRequest) =>
      apiFetch<NotificationPreferenceResponse[]>("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferenceResponse[]>(key);
      queryClient.setQueryData<NotificationPreferenceResponse[]>(key, (current) =>
        current?.map((preference) =>
          preference.eventType === body.eventType && body.channel in preference.channels
            ? {
                ...preference,
                channels: {
                  ...preference.channels,
                  [body.channel]: {
                    ...preference.channels[body.channel as "IN_APP" | "EMAIL"],
                    enabled: body.enabled,
                  },
                },
              }
            : preference,
        ),
      );
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (preferences) => queryClient.setQueryData(key, preferences),
  });
}
