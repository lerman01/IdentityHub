import type { AccountDto } from '@identityhub/shared';
import { CheckCircle2Icon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSwitchSite } from '@/hooks/useJira';

/**
 * Shows which Jira site this account authorized.
 *
 * There is no in-app site picker: the Atlassian grant is scoped to the single
 * site chosen on Atlassian's consent screen, so switching means re-consenting
 * (docs/DECISIONS.md #2c).
 */
export function JiraSiteCard({ account }: { account: AccountDto }) {
  const switchSite = useSwitchSite();

  async function onSwitch() {
    try {
      await switchSite.mutateAsync();
    } catch {
      toast.error('Could not start the switch', {
        description: 'Please sign out and sign in again to choose a different Jira site.',
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
              {account.site.name}{' '}
              <a
                href={account.site.url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {account.site.url}
              </a>
            </p>
            <p className="text-xs text-muted-foreground">
              Signed in with Atlassian{account.email ? ` as ${account.email}` : ''}
            </p>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onSwitch()}
              disabled={switchSite.isPending}
            >
              {switchSite.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Switch site
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Signs you out and back in — Atlassian asks which site to authorize.
          </TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}
