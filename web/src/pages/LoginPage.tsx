import { ExternalLinkIcon, ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
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
import { signInWithAtlassian, useSession } from '@/hooks/useAuth';

/** Human messages for the ?jira=error&reason=… redirect from the OAuth callback. */
const SIGN_IN_ERRORS: Record<string, string> = {
  state: 'The sign-in attempt expired or was tampered with. Please try again.',
  'missing-code': 'Atlassian did not return an authorization code. Please try again.',
  'no-sites':
    'Your Atlassian account has no Jira sites. Create a free one at atlassian.com, then sign in again.',
  'not-configured': 'This server has no Atlassian OAuth credentials configured yet.',
  jira_token_error:
    'Atlassian rejected the token exchange. Check the client ID/secret and callback URL in .env.',
  jira_unreachable: 'Could not reach Atlassian. Check your network and try again.',
};

export function LoginPage() {
  const session = useSession();
  const [searchParams, setSearchParams] = useSearchParams();

  // The OAuth callback redirects here on failure; turn the flag into a toast.
  useEffect(() => {
    const flag = searchParams.get('jira');
    if (!flag) return;

    if (flag === 'denied') {
      toast.info('Sign-in canceled', {
        description: 'You declined access on the Atlassian consent screen.',
      });
    } else if (flag === 'error') {
      const reason = searchParams.get('reason') ?? '';
      toast.error('Could not sign in', {
        description: SIGN_IN_ERRORS[reason] ?? 'Something went wrong. Please try again.',
      });
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const configured = session.data?.oauthConfigured ?? true;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShieldCheckIcon className="size-7" />
          <span className="text-xl font-semibold tracking-tight">IdentityHub</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Report NHI findings straight into your Jira workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configured ? (
              <>
                <Button className="w-full" size="lg" onClick={signInWithAtlassian}>
                  Sign in with Atlassian
                  <ExternalLinkIcon />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Your Atlassian account is your IdentityHub account — there is no separate
                  password. We never see your Atlassian credentials, and you can revoke access at
                  any time from your Atlassian account settings.
                </p>
              </>
            ) : (
              <Alert>
                <TriangleAlertIcon />
                <AlertTitle>Atlassian OAuth app not configured</AlertTitle>
                <AlertDescription>
                  This server has no Atlassian credentials, so sign-in is unavailable. Set{' '}
                  <code className="font-mono text-xs">ATLASSIAN_CLIENT_ID</code> and{' '}
                  <code className="font-mono text-xs">ATLASSIAN_CLIENT_SECRET</code> in{' '}
                  <code>.env</code> and restart — the README section{' '}
                  <span className="font-medium">“Create your Atlassian OAuth app”</span> walks
                  through every click.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
