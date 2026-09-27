import type {
  ContactResponse,
  CreateContactRequest,
  PaginatedResponse,
  UpdateContactRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface ListContactsParams {
  page: number;
  limit: number;
  search?: string;
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

function invalidateContacts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["contacts"] });
  // Couvre à la fois la liste des clients (le nombre de contacts affiché
  // doit suivre) et les contacts d'un client (clé ["clients","contacts",id])
  // par correspondance de préfixe — un second appel ciblant explicitement
  // cette clé imbriquée déclenchait une requête concurrente redondante :
  // la plus lente des deux pouvait écraser la plus récente avec des
  // données périmées (vu en Phase 6, contact principal affiché en retard
  // d'une bascule).
  void queryClient.invalidateQueries({ queryKey: ["clients"] });
}

export function useContacts(params: ListContactsParams) {
  return useQuery({
    queryKey: ["contacts", params] as const,
    queryFn: () =>
      apiFetch<PaginatedResponse<ContactResponse>>(`/contacts${toQueryString(params)}`),
    placeholderData: (previous) => previous,
  });
}

// `clientId` vide (aucun client sélectionné, ex. dans un formulaire de
// demande) : `enabled: false` évite un appel avec un identifiant invalide.
export function useContactsByClient(clientId: string) {
  return useQuery({
    queryKey: ["clients", "contacts", clientId] as const,
    queryFn: () => apiFetch<ContactResponse[]>(`/clients/${clientId}/contacts`),
    enabled: clientId.length > 0,
  });
}

export function useCreateContact(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateContactRequest) =>
      apiFetch<ContactResponse>(`/clients/${clientId}/contacts`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () => invalidateContacts(queryClient),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateContactRequest }) =>
      apiFetch<ContactResponse>(`/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: () => invalidateContacts(queryClient),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateContacts(queryClient),
  });
}
