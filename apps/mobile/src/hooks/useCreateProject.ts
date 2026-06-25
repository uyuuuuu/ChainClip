import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { saveAccessToken } from '../lib/storage';

type CreateProjectResponse = {
  projectId: string;
  accessToken: string;
  status: string;
};

export function useCreateProject() {
  return useMutation({
    mutationFn: async (input: { aspectRatio: string }) => {
      const data = await apiFetch<CreateProjectResponse>('/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await saveAccessToken(data.projectId, data.accessToken); // tokenを保管
      return data;
    },
  });
}