import type {
  QualificationSessionCreatedResponse,
  QualificationSessionDetailResponse,
  QualificationSessionResponse,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useQualificationSessionsList(requestId: string) {
  return useQuery({
    queryKey: ["qualification-sessions", "by-request", requestId] as const,
    queryFn: () =>
      apiFetch<QualificationSessionResponse[]>(`/requests/${requestId}/qualification-sessions`),
  });
}

export function useQualificationSession(id: string) {
  return useQuery({
    queryKey: ["qualification-sessions", id] as const,
    queryFn: () => apiFetch<QualificationSessionDetailResponse>(`/qualification-sessions/${id}`),
  });
}

export function useCreateQualificationSession(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) =>
      apiFetch<QualificationSessionCreatedResponse>(`/requests/${requestId}/qualification-sessions`, {
        method: "POST",
        body: JSON.stringify({ formId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["qualification-sessions", "by-request", requestId],
      });
    },
  });
}

// Actions admin sur un lien existant (section 37) : chacune invalide la
// liste du côté de la fiche demande (le statut/l'expiration affichés y
// changent) en plus du détail de la session elle-même.
function useSessionAdminAction<TResult>(
  requestId: string,
  sessionId: string,
  path: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: unknown) =>
      apiFetch<TResult>(`/qualification-sessions/${sessionId}${path}`, {
        method: "POST",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["qualification-sessions", "by-request", requestId],
      });
      void queryClient.invalidateQueries({ queryKey: ["qualification-sessions", sessionId] });
    },
  });
}

export function useMarkQualificationSessionSent(requestId: string, sessionId: string) {
  return useSessionAdminAction<QualificationSessionResponse>(requestId, sessionId, "/mark-sent");
}

export function useRevokeQualificationSession(requestId: string, sessionId: string) {
  return useSessionAdminAction<QualificationSessionResponse>(requestId, sessionId, "/revoke");
}

export function useExtendQualificationSession(requestId: string, sessionId: string) {
  return useSessionAdminAction<QualificationSessionResponse>(requestId, sessionId, "/extend");
}

export function useRegenerateQualificationSession(requestId: string, sessionId: string) {
  return useSessionAdminAction<QualificationSessionCreatedResponse>(
    requestId,
    sessionId,
    "/regenerate",
  );
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
