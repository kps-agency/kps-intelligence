import type { AiAnalysisResponse, RequestMatchingResponse } from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

// Le matching et l'analyse des réponses tournent aussi en arrière-plan
// (workflows) : rafraîchis périodiquement tant que la page est visible.
export function useRequestMatching(requestId: string) {
  return useQuery({
    queryKey: ["requests", "matching", requestId] as const,
    queryFn: () => apiFetch<RequestMatchingResponse>(`/requests/${requestId}/matching`),
    refetchInterval: 15_000,
  });
}

function useRequestRefresh(requestId: string) {
  const queryClient = useQueryClient();
  return (matching?: RequestMatchingResponse) => {
    if (matching) queryClient.setQueryData(["requests", "matching", requestId], matching);
    void queryClient.invalidateQueries({ queryKey: ["requests", "detail", requestId] });
    void queryClient.invalidateQueries({ queryKey: ["requests", "timeline", requestId] });
    void queryClient.invalidateQueries({ queryKey: ["requests", "analyses", requestId] });
  };
}

export function useRunMatching(requestId: string) {
  const refresh = useRequestRefresh(requestId);
  return useMutation({
    mutationFn: () =>
      apiFetch<RequestMatchingResponse>(`/requests/${requestId}/matching`, { method: "POST" }),
    onSuccess: refresh,
  });
}

export function useAssignTeamMember(requestId: string) {
  const refresh = useRequestRefresh(requestId);
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<RequestMatchingResponse>(`/requests/${requestId}/team-members`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    onSuccess: refresh,
  });
}

export function useUnassignTeamMember(requestId: string) {
  const refresh = useRequestRefresh(requestId);
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<RequestMatchingResponse>(`/requests/${requestId}/team-members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });
}

export function useAnalyzeQualification(requestId: string) {
  const refresh = useRequestRefresh(requestId);
  return useMutation({
    mutationFn: () =>
      apiFetch<AiAnalysisResponse>(`/requests/${requestId}/qualification-analysis`, {
        method: "POST",
      }),
    onSuccess: () => refresh(),
  });
}
