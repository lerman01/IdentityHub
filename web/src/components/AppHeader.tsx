import { Loader2Icon, LogOutIcon, ShieldCheckIcon } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

function HeaderLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'text-muted-foreground transition-colors hover:text-foreground',
          isActive && 'font-medium text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

export function AppHeader() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await logout.mutateAsync();
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-5">
          <Link to="/" className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5" />
            <span className="font-semibold tracking-tight">IdentityHub</span>
            <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground md:inline">
              NHI findings → Jira
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <HeaderLink to="/">Dashboard</HeaderLink>
            <HeaderLink to="/api-keys">API keys</HeaderLink>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{me.data?.email}</span>
          <Button variant="ghost" size="sm" onClick={onLogout} disabled={logout.isPending}>
            {logout.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <LogOutIcon aria-hidden />
            )}
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
