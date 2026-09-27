import type { ServiceResponse, UpdateServiceRequest } from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useServices() {
  return useQuery({
    queryKey: ["services"] as const,
    queryFn: () => apiFetch<ServiceResponse[]>("/services"),
  });
}

export function useUpdateService(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateServiceRequest) =>
      apiFetch<ServiceResponse>(`/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
  });
}
