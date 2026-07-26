import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput, UserDto } from '@identityhub/shared';
import { api } from '@/lib/api';

const ME_KEY = ['auth', 'me'] as const;

type MeResponse = { user: UserDto | null };

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    select: (data) => data.user,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<MeResponse>('/api/auth/login', input),
    onSuccess: (data) => queryClient.setQueryData(ME_KEY, data),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<MeResponse>('/api/auth/register', input),
    onSuccess: (data) => queryClient.setQueryData(ME_KEY, data),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/api/auth/logout'),
    // Wipe the entire client cache: nothing from one user's session may leak
    // into the next (client-side mirror of the server's tenant isolation).
    onSuccess: () => queryClient.clear(),
  });
}
