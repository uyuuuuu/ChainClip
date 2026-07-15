import { startRender } from "@/api/projects";
import { useMutation } from "@tanstack/react-query";
import type { components } from "../api/schema";
import { useEditStore } from "../stores/editStore";

type StartRenderResponse = components["schemas"]["StartRenderResponse"];
type EditConfigRequest = components["schemas"]["EditConfigRequest"];

const EDIT_CONFIG_VERSION = 1;

type Variables = {
  projectId: string;
  title?: string | null;
  description?: string | null;
};

// POST /projects/{projectId}/render
// editStore の timeline / transition から editConfig を組み立てて送信する。
// project.status = rendering になる。
// accessToken は api層(apiFetch)が projectId から解決してヘッダに付与する。
export function useStartRender() {
  return useMutation({
    mutationFn: ({
      projectId,
      title,
      description,
    }: Variables): Promise<StartRenderResponse> => {
      const { timeline, transition } = useEditStore.getState();

      // store の cut をサーバーの TimelineCutRequest 形に変換する。
      // order は配列の並び順。sceneId / sceneStartMs / sceneEndMs は render では送らない。
      const editConfig: EditConfigRequest = {
        version: EDIT_CONFIG_VERSION,
        transition,
        timeline: timeline.map((cut, order) => ({
          cutId: cut.cutId,
          order,
          clipId: cut.clipId,
          startMs: cut.startMs,
          endMs: cut.endMs,
          transform: {
            zoom: cut.transform.zoom,
            offsetX: cut.transform.offsetX,
            offsetY: cut.transform.offsetY,
            rotation: cut.transform.rotation,
          },
        })),
      };

      return startRender(projectId, { title, description, editConfig });
    },
  });
}
