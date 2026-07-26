import { Loader2Icon, ServerCrashIcon } from 'lucide-react';
import { Navigate, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useAuth';

function CenteredNote({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
}

function LoadingScreen() {
  return (
    <CenteredNote>
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </CenteredNote>
  );
}

function ServerUnreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <CenteredNote>
      <div className="flex flex-col items-center gap-3 text-center">
        <ServerCrashIcon className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Cannot reach the IdentityHub server</p>
          <p className="text-sm text-muted-foreground">
            Make sure it is running (<code className="font-mono">npm run dev</code>), then retry.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </CenteredNote>
  );
}

/** Wraps authenticated routes: verifies the session before rendering children. */
export function RequireAuth() {
  const session = useSession();

  if (session.isLoading) return <LoadingScreen />;
  if (session.isError) return <ServerUnreachable onRetry={() => void session.refetch()} />;
  if (!session.data?.account) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Wraps the login page: an already-signed-in account goes straight to the app. */
export function PublicOnly() {
  const session = useSession();

  if (session.isLoading) return <LoadingScreen />;
  if (session.data?.account) return <Navigate to="/" replace />;
  return <Outlet />;
}
