import type { AccountDto } from '@identityhub/shared';
import { CheckCircle2Icon, Loader2Icon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClearSite, useJiraSites, useSelectSite } from '@/hooks/useJira';

/**
 * There is no "connect Jira" step any more — signing in with Atlassian *is*
 * connecting. This only handles which site to use, which matters solely for
 * Atlassian accounts that can reach several.
 */
export function JiraSiteCard({ account }: { account: AccountDto }) {
  return account.site ? <SelectedSite account={account} /> : <SitePicker />;
}

function SelectedSite({ account }: { account: AccountDto }) {
  const clearSite = useClearSite();

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="size-5 text-green-600" aria-hidden />
          <div>
            <p className="text-sm font-medium">
              {account.site!.name}{' '}
              <a
                href={account.site!.url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {account.site!.url}
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              Signed in with Atlassian{account.email ? ` as ${account.email}` : ''}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void clearSite.mutateAsync()}
          disabled={clearSite.isPending}
        >
          {clearSite.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          Switch site
        </Button>
      </CardContent>
    </Card>
  );
}

function SitePicker() {
  const sites = useJiraSites(true);
  const selectSite = useSelectSite();

  async function choose(cloudId: string) {
    try {
      await selectSite.mutateAsync(cloudId);
    } catch (err) {
      toast.error('Could not select that site', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  if (sites.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Choose a Jira site</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (sites.isError) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Could not load your Jira sites</AlertTitle>
        <AlertDescription>
          {sites.error.message}{' '}
          <Button variant="outline" size="sm" onClick={() => void sites.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a Jira site</CardTitle>
        <CardDescription>
          Your Atlassian account can reach more than one Jira site. Findings will be filed to the
          one you pick — you can switch later.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sites.data!.map((site) => (
          <Button
            key={site.cloudId}
            variant="outline"
            className="justify-between"
            disabled={selectSite.isPending}
            onClick={() => void choose(site.cloudId)}
          >
            <span className="font-medium">{site.name}</span>
            <span className="text-xs text-muted-foreground">{site.url}</span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
