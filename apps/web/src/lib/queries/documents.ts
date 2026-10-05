import type { DocumentDownloadResponse, DocumentEntityType, DocumentResponse } from "@kps/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api-client";

const documentsKey = (entityType: DocumentEntityType, entityId: string) =>
  ["documents", entityType, entityId] as const;

export function useDocuments(entityType: DocumentEntityType, entityId: string) {
  return useQuery({
    queryKey: documentsKey(entityType, entityId),
    queryFn: () => apiFetch<DocumentResponse[]>(`/documents?entityType=${entityType}&entityId=${entityId}`),
  });
}

// Le dépôt et la suppression sont tracés dans l'historique de l'objet.
function useRefresh(entityType: DocumentEntityType, entityId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: documentsKey(entityType, entityId) });
    void queryClient.invalidateQueries({
      predicate: (query) => query.queryKey.includes("timeline"),
    });
  };
}

export function useUploadDocument(entityType: DocumentEntityType, entityId: string) {
  const refresh = useRefresh(entityType, entityId);
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set("entityType", entityType);
      body.set("entityId", entityId);
      body.set("file", file);
      return apiFetch<DocumentResponse>("/documents", { method: "POST", body });
    },
    onSuccess: refresh,
  });
}

export function useDeleteDocument(entityType: DocumentEntityType, entityId: string) {
  const refresh = useRefresh(entityType, entityId);
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

// Le fichier vit dans un stockage privé : l'API délivre un lien signé de
// courte durée. Le fichier est récupéré puis enregistré sous son nom
// d'origine — ouvert directement, le lien signé donne un nom encodé
// (« %C3%A9 ») dès qu'il contient un accent.
export function useDownloadDocument() {
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { url } = await apiFetch<DocumentDownloadResponse>(`/documents/${id}/download`);
      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        throw new ApiError(0, "Le stockage est injoignable.", null, []);
      }
      if (!response.ok) throw new ApiError(response.status, "Le fichier n'a pas pu être téléchargé.", null, []);
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    },
  });
}
