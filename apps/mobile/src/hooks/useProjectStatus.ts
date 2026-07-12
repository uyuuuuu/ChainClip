import { getProject } from "@/api/projects";
import { useQuery } from "@tanstack/react-query";
import type { ProjectStatus } from "../api/project-status";

// ポーリングを停止するステータス
const TERMINAL_STATUSES: ProjectStatus[] = ["ready", "failed", "completed"];

function isTerminal(status: string | undefined): boolean {
  return TERMINAL_STATUSES.includes(status as ProjectStatus);
}

// GET /projects/{projectId}
// status が ready / failed / completed になるまで一定間隔でポーリングする。
// preparing中は clipsTotal / clipsReady、ready時は clips + scenes を返す。
export function useProjectStatus(
  projectId: string | undefined,
  intervalMs = 2000,
) {
  return useQuery({
    queryKey: ["project", projectId],
    enabled: !!projectId,
    queryFn: () => {
      if (!projectId) throw new Error("projectId is required");
      return getProject(projectId);
    },
    // サーバーのプロジェクトstatusが終端に到達したらポーリング停止（false）、それ以外は intervalMs で継続
    refetchInterval: (query) =>
      isTerminal(query.state.data?.status) ? false : intervalMs,
  });
}
