import { AppHeader } from '@/components/AppHeader';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardPage() {
  return (
    <div className="min-h-screen bg-muted/40">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-6 p-4 py-8">
        {/* M2 replaces this placeholder with the Jira connection card + finding form. */}
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>
              You are signed in. The Jira connection flow lands in the next milestone.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
