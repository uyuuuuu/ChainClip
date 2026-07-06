import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { getDeviceId, saveAccessToken } from '../lib/storage';

type CreateProjectResponse = {
  projectId: string;
  accessToken: string;
  status: string;
};

export function useCreateProject() {
  return useMutation({
    mutationFn: async () => {
      // 端末IDを取得(なければ生成)して、ボディに含める
      const deviceId = await getDeviceId();

      const data = await apiFetch<CreateProjectResponse>('/projects', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
      await saveAccessToken(data.projectId, data.accessToken);
      return data;
    },
  });
}
