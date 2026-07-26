import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatedTicketDto, CreateFindingInput, ProjectDto, TicketDto } from '@identityhub/shared';
import { api } from '@/lib/api';

export function useJiraProjects(enabled: boolean) {
  return useQuery({
    queryKey: ['jira', 'projects'],
    queryFn: () => api.get<ProjectDto[]>('/api/jira/projects'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useRecentTickets(projectKey: string | null) {
  return useQuery({
    queryKey: ['tickets', 'recent', projectKey],
    queryFn: () =>
      api.get<TicketDto[]>(`/api/tickets/recent?projectKey=${encodeURIComponent(projectKey!)}`),
    enabled: Boolean(projectKey),
    // Tickets also arrive via the public API and the digest job — keep the
    // panel fresh without manual reloads.
    refetchInterval: 30_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFindingInput) => api.post<CreatedTicketDto>('/api/tickets', input),
    onSuccess: (_created, input) => {
      const key = ['tickets', 'recent', input.projectKey];
      void queryClient.invalidateQueries({ queryKey: key });
      // Jira's search index is eventually consistent: a just-created issue can
      // be missing from JQL results for a second or two. Refetch again shortly
      // so the new ticket doesn't appear to be missing.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: key }), 2500);
    },
  });
}
