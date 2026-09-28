import type {
  UpdateWorkflowRequest,
  WorkflowResponse,
  WorkflowRunResponse,
  WorkflowVocabularyResponse,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"] as const,
    queryFn: () => apiFetch<WorkflowResponse[]>("/workflows"),
  });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ["workflows", id] as const,
    queryFn: () => apiFetch<WorkflowResponse>(`/workflows/${id}`),
  });
}

// Les exécutions avancent en arrière-plan (étapes différées).
export function useWorkflowRuns(id: string) {
  return useQuery({
    queryKey: ["workflows", id, "runs"] as const,
    queryFn: () => apiFetch<WorkflowRunResponse[]>(`/workflows/${id}/runs`),
    refetchInterval: 30_000,
  });
}

export function useWorkflowVocabulary() {
  return useQuery({
    queryKey: ["workflows", "vocabulary"] as const,
    queryFn: () => apiFetch<WorkflowVocabularyResponse>("/workflows/vocabulary"),
    staleTime: Infinity,
  });
}

export function useUpdateWorkflow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateWorkflowRequest) =>
      apiFetch<WorkflowResponse>(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["workflows", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["workflows"], exact: true });
    },
  });
}
