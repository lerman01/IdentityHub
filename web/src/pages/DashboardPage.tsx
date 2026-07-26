import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { CreateFindingForm } from '@/components/CreateFindingForm';
import { JiraConnectionCard } from '@/components/JiraConnectionCard';
import { ProjectSelect } from '@/components/ProjectSelect';
import { RecentTickets } from '@/components/RecentTickets';
import { useMe } from '@/hooks/useAuth';
import { JIRA_CONNECTION_KEY, useJiraConnection } from '@/hooks/useJira';
import { useJiraProjects } from '@/hooks/useTickets';

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

/** Selected project, remembered per app user across visits (this browser). */
function useSelectedProject(userId: string | undefined) {
  const storageKey = userId ? `identityhub:project:${userId}` : null;
  const [projectKey, setState] = useState<string | null>(null);

  useEffect(() => {
    setState(storageKey ? localStorage.getItem(storageKey) : null);
  }, [storageKey]);

  const setProjectKey = useCallback(
    (key: string) => {
      setState(key);
      if (storageKey) localStorage.setItem(storageKey, key);
    },
    [storageKey],
  );

  return [projectKey, setProjectKey] as const;
}

export function DashboardPage() {
  useOAuthResultToasts();
  const me = useMe();
  const connection = useJiraConnection();
  const connected = connection.data?.connected ?? false;
  const projects = useJiraProjects(connected);
  const [projectKey, setProjectKey] = useSelectedProject(me.data?.id);

  // A single-project workspace needs no picking ceremony.
  useEffect(() => {
    if (!projectKey && projects.data?.length === 1) {
      setProjectKey(projects.data[0]!.key);
    }
  }, [projectKey, projects.data, setProjectKey]);

  return (
    <div className="min-h-screen bg-muted/40">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 p-4 py-8">
        <JiraConnectionCard />

        {connected && (
          <>
            <ProjectSelect
              projects={projects.data ?? []}
              isLoading={projects.isLoading}
              value={projectKey}
              onChange={setProjectKey}
            />

            <div className="grid items-start gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <CreateFindingForm projectKey={projectKey} />
              </div>
              <div className="lg:col-span-2">
                <RecentTickets projectKey={projectKey} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
