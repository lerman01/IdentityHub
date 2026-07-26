import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JiraConnectionDto } from '@identityhub/shared';
import { api } from '@/lib/api';

export const JIRA_CONNECTION_KEY = ['jira', 'connection'] as const;

export function useJiraConnection() {
  return useQuery({
    queryKey: JIRA_CONNECTION_KEY,
    queryFn: () => api.get<JiraConnectionDto>('/api/jira/connection'),
  });
}

export function useSelectSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cloudId: string) =>
      api.post<JiraConnectionDto>('/api/jira/site', { cloudId }),
    onSuccess: (data) => queryClient.setQueryData(JIRA_CONNECTION_KEY, data),
  });
}

export function useDisconnectJira() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/api/jira/connection'),
    onSuccess: () => {
      // Projects/tickets caches belong to the old connection — drop everything Jira.
      void queryClient.invalidateQueries({ queryKey: ['jira'] });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

/** Full-page navigation into the OAuth flow (it's a redirect dance, not a fetch). */
export function startJiraConnect() {
  window.location.href = '/api/jira/oauth/start';
}
