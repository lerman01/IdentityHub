import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { JiraConnectionCard } from '@/components/JiraConnectionCard';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { JIRA_CONNECTION_KEY, useJiraConnection } from '@/hooks/useJira';

/** Human messages for the ?jira=error&reason=... redirect from the OAuth callback. */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  state: 'The connection attempt expired or was tampered with. Please try again.',
  'missing-code': 'Atlassian did not return an authorization code. Please try again.',
  'no-sites':
    'Your Atlassian account has no Jira sites. Create a free site at atlassian.com first.',
  'not-configured': 'The server has no Atlassian OAuth credentials configured yet.',
  jira_token_error:
    'Atlassian rejected the token exchange. Check the client ID/secret and callback URL in .env.',
  jira_unreachable: 'Could not reach Atlassian. Check your network and try again.',
};

/** Turns the OAuth redirect flags into toasts, then cleans the URL. */
function useOAuthResultToasts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    const flag = searchParams.get('jira');
    if (!flag) return;
    const reason = searchParams.get('reason') ?? '';

    if (flag === 'connected') {
      toast.success('Jira connected', { description: 'You can start filing findings.' });
      void queryClient.invalidateQueries({ queryKey: JIRA_CONNECTION_KEY });
    } else if (flag === 'select-site') {
      void queryClient.invalidateQueries({ queryKey: JIRA_CONNECTION_KEY });
    } else if (flag === 'denied') {
      toast.info('Jira connection canceled', {
        description: 'You declined access on the Atlassian consent screen.',
      });
    } else if (flag === 'error') {
      toast.error('Could not connect Jira', {
        description:
          OAUTH_ERROR_MESSAGES[reason] ?? 'Something went wrong. Please try connecting again.',
      });
    }

    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);
}

export function DashboardPage() {
  useOAuthResultToasts();
  const connection = useJiraConnection();
  const connected = connection.data?.connected ?? false;

  return (
    <div className="min-h-screen bg-muted/40">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 p-4 py-8">
        <JiraConnectionCard />

        {connected && (
          /* M3 replaces this with the finding form + recent tickets. */
          <Card>
            <CardHeader>
              <CardTitle>Report a finding</CardTitle>
              <CardDescription>The finding form arrives in the next milestone.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
    </div>
  );
}
