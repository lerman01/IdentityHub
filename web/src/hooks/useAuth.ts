import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionDto } from '@identityhub/shared';
import { api } from '@/lib/api';

const ME_KEY = ['auth', 'me'] as const;

/** The signed-in account, plus whether the server can do Atlassian OAuth at all. */
export function useSession() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get<SessionDto>('/api/session/me'),
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/api/session/logout'),
    // Wipe the entire client cache: nothing from one account's session may
    // leak into the next (client-side mirror of the server's tenant isolation).
    onSuccess: () => queryClient.clear(),
  });
}

/** Full-page navigation into the OAuth flow (it's a redirect dance, not a fetch). */
export function signInWithAtlassian() {
  window.location.href = '/api/auth/start';
}
