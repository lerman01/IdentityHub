import type { JiraConnectionDto } from '@identityhub/shared';
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  PlugIcon,
  TriangleAlertIcon,
  UnplugIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { startJiraConnect, useDisconnectJira, useJiraConnection, useSelectSite } from '@/hooks/useJira';

export function JiraConnectionCard() {
  const connection = useJiraConnection();

  if (connection.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Jira workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (connection.isError) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Could not load your Jira connection</AlertTitle>
        <AlertDescription>
          {connection.error.message}{' '}
          <Button variant="outline" size="sm" onClick={() => void connection.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const status = connection.data!;

  if (!status.oauthConfigured) return <NotConfigured />;
  if (status.pendingSites?.length) return <SitePicker sites={status.pendingSites} />;
  if (status.connected) return <Connected status={status} />;
  return <Disconnected />;
}

function NotConfigured() {
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>Atlassian OAuth app not configured</AlertTitle>
      <AlertDescription>
        <p>
          The server has no Atlassian credentials yet, so Jira features are disabled. Register an
          OAuth app (about 5 minutes) and set{' '}
          <code className="font-mono text-xs">ATLASSIAN_CLIENT_ID</code> and{' '}
          <code className="font-mono text-xs">ATLASSIAN_CLIENT_SECRET</code> in <code>.env</code>,
          then restart. The README section{' '}
          <span className="font-medium">“Create your Atlassian OAuth app”</span> walks through every
          click.
        </p>
      </AlertDescription>
    </Alert>
  );
}

function Disconnected() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugIcon className="size-4" /> Connect your Jira workspace
        </CardTitle>
        <CardDescription>
          IdentityHub files NHI findings as Jira issues. You will be sent to Atlassian to approve
          read/write access to your Jira projects — we never see your Atlassian password, and you
          can revoke access at any time from your Atlassian account settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={startJiraConnect}>
          Connect Jira
          <ExternalLinkIcon />
        </Button>
      </CardContent>
    </Card>
  );
}

function SitePicker({ sites }: { sites: NonNullable<JiraConnectionDto['pendingSites']> }) {
  const selectSite = useSelectSite();

  async function choose(cloudId: string) {
    try {
      await selectSite.mutateAsync(cloudId);
      toast.success('Jira connected');
    } catch (err) {
      toast.error('Could not finish connecting', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a Jira site</CardTitle>
        <CardDescription>
          Your Atlassian account has access to several Jira sites. Findings will be filed to the one
          you pick (you can reconnect later to switch).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sites.map((site) => (
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

function Connected({ status }: { status: JiraConnectionDto }) {
  const disconnect = useDisconnectJira();

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.info('Jira disconnected', {
        description: 'Stored tokens were deleted. You can reconnect any time.',
      });
    } catch (err) {
      toast.error('Could not disconnect', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="size-5 text-green-600" aria-hidden />
          <div>
            <p className="text-sm font-medium">
              {status.site?.name}{' '}
              <a
                href={status.site?.url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {status.site?.url}
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              Connected{status.account?.email ? ` as ${status.account.email}` : ''} via OAuth 2.0
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onDisconnect()}
          disabled={disconnect.isPending}
        >
          {disconnect.isPending ? <Loader2Icon className="animate-spin" /> : <UnplugIcon />}
          Disconnect
        </Button>
      </CardContent>
    </Card>
  );
}
