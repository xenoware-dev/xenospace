import { useQuery } from '@tanstack/react-query';
import type { Project } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { keys } from '@/lib/queryClient.js';

export type ProjectOption = Pick<Project, 'id' | 'name' | 'key' | 'color' | 'status'> & { openTasks: number };

/**
 * The project a single-project view (board, sprints) opens on: the user's saved
 * default, else the one with the most open work. Alphabetical-first used to
 * open the board on an empty planning project, which reads as broken.
 */
export function pickDefaultProject(projects: ProjectOption[] | undefined, preferred?: string | null): string {
  if (!projects || projects.length === 0) return '';
  if (preferred && projects.some((p) => p.id === preferred)) return preferred;
  return [...projects].sort((a, b) => b.openTasks - a.openTasks)[0]!.id;
}

/**
 * The projects the viewer can see, for filter dropdowns and pickers.
 *
 * Cached for longer than most queries: project membership changes rarely, and
 * this is requested by almost every page.
 */
export function useProjectOptions() {
  return useQuery({
    queryKey: keys.projectOptions,
    queryFn: () => api.get<ProjectOption[]>('/projects/options'),
    staleTime: 5 * 60_000,
  });
}
