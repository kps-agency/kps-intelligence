import type {
  CreateUserRequest,
  UserProfileResponse,
  UserRole,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export const usersQueryKey = ["users"] as const;

export function useUsers() {
  return useQuery({
    queryKey: usersQueryKey,
    queryFn: () => apiFetch<UserProfileResponse[]>("/users"),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateUserRequest) =>
      apiFetch<UserProfileResponse>("/users", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleKey }: { id: string; roleKey: UserRole }) =>
      apiFetch<UserProfileResponse>(`/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ roleKey }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  });
}
