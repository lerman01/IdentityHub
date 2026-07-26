/**
 * Domain vocabulary shared by the web app, the server, and the public API.
 * Kept in one place so a new severity or identity type is added exactly once.
 */

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const IDENTITY_TYPES = [
  'service-account',
  'api-key',
  'service-principal',
  'certificate',
  'secret',
  'other',
] as const;
export type IdentityType = (typeof IDENTITY_TYPES)[number];

export const IDENTITY_TYPE_LABELS: Record<IdentityType, string> = {
  'service-account': 'Service account',
  'api-key': 'API key',
  'service-principal': 'Service principal',
  certificate: 'Certificate',
  secret: 'Secret',
  other: 'Other',
};

/** Where a ticket was created from. */
export const TICKET_SOURCES = ['ui', 'api', 'digest'] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];
