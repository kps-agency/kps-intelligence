import type {
  CompanySettingsResponse,
  CreateQuoteRequest,
  PaginatedResponse,
  QuoteListItemResponse,
  QuoteResponse,
  QuoteStatus,
  RejectQuoteRequest,
  SendQuoteRequest,
  TimelineEventResponse,
  UpdateCompanySettingsRequest,
  UpdateQuoteRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface ListQuotesParams {
  page: number;
  limit: number;
  search?: string;
  status?: QuoteStatus;
  opportunityId?: string;
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

// Un devis qui change fait avancer son opportunité, donc aussi la demande
// d'origine (workflows) : tout ce qui les affiche est rafraîchi.
function applyQuote(queryClient: QueryClient, quote: QuoteResponse) {
  queryClient.setQueryData(["quotes", "detail", quote.id], quote);
  void queryClient.invalidateQueries({ queryKey: ["quotes"] });
  void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
  if (quote.requestId) {
    void queryClient.invalidateQueries({ queryKey: ["requests", "detail", quote.requestId] });
    void queryClient.invalidateQueries({ queryKey: ["requests", "timeline", quote.requestId] });
  }
}

export function useQuotes(params: ListQuotesParams, enabled = true) {
  return useQuery({
    queryKey: ["quotes", "list", params] as const,
    queryFn: () => apiFetch<PaginatedResponse<QuoteListItemResponse>>(`/quotes${toQueryString(params)}`),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: ["quotes", "detail", id] as const,
    queryFn: () => apiFetch<QuoteResponse>(`/quotes/${id}`),
  });
}

export function useQuoteTimeline(id: string) {
  return useQuery({
    queryKey: ["quotes", "timeline", id] as const,
    queryFn: () => apiFetch<TimelineEventResponse[]>(`/quotes/${id}/timeline`),
    refetchInterval: 15_000,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateQuoteRequest) =>
      apiFetch<QuoteResponse>("/quotes", { method: "POST", body: JSON.stringify(request) }),
    onSuccess: (quote) => applyQuote(queryClient, quote),
  });
}

export function useUpdateQuote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateQuoteRequest) =>
      apiFetch<QuoteResponse>(`/quotes/${id}`, { method: "PUT", body: JSON.stringify(request) }),
    onSuccess: (quote) => applyQuote(queryClient, quote),
  });
}

// Envoi, révision, acceptation, refus : même forme (POST → devis à jour).
function useQuoteAction<TBody>(id: string, action: "send" | "revise" | "accept" | "reject") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) =>
      apiFetch<QuoteResponse>(`/quotes/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: (quote) => applyQuote(queryClient, quote),
  });
}

export const useSendQuote = (id: string) => useQuoteAction<SendQuoteRequest>(id, "send");
export const useReviseQuote = (id: string) => useQuoteAction<void>(id, "revise");
export const useAcceptQuote = (id: string) => useQuoteAction<void>(id, "accept");
export const useRejectQuote = (id: string) => useQuoteAction<RejectQuoteRequest>(id, "reject");

export function useCompanySettings(enabled = true) {
  return useQuery({
    queryKey: ["company-settings"] as const,
    queryFn: () => apiFetch<CompanySettingsResponse>("/company-settings"),
    enabled,
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateCompanySettingsRequest) =>
      apiFetch<CompanySettingsResponse>("/company-settings", {
        method: "PUT",
        body: JSON.stringify(request),
      }),
    onSuccess: (settings) => queryClient.setQueryData(["company-settings"], settings),
  });
}
