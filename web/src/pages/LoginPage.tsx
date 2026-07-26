import { loginSchema, type LoginInput } from '@identityhub/shared';
import { Loader2Icon, ShieldCheckIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { useLogin } from '@/hooks/useAuth';
import { zodResolver } from '@/lib/zodResolver';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    try {
      await login.mutateAsync(values);
    } catch {
      return; // the error is rendered from login.error below
    }
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? '/', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <ShieldCheckIcon className="size-7" />
          <span className="text-xl font-semibold tracking-tight">IdentityHub</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Report NHI findings to your Jira workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {login.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>{login.error.message}</AlertDescription>
                  </Alert>
                )}

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="you@company.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={login.isPending}>
                  {login.isPending && <Loader2Icon className="animate-spin" />}
                  Sign in
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              No account?{' '}
              <Link to="/register" className="font-medium text-foreground underline">
                Create one
              </Link>
            </p>
            <div className="w-full rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              Demo login: <span className="font-mono">demo@identityhub.local</span> /{' '}
              <span className="font-mono">demo-password-123</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
