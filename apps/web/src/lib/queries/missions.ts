import type {
  AddMissionMemberRequest,
  AssignableUserResponse,
  ChangeMissionStatusRequest,
  CreateMissionRequest,
  CreateTaskRequest,
  MissionListItemResponse,
  MissionResponse,
  MissionStatus,
  MyTaskResponse,
  PaginatedResponse,
  TaskCommentResponse,
  TaskResponse,
  TimelineEventResponse,
  UpdateMissionRequest,
  UpdateTaskRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface ListMissionsParams {
  page: number;
  limit: number;
  search?: string;
  status?: MissionStatus;
  clientId?: string;
  opportunityId?: string;
  memberId?: string;
}

function toQueryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, string | number | undefined][]) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const string = query.toString();
  return string ? `?${string}` : "";
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

function applyMission(queryClient: QueryClient, mission: MissionResponse) {
  queryClient.setQueryData(["missions", "detail", mission.id], mission);
  void queryClient.invalidateQueries({ queryKey: ["missions"] });
}

// Une tâche qui change modifie l'avancement et l'historique de la mission.
function refreshMission(queryClient: QueryClient, missionId: string) {
  void queryClient.invalidateQueries({ queryKey: ["missions", "tasks", missionId] });
  void queryClient.invalidateQueries({ queryKey: ["missions", "detail", missionId] });
  void queryClient.invalidateQueries({ queryKey: ["missions", "timeline", missionId] });
}

// `watch` : la mission d'une opportunité est créée par un workflow, après
// coup — la carte qui l'attend se rafraîchit seule.
export function useMissions(params: ListMissionsParams, enabled = true, watch = false) {
  return useQuery({
    queryKey: ["missions", "list", params] as const,
    queryFn: () => apiFetch<PaginatedResponse<MissionListItemResponse>>(`/missions${toQueryString(params)}`),
    placeholderData: (previous) => previous,
    enabled,
    refetchInterval: watch ? 5_000 : false,
  });
}

export function useMission(id: string) {
  return useQuery({
    queryKey: ["missions", "detail", id] as const,
    queryFn: () => apiFetch<MissionResponse>(`/missions/${id}`),
  });
}

export function useMissionTimeline(id: string) {
  return useQuery({
    queryKey: ["missions", "timeline", id] as const,
    queryFn: () => apiFetch<TimelineEventResponse[]>(`/missions/${id}/timeline`),
    refetchInterval: 15_000,
  });
}

export function useMissionManagers() {
  return useQuery({
    queryKey: ["missions", "managers"] as const,
    queryFn: () => apiFetch<AssignableUserResponse[]>("/missions/managers"),
    staleTime: 60_000,
  });
}

export function useCreateMission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateMissionRequest) => apiFetch<MissionResponse>("/missions", json("POST", request)),
    onSuccess: (mission) => applyMission(queryClient, mission),
  });
}

export function useUpdateMission(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateMissionRequest) =>
      apiFetch<MissionResponse>(`/missions/${id}`, json("PATCH", request)),
    onSuccess: (mission) => applyMission(queryClient, mission),
  });
}

export function useChangeMissionStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ChangeMissionStatusRequest) =>
      apiFetch<MissionResponse>(`/missions/${id}/status`, json("PATCH", request)),
    onSuccess: (mission) => applyMission(queryClient, mission),
  });
}

export function useAddMissionMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AddMissionMemberRequest) =>
      apiFetch<MissionResponse>(`/missions/${id}/members`, json("POST", request)),
    onSuccess: (mission) => applyMission(queryClient, mission),
  });
}

export function useRemoveMissionMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => apiFetch<MissionResponse>(`/missions/${id}/members/${userId}`, json("DELETE")),
    onSuccess: (mission) => {
      applyMission(queryClient, mission);
      refreshMission(queryClient, id);
    },
  });
}

export function useMissionTasks(missionId: string) {
  return useQuery({
    queryKey: ["missions", "tasks", missionId] as const,
    queryFn: () => apiFetch<TaskResponse[]>(`/missions/${missionId}/tasks`),
  });
}

export function useMyTasks(enabled = true) {
  return useQuery({
    queryKey: ["missions", "my-tasks"] as const,
    queryFn: () => apiFetch<MyTaskResponse[]>("/tasks/mine"),
    enabled,
  });
}

export function useCreateTask(missionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateTaskRequest) =>
      apiFetch<TaskResponse>(`/missions/${missionId}/tasks`, json("POST", request)),
    onSuccess: () => refreshMission(queryClient, missionId),
  });
}

export function useUpdateTask(missionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...request }: UpdateTaskRequest & { taskId: string }) =>
      apiFetch<TaskResponse>(`/tasks/${taskId}`, json("PATCH", request)),
    onSuccess: () => refreshMission(queryClient, missionId),
  });
}

export function useDeleteTask(missionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiFetch<void>(`/tasks/${taskId}`, json("DELETE")),
    onSuccess: () => refreshMission(queryClient, missionId),
  });
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ["tasks", "comments", taskId] as const,
    queryFn: () => apiFetch<TaskCommentResponse[]>(`/tasks/${taskId}/comments`),
    enabled: taskId !== null,
  });
}

export function useAddTaskComment(missionId: string, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<TaskCommentResponse[]>(`/tasks/${taskId}/comments`, json("POST", { body })),
    onSuccess: (comments) => {
      queryClient.setQueryData(["tasks", "comments", taskId], comments);
      void queryClient.invalidateQueries({ queryKey: ["missions", "tasks", missionId] });
    },
  });
}
