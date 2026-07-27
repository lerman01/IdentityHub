import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatedTicketDto,
  CreateFindingInput,
  ProjectDto,
  TicketDto,
} from '@identityhub/shared';
import { api } from '@/lib/api';

export function useJiraProjects(enabled: boolean) {
  return useQuery({
    queryKey: ['jira', 'projects'],
    queryFn: () => api.get<ProjectDto[]>('/api/tickets/projects'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

const recentTicketsKey = (projectKey: string | null) => ['tickets', 'recent', projectKey];

export function useRecentTickets(projectKey: string | null) {
  return useQuery({
    queryKey: recentTicketsKey(projectKey),
    queryFn: () =>
      api.get<TicketDto[]>(`/api/tickets/recent?projectKey=${encodeURIComponent(projectKey!)}`),
    enabled: Boolean(projectKey),
    // Tickets also arrive via the public API and the digest job — keep the
    // panel fresh without manual reloads.
    refetchInterval: 30_000,
  });
}

/**
 * Jira's search index is eventually consistent: a just-created issue is often
 * missing from JQL results for several seconds, so a single refetch after the
 * POST usually comes back without it. Refetch on a widening backoff until the
 * new key shows up, then stop. Runs detached from the mutation so the form
 * isn't left pending while we wait.
 */
const REFETCH_DELAYS_MS = [0, 1_000, 2_500, 5_000, 8_000];

async function refetchUntilVisible(
  queryClient: ReturnType<typeof useQueryClient>,
  projectKey: string,
  issueKey: string,
) {
  const queryKey = recentTicketsKey(projectKey);
  for (const delay of REFETCH_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    // Only the mounted card is worth refetching; if it went away, so do we.
    await queryClient.refetchQueries({ queryKey, type: 'active' });
    const tickets = queryClient.getQueryData<TicketDto[]>(queryKey);
    if (tickets?.some((ticket) => ticket.issueKey === issueKey)) return;
  }
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFindingInput) => api.post<CreatedTicketDto>('/api/tickets', input),
    onSuccess: (created, input) => {
      void refetchUntilVisible(queryClient, input.projectKey, created.issueKey);
    },
  });
}
