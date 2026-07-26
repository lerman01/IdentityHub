import { TICKET_SOURCES, type CreateFindingInput, type TicketSource } from '@identityhub/shared';

/**
 * Jira labels are how this app marks and classifies its own issues.
 *
 * Since the Recent Tickets view is a JQL query rather than a local table
 * (docs/DECISIONS.md #9), labels carry everything we need to recognise our
 * issues later: APP_LABEL identifies them, `source:*` records which entry
 * point filed them.
 *
 * Labels are user-editable in Jira, which is the accepted trade-off of this
 * design: strip `identityhub` from an issue and it drops out of the view.
 */

export const APP_LABEL = 'identityhub';

const SOURCE_PREFIX = 'source:';

export function buildLabels(input: CreateFindingInput, source: TicketSource): string[] {
  const labels = [APP_LABEL, `${SOURCE_PREFIX}${source}`];
  if (input.severity) labels.push(`severity:${input.severity}`);
  if (input.identityType) labels.push(`nhi:${input.identityType}`);
  if (source === 'digest') labels.push('nhi-blog-digest');
  return labels;
}

/**
 * Reads the source back off an issue's labels. Undefined when the label is
 * absent — an issue tagged by hand, or created before this app wrote it.
 */
export function parseSource(labels: string[] | undefined): TicketSource | undefined {
  const raw = labels?.find((l) => l.startsWith(SOURCE_PREFIX))?.slice(SOURCE_PREFIX.length);
  return TICKET_SOURCES.find((s) => s === raw);
}
