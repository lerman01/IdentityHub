import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { CreateFindingForm } from '@/components/CreateFindingForm';
import { JiraSiteCard } from '@/components/JiraSiteCard';
import { ProjectSelect } from '@/components/ProjectSelect';
import { RecentTickets } from '@/components/RecentTickets';
import { useSession } from '@/hooks/useAuth';
import { useJiraProjects } from '@/hooks/useTickets';

/** Greets the account after a successful sign-in redirect, then cleans the URL. */
function useSignInToast() {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const flag = searchParams.get('jira');
    if (!flag) return;

    if (flag === 'signed-in') {
      toast.success('Signed in', { description: 'You can start filing findings.' });
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
}

/** Selected project, remembered per account across visits (this browser). */
function useSelectedProject(accountId: string | undefined) {
  const storageKey = accountId ? `identityhub:project:${accountId}` : null;
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
  useSignInToast();
  const session = useSession();
  const account = session.data?.account ?? null;

  const projects = useJiraProjects(Boolean(account));
  const [projectKey, setProjectKey] = useSelectedProject(account?.id);

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
        {account && (
          <>
            <JiraSiteCard account={account} />

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
