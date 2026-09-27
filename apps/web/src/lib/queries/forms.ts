import type {
  CreateFormFieldRequest,
  CreateFormRequest,
  CreateFormStepRequest,
  FormListItemResponse,
  FormResponse,
  FormStepResponse,
  UpdateFormFieldRequest,
  UpdateFormRequest,
  UpdateFormStepRequest,
} from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export function useForms() {
  return useQuery({
    queryKey: ["forms"] as const,
    queryFn: () => apiFetch<FormListItemResponse[]>("/forms"),
  });
}

// Nommé useFormDetail (pas useForm) : évite toute collision avec le hook
// useForm de react-hook-form, utilisé dans les dialogues de ce module.
export function useFormDetail(id: string) {
  return useQuery({
    queryKey: ["forms", "detail", id] as const,
    queryFn: () => apiFetch<FormResponse>(`/forms/${id}`),
  });
}

export function useCreateForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateFormRequest) =>
      apiFetch<FormResponse>("/forms", { method: "POST", body: JSON.stringify(request) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forms"] }),
  });
}

export function useUpdateForm(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateFormRequest) =>
      apiFetch<FormResponse>(`/forms/${id}`, { method: "PATCH", body: JSON.stringify(request) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["forms", "detail", id] });
      void queryClient.invalidateQueries({ queryKey: ["forms"], exact: true });
    },
  });
}

function useFormMutations(formId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["forms", "detail", formId] });
    void queryClient.invalidateQueries({ queryKey: ["forms"], exact: true });
  };
  return { queryClient, invalidate };
}

export function useCreateStep(formId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (request: CreateFormStepRequest) =>
      apiFetch<FormStepResponse>(`/forms/${formId}/steps`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateStep(formId: string, stepId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (request: UpdateFormStepRequest) =>
      apiFetch<FormStepResponse>(`/forms/${formId}/steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteStep(formId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (stepId: string) =>
      apiFetch<void>(`/forms/${formId}/steps/${stepId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useReorderSteps(formId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch<void>(`/forms/${formId}/steps/reorder`, {
        method: "POST",
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: invalidate,
  });
}

export function useCreateField(formId: string, stepId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (request: CreateFormFieldRequest) =>
      apiFetch(`/forms/${formId}/steps/${stepId}/fields`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateField(formId: string, stepId: string, fieldId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (request: UpdateFormFieldRequest) =>
      apiFetch(`/forms/${formId}/steps/${stepId}/fields/${fieldId}`, {
        method: "PATCH",
        body: JSON.stringify(request),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteField(formId: string, stepId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (fieldId: string) =>
      apiFetch<void>(`/forms/${formId}/steps/${stepId}/fields/${fieldId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useReorderFields(formId: string, stepId: string) {
  const { invalidate } = useFormMutations(formId);
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch<void>(`/forms/${formId}/steps/${stepId}/fields/reorder`, {
        method: "POST",
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: invalidate,
  });
}
