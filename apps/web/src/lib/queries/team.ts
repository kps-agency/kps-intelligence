import type {
  SkillResponse,
  TeamMemberDetailResponse,
  TeamMemberResponse,
  UpdateAvailabilityRequest,
  UpdateTeamProfileRequest,
  UpdateTeamSkillsRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useTeam() {
  return useQuery({
    queryKey: ["team"] as const,
    queryFn: () => apiFetch<TeamMemberResponse[]>("/team"),
  });
}

export function useTeamMember(id: string) {
  return useQuery({
    queryKey: ["team", id] as const,
    queryFn: () => apiFetch<TeamMemberDetailResponse>(`/team/${id}`),
  });
}

export function useSkills() {
  return useQuery({
    queryKey: ["skills"] as const,
    queryFn: () => apiFetch<SkillResponse[]>("/skills"),
    staleTime: 60_000,
  });
}

function useTeamMemberMutation<TBody>(id: string, path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) =>
      apiFetch<TeamMemberDetailResponse>(`/team/${id}/${path}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["team", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["team"], exact: true });
    },
  });
}

export function useUpdateTeamProfile(id: string) {
  return useTeamMemberMutation<UpdateTeamProfileRequest>(id, "profile");
}

export function useUpdateTeamSkills(id: string) {
  return useTeamMemberMutation<UpdateTeamSkillsRequest>(id, "skills");
}

export function useUpdateAvailability(id: string) {
  return useTeamMemberMutation<UpdateAvailabilityRequest>(id, "availability");
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; category: string | null }) =>
      apiFetch<SkillResponse>("/skills", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}
