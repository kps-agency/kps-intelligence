import type {
  AssignableUserResponse,
  ChangeOpportunityStageRequest,
  CreateOpportunityRequest,
  OpportunityBoardResponse,
  OpportunityResponse,
  OpportunityStatus,
  PaginatedResponse,
  TimelineEventResponse,
  UpdateOpportunityRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface BoardParams {
  search?: string;
  ownerUserId?: string;
}

export interface ListOpportunitiesParams {
  page: number;
  limit: number;
  status?: OpportunityStatus;
  clientId?: string;
  requestId?: string;
}

function toQueryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const string = query.toString();
  return string ? `?${string}` : "";
}

const boardKey = (params: BoardParams) => ["opportunities", "board", params] as const;

// Une étape qui change touche le Kanban, la fiche, sa timeline et — via le
// workflow de synchronisation — le statut et la timeline de la demande.
function invalidateOpportunity(queryClient: QueryClient, opportunity: OpportunityResponse) {
  void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
  if (opportunity.requestId) {
    void queryClient.invalidateQueries({ queryKey: ["requests", "detail", opportunity.requestId] });
    void queryClient.invalidateQueries({ queryKey: ["requests", "timeline", opportunity.requestId] });
  }
}

// D'autres utilisateurs et les workflows font aussi bouger le pipeline :
// rafraîchi périodiquement tant que la page est visible.
export function useOpportunityBoard(params: BoardParams, enabled = true) {
  return useQuery({
    enabled,
    queryKey: boardKey(params),
    queryFn: () => apiFetch<OpportunityBoardResponse>(`/opportunities/board${toQueryString(params)}`),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
}

export function useOpportunities(params: ListOpportunitiesParams, enabled = true) {
  return useQuery({
    queryKey: ["opportunities", "list", params] as const,
    queryFn: () =>
      apiFetch<PaginatedResponse<OpportunityResponse>>(`/opportunities${toQueryString(params)}`),
    enabled,
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: ["opportunities", "detail", id] as const,
    queryFn: () => apiFetch<OpportunityResponse>(`/opportunities/${id}`),
  });
}

export function useOpportunityTimeline(id: string) {
  return useQuery({
    queryKey: ["opportunities", "timeline", id] as const,
    queryFn: () => apiFetch<TimelineEventResponse[]>(`/opportunities/${id}/timeline`),
    refetchInterval: 15_000,
  });
}

export function useOpportunityOwners() {
  return useQuery({
    queryKey: ["opportunities", "owners"] as const,
    queryFn: () => apiFetch<AssignableUserResponse[]>("/opportunities/owners"),
    staleTime: 60_000,
  });
}

export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateOpportunityRequest) =>
      apiFetch<OpportunityResponse>("/opportunities", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: (created) => invalidateOpportunity(queryClient, created),
  });
}

export function useUpdateOpportunity(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateOpportunityRequest) =>
      apiFetch<OpportunityResponse>(`/opportunities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["opportunities", "detail", id], updated);
      invalidateOpportunity(queryClient, updated);
    },
  });
}

export interface StageChange extends ChangeOpportunityStageRequest {
  id: string;
}

// Déplacement d'une carte : la colonne change à l'écran tout de suite, et
// revient en arrière si l'API refuse.
export function useChangeOpportunityStage(board?: BoardParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...request }: StageChange) =>
      apiFetch<OpportunityResponse>(`/opportunities/${id}/stage`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onMutate: async ({ id, status }) => {
      if (!board) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: boardKey(board) });
      const previous = queryClient.getQueryData<OpportunityBoardResponse>(boardKey(board));
      if (previous) queryClient.setQueryData(boardKey(board), moveCard(previous, id, status));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (board && context?.previous) queryClient.setQueryData(boardKey(board), context.previous);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["opportunities", "detail", updated.id], updated);
      invalidateOpportunity(queryClient, updated);
    },
  });
}

function moveCard(
  board: OpportunityBoardResponse,
  id: string,
  status: OpportunityStatus,
): OpportunityBoardResponse {
  const card = board.columns.flatMap((c) => c.items).find((o) => o.id === id);
  if (!card || card.status === status) return board;
  return {
    columns: board.columns.map((column) => {
      if (column.status === card.status) {
        return { ...column, count: column.count - 1, items: column.items.filter((o) => o.id !== id) };
      }
      if (column.status === status) {
        return { ...column, count: column.count + 1, items: [{ ...card, status }, ...column.items] };
      }
      return column;
    }),
  };
}
