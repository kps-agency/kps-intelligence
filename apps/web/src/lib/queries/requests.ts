import type {
  CreateRequestRequest,
  PaginatedResponse,
  RequestResponse,
  RequestSource,
  RequestStatus,
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
