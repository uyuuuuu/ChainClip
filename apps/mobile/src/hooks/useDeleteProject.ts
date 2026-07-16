import { deleteProject } from '@/api/projects';
import { useMutation } from '@tanstack/react-query';

export const useDeleteProject = () => {
  return useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
  });
};
