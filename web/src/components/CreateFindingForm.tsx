import {
  createFindingSchema,
  IDENTITY_TYPE_LABELS,
  IDENTITY_TYPES,
  SEVERITIES,
  SEVERITY_LABELS,
  type CreateFindingFormValues,
  type CreateFindingInput,
} from '@identityhub/shared';
import { Loader2Icon, SendIcon, WandSparklesIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateTicket } from '@/hooks/useTickets';
import { ApiError } from '@/lib/api';
import { zodResolver } from '@/lib/zodResolver';

/** Realistic sample findings — one click fills the form for a smooth live demo. */
const SAMPLE_FINDINGS: Array<Partial<CreateFindingFormValues>> = [
  {
    title: 'Stale service account: svc-deploy-prod',
    description:
      'Service account svc-deploy-prod has not authenticated in 94 days but still holds admin-level IAM bindings in project prod-eu.\n\nOwner unknown; last change 2026-04-12.\nRecommended action: disable the account, rotate its credentials, and re-scope bindings to least privilege.',
    severity: 'high',
    identityType: 'service-account',
  },
  {
    title: 'Over-privileged API key: ghcr-publish-bot',
    description:
      'API key ghcr-publish-bot holds org-wide write scope but is only used to push a single container image.\n\nObserved usage: 1 repository over the last 60 days.\nRecommended action: replace with a fine-grained token scoped to the single repository.',
    severity: 'medium',
    identityType: 'api-key',
  },
  {
    title: 'Expiring certificate: mtls-gateway-cert (14 days)',
    description:
      'The mTLS client certificate mtls-gateway-cert used by the payments gateway expires in 14 days.\n\nNo rotation pipeline detected for this certificate.\nRecommended action: rotate now and add automated renewal before expiry.',
    severity: 'critical',
    identityType: 'certificate',
  },
];

const NONE = 'none';

interface Props {
  projectKey: string | null;
}

export function CreateFindingForm({ projectKey }: Props) {
  const createTicket = useCreateTicket();

  const form = useForm<CreateFindingFormValues, unknown, CreateFindingInput>({
    resolver: zodResolver(createFindingSchema),
    defaultValues: { projectKey: '', title: '', description: '' },
  });

  // The project comes from the picker above the form; keep the form in sync.
  if (projectKey && form.getValues('projectKey') !== projectKey) {
    form.setValue('projectKey', projectKey);
  }

  function fillSample() {
    const sample = SAMPLE_FINDINGS[Math.floor(Math.random() * SAMPLE_FINDINGS.length)]!;
    form.reset({ ...form.getValues(), ...sample });
  }

  async function onSubmit(values: CreateFindingInput) {
    try {
      const created = await createTicket.mutateAsync(values);
      toast.success(`Ticket ${created.issueKey} created`, {
        description: 'The finding is now in your Jira project.',
        action: {
          label: 'Open in Jira',
          onClick: () => window.open(created.url, '_blank', 'noopener'),
        },
      });
      form.reset({ projectKey: values.projectKey, title: '', description: '' });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      toast.error('Could not create the ticket', { description: message });
    }
  }

  const disabled = !projectKey;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Report an NHI finding</CardTitle>
          <CardDescription>
            {disabled
              ? 'Pick a Jira project above to start filing findings.'
              : `Creates an issue in ${projectKey} with the identityhub label.`}
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={fillSample} disabled={disabled}>
          <WandSparklesIcon />
          Fill sample
        </Button>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g. "Stale service account: svc-deploy-prod"'
                      disabled={disabled}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="What did you find? Impact, evidence, and the recommended remediation."
                      disabled={disabled}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Severity <span className="text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}
                      disabled={disabled}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        {SEVERITIES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SEVERITY_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="identityType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Identity type <span className="text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}
                      disabled={disabled}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Not set" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        {IDENTITY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {IDENTITY_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="submit" disabled={disabled || createTicket.isPending}>
                {createTicket.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SendIcon />
                )}
                Create Jira ticket
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
