import type {
  AiAnalysisResponse,
  AssignableUserResponse,
  CreateRequestRequest,
  PaginatedResponse,
  RequestResponse,
  RequestSource,
  RequestStatus,
  TimelineEventResponse,
  UpdateRequestRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface ListRequestsParams {
  page: number;
  limit: number;
  search?: string;
  status?: RequestStatus;
  source?: RequestSource;
  clientId?: string;
}

function toQueryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const string = query.toString();
  return string ? `?${string}` : "";
}

export function useRequests(params: ListRequestsParams) {
  return useQuery({
    queryKey: ["requests", params] as const,
    queryFn: () =>
      apiFetch<PaginatedResponse<RequestResponse>>(`/requests${toQueryString(params)}`),
    placeholderData: (previous) => previous,
  });
}

export function useRequestDetail(id: string) {
  return useQuery({
    queryKey: ["requests", "detail", id] as const,
    queryFn: () => apiFetch<RequestResponse>(`/requests/${id}`),
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateRequestRequest) =>
      apiFetch<RequestResponse>("/requests", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requests"] }),
  });
}

export function useUpdateRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateRequestRequest) =>
      apiFetch<RequestResponse>(`/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["requests", "detail", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: ["requests", "assignable-users"] as const,
    queryFn: () => apiFetch<AssignableUserResponse[]>("/requests/assignable-users"),
    staleTime: 60_000,
  });
}

export function useRequestAnalyses(id: string) {
  return useQuery({
    queryKey: ["requests", "analyses", id] as const,
    queryFn: () => apiFetch<AiAnalysisResponse[]>(`/requests/${id}/analyses`),
  });
}

// Rafraîchie périodiquement tant que la page est visible : une partie des
// étapes (envoi automatique du lien, ouverture par le prospect) arrive
// après coup, sans action de l'utilisateur sur cette page.
export function useRequestTimeline(id: string) {
  return useQuery({
    queryKey: ["requests", "timeline", id] as const,
    queryFn: () => apiFetch<TimelineEventResponse[]>(`/requests/${id}/timeline`),
    refetchInterval: 15000,
  });
}

export function useAnalyzeRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<AiAnalysisResponse>(`/requests/${id}/analyze`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["requests", "analyses", id] });
      void queryClient.invalidateQueries({ queryKey: ["requests", "detail", id] });
      void queryClient.invalidateQueries({ queryKey: ["requests", "timeline", id] });
    },
  });
}
