import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Switching Jira site means re-running Atlassian's consent screen, because the
 * grant is site-scoped and Atlassian owns the choice (docs/DECISIONS.md #2c).
 *
 * So: end the session, then restart the OAuth flow. `/oauth/start` sends
 * `prompt=consent`, which guarantees the site chooser appears again.
 */
export function useSwitchSite() {
  return useMutation({
    mutationFn: async () => {
      await api.post<void>('/api/auth/logout');
      window.location.href = '/api/jira/oauth/start';
    },
  });
}
