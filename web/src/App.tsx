import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';

/**
 * M0 placeholder: proves the full loop (Vite → proxy → Express → SQLite boot)
 * works. Replaced by the real router in M1.
 */
export function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ status: string }>('/api/health'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-semibold">IdentityHub</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Scaffold running — API health:{' '}
          <span className="font-medium text-foreground">
            {health.isLoading ? 'checking…' : health.isError ? 'unreachable' : health.data?.status}
          </span>
        </p>
      </div>
    </div>
  );
}
