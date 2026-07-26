import type { TicketDto, TicketSource } from '@identityhub/shared';
import { ExternalLinkIcon, InboxIcon, TriangleAlertIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentTickets } from '@/hooks/useTickets';
import { relativeTime } from '@/lib/relativeTime';

const SOURCE_BADGES: Record<TicketSource, { label: string; className: string }> = {
  ui: { label: 'UI', className: 'bg-blue-100 text-blue-800' },
  api: { label: 'API', className: 'bg-purple-100 text-purple-800' },
  digest: { label: 'Digest', className: 'bg-amber-100 text-amber-800' },
};

export function RecentTickets({ projectKey }: { projectKey: string | null }) {
  const tickets = useRecentTickets(projectKey);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent tickets</CardTitle>
        <CardDescription>
          {projectKey
            ? `The last 10 findings filed to ${projectKey} from IdentityHub.`
            : 'Pick a project to see its recent findings.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!projectKey ? null : tickets.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : tickets.isError ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TriangleAlertIcon className="size-4" />
            {tickets.error.message}
          </div>
        ) : tickets.data!.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <InboxIcon className="size-6" />
            <p>
              No findings filed to this project yet.
              <br />
              Create the first one with the form.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {tickets.data!.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TicketRow({ ticket }: { ticket: TicketDto }) {
  const badge = SOURCE_BADGES[ticket.source];
  return (
    <li>
      <a
        href={ticket.jiraUrl}
        target="_blank"
        rel="noreferrer"
        className="group flex items-center gap-3 py-2.5"
        title={`Open ${ticket.issueKey} in Jira`}
      >
        <Badge variant="secondary" className={badge.className}>
          {badge.label}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium group-hover:underline">{ticket.summary}</p>
          <p className="text-xs text-muted-foreground">
            {ticket.issueKey} · {relativeTime(ticket.createdAt)}
          </p>
        </div>
        <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
    </li>
  );
}
