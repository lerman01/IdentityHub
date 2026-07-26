import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountDto, JiraSiteOption } from '@identityhub/shared';
import { api } from '@/lib/api';
import { ME_KEY } from './useAuth';

/** Jira sites this account's Atlassian login can reach — drives the picker. */
export function useJiraSites(enabled: boolean) {
  return useQuery({
    queryKey: ['jira', 'sites'],
    queryFn: () => api.get<JiraSiteOption[]>('/api/jira/sites'),
    enabled,
  });
}

export function useSelectSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cloudId: string) => api.post<AccountDto>('/api/jira/site', { cloudId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

/** "Switch Jira site" — stays signed in, drops the current choice. */
export function useClearSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/api/jira/site'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      // Projects and tickets belong to the old site.
      void queryClient.invalidateQueries({ queryKey: ['jira', 'projects'] });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
