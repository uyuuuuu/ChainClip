import { startPrepare } from "@/api/projects";
import { useMutation } from "@tanstack/react-query";
import type { components } from "../api/schema";

type StartPrepareResponse = components["schemas"]["StartPrepareResponse"];

type Variables = {
  projectId: string;
};

// POST /projects/{projectId}/prepare
// 全clipがuploadedならprepare workerを起動する。project.status = preparing になる。
// accessToken は api層(apiFetch)が projectId から解決してヘッダに付与する。
export function useStartPrepare() {
  return useMutation({
    mutationFn: ({ projectId }: Variables): Promise<StartPrepareResponse> =>
      startPrepare(projectId),
  });
}
