import { Loader2Icon, ServerCrashIcon } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/useAuth';

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
  const me = useMe();
  const location = useLocation();

  if (me.isLoading) return <LoadingScreen />;
  if (me.isError) return <ServerUnreachable onRetry={() => void me.refetch()} />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Wraps login/register: an already-signed-in user goes straight to the app. */
export function PublicOnly() {
  const me = useMe();

  if (me.isLoading) return <LoadingScreen />;
  if (me.data) return <Navigate to="/" replace />;
  return <Outlet />;
}
