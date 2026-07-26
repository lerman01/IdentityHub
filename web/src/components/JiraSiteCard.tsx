import type { AccountDto } from '@identityhub/shared';
import { CheckCircle2Icon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Shows which Jira site this account authorized. Purely informational.
 *
 * There is no site switcher: the Atlassian grant is scoped to the single site
 * chosen on Atlassian's consent screen, so changing it means re-consenting —
 * which is exactly what Sign out then Sign in does (docs/DECISIONS.md #2c).
 * The hint below says so, because it is otherwise not discoverable.
 */
export function JiraSiteCard({ account }: { account: AccountDto }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="size-5 shrink-0 text-green-600" aria-hidden />
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
        <p className="text-xs text-muted-foreground">
          To use a different Jira site, sign out and sign in again.
        </p>
      </CardContent>
    </Card>
  );
}
