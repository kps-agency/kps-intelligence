import type {
  ClientListItemResponse,
  ClientResponse,
  ClientStatus,
  CreateClientRequest,
  PaginatedResponse,
  UpdateClientRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface ListClientsParams {
  page: number;
  limit: number;
  search?: string;
  status?: ClientStatus;
}

function clientsQueryKey(params: ListClientsParams) {
  return ["clients", params] as const;
}

function toQueryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const string = query.toString();
  return string ? `?${string}` : "";
}

export function useClients(params: ListClientsParams) {
  return useQuery({
    queryKey: clientsQueryKey(params),
    queryFn: () =>
      apiFetch<PaginatedResponse<ClientListItemResponse>>(
        `/clients${toQueryString(params)}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ["clients", "detail", id] as const,
    queryFn: () => apiFetch<ClientResponse>(`/clients/${id}`),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateClientRequest) =>
      apiFetch<ClientResponse>("/clients", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateClientRequest) =>
      apiFetch<ClientResponse>(`/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["clients", "detail", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
