import type { CreatedApiKeyDto } from '@identityhub/shared';
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeys';
import { relativeTime } from '@/lib/relativeTime';

export function ApiKeysPage() {
  const keys = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedApiKeyDto | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Give the key a name', { description: 'e.g. "prod-scanner" or "ci-pipeline".' });
      return;
    }
    try {
      const created = await createKey.mutateAsync(name.trim());
      setCreatedKey(created);
      setName('');
    } catch (err) {
      toast.error('Could not create the key', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function onRevoke(id: string, keyName: string) {
    try {
      await revokeKey.mutateAsync(id);
      toast.info(`Key "${keyName}" revoked`, {
        description: 'Requests using it will now receive 401.',
      });
    } catch (err) {
      toast.error('Could not revoke the key', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 p-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-4" /> API keys
            </CardTitle>
            <CardDescription>
              Let external systems (scanners, CI/CD pipelines) file NHI findings through the REST
              API. Tickets created with a key go to <em>your</em> connected Jira workspace. Keys are
              shown once and stored hashed — treat them like passwords.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={(e) => void onCreate(e)} className="flex max-w-md gap-2">
              <Input
                placeholder='Key name, e.g. "prod-scanner"'
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <Button type="submit" disabled={createKey.isPending}>
                {createKey.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                Create key
              </Button>
            </form>

            {keys.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : keys.isError ? (
              <p className="text-sm text-destructive">{keys.error.message}</p>
            ) : keys.data!.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No keys yet. Create one to call the public API.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.data!.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell className="font-mono text-xs">{key.keyHint}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {relativeTime(key.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {key.lastUsedAt ? relativeTime(key.lastUsedAt) : 'never'}
                      </TableCell>
                      <TableCell>
                        {key.revokedAt ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Revoked
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!key.revokedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void onRevoke(key.id, key.name)}
                            disabled={revokeKey.isPending}
                            aria-label={`Revoke ${key.name}`}
                          >
                            <Trash2Icon />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <ShowOnceDialog createdKey={createdKey} onClose={() => setCreatedKey(null)} />
    </div>
  );
}

function ShowOnceDialog({
  createdKey,
  onClose,
}: {
  createdKey: CreatedApiKeyDto | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const curlExample = createdKey
    ? [
        `curl -X POST ${window.location.origin}/api/v1/findings \\`,
        `  -H "Authorization: Bearer ${createdKey.key}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"projectKey":"YOUR_PROJECT","title":"Stale service account: svc-ci","description":"Found by scanner","severity":"high","identityType":"service-account","foundBy":"nightly-scan"}'`,
      ].join('\n')
    : '';

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={Boolean(createdKey)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Copy your new API key</DialogTitle>
          <DialogDescription>
            This is the only time the key is shown — we store just a hash of it. If it is lost,
            revoke it and create a new one.
          </DialogDescription>
        </DialogHeader>

        {createdKey && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
                {createdKey.key}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copy(createdKey.key)}
                aria-label="Copy key"
              >
                {copied ? <CheckIcon className="text-green-600" /> : <CopyIcon />}
              </Button>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Try it (creates a real ticket):
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {curlExample}
              </pre>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done — I saved the key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
