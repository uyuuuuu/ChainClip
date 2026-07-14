import { apiFetch } from "./client";
import type { components } from "./schema";

type CreateProjectResponse = components["schemas"]["CreateProjectResponse"];
type GetProjectStatusResponse =
  components["schemas"]["GetProjectStatusResponse"];
type StartPrepareResponse = components["schemas"]["StartPrepareResponse"];
type StartRenderRequest = components["schemas"]["StartRenderRequest"];
type StartRenderResponse = components["schemas"]["StartRenderResponse"];

/**
 * POST /projects
 * プロジェクトを作成する。project.status = draft。accessToken を返す。
 */
export async function createProject(
  deviceId: string,
): Promise<CreateProjectResponse> {
  return await apiFetch<CreateProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

/**
 * GET /projects/{projectId}
 * プロジェクトの状態を取得する。
 * preparing中は clipsTotal / clipsReady、ready時は clips + scenes を返す。
 */
export async function getProject(
  projectId: string,
): Promise<GetProjectStatusResponse> {
  return await apiFetch<GetProjectStatusResponse>(`/projects/${projectId}`, {
    projectId,
  });
}

/**
 * POST /projects/{projectId}/prepare
 * 全clipがuploadedならprepare workerを起動する。project.status = preparing になる。
 * accessToken は apiFetch が projectId から解決し Authorization ヘッダに付与する。
 */
export async function startPrepare(
  projectId: string,
): Promise<StartPrepareResponse> {
  return await apiFetch<StartPrepareResponse>(
    `/projects/${projectId}/prepare`,
    {
      method: "POST",
      projectId,
    },
  );
}

/**
 * POST /projects/{projectId}/render
 * editConfig を保存し render worker を起動する。project.status = rendering になる。
 * accessToken は apiFetch が projectId から解決し Authorization ヘッダに付与する。
 */
export async function startRender(
  projectId: string,
  body: StartRenderRequest,
): Promise<StartRenderResponse> {
  return await apiFetch<StartRenderResponse>(
    `/projects/${projectId}/render`,
    {
      method: "POST",
      projectId,
      body: JSON.stringify(body),
    },
  );
}
