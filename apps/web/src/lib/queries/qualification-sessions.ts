import type { QualificationSessionDetailResponse, QualificationSessionResponse } from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useQualificationSession(id: string) {
  return useQuery({
    queryKey: ["qualification-sessions", id] as const,
    queryFn: () => apiFetch<QualificationSessionDetailResponse>(`/qualification-sessions/${id}`),
  });
}

export function useCreateQualificationSession(requestId: string) {
  return useMutation({
    mutationFn: (formId: string) =>
      apiFetch<QualificationSessionResponse>(`/requests/${requestId}/qualification-sessions`, {
        method: "POST",
        body: JSON.stringify({ formId }),
      }),
  });
}

export function useSaveFormResponse(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, value }: { fieldKey: string; value: unknown }) =>
      apiFetch<QualificationSessionDetailResponse>(
        `/qualification-sessions/${sessionId}/responses/${fieldKey}`,
        { method: "PUT", body: JSON.stringify({ value }) },
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(["qualification-sessions", sessionId], updated);
    },
  });
}

export function useSubmitQualificationSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<QualificationSessionResponse>(`/qualification-sessions/${sessionId}/submit`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["qualification-sessions", sessionId] });
    },
  });
}
