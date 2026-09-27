import type { PublicQualificationSessionResponse } from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { publicApiFetch } from "@/lib/public-api-client";

export function usePublicQualification(token: string) {
  return useQuery({
    queryKey: ["public-qualification", token] as const,
    queryFn: () => publicApiFetch<PublicQualificationSessionResponse>(`/public/qualification/${token}`),
    // Un prospect qui revient sur son lien doit voir l'état vraiment à
    // jour (progression enregistrée sur un autre appareil, expiration
    // entre-temps...) : jamais de donnée mise en cache silencieusement.
    staleTime: 0,
    retry: false,
  });
}

export function useSavePublicFormResponse(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, value }: { fieldKey: string; value: unknown }) =>
      publicApiFetch<PublicQualificationSessionResponse>(
        `/public/qualification/${token}/responses/${fieldKey}`,
        { method: "PUT", body: JSON.stringify({ value }) },
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(["public-qualification", token], updated);
    },
  });
}

export function useSubmitPublicQualification(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      publicApiFetch<PublicQualificationSessionResponse>(`/public/qualification/${token}/submit`, {
        method: "POST",
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["public-qualification", token], updated);
    },
  });
}
