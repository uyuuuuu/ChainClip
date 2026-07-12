import { createProject } from "@/api/projects";
import { useMutation } from "@tanstack/react-query";
import type { components } from "../api/schema";
import { getDeviceId, saveAccessToken } from "../lib/storage";

type CreateProjectResponse = components["schemas"]["CreateProjectResponse"];

export function useCreateProject() {
  return useMutation({
    mutationFn: async () => {
      // 端末IDを取得(なければ生成)して、ボディに含める
      const deviceId = await getDeviceId();

      const data = await createProject(deviceId);
      await saveAccessToken(data.projectId, data.accessToken);
      return data;
    },
  });
}
